/*
 * CVI (CVITEK / RISC-V C906 机型) 平台账号持久化。
 *
 * 与 RK (X6PRO) 的差异: 该平台固件无文件 JS 模块, 但有原生 $jsapi/system_kv
 * (setItem/getItem/removeItem/clear), 账号 JSON 整体存一个 KV 键。
 * 存储结构与 services/store.js (panet 文件版) 完全一致:
 *   { version:2, accounts:{ "<ssid>": { username, password(密文), remember, adapter } }, ssid, serverBase }
 * 构建时由 CI 用本文件覆盖 services/store.js (见 .github/workflows/build.yml)。
 * 注意: 相对导入按**目标位置** (services/store.js) 书写, 本文件不从 platform/ 目录直接构建。
 */
import kvModule from '$jsapi/system_kv'
import { paAesEncode, paAesDecode } from './aes.js'

var SCHEMA_VERSION = 2
var KV_KEY = 'wifi_account'
var _kv = null
var _memory = null // 读写缓存; KV 不可用时作为唯一存储

/* 模块导出可能是已实例化对象, 也可能是构造函数, 两种形态都兼容 */
function client() {
  if (_kv) return _kv
  if (typeof kvModule === 'function') {
    try {
      _kv = new kvModule()
    } catch (e) {
      _kv = kvModule
    }
  } else {
    _kv = kvModule
  }
  return _kv
}

/* SSID 归一: 去除首尾空白, 空/未知统一为 '' 槽位 */
function normalizeSsid(ssid) {
  var s = ssid == null ? '' : String(ssid)
  s = s.replace(/^\s+|\s+$/g, '')
  return s
}

function emptySlot() {
  return { username: '', password: '', remember: false, adapter: '' }
}

function defaults() {
  return { version: SCHEMA_VERSION, accounts: {}, ssid: '', serverBase: '' }
}

function decodeSlot(raw) {
  var out = emptySlot()
  if (!raw || typeof raw !== 'object') return out
  out.username = typeof raw.username === 'string' ? raw.username : ''
  out.remember = raw.remember === true
  out.adapter = typeof raw.adapter === 'string' ? raw.adapter : ''
  if (raw.password) {
    try {
      out.password = paAesDecode(raw.password)
    } catch (e) {
      out.password = ''
    }
  }
  return out
}

function normalize(d) {
  var out = defaults()
  if (!d || typeof d !== 'object') return out
  out.serverBase = typeof d.serverBase === 'string' ? d.serverBase : ''
  out.ssid = normalizeSsid(d.ssid)

  if (d.version === 2 && d.accounts && typeof d.accounts === 'object') {
    for (var k in d.accounts) {
      if (!Object.prototype.hasOwnProperty.call(d.accounts, k)) continue
      out.accounts[normalizeSsid(k)] = decodeSlot(d.accounts[k])
    }
    return out
  }

  /* version 1 迁移: 顶层 username/password/remember 归入当前(未知)SSID 槽位 */
  if (d.version === 1) {
    var legacy = decodeSlot(d)
    if (legacy.username || legacy.password || legacy.remember) {
      out.accounts[out.ssid] = legacy
    }
    return out
  }

  /* 无版本号/损坏: 尽量挽救顶层同名字段 */
  var loose = decodeSlot(d)
  if (loose.username || loose.password) out.accounts[out.ssid] = loose
  return out
}

function encodeSlot(slot) {
  return {
    username: slot.username || '',
    password: slot.password ? paAesEncode(slot.password) : '',
    remember: slot.remember === true,
    adapter: slot.adapter || '',
  }
}

async function read() {
  if (_memory) return _memory
  var d = null
  try {
    /* system_kv 的 getItem 为同步返回字符串 */
    var raw = client().getItem(KV_KEY)
    if (raw && raw !== 'undefined' && raw !== 'null') d = JSON.parse(raw)
  } catch (e) {
    d = null
  }
  _memory = normalize(d)
  return _memory
}

async function write() {
  var data = { version: SCHEMA_VERSION, accounts: {}, ssid: _memory.ssid, serverBase: _memory.serverBase }
  for (var k in _memory.accounts) {
    if (!Object.prototype.hasOwnProperty.call(_memory.accounts, k)) continue
    data.accounts[k] = encodeSlot(_memory.accounts[k])
  }
  try {
    /* system_kv 的 setItem 为异步 (Promise), 兼容同步实现 */
    var r = client().setItem(KV_KEY, JSON.stringify(data))
    if (r && typeof r.then === 'function') await r
    return true
  } catch (e) {
    return false
  }
}

/*
 * 读取当前 WiFi 下的账号。
 * 回退规则 (按优先级):
 *   1) 指定 SSID 有槽位 -> 用它
 *   2) 未指定 SSID      -> 用"最近使用"槽位 (db.ssid)
 *   3) 指定 SSID 无槽位, 且库中只有遗留的 '' 槽位 (v1 迁移而来) -> 用遗留槽位
 */
export async function loadAccount(ssid) {
  var db = await read()
  var key = normalizeSsid(ssid)
  var slot = null
  if (key && db.accounts[key]) {
    slot = db.accounts[key]
  } else if (!key && db.ssid && db.accounts[db.ssid]) {
    slot = db.accounts[db.ssid]
  } else if (key && db.accounts[''] && Object.keys(db.accounts).length === 1) {
    slot = db.accounts['']
  }
  var out = slot ? { username: slot.username, password: slot.password, remember: slot.remember, adapter: slot.adapter } : emptySlot()
  out.serverBase = db.serverBase || ''
  out.ssid = db.ssid || ''
  return out
}

/*
 * 保存当前 WiFi 下的账号。ssid 为空则写入"最近使用"槽位。
 * password 以 AES 密文落盘, 不存明文。
 */
export async function saveAccount(acc, ssid) {
  var db = await read()
  var key = normalizeSsid(ssid) || db.ssid || ''
  if (key) db.ssid = key
  db.accounts[key] = {
    username: acc.username || '',
    password: acc.password || '',
    remember: acc.remember === true,
    adapter: acc.adapter || '',
  }
  if (acc.serverBase) db.serverBase = acc.serverBase
  return write()
}

/* 清除当前 WiFi 下记住的密码 (用户名保留), 用于"不再记住密码" */
export async function forgetPassword(ssid) {
  var db = await read()
  var key = normalizeSsid(ssid) || db.ssid || ''
  var slot = db.accounts[key]
  if (slot) {
    slot.password = ''
    slot.remember = false
  }
  return write()
}

/* 清空某个 SSID 的全部记录 (调试/切换门店场景) */
export async function clearAccount(ssid) {
  var db = await read()
  var key = normalizeSsid(ssid)
  if (key && db.accounts[key]) delete db.accounts[key]
  return write()
}
