# 更新日志

有道词典笔 (Falcon mini-app) 上的 Panabit 网页认证登录应用。
所有版本产物为 `.amr` 安装包，见 [Releases](../../releases)。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

---

## [1.0.0] - 2026-09-12

首个正式版。完成从"能登录"到"好用且稳"的收口：设备管理能力、按网络隔离的凭据、
以及在服务器不可达时不再失控的行为。

### 新增

- **设备管理页** (`management`)
  - 在线设备列表 (`ucenter/load_user_list`)：设备名 / 在线 IP / MAC / 在线时长，自动标记「本机」
  - 单设备下线 (`ucenter/user_offone`，`addr=<在线IP>`)：每台设备一个下线按钮 + 自绘确认弹层
  - 全部下线 (`ucenter/user_offall`)：下线后自动返回主页重新检测
  - 列表 15 秒自动刷新
- **已认证即进管理页**：启动检测、登录成功复查、MAC 免认证 (`code=200`) 判定为已认证时
  自动跳转管理页（停留 800ms 让用户看到状态）
- **记住密码按 WiFi 隔离**
  - 存储结构升级 v2：`{ version:2, accounts: { "<ssid>": {...} }, ssid, serverBase }`
  - 换网络不会串用上一个 WiFi 的账号密码
  - 当前 WiFi 名称由原生 `panet.wifiSsid()` 读取（`iw dev <if> link` → `wpa_cli status` 兜底）
  - 取不到 WiFi 名时回退"最近使用"槽位；v1 旧数据自动迁移
- **密码不显明文**：已记住的密码只显示固定长度圆点掩码；新输入的密码明文显示 3 秒便于核对
- **原生模块 `panet` 新增 `wifiSsid()`**

### 优化

- **探测并发竞速**：三个国内探测源同时发起，首个确定结论直接采纳
  （正常网络下从串行 ~240ms+ 降到 ~35ms 量级）；单源失败不判决，全部失败才判无网络
- **前后台切换不冲突**：每次重检 abort 上一次在途探测，迟到结果不再覆盖新状态；
  输入法面板引起的 onHide/onShow 被识别并抑制；定时器在 onHide/onUnload 统一释放

### 修复

- 管理页与主页之间反复来回跳（空转）：
  - `openManagement` 不再预设 `_leftAt`，改由管理页关闭时 `trigger('wifiManageClosed')` 通知
  - 自动进入次数上限 2 次 + 8 秒防抖
  - 管理页"从未成功拉到过列表就关闭"一律按失败处理（系统会在 3 秒内回收页面，
    此时拿不到失败信号，单靠计数会漏）
  - 失败退出后进入 3 分钟冷却窗；管理页成功加载或用户手动重检时解除
  - 首屏 `load_portal_conf` 连不上时 1.2 秒后自动退回主页，不再悬空等待被系统回收
- `$falcon` 事件参数在跨页面回调中被包成对象（`[object Object]`），
  导致失败标记丢失；已兼容字符串 / `{0:...}` / `{detail:...}` / `{data:{value:...}}` / 嵌套对象

---

## [0.6.0] - 2026-09-12

- 设备管理页（设备列表 / 单机下线 / 全部下线）
- 连通性检测改为并发竞速
- 已认证自动进入管理页

## [0.5.0] - 2026-09-06

- 外部小程序调用接口 `action=check`：检测结果经 `wifiCheckResult` 事件回传，callback 名可指定
- 新增关于页

## [0.4.0] - 2026-09-06

- 去除图标
- 新增外部小程序调用接口（`navTo falcon://` 启动参数：login / log / server / 凭据 / auto）

## [0.3.0] - 2026-09-06

- 新增应用内日志页（最近 120 行 / 新日志在上 / 3s 自动刷新 / 清空 / 返回）

## [0.2.0] - 2026-09-06

- 应用日志单独存储到 `/userdisk/xiro/wifi.log`（自动建目录 + 超过 512KB 轮转）
- `panet` 增加 `appendFile` / `mkdirs`

## [0.1.0] - 2026-09-05

首个可用版本。

- Panabit Portal 账号密码登录（AES-128-ECB/ZeroPadding，密钥 `Panabit@1024_key`）
- 连通性测试 + 跳转页面解析
- 自研原生模块 `panet`（固件无系统 http / storage 模块）
- 系统输入法唤起（`global.startTextEdit`）
- 记住密码（密码 AES 密文落盘）
- 一键下线

---

## 已知限制

- 认证服务器不可达时管理页无法使用，此时应用会在主页提示并停止自动进入（3 分钟冷却）
- 设备 IP 无法从固件查询（`jsapi` 无 `nm` 模块），Portal 参数以服务器下发的跳转参数为准
- 服务端 GB2312 中文无法转 UTF-8（固件无 `misc` 模块），错误信息用错误码本地映射代替

[1.0.0]: https://github.com/bot-xiro/wifi-login/releases/tag/v1.0.0
[0.6.0]: https://github.com/bot-xiro/wifi-login/releases/tag/v0.6.0
[0.5.0]: https://github.com/bot-xiro/wifi-login/releases/tag/v0.5.0
[0.4.0]: https://github.com/bot-xiro/wifi-login/releases/tag/v0.4.0
[0.3.0]: https://github.com/bot-xiro/wifi-login/releases/tag/v0.3.0
[0.2.0]: https://github.com/bot-xiro/wifi-login/releases/tag/v0.2.0
[0.1.0]: https://github.com/bot-xiro/wifi-login/releases/tag/v0.1.0
