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
      <text class="section">简介</text>
      <text class="row">· WiFi 认证上网框架 + 模块化认证适配器 (自动识别认证页类型)</text>
      <text class="row">· 连通性测试 / 账号密码登录 / 在线设备管理</text>
      <text class="row">· 内置 Panabit 适配器, 更多认证系统见仓库 ADAPTER.md 适配指南</text>
      <text class="section">作者</text>
      <text class="row">· Xiro · 来自 vibe coding 制作</text>
      <text class="section">开源</text>
      <text class="row coderow">github.com/soarnext/wifi-login</text>
      <text class="section">设备兼容性</text>
      <text class="row">· 有道词典笔 X6PRO (RK3562): 已实测, 使用 -rk 产物</text>
      <text class="row">· CVITEK (RISC-V) 机型: 已适配待真机验证, 使用 -cvi 产物</text>
      <text class="row">· 遇到问题请附机型/固件与日志提交 Issues 或 PR</text>
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
