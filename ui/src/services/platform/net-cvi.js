/*
 * CVI (CVITEK / RISC-V C906 机型) 平台网络适配层。
 *
 * 与 RK (X6PRO / aarch64) 的差异: 该平台固件自带原生 JSAPI 模块
 *   - $jsapi/http: request({url, method, headers, data, timeout}) -> Promise<{status, body, headers}>
 * 因此无需自研 panet 原生库 (.so); 导出接口与 services/net.js (panet 版) 完全一致,
 * 构建时由 CI 用本文件覆盖 services/net.js (见 .github/workflows/build.yml 的 cvi 构建步骤)。
 *
 * 注意: 本文件依赖 '$jsapi/xxx' 形式的 Falcon 内置模块引入
 * (aiot-vue-cli 的 falcon-module 插件识别), 仅 CVI 版构建会打包本文件。
 */
import httpModule from '$jsapi/http'

var _http = null
var _httpCtor = null

/* 模块导出可能是已实例化对象, 也可能是构造函数, 两种形态都兼容 */
function client() {
  if (_http) return _http
  _httpCtor = httpModule
  if (typeof httpModule === 'function') {
    try {
      _http = new httpModule()
    } catch (e) {
      _http = httpModule
    }
  } else {
    _http = httpModule
  }
  return _http
}

/*
 * JS 层超时兜底: 原生实现挂起不返回时保证调用方一定能拿到结果
 * (与 services/net.js 的 raceTimeout 一致)
 */
function raceTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var done = false
    var timer = setTimeout(function () {
      if (done) return
      done = true
      reject(new Error('请求超时 (' + Math.round(ms / 1000) + 's)'))
    }, ms)
    promise.then(
      function (v) {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve(v)
      },
      function (e) {
        if (done) return
        done = true
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

function strToBytes(s) {
  var out = new Uint8Array(s.length)
  for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

function normalizeHeaders(obj) {
  var map = {}
  if (!obj || typeof obj !== 'object') return map
  for (var k in obj) {
    map[String(k).toLowerCase()] = String(obj[k])
  }
  return map
}

/* 'Name: value' 数组 -> http 模块需要的对象 */
function linesToObject(lines) {
  var out = {}
  if (!Array.isArray(lines)) return out
  for (var i = 0; i < lines.length; i++) {
    var idx = String(lines[i]).indexOf(':')
    if (idx > 0) out[String(lines[i]).slice(0, idx).trim()] = String(lines[i]).slice(idx + 1).trim()
  }
  return out
}

/*
 * 发起请求, 永不 throw。
 * 返回结构与 panet 版一致:
 *   { ok, statusCode, headerLines, headers(小写键 map), body: Uint8Array, text, error }
 */
export async function request(opts) {
  var url = opts.url
  var method = opts.method || 'GET'
  var timeout = opts.timeout || 8
  var reqOpts = { url: url, method: method, timeout: timeout }
  if (opts.headers) reqOpts.headers = linesToObject(opts.headers)
  if (opts.body) reqOpts.data = opts.body
  var res
  try {
    res = await raceTimeout(client().request(reqOpts), timeout * 1000 + 500)
  } catch (e) {
    return {
      ok: false,
      statusCode: 0,
      headerLines: [],
      headers: {},
      body: new Uint8Array(0),
      text: '',
      error: '网络请求失败: ' + describeErr(e),
    }
  }
  /* http 模块: 成功返回 { status, body(字符串), headers(对象) } */
  var text = res && res.body != null ? String(res.body) : ''
  var hmap = normalizeHeaders(res && res.headers)
  var lines = []
  for (var k in hmap) lines.push(k + ': ' + hmap[k])
  return {
    ok: true,
    statusCode: res && typeof res.status === 'number' ? res.status : 0,
    headerLines: lines,
    headers: hmap,
    body: strToBytes(text),
    text: text,
    error: '',
  }
}

export function describeErr(e) {
  if (e == null) return '未知错误'
  if (typeof e === 'string') return e
  if (e.message) return e.message
  try {
    return JSON.stringify(e)
  } catch (err) {
    return String(e)
  }
}

/*
 * 当前连接的 WiFi 名称 (SSID)。用于按网络隔离记住的账号密码。
 * CVI 平台的 $jsapi/wifi 模块提供 scan/config/connect 等能力, 但没有
 * "当前连接 SSID" 查询接口; 返回空串, store 会回退到"最近使用"槽位。
 */
export async function wifiSsid() {
  return ''
}

/*
 * 检测结果落盘。CVI 平台无文件 JS 模块, status.json 无法写入, 保持接口一致为 no-op。
 */
export async function writeStatusFile(content) {
  return false
}
