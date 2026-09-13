/*
 * 持久化适配: 固件不提供 storage JS 模块, 用 panet.writeFile/readFile
 * 把账号数据存到应用私有数据目录 ($dataDir), JSON + 密码 AES 密文。
 * 读取失败/损坏一律回退默认值, 不抛异常。
 *
 * 存储结构 (version 2):
 *   {
 *     version: 2,
 *     accounts: { "<ssid>": { username, password(密文), remember } },
 *     ssid: "<最近使用的 ssid>",
 *     serverBase: "<最近使用的认证服务器>"
 *   }
 * 同一台设备在不同 WiFi 下各存各的账号, 互不覆盖。
 * version 1 的旧数据读取时迁移成 { "<ssid或空>": {...} }。
 */

import { Panet } from 'panet'
import { paAesEncode, paAesDecode } from './aes.js'

var SCHEMA_VERSION = 2
var _panet = null
var _storePath = null
var _memory = null // 读写缓存; $dataDir 不可用时作为唯一存储

function client() {
  if (!_panet) _panet = typeof Panet === 'function' ? new Panet() : Panet
  return _panet
}

function storePath() {
  if (_storePath !== null) return _storePath
  var dir = ''
  try {
    dir = globalThis.$dataDir || ''
  } catch (e) {
    dir = ''
  }
  _storePath = dir ? dir + '/wifi_account.json' : ''
  return _storePath
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
  var path = storePath()
  var d = null
  if (path) {
    try {
      var raw = await client().readFile(path)
      if (raw) d = JSON.parse(raw)
    } catch (e) {
      d = null
    }
  }
  _memory = normalize(d)
  return _memory
}

async function write() {
  var path = storePath()
  if (!path) return false
  var data = { version: SCHEMA_VERSION, accounts: {}, ssid: _memory.ssid, serverBase: _memory.serverBase }
  for (var k in _memory.accounts) {
    if (!Object.prototype.hasOwnProperty.call(_memory.accounts, k)) continue
    data.accounts[k] = encodeSlot(_memory.accounts[k])
  }
  try {
    await client().writeFile(path, JSON.stringify(data))
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
 *      (用户首次连上任意 WiFi 仍能看到旧版记住的账号; 一旦该 WiFi 保存过就独立)
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
