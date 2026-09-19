/*
 * CVI (CVITEK / RISC-V C906 机型) 平台运行日志。
 *
 * 与 RK (X6PRO) 的差异: 该平台固件无文件 JS 模块, 日志存内存环形缓冲
 * (最近 500 行), 应用内「日志」页可查看; 应用重启后清空 (CVI 版不落盘)。
 * 构建时由 CI 用本文件覆盖 services/logger.js。
 */
var MAX_LINES = 500
var _lines = []

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

export function initLog() {}

/* log('检测', 'status=free ...') -> [09-06 12:30:00][检测] ... */
export function log(tag, msg) {
  var line =
    '[' + timestamp() + '][' + tag + '] ' + String(msg == null ? '' : msg).replace(/[\r\n]+/g, ' ')
  _lines.push(line)
  if (_lines.length > MAX_LINES) _lines.splice(0, _lines.length - MAX_LINES)
}

/* 供日志页读取 (与 panet 版一致: 返回原文, 新日志由调用方决定顺序) */
export async function readLog() {
  return _lines.join('\n')
}

export async function clearLog() {
  _lines = []
  return true
}
