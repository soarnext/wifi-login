/*
 * Portal 适配器公共工具。
 * 各认证协议适配器 (services/portal-adapters/<协议>.js) 共用的底层助手,
 * 与具体协议无关; 协议相关的返回码文案映射放在各自适配器内。
 */

/*
 * 参数序列化为查询串。undefined/null 值跳过, 其余按原样拼接
 * (Panabit 等网关不接受 URL 编码, 与网页端抓包保持一致)。
 */
export function qs(params) {
  var parts = []
  for (var k in params) {
    if (params[k] === undefined || params[k] === null) continue
    parts.push(k + '=' + params[k])
  }
  return parts.join('&')
}

/*
 * 网关响应多为 GB2312 编码, 按 latin1 读入中文会乱码。
 * 只保留 ASCII 部分用于对照解析 (JSON 结构与错误码均为 ASCII)。
 */
export function sanitize(text) {
  return String(text || '').replace(/[^\x20-\x7e]/g, '')
}
