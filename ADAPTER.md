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

**必须拿全登录页与管理页的全部 HTML / CSS / JS** (含内联 `<style>` / `<script>`
与所有外链资源), 加密实现、参数构造、返回码处理往往藏在外链 js 里, 漏一个文件
就可能误判协议。来源按条件选择, 不确定时询问用户:

#### 1.0 先定位认证页 URL

- 连上目标 WiFi 后浏览器访问任意 **HTTP** 站点 (不要用 HTTPS), 被强制门户劫持
  后的地址栏 URL 就是认证页; 记下它 (含 `?wlanuserip=...` 等查询参数)。
- 词典笔上也可读 `/userdisk/xiro/status.json` 或日志里的 `portalPage` 字段拿跳转 URL。
- 管理页地址通常在登录成功后的跳转链接、页面里的"设备管理/在线终端"入口、
  或同服务器的 `/ucenter`、`/manage` 等路径; 需要凭据登录后才能打开的, 先登录再提取。

#### 1.1 Chrome / Edge (Windows / macOS / Linux)

1. F12 打开 DevTools → **Network** 面板, 勾选 **Preserve log** (防止跳转清记录),
   过滤框选 **Doc** + **CSS** + **JS** (或 `Fetch/XHR`)。
2. 刷新认证页, 让所有资源加载完毕。
3. 提取 HTML: 页面右键 → **查看网页源代码** (`Ctrl+U`) → 全选另存;
   或 Network 里点第一个文档请求 → **Response** → 右键 Copy value。
4. 提取全部外链 CSS/JS: Network 面板逐个右键请求 → **Copy → Copy response**
   另存为文件; 或全选列表行 → 右键 → **Save all as HAR with content**
   (`.har` 里含每个响应的完整 body, 最省事, 推荐)。
5. 管理页重复上述步骤 (登录状态下)。

#### 1.2 Firefox

1. F12 → **网络 (Network)** 面板, 勾选"保留日志"。
2. 刷新后, 地址栏 `Ctrl+U` 看源码另存; 各 CSS/JS 在"网络"面板点请求 →
   **响应** 标签 → 复制内容另存。
3. 或页面右键 → **另存为 → 网页，全部** (会连带抓 HTML + 引用的 CSS/JS/图片)。

#### 1.3 手机自带浏览器 / 平板

- Android: 手机连同一认证网络 → 用 Chrome 打开认证页 → 电脑 Chrome 访问
  `chrome://inspect` → 对手机页面 **inspect** → 按 1.1 的 Network 方式提取。
- 无电脑时: 手机浏览器菜单里找"发送页面链接/保存页面", 或装"标记浏览器/
  Via"等支持查看源码的浏览器另存 HTML; CSS/JS 用"查看源代码"里逐个复制。
- iOS Safari: 装 **Web Inspector** 用 Mac Safari 远程调试; 或借助
  "a-Shell / iSH" 里的 curl 按 1.4 命令行方式抓。

#### 1.4 命令行 (curl / wget) —— 最完整、推荐批量

适合把登录页 + 管理页整站资源一次抓全 (注意: 部分网关对 UA/Referer 敏感,
加 `-A` 模拟浏览器; 有跳转链加 `-L`; 带查询参数的 URL 整体用引号包住):

```sh
# 单个页面 (含跳转链)
curl -sL -A "Mozilla/5.0" "http://<portal>/portal.html?wlanuserip=..." -o login.html

# 整页资源 (HTML + 它引用的 CSS/JS/图片, 保持目录结构, 适合登录页/管理页各抓一次)
wget -p -k -nH --cut-dirs=1 -A "Mozilla/5.0" \
     "http://<portal>/portal.html?wlanuserip=..."
wget -p -k -nH --cut-dirs=1 -A "Mozilla/5.0" \
     "http://<portal>/ucenter.html"
```

`wget -p` 会顺带下载 HTML 里 `<link>` / `<script src>` / `<img>` 引用的全部资源;
但**动态 `document.createElement('script')`、`import()`、登录后才加载的 js 抓不到**,
这类必须配合 1.1/1.2 的浏览器 Network 面板 (HAR) 补齐。

#### 1.5 抓包工具 (mitmproxy / Fiddler / Charles / HttpCanary)

适合: 页面被网关按 UA 拒绝、HTTPS 认证页、或想同时看清登录请求与响应。

- **mitmproxy**: `mitmproxy --mode regular` → 浏览器走代理访问认证页 →
  对每个请求按 `e` 导出 response body; 或 `mitmdump -w flows.mitm` 全量存盘后解析。
- **Fiddler**: 会话列表全选 → 右键 → **Export Sessions** → 选 "Web Archive" 或
  逐条 "Response → Saved to file"。
- **Charles**: 右键 → **Export** (支持 .chls / 逐条 Save Response)。
- 手机端 **HttpCanary / Stream**: 抓 HTTPS 需装证书, 导出 HAR。

#### 1.6 本地文件 / 设备侧

- 用户已抓包导出 (HAR / .chls / 另存网页目录) 或拿到网关服务器上的页面目录
  (如 `登入/index.html` + `assert/*.js`、`管理/index.html`): 直接读文件分析。
- 词典笔 (设备侧) 没有通用浏览器, 只能作为补充: 用本应用日志里的 `portalPage`
  拿到 URL 后, 仍需在电脑上按上述方式提取。

#### 1.7 提取完整性自查清单

对照检查, 缺一不可:

- [ ] 登录页 HTML (含内联 `<style>` / `<script>`)
- [ ] 登录页引用的**全部**外链 `.css`
- [ ] 登录页引用的**全部**外链 `.js` (加密函数、表单提交、返回码处理都在这里)
- [ ] 管理页 HTML + 其全部 CSS/JS (设备列表 / 下线接口在此)
- [ ] 页面里 iframe 引入的子页面
- [ ] 动态加载的脚本 (HAR 里能看到实际请求, `wget -p` 抓不到的那批)
- [ ] 若认证页有中文: 记录响应编码 (多为 GB2312/GBK), 提取时别转码破坏字节

需要拿到: 登录页 HTML (表单字段/内联跳转逻辑) + 它引用的全部 js
(加密实现 / 登录提交 / 返回码处理); 管理页同理 (列表/下线端点)。

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
