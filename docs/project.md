# 工程结构与构建

> 返回 [README](../README.md)

## 工程结构

```
.github/
  ISSUE_TEMPLATE/             # 提 Issue 模板: Bug 反馈 / 添加认证适配器
  workflows/build.yml         # GitHub Actions: 交叉编译 .so + 打包 AMR + 发布 Release
ADAPTER.md                    # 适配器模块开发指南 (接口契约 + 全流程)
CHANGELOG.md                  # 更新日志 (CI 发版时按版本抽取为 Release Notes)
SKILL.md                      # 配套 skill: 从网站分析到制作适配器全流程
docs/                         # 详细文档 (外部调用接口 / Panabit 协议 / 本文件)
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

## 构建

GitHub Actions 云端打包 (推送 `main` 或打 `v*` 标签即触发; 打标签时构建完成后
自动创建 Release 并上传 AMR)。流程: 交叉编译 `libjsapi_panet.so` (aarch64) →
`pnpm install -C ./ui` → `pnpm -C ui package` (`aiot-cli -c -q -p` 产出 QuickJS
生产包) → 上传/发布。

本地构建 (需 Node + pnpm):

```sh
pnpm install -C ./ui
pnpm -C ui build          # debug AMR (aiot-cli -p)
pnpm -C ui package        # 生产 QuickJS AMR (aiot-cli -c -q -p)
```

版本号在 `ui/package.json` 与 `ui/src/services/version.js` 两处同步,
产物名为 `<appid>.<主>_<次>_<修>.amr` (如 `8001865309000001.1_1_0.amr`)。

## 安装

```sh
adb push 8001865309000001.1_1_0.amr /data/local/tmp/
adb shell "miniapp_cli install /data/local/tmp/8001865309000001.1_1_0.amr"
adb shell "miniapp_cli start 8001865309000001"
```

> 该固件 `miniapp_cli start <appid>` 不带 `--page` 才进主页。
