/*
 * 应用日志: 单独存储在 /userdisk/xiro/wifi.log (目录不存在自动创建)。
 * 走 panet.appendFile (追加写, 超过 512KB 自动截断轮转), 异常静默不影响业务。
 */

import { Panet } from 'panet'

var LOG_DIR = '/userdisk/xiro'
var LOG_PATH = LOG_DIR + '/wifi.log'

var _panet = null
var _dirReady = false

function client() {
  if (!_panet) _panet = typeof Panet === 'function' ? new Panet() : Panet
  return _panet
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n
}

function timestamp() {
  try {
    var d = new Date()
    return (
      pad2(d.getMonth() + 1) +
      '-' +
      pad2(d.getDate()) +
      ' ' +
      pad2(d.getHours()) +
      ':' +
      pad2(d.getMinutes()) +
      ':' +
      pad2(d.getSeconds())
    )
  } catch (e) {
    return ''
  }
}

export function initLog() {
  if (_dirReady) return
  _dirReady = true
  try {
    client()
      .mkdirs(LOG_DIR)
      .catch(function () {})
  } catch (e) {}
}

/* log('检测', 'status=free ...') -> [09-06 12:30:00][检测] ... */
export function log(tag, msg) {
  if (!_dirReady) initLog()
  var line =
    '[' +
    timestamp() +
    '][' +
    tag +
    '] ' +
    String(msg == null ? '' : msg).replace(/[\r\n]+/g, ' ') +
    '\n'
  try {
    client()
      .appendFile(LOG_PATH, line)
      .catch(function () {})
  } catch (e) {}
}

/* 供日志页读取全文 (CVI 版为内存缓冲, 接口一致) */
export async function readLog() {
  try {
    var raw = await client().readFile(LOG_PATH)
    return raw || ''
  } catch (e) {
    return ''
  }
}

export async function clearLog() {
  try {
    await client().writeFile(LOG_PATH, '')
    return true
  } catch (e) {
    return false
  }
}
