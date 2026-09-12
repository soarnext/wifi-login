# 设备画像: youdao-melonpro-wifi

profile_id: youdao-rk3562-melonpro-wifi
model: 有道词典笔 (RK3562, 主机名 YoudaoDictionaryPen-215, 项目代号 melon_pro)
firmware: Buildroot 2021.11, 内核 Linux 5.10.160 (aarch64), miniapp 运行时 2.3.4 系
adb 标识: product:occam / model:Nexus_4 / device:mako (伪装, 勿依赖)

runtime:
  falcon: libfalcon.so 6.1MB (内置 http / storage 模块)
  quickjs: 20200705
  jsapi 扩展: /etc/miniapp/jsapis/libjsapi_export.so
    - global (JSGlobalProxy: startTextEdit / closeTextEdit / textEditFinished) ✔ 已验证存在于固件
    - wifi (JSWifiProxy: isConnected / getWifiQual / 断开等, 无 IP 查询)
    - camera / bluetooth / volume / brightness / systemInfo / batteryInfo ...
    - 无 misc (gbk_to_utf8 不可用 → 服务端 GB2312 中文用错误码本地映射代替)
    - 无 nm (设备 IP 不可查询 → portal 参数以服务器下发的跳转参数为准)
  输入法: 系统级 mini-app "有道输入法" (appid 8001666679481944, category IM_PANEL_DICT)

screen:
  physical: { width: 960, height: 266, direction: 270, xoffset: 0, yoffset: 107 }
  design: { width: 960 }
  touch: { tp_direction: 270, tp_xoffset: 113, tp_yoffset: 0 }
  触控换算 (display → send_event): touchX = displayY + 107, touchY = 959 - displayX

package:
  appid: "8001865309000001"
  version: 1.0.0
  start_page: index  (固件实测: miniapp_cli start <appid> 不带 --page 才进主页)
  安装: adb push <app>.amr /userdisk/ && miniapp_cli install /userdisk/<app>.amr

validation:
  tested_at: ""
  evidence:
    - /etc/miniapp/resources/cfg.json (960x266, direction 270)
    - miniapp_cli --help (14 子命令, 无 injectKey/setRenderConfig)
    - strings libjsapi_export.so → startTextEdit/textEditFinished 存在
    - strings libfalcon.so → http / storage 模块名存在
    - AES 实现对照 Node crypto ALL PASS; detect 解析 ALL PASS (test/)
  实测结论 (2026-09-06):
    - 固件无系统 http/storage JS 模块 → 自研 libjsapi_panet.so (socket HTTP + 文件持久化)
    - global.startTextEdit 可弹出系统输入法; textEditFinished 回调多参数,
      首参为去横线 UUID, 文本在后续参数 (需归一化比对), 应参考多参数解析
    - 关闭后立刻重开输入法会被忽略, 需 >=600ms 间隔 + 失败重试
    - 输入法面板会引发页面 onHide/onShow, 需"输入会话中"守卫防止自动刷新冲掉表单
    - 连通性测试/无需登入提示/登录表单/IME 输入/登录请求格式 全部真机验证通过
