<template>
  <div class="wrapper">
    <div class="headbar">
      <text class="title">关于</text>
      <div class="headbtns">
        <div class="hbtn" @click="goBack">
          <text class="hbtn-text">返回</text>
        </div>
      </div>
    </div>
    <scroller class="aboutscroll">
      <div class="titlerow">
        <text class="appname">WiFi 网络认证</text>
        <div class="verbadge"><text class="verbadge-text">v{{ version }}</text></div>
      </div>
      <text class="row">appid: {{ appid }}</text>
      <text class="section">功能</text>
      <text class="row">· WiFi 连通性测试 (国内探测源并发竞速), 直连正常提示无需登入</text>
      <text class="row">· 被强制门户劫持时自动解析 Portal 服务器地址</text>
      <text class="row">· Panabit Portal 账号密码登录 (密码 AES 加密提交)</text>
      <text class="row">· 记住密码按 WiFi 隔离: 每个网络各存各的, 密码密文落盘且界面掩码</text>
      <text class="row">· 设备管理: 在线设备列表 / 单设备下线 / 全部下线</text>
      <text class="row">· 已认证时自动进入设备管理页 (带防空转与冷却策略)</text>
      <text class="row">· 会话过期自动刷新 + 30 秒心跳保活</text>
      <text class="row">· 探测不到服务器时可手动输入 IP:端口</text>
      <text class="section">外部调用</text>
      <text class="row coderow">$falcon.navTo('falcon://{{ appid }}/index', 参数)</text>
      <text class="row coderow">- action=check 检测是否需要登入, 结果经 $falcon.trigger 回调</text>
      <text class="row coderow">  (默认事件名 wifiCheckResult, 可用 callback 指定)</text>
      <text class="row coderow">- action=login 登录 (server/username/password/remember/auto)</text>
      <text class="row coderow">- action=log 打开日志页</text>
      <text class="section">日志</text>
      <text class="row">/userdisk/xiro/wifi.log (超过 512KB 自动轮转)</text>
      <text class="section">设备兼容性</text>
      <text class="row">· 有道词典笔 X6PRO: 已实测 (唯一完成真机验证的机型)</text>
      <text class="row">· 其他机型: 未验证, 遇到问题请附机型/固件与日志提交 Issues 或 PR</text>
    </scroller>
    <div class="statusbar">
      <text class="statusinfo">开源: github.com/soarnext/wifi-login  |  仅 X6PRO 实测, 其他机型请提 Issues / PR</text>
    </div>
  </div>
</template>

<script>
import { APP_VERSION, APP_ID } from '../../services/version.js'

export default {
  name: 'about',
  data() {
    return {
      version: APP_VERSION,
      appid: APP_ID,
    }
  },
  methods: {
    onShow() {},
    onHide() {},
    onUnload() {},
    goBack() {
      this.$page.finish()
    },
  },
}
</script>

<style>
.wrapper {
  width: 960px;
  height: 266px;
  background-color: #000000;
  flex-direction: column;
}
.headbar {
  width: 960px;
  height: 44px;
  background-color: #141414;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-left: 20px;
  padding-right: 16px;
}
.title {
  font-size: 26px;
  color: #ffffff;
  font-weight: bold;
}
.headbtns {
  flex-direction: row;
  align-items: center;
}
.hbtn {
  width: 90px;
  height: 32px;
  border-radius: 16px;
  background-color: #333333;
  align-items: center;
  justify-content: center;
}
.hbtn-text {
  font-size: 17px;
  color: #ffffff;
}
.aboutscroll {
  width: 960px;
  height: 198px;
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 10px;
}
.titlerow {
  flex-direction: row;
  align-items: center;
}
.appname {
  font-size: 22px;
  color: #37c2a0;
  font-weight: bold;
  margin-right: 10px;
}
.verbadge {
  height: 26px;
  border-radius: 13px;
  background-color: #143326;
  align-items: center;
  justify-content: center;
  padding-left: 10px;
  padding-right: 10px;
}
.verbadge-text {
  font-size: 14px;
  color: #6fe3c0;
}
.section {
  font-size: 17px;
  color: #ffb648;
  font-weight: bold;
  margin-top: 8px;
  margin-bottom: 4px;
}
.row {
  font-size: 15px;
  color: #cccccc;
  margin-bottom: 3px;
}
.coderow {
  color: #8fb7e8;
}
.statusbar {
  width: 960px;
  height: 24px;
  background-color: #141414;
  justify-content: center;
  padding-left: 20px;
}
.statusinfo {
  font-size: 13px;
  color: #888888;
}
</style>
