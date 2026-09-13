<template>
  <div class="wrapper">
    <div class="headbar">
      <div class="titlerow">
        <div class="logo"><text class="logo-text">Wi</text></div>
        <text class="title">WiFi 网络认证</text>
      </div>
      <div class="headbtns">
        <div class="headbtn headbtn-sm" @click="openLog">
          <text class="headbtn-text">日志</text>
        </div>
        <div class="headbtn headbtn-sm" @click="openAbout">
          <text class="headbtn-text">关于</text>
        </div>
        <div class="headbtn" @click="runCheck(null, true)">
          <text class="headbtn-text">{{ checking ? '检测中…' : '重新检测' }}</text>
        </div>
      </div>
    </div>
    <div class="divider"></div>

    <div class="statusarea" @click="runCheck(null, true)">
      <div class="statusmain">
        <div class="statusline">
          <div class="statusdot statusdot-free" v-if="pageState === 'free'"></div>
          <div class="statusdot statusdot-ok" v-if="pageState === 'ok'"></div>
          <div class="statusdot statusdot-portal" v-if="pageState === 'portal'"></div>
          <div class="statusdot statusdot-offline" v-if="pageState === 'offline'"></div>
          <div class="statusdot statusdot-busy" v-if="pageState === 'busy'"></div>
          <div class="statusdot statusdot-busy" v-if="pageState === 'manual'"></div>
          <text class="status status-free" v-if="pageState === 'free'">无需登入</text>
          <text class="status status-ok" v-if="pageState === 'ok'">认证成功，无需登入</text>
          <text class="status status-portal" v-if="pageState === 'portal'">需要认证</text>
          <text class="status status-offline" v-if="pageState === 'offline'">无网络连接</text>
          <text class="status status-busy" v-if="pageState === 'busy'">正在检测…</text>
          <text class="status status-busy" v-if="pageState === 'manual'">需要认证（未识别服务器）</text>
        </div>
      </div>
      <div class="statusinfo">
        <div class="inforow" v-if="probeName">
          <text class="infolabel">连通性测试</text>
          <text class="infovalue">{{ probeName }}</text>
        </div>
        <div class="inforow" v-if="serverShow">
          <text class="infolabel">认证服务器</text>
          <text class="infovalue">{{ serverShow }}</text>
        </div>
        <div class="inforow" v-if="portalPage">
          <text class="infolabel">跳转页面</text>
          <text class="infovalue">{{ portalPage }}</text>
        </div>
        <div class="inforow" v-if="deviceIp">
          <text class="infolabel">本机参数</text>
          <text class="infovalue">{{ deviceIp }}</text>
        </div>
      </div>
    </div>

    <div class="formrow" v-if="showForm || canLogout">
      <div class="field" v-if="showForm" @click="editUsername">
        <text class="fieldlabel">账号</text>
        <text class="fieldvalue" v-if="username">{{ username }}</text>
        <text class="fieldvalue fieldplaceholder" v-if="!username">点此输入账号</text>
      </div>
      <div class="field" v-if="showForm" @click="editPassword">
        <text class="fieldlabel">密码</text>
        <!-- 已记住的密码不显示明文, 仅显示掩码长度; 新输入的密码短暂可见 -->
        <text class="fieldvalue" v-if="pwdMask && !pwdRevealed">{{ pwdMask }}</text>
        <text class="fieldvalue" v-if="password && pwdRevealed">{{ password }}</text>
        <text class="fieldvalue fieldplaceholder" v-if="!password">点此输入密码</text>
      </div>
      <div class="remember" v-if="showForm" @click="toggleRemember">
        <text class="remembertext remembertext-on" v-if="remember">已记住密码</text>
        <text class="remembertext" v-if="!remember">记住密码</text>
      </div>
      <div class="btn btn-login" v-if="showForm && !logging" @click="doLogin">
        <text class="btn-text">登 录</text>
      </div>
      <div class="btn btn-busy" v-if="showForm && logging">
        <text class="btn-text">登录中…</text>
      </div>
      <div class="btn btn-manage" v-if="canLogout" @click="openManagement">
        <text class="btn-text">设备管理</text>
      </div>
      <div class="btn btn-logout" v-if="canLogout" @click="doLogout">
        <text class="btn-text btn-text-logout">下 线</text>
      </div>
    </div>

    <div class="formrow" v-if="showManualServer">
      <div class="field field-wide" @click="editServer">
        <text class="fieldlabel">服务器</text>
        <text class="fieldvalue-wide" v-if="manualServer">{{ manualServer }}</text>
        <text class="fieldvalue-wide fieldplaceholder" v-if="!manualServer">点此输入认证服务器IP[:端口]</text>
      </div>
      <div class="btn btn-login" @click="applyManualServer">
        <text class="btn-text">确 定</text>
      </div>
    </div>

    <div class="divider"></div>
    <div class="msgrow">
      <div class="msgbar msgbar-error" v-if="msgType === 'error' && msg"></div>
      <div class="msgbar msgbar-warn" v-if="msgType === 'warn' && msg"></div>
      <div class="msgbar msgbar-info" v-if="msgType === 'info'"></div>
      <text class="msg msg-error" v-if="msgType === 'error'">{{ msg }}</text>
      <text class="msg msg-warn" v-if="msgType === 'warn'">{{ msg }}</text>
      <text class="msg msg-info" v-if="msgType === 'info'">{{ msg }}</text>
      <text class="msg msg-info" v-if="!msg">就绪</text>
    </div>
  </div>
</template>

<script>
import { checkPortal } from '../../services/detect.js'
import { loadPortalConf, userLogin, queryAuthStat, logout } from '../../services/portal.js'
import { loadAccount, saveAccount } from '../../services/store.js'
import { wifiSsid } from '../../services/net.js'
import { log, initLog } from '../../services/logger.js'
import { Panet } from 'panet'
import { SystemIme } from '../../services/ime.js'

/* 管理页判定"服务器不可用"后, 这段时间内不再自动进入 (用户手动重检可立即解除) */
const MANAGE_COOLDOWN_MS = 180000

export default {
  name: 'index',
  data() {
    return {
      pageState: 'busy', // free | ok | portal | offline | busy | manual
      probeName: '',
      serverShow: '',
      serverBase: '',
      portalPage: '',
      deviceIp: '',
      authType: 'panabit',
      sceneStr: '',
      username: '',
      password: '',
      /* 已记住的密码来源SSID: 用于掩码显示与"按网络隔离"提示 */
      ssid: '',
      /* 本次新输入的密码短暂明文显示, 记住的密码始终只显示掩码 */
      pwdRevealed: false,
      remember: false,
      logging: false,
      checking: false,
      canLogout: false,
      showForm: false,
      showManualServer: false,
      manualServer: '',
      msg: '',
      msgType: 'info',
    }
  },
  computed: {
    /* 已记住密码的掩码: 不泄露真实长度与内容, 固定 8 位圆点 */
    pwdMask() {
      return this.password ? '\u25cf\u25cf\u25cf\u25cf\u25cf\u25cf\u25cf\u25cf' : ''
    },
  },
  methods: {
    onShow() {
      if (this._started) {
        // 系统输入法面板弹出/收起会让本页 onHide/onShow 一轮;
        // 输入会话中及刚关闭的短暂窗口内不做自动刷新, 否则会把登录表单冲掉
        if (this.logging) return
        if (this._imeBusy) return
        if (this._imeClosedAt && Date.now() - this._imeClosedAt < 3000) return
        // 从设备管理页返回 (由管理页 trigger('wifiManageClosed') 打标):
        // 立即重新检测本机是否已下线, 不受 90 秒节流限制。
        // _leftAt 只在管理页真正关闭时才被设置, 管理页在前台时不会被误触。
        if (this._leftAt) {
          this._leftAt = 0
          this._enteredManageAt = 0
          this.runCheck()
          return
        }
        // 从后台回来: 认证会话可能已过期, 停留超过 90 秒未同步则自动重新检测
        var stale = !this._lastSyncAt || Date.now() - this._lastSyncAt > 90000
        if ((this.pageState === 'portal' || this.pageState === 'manual') && stale) {
          this.runCheck()
        }
        return
      }
      this._started = true
      this.ime = new SystemIme()
      initLog()
      log('应用', '页面启动')
      // 管理页确认服务器可用时, 重置自动进入次数限制
      var self0 = this
      try {
        this._manageUsableToken = $falcon.on('wifiManageUsable', function () {
          self0._manageUsable()
        })
        this._manageClosedToken = $falcon.on('wifiManageClosed', function (info) {
          self0._manageClosed(info)
        })
      } catch (e) {}
      var self = this
      // == DEBUG: 真机联调开关, 验证完删除 ==
      var DBG = null // 联调开关: 设为 { server, username, password } 可跳过探测直连指定服务器
      if (DBG) {
        this.username = DBG.username
        this.password = DBG.password
        this.remember = true
        this._lastServer = DBG.server
        this._lastSyncAt = Date.now()
        this.pageState = 'portal'
        this.serverBase = DBG.server
        this.serverShow = DBG.server.replace('http://', '')
        this.authType = 'panabit'
        this.showForm = true
        this.startHeartbeat()
        this.setMsg('[调试] 已指向模拟认证服务器', 'warn')
        return
      }
      // 外部小程序调用接口 (见 applyLaunch)
      if (self.applyLaunch(self.readLaunchOptions())) return
      /* 先取当前 WiFi 名称, 再按名称读对应账号 (不同门店/网络各存各的密码) */
      wifiSsid().then(function (ssid) {
        self._ssid = ssid || ''
        return loadAccount(self._ssid)
      }).then(function (acc) {
        self.username = acc.username
        self.password = acc.password
        self.remember = acc.remember
        self.ssid = self._ssid || acc.ssid || ''
        self._lastServer = acc.serverBase || ''
        log('配置', 'wifi=' + (self._ssid || '(未知)') + ' 已存账号=' + (acc.username || '无'))
        self.runCheck()
      })
    },

    /* ---- 外部小程序调用接口 ----
     * 其他小程序通过 $falcon.navTo('falcon://8001865309000001/index', {参数}) 调用,
     * 参数 (KV 字符串) 也支持页面已被拉起时通过 newOptions 传入:
     *   action  : 'login' 直接进入登录流程 / 'log' 打开日志页 / 缺省正常检测
     *   server  : 'IP[:端口]' 或 'http://IP[:端口]' (提供则跳过自动探测)
     *   username/password : 预填凭据 (密码明文传输, 仅限调用方可信时)
     *   remember: '1' 记住密码
     *   auto    : '1' 且 server/username/password 齐全时自动提交登录
     */
    readLaunchOptions() {
      try {
        var lo = this.$page && this.$page.loadOptions
        var no = this.$page && this.$page.newOptions
        var o = no && this.hasKeys(no) ? no : lo
        if (!o) return null
        if (typeof o === 'string') {
          try {
            o = JSON.parse(o)
          } catch (e) {
            return null
          }
        }
        if (!o || typeof o !== 'object' || !this.hasKeys(o)) return null
        return o
      } catch (e) {
        return null
      }
    },
    hasKeys(o) {
      for (var k in o) return true
      return false
    },
    safeJson(o) {
      try {
        return JSON.stringify(o)
      } catch (e) {
        return String(o)
      }
    },
    normalizeServer(v) {
      var s = String(v || '').replace(/^\s+|\s+$/g, '')
      if (!s) return ''
      if (/^https:\/\//i.test(s)) return ''
      s = s.replace(/^http:\/\//i, '').replace(/\/+$/, '')
      if (!/^[A-Za-z0-9.\-]+(:\d+)?$/.test(s)) return ''
      return 'http://' + s
    },
    /* 返回 true 表示已按调用参数执行, 跳过默认探测流程 */
    applyLaunch(o) {
      if (!o) return false
      var action = String(o.action || '').toLowerCase()
      /* 外部拉起: 整个生命周期内不自动跳转管理页, 避免打断调用方流程 */
      this._launched = true
      if (action === 'log') {
        log('接口', '外部调用: 打开日志页')
        $falcon.navTo('log', {})
        return true
      }
      if (action === 'check') {
        // 检测网络是否需要登入, 结果通过 $falcon.trigger 回传给调用方
        var cb = String(o.callback || 'wifiCheckResult')
        log('接口', '外部调用: 检测网络, 回调事件=' + cb)
        this._checkCallback = cb
        this.runCheck()
        return true
      }
      var server = this.normalizeServer(o.server)
      if (action === 'login' || server) {
        if (!server) {
          log('接口', '外部调用缺少有效 server: ' + String(o.server || ''))
          this.runCheck()
          return true
        }
        log('接口', '外部调用: 登录流程 server=' + server + ' auto=' + String(o.auto || ''))
        this._lastServer = server
        this._lastSyncAt = Date.now()
        this.serverBase = server
        this.serverShow = server.replace('http://', '')
        if (o.username) this.username = String(o.username)
        if (o.password) this.password = String(o.password)
        if (o.remember === '1' || o.remember === 1 || o.remember === true) this.remember = true
        this.authType = 'panabit'
        this.pageState = 'portal'
        this.showForm = true
        this.showManualServer = false
        this.startHeartbeat()
        var auto = o.auto === '1' || o.auto === 1 || o.auto === true
        if (auto && this.username && this.password) {
          this.setMsg('外部调用自动登录中…', 'info')
          this.doLogin()
        } else {
          this.setMsg('外部调用：请确认账号密码后点击登录', 'warn')
        }
        return true
      }
      return false
    },
    onNewOptions(options) {
      // 页面已在运行时被外部重新拉起
      var self = this
      if (!this._started) return
      var o = options
      if (o && typeof o === 'string') {
        try {
          o = JSON.parse(o)
        } catch (e) {
          o = null
        }
      }
      if (!o || typeof o !== 'object' || !this.hasKeys(o)) return
      log('接口', '外部重新拉起: ' + safeJson(o))
      if (this.applyLaunch(o)) return
      this.runCheck()
    },
    onHide() {
      // 输入会话中 (输入法面板导致的 onHide): 保留会话与心跳, 不当成本页离开
      if (this._imeBusy) return
      this._leftAt = Date.now()
      this.stopHeartbeat()
      if (this.ime) this.ime.cancel()
    },
    onUnload() {
      this._gen = (this._gen || 0) + 1
      this._destroyed = true
      if (this._detectSignal) this._detectSignal.aborted = true
      if (this._autoManageTimer) clearTimeout(this._autoManageTimer)
      try {
        if (this._manageUsableToken) $falcon.off('wifiManageUsable', this._manageUsableToken)
        if (this._manageClosedToken) $falcon.off('wifiManageClosed', this._manageClosedToken)
      } catch (e) {}
      this.stopHeartbeat()
      if (this.ime) {
        this.ime.destroy()
        this.ime = null
      }
    },

    setMsg(text, type) {
      this.msg = text || ''
      this.msgType = type || 'info'
    },

    openLog() {
      $falcon.navTo('log', {})
    },
    openAbout() {
      $falcon.navTo('about', {})
    },

    /* 进入设备管理页: 带上服务器与本机 IP, 管理页直接复用, 不再重复探测 */
    openManagement() {
      /* 本机 IP 优先取本次检测的 portal 参数 (wlanuserip), 其次取上次记住的 */
      var ip = this.paramOf('wlanuserip') || this._selfIp || this._lastIp || ''
      log('管理页', '打开: server=' + this.serverBase + ' ip=' + ip)
      $falcon.navTo('management', { serverBase: this.serverBase, ip: ip })
      // 切走期间停止心跳, 返回时按需重启
      this.stopHeartbeat()
      /* 注意: 这里不设 _leftAt。管理页在前台时本页 onShow 也可能被系统调用,
       * 若提前打上离开标记, 管理页还开着就会被误判为"已返回"而触发重检,
       * 形成 主页->管理页 空转。真正返回时由管理页 trigger('wifiManageClosed') 设置。 */
      this._enteredManageAt = Date.now()
    },

    /*
     * 已认证时自动进入设备管理页。
     * 外部调用 (action=check/login) 场景不自动跳转, 否则会打断调用方的流程/页面。
     * 返回 true 表示已触发跳转。
     */
    _autoManage() {
      if (this._checkCallback) return false // 外部检测接口: 只回调, 不跳页
      if (this._launched) return false // 外部拉起场景: 尊重调用方
      if (this._manual) return false // 用户主动点了重新检测/下线: 保持本页反馈
      if (this._destroyed) return false
      // 管理页没能用起来 (服务器连不上) 时不要反复来回跳, 最多自动进 2 次
      if ((this._manageTries || 0) >= 2) return false
      /* 冷却窗口: 管理页最近一次是"服务器不可达"退出时, 一段时间内不再自动进入。
       * 用时间窗而非仅计数, 是因为系统可能在管理页开启后很快回收它
       * (实测 3 秒即 onUnload), 那种情况下主页拿不到 failed 标记, 单靠计数会漏。 */
      if (this._manageCooldownUntil && Date.now() < this._manageCooldownUntil) return false
      if (this._autoManagedAt && Date.now() - this._autoManagedAt < 8000) return false // 防抖
      this._autoManagedAt = Date.now()
      this._manageTries = (this._manageTries || 0) + 1
      var self = this
      // 稍作停留让用户看到状态, 再跳转
      this._autoManageTimer = setTimeout(function () {
        if (self._destroyed) return
        if (!self.serverBase) return
        self.openManagement()
      }, 800)
      return true
    },

    /* 管理页成功拉到设备列表后回调, 重置自动进入计数与冷却 */
    _manageUsable() {
      this._manageTries = 0
      this._manageCooldownUntil = 0
    },

    /*
     * 管理页已关闭 (用户点返回 / 全部下线后自动退 / 加载失败兜底退出)。
     * 此时才认为真的"离开过又回来了", 打上 _leftAt 以便 onShow 立即重检。
     * 注意: $falcon 事件回调未必原样传字符串 (实测会拿到对象包装), 两种形态都兼容。
     */
    _manageClosed(info) {
      var failed = false
      if (info === 'failed' || info === undefined) {
        failed = info === 'failed'
      } else if (info && typeof info === 'object') {
        /* 事件系统可能把参数包成 {0:'failed'} / {detail:'failed'} / {data:...} */
        var v = info[0] !== undefined ? info[0] : info.detail !== undefined ? info.detail : info.data
        if (v && typeof v === 'object') v = v[0] !== undefined ? v[0] : v.value
        failed = v === 'failed'
        /* 兜底: 对象里任何字段序列化后含 failed 即视为失败退出 */
        if (!failed) {
          try {
            failed = JSON.stringify(info).indexOf('failed') >= 0
          } catch (e) {}
        }
      } else {
        failed = String(info).indexOf('failed') >= 0
      }
      log('管理页', '已关闭 failed=' + failed)
      /* 管理页明确报告服务器不可用: 抑制后续自动进入, 且不做无意义的重检
       * (此时检测结果必然还是 free, 重检只会再触发一次跳转)。
       * 同时设冷却窗: 服务器没那么快恢复, 短期内不再打扰用户。 */
      if (failed) {
        this._manageTries = 2
        this._autoManagedAt = Date.now()
        this._manageCooldownUntil = Date.now() + MANAGE_COOLDOWN_MS
        this._leftAt = 0
        this.setMsg('认证服务器不可达，已退出设备管理', 'warn')
        return
      }
      this._leftAt = Date.now()
    },

    /* 检测结果机器可读输出: /userdisk/xiro/status.json, 供其他程序读取 */
    writeStatus(det) {
      try {
        var d = new Date()
        var p2 = function (n) {
          return (n < 10 ? '0' : '') + n
        }
        det.time =
          p2(d.getMonth() + 1) +
          '-' +
          p2(d.getDate()) +
          ' ' +
          p2(d.getHours()) +
          ':' +
          p2(d.getMinutes()) +
          ':' +
          p2(d.getSeconds())
        this._panet = this._panet || (typeof Panet === 'function' ? new Panet() : Panet)
        this._panet
          .writeFile('/userdisk/xiro/status.json', JSON.stringify(det))
          .catch(function (e) {
            log('状态', 'status.json 写入失败: ' + e)
          })
      } catch (e) {
        log('状态', 'writeStatus 同步异常: ' + e)
      }
    },

    /* ---- 系统输入法输入 (global.startTextEdit, skill 状态机) ---- */
    openIme(opts) {
      var self = this
      this._imeBusy = true
      return this.ime.open(opts).then(function (v) {
        self._imeBusy = false
        self._imeClosedAt = Date.now()
        return v
      }, function () {
        self._imeBusy = false
        self._imeClosedAt = Date.now()
        return null
      })
    },
    editServer() {
      var self = this
      this.openIme({
        text: this.manualServer,
        placeholder: '例如 192.168.3.12:8080',
        maxlength: 64,
        enterButtonText: '确定',
      }).then(function (v) {
        if (v == null) return
        self.manualServer = v.trim()
      })
    },
    editUsername() {
      var self = this
      this.openIme({
        text: this.username,
        placeholder: '请输入账号',
        maxlength: 64,
        enterButtonText: '下一步',
      }).then(function (v) {
        if (v == null) return
        self.username = v.trim()
        self.editPassword()
      })
    },
    editPassword() {
      var self = this
      this.openIme({
        text: this.password,
        placeholder: '请输入密码',
        maxlength: 64,
        enterButtonText: '确定',
      }).then(function (v) {
        if (v == null) return
        self.password = v.replace(/^\s+|\s+$/g, '')
        /* 用户刚录入的密码明文显示 3 秒便于核对, 之后回到掩码 */
        self.pwdRevealed = true
        if (self._revealTimer) clearTimeout(self._revealTimer)
        self._revealTimer = setTimeout(function () {
          self.pwdRevealed = false
        }, 3000)
      })
    },

    /*
     * 会话保活心跳: 网页认证页每 5 秒轮询 query_auth_stat 维持服务器侧
     * 会话 (页面静止几分钟后 token 过期导致"无法登入需刷新")。
     * app 用 30 秒间隔达到同样效果, 同时探测设备是否已在别处完成认证。
     */
    startHeartbeat() {
      var self = this
      if (this._statTimer) return
      this._statTimer = setInterval(function () {
        var gen = self._gen || 0
        queryAuthStat(self.serverBase, {
          ip: self.paramOf('wlanuserip'),
          sceneStr: self.sceneStr,
          type: self.authType,
        }).then(function (res) {
          if (gen !== (self._gen || 0)) return
          if (res.ok && res.data && res.data.stat && res.data.stat != 0) {
            self.stopHeartbeat()
            self._lastSyncAt = Date.now()
            log('心跳', 'stat=' + res.data.stat + ' 已在别处认证')
            self.pageState = 'ok'
            self.showForm = false
            self.canLogout = true
            self.setMsg('该设备已通过认证，无需登入，可点「设备管理」查看在线设备', 'info')
          } else if (res.ok) {
            self._lastSyncAt = Date.now()
          }
        })
      }, 30000)
    },
    stopHeartbeat() {
      if (this._statTimer) {
        clearInterval(this._statTimer)
        this._statTimer = null
      }
    },

    /* ---- 连通性测试 ---- */
    /* onDone: 可选, 检测完成后回调 (外部 check 接口用)
     * manual: true 表示用户主动触发 (点按钮), 检测出已认证时不自动跳管理页,
     *         只在当前页给出"设备管理"按钮, 避免界面自己跳走 */
    runCheck(onDone, manual) {
      if (typeof onDone !== 'function') onDone = null
      /* 只有用户主动点按钮的重检才保留 _manual; 自动/外部触发的重检清掉该标记,
         使"从后台返回发现已认证"仍能自动进入管理页 */
      if (manual) {
        this._manual = true
        /* 用户主动重检 = 明确表达"再看看": 解除上一次"服务器不可达"的抑制与冷却,
         * 让服务器恢复后能重新自动进管理页 (本次因 _manual 不会立即跳转)。 */
        this._manageTries = 0
        this._autoManagedAt = 0
        this._manageCooldownUntil = 0
      } else if (!this._leftAt) {
        this._manual = false
      }
      var self = this
      var gen = (this._gen = (this._gen || 0) + 1)
      this.stopHeartbeat()
      /* 取消上一次仍可能返回的探测, 避免迟到结果覆盖本次状态 */
      if (this._detectSignal) this._detectSignal.aborted = true
      var signal = (this._detectSignal = { aborted: false })
      this.checking = true
      this.pageState = 'busy'
      this.setMsg('正在进行 WiFi 连通性测试…', 'info')
      this.canLogout = false
      this.showForm = false
      this.showManualServer = false

      checkPortal({ signal: signal }).then(function (det) {
        if (gen !== self._gen) return
        if (det.status === 'aborted') return
        self.checking = false
        self.probeName = det.status === 'offline' ? '全部探测源无响应' : det.probe
        log('检测', 'status=' + det.status + ' probe=' + det.probe + (det.portalPage ? ' page=' + det.portalPage : '') + (det.error ? ' err=' + det.error : ''))
        self.writeStatus(det)
        if (self._checkCallback) {
          // 外部检测接口: 回传结果 JSON 给调用方 ($falcon.on(回调名) 接收)
          var result = {
            status: det.status,
            needLogin: det.status === 'portal',
            probe: det.probe,
            serverIp: det.serverIp,
            serverPort: det.serverPort,
            serverBase: det.serverBase,
            portalPage: det.portalPage,
            pageTitle: det.pageTitle,
            error: det.error,
          }
          try {
            $falcon.trigger(self._checkCallback, JSON.stringify(result))
            log('接口', '检测结果已回调 ' + self._checkCallback + ' ' + JSON.stringify(result))
          } catch (e) {
            log('接口', '回调失败: ' + e)
          }
          self._checkCallback = null
        }
        if (det.status === 'free') {
          self.pageState = 'free'
          self.portalPage = ''
          self.setMsg('网络直连正常，无需登入', 'info')
          /* 已可上网: 若已知认证服务器, 直接进入设备管理 (无服务器则仅提示) */
          if (self._lastServer) {
            self.serverBase = self._lastServer
            self.serverShow = self._lastServer.replace('http://', '')
            self.canLogout = true
            if (self._autoManage()) return
          } else {
            self.serverBase = ''
            self.serverShow = ''
          }
          return
        }
        if (det.status === 'offline') {
          self.pageState = 'offline'
          self.serverBase = ''
          self.serverShow = ''
          self.portalPage = ''
          if (det.error) {
            self.setMsg('请检查 WiFi 连接 (' + det.error + ')', 'warn')
          } else {
            self.setMsg('请先连接 WiFi（设置 → 网络）', 'warn')
          }
          return
        }
        // 被强制门户拦截
        self.portalPage = det.portalPage || ''
        if (det.pageTitle) {
          self.setMsg('被认证页拦截: ' + det.pageTitle, 'warn')
        } else {
          self.setMsg('检测到需要认证', 'warn')
        }
        self.afterPortal(det.serverBase, det.params, gen)
      })
    },

    afterPortal(serverBase, params, gen) {
      var self = this
      var p = params || {}
      this._params = p
      this._selfIp = p.wlanuserip || ''
      if (this._selfIp) this._lastIp = this._selfIp
      var ipDesc = []
      if (p.wlanuserip) ipDesc.push('IP ' + p.wlanuserip)
      if (p.clientmac) ipDesc.push('MAC ' + p.clientmac)
      if (p.vlan && p.vlan !== '0.0') ipDesc.push('VLAN ' + p.vlan.split('.').join('/'))
      this.deviceIp = ipDesc.join('  ')

      if (!serverBase) {
        var saved = this._lastServer || ''
        if (saved) {
          serverBase = saved
        } else {
          this.pageState = 'manual'
          this.serverShow = ''
          this.serverBase = ''
          this.showManualServer = true
          this.showForm = false
          this.setMsg('已拦截跳转，但未识别到认证服务器地址，请手动输入', 'warn')
          return
        }
      }

      this.serverBase = serverBase
      this.serverShow = serverBase.replace('http://', '')
      this._lastServer = serverBase
      loadPortalConf(serverBase, {
        ip: p.wlanuserip || '',
        vlan: p.vlan || '',
        mac: p.clientmac || '',
      }).then(function (res) {
        if (gen !== self._gen) return
        if (res.ok && res.code === 200) {
          // MAC 免认证已通过
          log('配置', 'code=200 已通过认证 server=' + serverBase)
          self.pageState = 'ok'
          self.showForm = false
          self.canLogout = true
          self.stopHeartbeat()
          self.setMsg('该设备已通过认证，无需登入', 'info')
          /* 已认证: 直接进入设备管理页 (外部调用场景不跳) */
          self._autoManage()
          return
        }
        if (res.ok && res.code === 0 && res.data && res.data.policy) {
          var policy = res.data.policy
          self.authType = policy.auth1 || 'panabit'
          self.sceneStr = policy.scene_str || ''
          self._lastSyncAt = Date.now()
          log('配置', 'code=0 auth=' + self.authType + ' server=' + serverBase)
          if (self.authType !== 'panabit') {
            self.pageState = 'portal'
            self.showForm = false
            self.startHeartbeat()
            self.setMsg('该网络当前认证方式非账号密码，请在网页认证页操作', 'warn')
            return
          }
          self.pageState = 'portal'
          self.showForm = true
          self.canLogout = false
          self.startHeartbeat()
          if (self.username && self.password) {
            self.setMsg('需要认证，账号密码已就绪，点击登录', 'warn')
          } else {
            self.setMsg('需要认证，请输入账号密码', 'warn')
          }
          return
        }
        if (res.code === -1) {
          log('配置', 'server=' + serverBase + ' 无响应: ' + res.msg)
          // 服务器连不上/响应异常: 地址可能不对, 提供手动输入 (预填当前地址)
          self.pageState = 'manual'
          self.showForm = false
          self.showManualServer = true
          self.manualServer = self.serverShow
          self.setMsg('服务器无响应（' + res.msg + '），可手动输入正确地址', 'warn')
          return
        }
        self.pageState = 'portal'
        self.showForm = true
        log('配置', 'server=' + serverBase + ' code=' + res.code + ' msg=' + res.msg)
        self.setMsg(res.msg, 'error')
      })
    },

    /* ---- 手动服务器 ---- */
    /* 自动探测不到/连不上服务器时, 手动输入 IP[:端口] 或主机名 */
    applyManualServer() {
      var v = (this.manualServer || '').replace(/^\s+|\s+$/g, '')
      if (!v) {
        this.setMsg('请先输入服务器地址', 'warn')
        return
      }
      if (!/^[A-Za-z0-9.\-]+(:\d+)?$/.test(v)) {
        this.setMsg('地址格式应为 IP[:端口] 或主机名', 'error')
        return
      }
      var base = 'http://' + v
      var gen = (this._gen = (this._gen || 0) + 1)
      this.showManualServer = false
      log('手动服务器', base)
      this.saveServer(base)
      this.afterPortal(base, {}, gen)
    },
    saveServer(base) {
      var self = this
      loadAccount(self._ssid).then(function (acc) {
        acc.serverBase = base
        saveAccount(acc, self._ssid)
      })
    },
    toggleRemember() {
      this.remember = !this.remember
    },

    /* ---- 登录 ---- */
    async doLogin() {
      var self = this
      if (this.logging) return
      if (!this.serverBase) {
        this.setMsg('尚未获取认证服务器，请先检测', 'warn')
        return
      }
      if (!this.username || !this.password) {
        this.setMsg('请输入账号和密码', 'warn')
        return
      }
      this.logging = true
      var gen = (this._gen = (this._gen || 0) + 1)
      log('登录', 'user=' + this.username + ' server=' + this.serverBase + ' remember=' + this.remember)
      var loginOpts = function () {
        return {
          authType: self.authType,
          ip: self.paramOf('wlanuserip'),
          mac: self.paramOf('clientmac'),
          code: '',
          username: self.username,
          password: self.password,
          remember: self.remember,
        }
      }
      var syncSession = async function () {
        // 等价网页端"刷新页面": 重新 load_portal_conf 换取新认证会话
        var r = await loadPortalConf(self.serverBase, {
          ip: self.paramOf('wlanuserip'),
          vlan: self.paramOf('vlan'),
          mac: self.paramOf('clientmac'),
        })
        if (r && r.ok && r.code === 0 && r.data && r.data.policy) {
          self.authType = r.data.policy.auth1 || 'panabit'
          self.sceneStr = r.data.policy.scene_str || ''
        }
        self._lastSyncAt = Date.now()
        return r
      }

      // 1) 登录前刷新会话: 页面静止几分钟后服务器侧 token 过期会导致"无法登入需刷新",
      //    打字慢的场景(系统输入法)尤其容易踩中, 所以每次登录前都强制同步一次
      this.setMsg('正在刷新认证会话…', 'info')
      var sync = await syncSession()
      if (gen !== this._gen) return
      if (sync && sync.code === 200) {
        this.logging = false
        this.stopHeartbeat()
        this.pageState = 'ok'
        this.showForm = false
        this.setMsg('该设备已通过认证，无需登入', 'info')
        return
      }

      // 2) 登录
      this.setMsg('正在认证…', 'info')
      var res = await userLogin(this.serverBase, loginOpts())
      if (gen !== this._gen) return

      // 3) 会话过期类失败(code 非 2/3/255 的应用层错误): 自动刷新会话重试一次
      if (!res.ok && res.code >= 0 && res.code !== 2 && res.code !== 3 && res.code !== 255) {
        this.setMsg('认证会话可能已过期，自动刷新后重试…', 'warn')
        await syncSession()
        if (gen !== this._gen) return
        res = await userLogin(this.serverBase, loginOpts())
        if (gen !== this._gen) return
      }

      this.logging = false
      log('登录', '结果 code=' + res.code + ' msg=' + res.msg)
      if (!res.ok) {
        if (res.code === 3 && res.data && res.data.left) {
          this.setMsg('尝试过多，已锁定 ' + res.data.left + ' 秒', 'error')
        } else {
          this.setMsg(res.msg || '认证失败', 'error')
        }
        return
      }
      // 登录成功 → 保存凭据 (按当前 WiFi 名称分别存储) → 复查连通性确认放行
      if (this.remember) {
        saveAccount(
          {
            username: this.username,
            password: this.password,
            remember: true,
            serverBase: this.serverBase,
          },
          this._ssid
        )
        log('配置', '已记住账号 (wifi=' + (this._ssid || '未知') + ')')
      } else {
        loadAccount(this._ssid).then(function (acc) {
          acc.username = self.username
          acc.password = ''
          acc.remember = false
          acc.serverBase = self.serverBase
          saveAccount(acc, self._ssid)
        })
      }
      this.verifyOnline(gen)
    },

    paramOf(key) {
      return this._params && this._params[key] ? this._params[key] : ''
    },

    verifyOnline(gen) {
      var self = this
      checkPortal({ signal: this._detectSignal }).then(function (det) {
        if (gen !== self._gen) return
        if (det.status === 'aborted') return
        self.logging = false
        log('复查', det.status)
        if (det.status === 'free') {
          self.pageState = 'ok'
          self.showForm = false
          self.canLogout = true
          self.probeName = det.probe
          self.stopHeartbeat()
          self.setMsg('认证成功，已可上网', 'info')
          /* 登录成功后已认证: 直接进入设备管理页 (外部调用场景不跳) */
          self._autoManage()
        } else if (det.status === 'portal') {
          self.pageState = 'portal'
          self.showForm = true
          self.startHeartbeat()
          self.setMsg('登录请求已提交，但仍被拦截，可稍后重试', 'warn')
        } else {
          self.pageState = 'offline'
          self.stopHeartbeat()
          self.setMsg('登录请求已提交，网络仍不通', 'warn')
        }
      })
    },

    /* ---- 下线 ---- */
    doLogout() {
      var self = this
      if (!this.serverBase) return
      this.setMsg('正在下线…', 'info')
      logout(this.serverBase, { ip: this.paramOf('wlanuserip') }).then(function (res) {
        log('下线', 'code=' + res.code + ' msg=' + res.msg)
        self.runCheck()
      })
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
.titlerow {
  flex-direction: row;
  align-items: center;
}
.logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background-color: #2f7bd9;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
}
.logo-text {
  font-size: 15px;
  color: #ffffff;
  font-weight: bold;
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
.headbtn {
  width: 130px;
  height: 32px;
  border-radius: 16px;
  background-color: #2f7bd9;
  align-items: center;
  justify-content: center;
}
.headbtn-sm {
  width: 90px;
  margin-right: 10px;
  background-color: #3f5f85;
}
.headbtn-text {
  font-size: 18px;
  color: #ffffff;
}
.divider {
  width: 960px;
  height: 1px;
  background-color: #0d1b30;
}
.statusarea {
  width: 960px;
  height: 100px;
  background-color: #0e1d33;
  flex-direction: row;
  padding-left: 20px;
  padding-right: 20px;
}
.statusmain {
  width: 360px;
  flex-direction: column;
  justify-content: center;
}
.statusline {
  flex-direction: row;
  align-items: center;
}
.statusdot {
  width: 14px;
  height: 14px;
  border-radius: 7px;
  margin-right: 12px;
}
.statusdot-free {
  background-color: #37c2a0;
}
.statusdot-ok {
  background-color: #37c2a0;
}
.statusdot-portal {
  background-color: #ffb648;
}
.statusdot-offline {
  background-color: #ff6b6b;
}
.statusdot-busy {
  background-color: #8fb7e8;
}
.status {
  font-size: 36px;
  font-weight: bold;
  height: 44px;
}
.status-free {
  color: #37c2a0;
}
.status-ok {
  color: #37c2a0;
}
.status-portal {
  color: #ffb648;
}
.status-offline {
  color: #ff6b6b;
}
.status-busy {
  color: #8fb7e8;
}
.statusinfo {
  width: 560px;
  flex-direction: column;
  justify-content: center;
}
.inforow {
  height: 20px;
  flex-direction: row;
  margin-top: 2px;
}
.infolabel {
  width: 100px;
  font-size: 14px;
  color: #6f8cb0;
}
.infovalue {
  width: 460px;
  font-size: 14px;
  color: #b8cde8;
  lines: 1;
  text-overflow: ellipsis;
}
.formrow {
  width: 960px;
  height: 60px;
  background-color: #16324f;
  flex-direction: row;
  align-items: center;
  padding-left: 16px;
  padding-right: 16px;
}
.field {
  width: 270px;
  height: 42px;
  background-color: #0d1b30;
  border-radius: 8px;
  flex-direction: row;
  align-items: center;
  padding-left: 12px;
  margin-right: 12px;
}
.field-wide {
  width: 560px;
}
.fieldlabel {
  width: 52px;
  font-size: 18px;
  color: #6f8cb0;
}
.fieldvalue {
  width: 190px;
  font-size: 18px;
  color: #e8f1fb;
  lines: 1;
  text-overflow: ellipsis;
}
.fieldvalue-wide {
  width: 480px;
  font-size: 18px;
  color: #e8f1fb;
  lines: 1;
  text-overflow: ellipsis;
}
.fieldplaceholder {
  color: #4a6076;
}
.remember {
  width: 120px;
  height: 42px;
  flex-direction: row;
  align-items: center;
  margin-right: 10px;
}
.remembertext {
  font-size: 18px;
  color: #b8cde8;
}
.remembertext-on {
  color: #37c2a0;
}
.btn {
  height: 42px;
  border-radius: 8px;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
}
.btn-login {
  width: 130px;
  background-color: #2f7bd9;
}
.btn-busy {
  width: 130px;
  background-color: #274d7c;
}
.btn-manage {
  width: 140px;
  background-color: #2c5aa0;
}
.btn-logout {
  width: 100px;
  background-color: #0d1b30;
}
.btn-text {
  font-size: 20px;
  color: #ffffff;
  font-weight: bold;
}
.btn-text-logout {
  color: #ff8f8f;
  font-weight: normal;
}
.msgrow {
  width: 960px;
  flex: 1;
  background-color: #0e1d33;
  flex-direction: row;
  align-items: center;
  padding-left: 20px;
  padding-right: 20px;
}
.msgbar {
  width: 4px;
  height: 40px;
  border-radius: 2px;
  margin-right: 12px;
}
.msgbar-error {
  background-color: #ff6b6b;
}
.msgbar-warn {
  background-color: #ffb648;
}
.msgbar-info {
  background-color: #2f7bd9;
}
.msg {
  font-size: 16px;
  lines: 2;
  flex: 1;
}
.msg-error {
  color: #ff8f8f;
}
.msg-warn {
  color: #ffd48a;
}
.msg-info {
  color: #9fc3ee;
}
</style>
