/*
 * panet 原生模块适配层。
 * 固件不提供系统 http 模块 (js_modules 仅 events/qjs-dbus/util), 网络能力由
 * 自带 native 库 libjsapi_panet.so 提供: request(url, method, timeoutSec)
 * -> Promise<{statusCode, headers:["Name: value"...], body:base64}>
 * 这里归一化成稳定结构, 页面只消费 {ok, statusCode, headers, body, text}。
 */

import { Panet } from 'panet'

var _panet = null

/* 模块导出的可能是构造函数, 也可能是已构造好的实例, 两种形态都兼容 */
function client() {
  if (_panet) return _panet
  if (typeof Panet === 'function') {
    _panet = new Panet()
  } else {
    _panet = Panet
  }
  return _panet
}

/* 预建 128 项查找表: 每字符 O(1) 查表替代 TBL.indexOf (O(n)), 响应体越大收益越明显 */
var B64_INDEX = null

function b64Table() {
  if (!B64_INDEX) {
    B64_INDEX = new Int16Array(128)
    var TBL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    for (var i = 0; i < 128; i++) B64_INDEX[i] = -1
    for (var j = 0; j < TBL.length; j++) B64_INDEX[TBL.charCodeAt(j)] = j
  }
  return B64_INDEX
}

function b64ToBytes(b64) {
  var TBL = b64Table()
  var out = []
  var buf = 0
  var bits = 0
  for (var i = 0; i < b64.length; i++) {
    var c = b64.charCodeAt(i)
    var v = c < 128 ? TBL[c] : -1
    if (v < 0) continue // 跳过 padding/空白
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 0xff)
    }
  }
  var arr = new Uint8Array(out.length)
  for (var j = 0; j < out.length; j++) arr[j] = out[j]
  return arr
}

function bytesToLatin1(bytes) {
  var s = ''
  var CHUNK = 4096
  for (var i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)))
  }
  return s
}

function toBytes(data) {
  if (data == null) return new Uint8Array(0)
  if (typeof data === 'string') return bytesOfLatin1String(data)
  if (typeof data.length === 'number' && typeof data.byteLength !== 'number') {
    var arr = new Uint8Array(data.length)
    for (var i = 0; i < data.length; i++) arr[i] = data[i] & 0xff
    return arr
  }
  if (typeof data.byteLength === 'number') {
    var view = typeof Uint8Array !== 'undefined' && data instanceof Uint8Array ? data : new Uint8Array(data)
    return new Uint8Array(view)
  }
  return new Uint8Array(0)
}

function bytesOfLatin1String(str) {
  var out = []
  for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 0xff)
  return new Uint8Array(out)
}

function headersToMap(lines) {
  var map = {}
  for (var i = 0; i < lines.length; i++) {
    var idx = lines[i].indexOf(':')
    if (idx < 0) continue
    var key = lines[i].slice(0, idx).toLowerCase()
    map[key] = lines[i].slice(idx + 1).trim()
  }
  return map
}

/*
 * JS 层超时兜底: 实测部分网络条件下原生 request 会挂起不返回
 * (固件层 timeout 参数不可靠), 用竞速定时器保证调用方一定能拿到结果,
 * 否则检测/登录/设备列表会永久停在"进行中"。
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

/*
 * 发起请求, 永不 throw。
 * 返回: { ok, statusCode, headerLines, headers(小写键 map), body: Uint8Array, text: latin1, error }
 */
export async function request(opts) {
  var url = opts.url
  var method = opts.method || 'GET'
  var timeout = opts.timeout || 8
  var res
  try {
    res = await raceTimeout(client().request(url, method, timeout), timeout * 1000 + 500)
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
  var lines = []
  if (res && res.headers) {
    if (typeof res.headers.length === 'number') lines = res.headers
    else if (typeof res.headers === 'string') lines = res.headers.split('\n')
  }
  var bodyB64 = res && typeof res.body === 'string' ? res.body : ''
  var body = b64ToBytes(bodyB64)
  return {
    ok: true,
    statusCode: res && typeof res.statusCode === 'number' ? res.statusCode : 0,
    headerLines: lines,
    headers: headersToMap(lines),
    body: body,
    text: bytesToLatin1(body),
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
 * 取不到 (模块不支持/无 WiFi) 返回空串, 调用方需容忍。
 */
export async function wifiSsid() {
  try {
    var c = client()
    if (typeof c.wifiSsid !== 'function') return ''
    var s = await c.wifiSsid()
    return typeof s === 'string' ? s : ''
  } catch (e) {
    return ''
  }
}

/*
 * 检测结果机器可读落盘 (RK: /userdisk/xiro/status.json, 供其他程序读取)。
 * CVI 平台无文件模块, 对应实现为 no-op; 平台相关落在本层, 页面不直接依赖 panet。
 */
export async function writeStatusFile(content) {
  await client().writeFile('/userdisk/xiro/status.json', content)
  return true
}
