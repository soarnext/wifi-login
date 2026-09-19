<template>
  <div class="wrapper">
    <div class="headbar">
      <text class="title">运行日志</text>
      <div class="headbtns">
        <div class="hbtn hbtn-refresh" @click="reload">
          <text class="hbtn-text">刷新</text>
        </div>
        <div class="hbtn hbtn-clear" @click="clearLog">
          <text class="hbtn-text">清空</text>
        </div>
        <div class="hbtn hbtn-back" @click="goBack">
          <text class="hbtn-text">返回</text>
        </div>
      </div>
    </div>
    <scroller class="logscroll">
      <text class="logline" :class="lineClass(line)" v-for="(line, i) in lines" :key="i">{{ line }}</text>
      <text class="logline logempty" v-if="!lines.length">暂无日志</text>
    </scroller>
    <div class="statusbar">
      <text class="statusinfo">{{ statusText }}</text>
    </div>
  </div>
</template>

<script>
/* 日志读写统一走 logger 服务: RK 版落盘文件, CVI 版为内存缓冲, 本页平台无关 */
import { readLog, clearLog as clearLogFile } from '../../services/logger.js'

const MAX_LINES = 120

export default {
  name: 'log',
  data() {
    return {
      lines: [],
      statusText: '',
    }
  },
  methods: {
    onShow() {
      this._started = true
      this.reload()
      if (!this._timer) {
        var self = this
        this._timer = setInterval(function () {
          self.reload()
        }, 3000)
      }
    },
    onHide() {
      this.stopTimer()
    },
    onUnload() {
      this.stopTimer()
    },
    stopTimer() {
      if (this._timer) {
        clearInterval(this._timer)
        this._timer = null
      }
    },
    reload() {
      var self = this
      readLog().then(function (content) {
        /* 内容未变化时跳过: 3s 轮询下避免 120 行日志整列表重渲染 */
        if (content === self._lastContent) return
        self._lastContent = content
        var all = (content || '').split('\n')
        while (all.length && all[all.length - 1] === '') all.pop()
        var tail = all.slice(-MAX_LINES).reverse()
        self.lines = tail
        self.statusText =
          '共 ' + all.length + ' 行, 显示最近 ' + tail.length + ' 行 (新日志在上, 3s 自动刷新)'
      }).catch(function (e) {
        self.lines = []
        self.statusText = '读取失败: ' + e
      })
    },
    /* 按日志 tag/内容着色: 错误红、登录/下线绿、心跳弱化, 便于快速定位 */
    lineClass(line) {
      if (/失败|错误|error|timeout|无响应/i.test(line)) return 'logline-err'
      if (/\[登录\]|\[下线\]/.test(line)) return 'logline-ok'
      if (/\[心跳\]/.test(line)) return 'logline-dim'
      if (/\[检测\]|\[复查\]/.test(line)) return 'logline-info'
      return ''
    },
    clearLog() {
      var self = this
      clearLogFile()
        .then(function () {
          self._lastContent = null // 清空后强制刷新
          self.reload()
        })
        .catch(function (e) {
          self.statusText = '清空失败: ' + e
        })
    },
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
  background-color: #24466b;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
}
.hbtn-refresh {
  background-color: #2f7bd9;
}
.hbtn-clear {
  background-color: #1e3a5f;
}
.hbtn-back {
  background-color: #333333;
}
.hbtn-text {
  font-size: 17px;
  color: #ffffff;
}
.logscroll {
  width: 960px;
  height: 198px;
  padding-left: 16px;
  padding-right: 16px;
  padding-top: 8px;
}
.logline {
  font-size: 16px;
  color: #cccccc;
  margin-bottom: 3px;
}
.logline-err {
  color: #ff7b7b;
}
.logline-ok {
  color: #6fd8b0;
}
.logline-dim {
  color: #666666;
}
.logline-info {
  color: #a8c8ee;
}
.logempty {
  color: #555555;
  margin-top: 20px;
  text-align: center;
}
.statusbar {
  width: 960px;
  flex: 1;
  background-color: #141414;
  justify-content: flex-end;
  padding-left: 20px;
  padding-right: 16px;
  flex-direction: row;
  align-items: center;
}
.statusinfo {
  font-size: 13px;
  color: #888888;
  text-align: right;
}
</style>
