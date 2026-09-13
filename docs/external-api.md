# 外部调用接口与日志

> 返回 [README](../README.md)

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

## 设备管理页

`management` 页同样可被直接拉起, 传入已有服务器与本机 IP 可跳过重复探测;
`adapter` 需传适配器 ID, 且该适配器提供 `listDevices` 能力才能拉起设备列表:

```js
$falcon.navTo('falcon://8001865309000001/management', {
  serverBase: 'http://192.168.64.199:8080',
  ip: '192.168.50.11',   // 本机在线 IP, 用于标记「本机」
  adapter: 'panabit',    // 适配器 ID (缺省无设备管理能力, 会提示后返回)
})
```

## 检测结果写盘

检测结果同时机器可读落盘 `/userdisk/xiro/status.json` (每次检测后更新):

```json
{"time":"09-06 14:00:00","status":"free","probe":"小米","server":"","portalPage":"","message":"网络直连正常，无需登入"}
```

## 日志

应用运行日志单独存储在 `/userdisk/xiro/wifi.log` (目录不存在自动创建, 超过 512KB 自动截断轮转):

```
adb shell "cat /userdisk/xiro/wifi.log"
```

记录: 启动、连通性测试结果、适配器自动识别/手动选择、Portal 配置解析、登录请求结果、
心跳异常认证、手动服务器输入、下线、设备列表与单机下线。
应用内「日志」按钮可打开日志页 (新日志在上, 3 秒自动刷新, 支持刷新/清空/返回)。
