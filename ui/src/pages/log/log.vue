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
import { Panet } from 'panet'

const LOG_PATH = '/userdisk/xiro/wifi.log'
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
      if (!this._started) {
        this._started = true
        this._panet = typeof Panet === 'function' ? new Panet() : Panet
      }
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
      this._panet.readFile(LOG_PATH).then(function (content) {
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
      this._panet.writeFile(LOG_PATH, '').then(function () {
        self.reload()
      }).catch(function (e) {
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
  background-color: #10233f;
  flex-direction: column;
}
.headbar {
  width: 960px;
  height: 44px;
  background-color: #16324f;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-left: 20px;
  padding-right: 16px;
}
.title {
  font-size: 26px;
  color: #e8f1fb;
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
  background-color: #2c5aa0;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
}
.hbtn-refresh {
  background-color: #2f7bd9;
}
.hbtn-clear {
  background-color: #274d7c;
}
.hbtn-back {
  background-color: #3f5f85;
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
  color: #b8cde8;
  margin-bottom: 3px;
}
.logline-err {
  color: #ff8f8f;
}
.logline-ok {
  color: #7fd8b8;
}
.logline-dim {
  color: #5f7ea6;
}
.logline-info {
  color: #9fc3ee;
}
.logempty {
  color: #4a6076;
  margin-top: 20px;
  text-align: center;
}
.statusbar {
  width: 960px;
  flex: 1;
  background-color: #16324f;
  justify-content: flex-end;
  padding-left: 20px;
  padding-right: 16px;
  flex-direction: row;
  align-items: center;
}
.statusinfo {
  font-size: 13px;
  color: #6f8cb0;
  text-align: right;
}
</style>
