# WiFi 网络认证 (有道词典笔)

面向有道词典笔的 WiFi captive portal 登录应用。本体是一个**认证框架**:
连通性检测、认证页类型自动识别、适配器注册表、UI、账号存储、日志都是通用的;
具体的认证协议 (获取配置 / 登录 / 状态心跳 / 下线 / 设备管理) 由
**可插拔的适配器模块**实现。内置 [Panabit 上网认证系统](#panabit-portal-api)
适配器作为默认适配器与演示模板, 开发者可按
[适配器开发指南](#适配器开发) 适配任意 WiFi 登入页面。

## 设备兼容性

| 机型 | 状态 | 说明 |
| --- | --- | --- |
| **有道词典笔 X6PRO** | ✅ 已实测 | 本项目唯一完成真机验证的机型，开发与联调均在其上进行 |
| 其他有道词典笔机型 | ⚠️ 未验证 | 未做过适配测试，不保证可用 |

本应用依赖固件私有能力（自研原生模块 `panet`、系统输入法 `global.startTextEdit`、
960×266 横条屏布局），不同机型/固件版本之间可能存在差异。

**其他机型遇到问题怎么办：**

- 欢迎提交 [Issues](../../issues) 反馈，请附上机型、固件版本与 `/userdisk/xiro/wifi.log` 日志
- 也欢迎 Fork 后提交 Pull Request 修复

**PR 合并的前提（务必遵守）：**

1. **不得影响 X6PRO 上已验证的现有功能** —— 这是唯一的基准机型
2. 机型差异请用能力探测做分支处理（例如 `panet` 方法是否存在、屏幕尺寸、
   jsapi 可用性），不要直接改掉通用逻辑
3. 涉及屏幕尺寸的改动必须同时适配 960×266

## 功能

- **认证框架 + 模块化适配器**: 本体不依赖任何具体认证协议, 协议实现在
  `ui/src/services/portal-adapters/` 下的适配器模块 (必选接口 `match` / `loadConf` /
  `login`, 可选 `queryStat` / `logout` / `sync` / `listDevices` / `offOne` / `offAll`);
  协议语义 (会话刷新 / 失败重试 / 返回码文案) 全部收口在适配器内, 页面不出现协议分支。
  适配器提供 `listDevices` 才会在界面显示「设备管理」入口。
- **认证页类型自动识别**: 检测到被强制门户拦截后, 每个适配器按页面特征
  (跳转 URL 参数 / 页面标题 / 内容 / 响应头) 评分, 取最高分者; 识别不出时回退该
  WiFi 上次成功登录所用的适配器, 再不行界面显示「认证类型」选择行由用户手选
  (选完还可手动输入服务器地址)。登录成功会把所用适配器按 WiFi 记住, 下次同 WiFi 优先复用。
- **连通性测试 (国内探测源)**: 小米 `connect.rom.miui.com/generate_204`、vivo `wifi.vivo.com.cn/generate_204`、华为 `connectivitycheck.platform.hicloud.com/generate_204`。
  - **并发竞速**: 三个探测源同时发起, 首个给出确定结论的直接采纳, 不再逐个串行等待
    (实测正常网络下从 ~240ms+ 降到 ~35ms 量级); 单源失败不判决, 全部失败才判无网络。
  - 网络直连正常 → 提示 **"无需登入"**; 若已认证则**自动进入设备管理页**
  - 被强制门户劫持 → 解析跳转页面 (302 Location 透传 / meta refresh / location.href / 带 `wlanuserip`、`paip` 参数的链接), 展示 **Portal 服务器 IP:端口** 与跳转页面 URL
  - 全部探测失败 → 提示无网络连接
- **账号密码登录** (由 Panabit 适配器实现: `webauth/user_login`, 密码 AES-128-ECB/ZeroPadding 加密,
  密钥 `Panabit@1024_key`, 与网页端 `pa_aes_encode` 一致; 登录前自动刷新会话,
  会话过期类失败自动重试一次, 语义在适配器内自理)
- **设备管理页** (由适配器提供 `listDevices` / `offOne` / `offAll` 能力; Panabit 适配器实现):
  - **在线设备列表** (`ucenter/load_user_list`): 设备名 / 在线 IP / MAC / 在线时长, 自动标记「本机」
  - **单设备下线** (`ucenter/user_offone`, `addr=<ip>`): 每台设备一个下线按钮, 带确认弹层
  - **全部下线** (`ucenter/user_offall`): 下线后自动返回主页重新检测
  - 列表 15 秒自动刷新; 全部下线/确认等用自绘弹层 (原生 confirmDialog 不适配横条屏)
- **已认证即进管理页**: 启动检测、登录成功复查、MAC 免认证 (`code=200`) 判定为已认证时,
  自动跳转设备管理页 (停留 800ms 让用户看到状态); 外部小程序调用 (`action=check|login`)
  与用户手动点「重新检测」时不自动跳转, 避免打断调用方流程或界面自己跳走。
  - **防空转**: 自动进入次数上限 2 次, 服务器连不上时不再反复来回跳; 管理页成功拉到
    设备列表后通过 `wifiManageUsable` 事件重置计数。
  - **管理页兜底退出**: 网络类失败 (`connect failed` / `timeout`) 连续 2 次自动退回主页,
    并通过 `wifiManageClosed` 事件通知主页 (只在真正关闭时才触发返回重检, 管理页在前台
    时不会误判为"已返回")。
- **记住密码 (按 WiFi 隔离)**: 文件落盘 (`$dataDir/wifi_account.json`), 密码 AES 密文存储。
  - **每个 WiFi 各存各的账号**: 存储结构 `{ version:2, accounts:{ "<ssid>": {...} }, ssid }`
    (槽位含上次成功登录所用 `adapter`), 换到别的网络不会用上一个网络的账号密码;
    当前 WiFi 名称由原生 `panet.wifiSsid()` 读取 (`iw dev <if> link` → `wpa_cli status` 兜底);
  - **密码不显明文**: 已记住的密码只显示固定长度圆点掩码, 新输入的密码明文显示 3 秒便于核对;
  - 取不到 WiFi 名称时回退"最近使用"槽位; v1 旧数据自动迁移;
  - 支持一键下线 (`ucenter/user_offall`)。
- **会话过期自动处理**: 网页认证页靠 5 秒一次的 `query_auth_stat` 心跳维持服务器侧会话,
  页面静止几分钟后 token 过期会提示"无法登入需刷新"。本应用:
  1. 每次登录前自动重新 `load_portal_conf` 刷新会话 (等价网页端刷新页面);
  2. 认证页停留期间 30 秒心跳保活, 同时探测是否已在别处完成认证;
  3. 会话过期类失败自动刷新重试一次 (密码错误 255 / 锁定 3 / 需改密 2 不重试);
  4. 切后台超过 90 秒回前台自动重新检测; 从管理页返回时立即重新检测本机状态。
- **前后台切换不冲突**:
  - 每次重新检测会 `abort` 上一次仍在途的探测, 迟到的旧结果不再覆盖新状态;
  - 系统输入法面板引起的 onHide/onShow 被识别并抑制, 不会冲掉登录表单;
  - 检测/心跳/日志等定时器在 onHide/onUnload 统一释放。
- **系统输入法**: 账号/密码通过 `global.startTextEdit` 唤起系统级"有道输入法"面板
  (单例 Global、textEditFinished on/off 成对、UUID 校验、仅 editConfirmed 写回、页面销毁清理)。

## 工程

```
.github/workflows/build.yml   # GitHub Actions: 交叉编译 .so + 打包 AMR + 发布 Release
CHANGELOG.md                  # 更新日志 (CI 发版时按版本抽取为 Release Notes)
ADAPTER.md                    # 适配器模块开发指南 (接口契约 + 全流程)
SKILL.md                      # 配套 skill: 从网站分析到制作适配器全流程
native/                       # 自研原生模块 panet (固件无系统 http/storage 模块)
  panet/panet.cpp             #   request / writeFile / appendFile / readFile / mkdirs / wifiSsid
  panet/CMakeLists.txt        #   aarch64 交叉编译配置
  sdk/                        #   板端 JSAPI SDK 头文件
ui/                           # 小程序源码 (aiot-vue-cli 工程)
  src/app.js                  # setViewPort(960) + BasePage 注册
  src/app.json                # 页面注册: index / management / log / about
  src/base-page.js            # 页面基类: token/timer 统一释放
  src/pages/index/index.vue        # 主页面 (960x266 横条屏)
  src/pages/management/management.vue  # 设备管理页 (列表/单机下线/全部下线)
  src/pages/log/log.vue            # 日志页 (最近 120 行, 3s 刷新)
  src/pages/about/about.vue        # 关于页
  src/services/net.js         # panet 适配层 (返回值归一化) + wifiSsid()
  src/services/detect.js      # 连通性测试 (并发竞速) + portal 劫持解析 (附 headers)
  src/services/portal-adapters/   # 认证适配器模块 (本体框架消费的稳定接口)
    adapter-api.js            #   适配器公共工具 (查询串序列化 / GB2312 清洗)
    panabit.js                #   Panabit 适配器 (内置默认, 亦作演示模板)
    registry.js               #   注册表 + detectAdapter 自动识别 (特征评分)
  src/services/aes.js         # AES-128-ECB/ZeroPadding 纯 JS 实现
  src/services/ime.js         # 系统输入法 (global.startTextEdit) 封装
  src/services/store.js       # 账号持久化 (按 WiFi/SSID 分桶)
  src/services/logger.js      # 运行日志写 /userdisk/xiro/wifi.log
  src/services/version.js     # 版本号
profiles/                     # 设备画像 (X6PRO 真机实测结论)
```

## Panabit Portal API

以下协议由内置的 **Panabit 适配器** (`panabit.js`) 实现, 作为默认适配器与演示模板
(其他认证系统按[适配器开发指南](#适配器开发)自行适配)。

端点: `http://<portal服务器>[:端口]/api?<查询参数>`, 响应 JSON, `code==0` 成功, `code==200` 为 MAC 免认证已通过。

| route | action | 参数 | 说明 |
|---|---|---|---|
| portal | load_portal_conf | ip, vlan, mac, device | 加载配置/策略; 建立会话 |
| webauth | user_login | auth_type, ip, mac, username, password(AES), remember_me | 账号密码登录; code 3=锁定(带 left), 2=需改密, 255=账密错误 |
| webauth | query_auth_stat | scene_str, ip, type | 认证状态/心跳; data.stat!=0 即已认证 |
| ucenter | user_offall | ip | 下线所有 |
| ucenter | load_user_list | ip | 在线设备列表 (管理页提取) |
| ucenter | user_offone | addr | 单设备下线 (addr=目标设备在线 IP, 管理页提取) |

## 适配器开发

本体为框架, 适配新的 WiFi 登入页面只需两步:

1. 在 `ui/src/services/portal-adapters/` 新增 `<协议>.js` (建议复制 `panabit.js` 演示模板),
   实现接口契约 (必选 `match` / `loadConf` / `login`, 其余可选);
2. 在 `registry.js` 的 `ADAPTERS` 数组注册一行。

注册后: 「认证类型」选择列表与自动识别自动生效; 提供 `listDevices` 则自动显示
「设备管理」入口。完整的接口契约、自动识别评分机制、开发全流程
(获取前端代码 → 分析协议 → 阻塞检查 → 实现 → 注册 → 验证) 见
[ADAPTER.md](ADAPTER.md) (配套 skill 见 [SKILL.md](SKILL.md))。

## 构建与安装

GitHub Actions 云端打包（推送 `main` 或打 `v*` 标签即触发；打标签时构建完成后
自动创建 Release 并上传 AMR）。也可直接从 [Releases](../../releases) 下载现成产物:

```sh
adb push 8001865309000001.1_0_0.amr /data/local/tmp/
adb shell "miniapp_cli install /data/local/tmp/8001865309000001.1_0_0.amr"
adb shell "miniapp_cli start 8001865309000001"
```

> 该固件 `miniapp_cli start <appid>` 不带 `--page` 才进主页。

## 外部小程序调用接口

无图标应用, 供其他小程序按需拉起。调用方:

```js
// 打开登录界面 (指定服务器, 预填账号密码, 自动提交)
$falcon.navTo('falcon://8001865309000001/index', {
  action: 'login',
  server: '192.168.64.199:8080',   // 或 http://192.168.64.199:8080
  username: '15180484996',
  password: 'xxxx',
  remember: '1',
  auto: '1',
  adapter: 'panabit',              // 可选: 强制指定适配器, 缺省自动识别/该 WiFi 记住的
})

// 检测网络是否需要登入 (结果 JSON 经 $falcon.trigger('wifiCheckResult') 回传:
//   $falcon.on('wifiCheckResult', json => { ... })
//   { status: 'free'|'portal'|'offline', needLogin: bool, probe, serverIp,
//     serverPort, serverBase, portalPage, pageTitle, error }
$falcon.navTo('falcon://8001865309000001/index', { action: 'check' })
$falcon.navTo('falcon://8001865309000001/index', { action: 'check', callback: 'myEventName' })

// 仅打开日志页
$falcon.navTo('falcon://8001865309000001/index', { action: 'log' })

// 无参数 = 正常流程 (自动连通性检测)
$falcon.navTo('falcon://8001865309000001')
```

| 参数 | 说明 |
|---|---|
| action | `login` 登录 / `check` 检测并回调结果 / `log` 日志页 / 缺省 = 自动连通性检测 |
| callback | `action=check` 时结果回调的事件名, 缺省 `wifiCheckResult` |
| server | `IP[:端口]` 或 `http://IP[:端口]`, 提供则跳过自动探测 (https 不支持) |
| username / password | 预填凭据 (密码明文传输, 仅限调用方可信场景) |
| remember | `'1'` 记住密码 |
| auto | `'1'` 且 server/username/password 齐全时自动提交登录 |
| adapter | 可选, 强制指定适配器 ID (如 `panabit`); 缺省自动识别 / 用该 WiFi 记住的 / 第一个注册的 |

> 外部调用场景 (`action=check` / `action=login`) **不会自动跳转设备管理页**, 以免打断调用方流程;
> 只有正常启动流程 (无参数) 检测到已认证时才自动进入管理页。

页面已在前台时被重新拉起, 参数同样生效 (走 `onNewOptions`)。

### 设备管理页

`management` 页同样可被直接拉起, 传入已有服务器与本机 IP 可跳过重复探测;
`adapter` 需传适配器 ID, 且该适配器提供 `listDevices` 能力才能拉起设备列表:

```js
$falcon.navTo('falcon://8001865309000001/management', {
  serverBase: 'http://192.168.64.199:8080',
  ip: '192.168.50.11',   // 本机在线 IP, 用于标记「本机」
  adapter: 'panabit',    // 适配器 ID (缺省无设备管理能力, 会提示后返回)
})
```

检测结果同时机器可读落盘 `/userdisk/xiro/status.json` (每次检测后更新):
`{"time":"09-06 14:00:00","status":"free","probe":"小米","server":"","portalPage":"","message":"网络直连正常，无需登入"}`

## 日志

应用运行日志单独存储在 `/userdisk/xiro/wifi.log` (目录不存在自动创建, 超过 512KB 自动截断轮转):

```
adb shell "cat /userdisk/xiro/wifi.log"
```

记录: 启动、连通性测试结果、适配器自动识别/手动选择、Portal 配置解析、登录请求结果、心跳异常认证、手动服务器输入、下线、设备列表与单机下线。
应用内「日志」按钮可打开日志页 (新日志在上, 3 秒自动刷新, 支持刷新/清空/返回)。
