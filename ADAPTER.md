# Portal 适配器模块开发指南

本体 (index/management 页) 是一个**认证框架**: 连通性检测、认证页类型自动识别、
适配器注册表、UI、账号存储、日志都是通用的; 具体的认证协议 (获取配置/登录/
状态心跳/下线/设备管理) 由 `ui/src/services/portal-adapters/` 下的
**适配器模块**实现。

适配一个新的 WiFi 登入页 = **新增一个模块文件 + 在 registry.js 注册一行**。

## 内置适配器 (默认 / 演示模板)

- `ui/src/services/portal-adapters/panabit.js` — Panabit 上网认证系统,
  本项目唯一完成真机验证的实现, 同时作为新适配器的**演示模板**。
  新适配器建议复制它再改协议细节。
- `ui/src/services/portal-adapters/adapter-api.js` — 适配器公共工具
  (查询串序列化 / GB2312 响应清洗)。

## 接口契约 (与 registry.js 注释一致)

必选:

| 成员 | 形态 | 说明 |
| --- | --- | --- |
| `id` | string | 唯一 ID, 存储 / 外部调用 / 管理页传参用 |
| `name` | string | 展示名, 按钮 / 提示用 |
| `match(ctx)` | → 0-100 分 | 自动识别评分; ctx 含 `{ portalPage, pageTitle, snippet, params, serverBase, headers }`; 0 表示不匹配 |
| `loadConf(serverBase, p, state)` | → `{ status, msg?, code? }` | 建会话 + 读配置; status 为 `free`(免认证已通过) / `ready`(账号密码可登录) / `manual`(服务器无响应建议手输) / `other`(非账密认证方式) / `error` |
| `login(serverBase, o)` | → `{ ok, msg?, code? }` | 账号密码登录; o 含 `{ params, username, password, remember, state }`; 会话刷新与失败重试**由适配器自理**, 框架只调用一次 |

可选 (存在才在界面暴露对应入口):

| 成员 | 说明 |
| --- | --- |
| `queryStat(serverBase, { params, state })` | → `{ ok, stat? }`; stat != 0 即已认证; 不支持返回 `{ ok: false }`, 心跳静默 |
| `logout(serverBase, { params, state })` | 本机下线 |
| `sync(serverBase, { ip }, state)` | 管理页进入前建会话 |
| `listDevices(serverBase, { params })` | → `{ ok, list }`; 有才显示"设备管理"按钮 |
| `offOne(serverBase, { addr })` | 单设备下线 |
| `offAll(serverBase, { params })` | 全部下线 |

约定:

- `state` 是框架持有的对象, 适配器把 auth_type/scene_str 等写回供后续调用使用;
  适配器自身**不保留可变状态** (避免跨登录残留)。
- 迟到结果由框架的 generation token 拦截, 适配器无需自己防抖。
- 网关响应多为 GB2312, 用 `sanitize()` 只保留 ASCII 后再 `JSON.parse`。
- 页面不出现任何协议分支; 协议语义全部收口在适配器内。

## 开发全流程

### 1. 获取认证页前端代码

来源 (按条件选择, 不确定时询问用户):

- **本地文件**: 用户手上已有认证页 HTML/JS (抓包导出 / 另存 / 登入页目录拷贝);
  直接读文件分析。
- **浏览器**: 在需要认证的网络下用电脑浏览器打开任意 HTTP 站点, 被强制门户
  劫持到认证页后查看源码 / 网络请求 (F12), 拿到登录页与它引用的 js。
- **设备侧**: adb 从词典笔拉取 (设备没有通用浏览器, 能拿到的有限, 只作补充)。

需要拿到: 登录页 HTML (表单字段/内联跳转逻辑) + 它引用的全部 js
(加密实现 / 登录提交 / 返回码处理)。

### 2. 分析认证协议

从代码中提取并记录:

- 登录端点: URL / 方法 / 参数表; 每个参数的来源 (本机 IP / MAC / 会话 token /
  检测参数 `wlanuserip`/`clientmac`/`vlan` 是否覆盖)。
- 密码字段形态: 明文还是加密 (AES/MD5/RSA...), 加密后 hex 还是 base64,
  密钥固定在 JS 里还是每次会话下发 / 派生。
- 返回码语义: 成功 / 账密错误 / 锁定 / 需改密 / 会话过期。
- 响应编码 (GB2312 只保留 ASCII 对照, 中文文案本地映射)。
- 状态查询 / 心跳端点 (有的话) → 实现 `queryStat`。
- 下线 / 设备列表端点 (有的话) → 实现 `logout` / `listDevices` / `offOne` / `offAll`。

### 3. 阻塞检查 (无法制作时明确告知)

出现以下任一情况, **停下来告知用户** (说明现象 / 证据 / 影响), 不要猜、
不要静默降级:

1. **加密超出设备能力**: 框架内置纯 JS 加密只有 AES-128-ECB/ZeroPadding
   (`ui/src/services/aes.js`); 设备是 QuickJS 运行时 (无 Node/OpenSSL, 大数运算性能弱)。
   - AES-ECB / 简单摘要 (MD5/SHA1) → 可做 (新摘要需新增纯 JS 实现并自测)。
   - RSA / SM2/SM4 / 魔改算法 / 动态密钥交换且派生过程不可复现 → **告知无法制作**
     (纯 JS 不可行, 需 native 扩展另行评估)。
2. **前端代码被加密 / 混淆到无法分析** (整文件或登录关键路径) → 告知。
3. **登录依赖验证码 / 短信 / 滑块 / 设备指纹 / 后端绑定验证** —— 纯 API 无法
   复现 → 告知。
4. 协议存在多种解释且代码/抓包无法确认 → 带证据询问用户。

### 4. 实现适配器

- 复制 `ui/src/services/portal-adapters/panabit.js` 为 `<协议>.js`, 改协议细节; 保留接口形态。
- `match()`: 给出可从 URL/标题/内容稳定区分的特征并加权评分
  (Panabit 用跳转 URL 的 `wlanuserip=/paip=/iarmdst=` 参数 + 页面字样)。
- `loadConf()` / `login()`: 严格按上面归一化状态返回; 会话刷新 / 失败重试在
  `login()` 内自理。
- 复用 `ui/src/services/portal-adapters/adapter-api.js` 的 `qs()` / `sanitize()`;
  协议专属文案映射放适配器内。

### 5. 注册

在 `registry.js` 的 `ADAPTERS` 数组加一行。注册后:

- "认证类型"选择列表自动出现该适配器;
- 自动识别自动把它纳入评分;
- 提供 `listDevices` 则主页自动显示"设备管理"入口。

### 6. 验证

- 本地: `node test/*.test.mjs` (文本注入桩跑纯逻辑) + `pnpm -C ui build` 编译检查。
- 真机: 安装 → 连目标认证网络 → 看日志 `[适配器] 自动识别 <id> score=<n>` →
  登录 → 复查放行; 识别不出时走界面手选。
- **Panabit 回归**: 新适配器不得影响 Panabit 已验证行为 (同一网络下 Panabit
  自动识别得分必须仍最高)。

## 外部调用接口

```
$falcon.navTo('falcon://<appid>/index', {
  action: 'login', server: 'IP[:端口]',
  username: 'x', password: 'y', remember: '1', auto: '1',
  adapter: '<适配器id>'   // 可选: 强制指定适配器, 缺省自动识别/记住的
})
```
