/*
 * WiFi 连通性测试 + captive portal 检测。
 * 只使用国内连通性测试端点:
 *   - 小米:   http://connect.rom.miui.com/generate_204  (正常返回 204 空包体)
 *   - vivo:   http://wifi.vivo.com.cn/generate_204
 *   - 华为:   http://connectivitycheck.platform.hicloud.com/generate_204
 * 判定逻辑 (全部探测源并发竞速, 首个确定结果即返回, 不再顺序等待):
 *   - 302 + Location                        -> portal (直接拿到跳转页面)
 *   - 204 空包体                            -> free   (无需登入)
 *   - 非空包体 (被劫持/被改写, 且无跳转URL) -> portal
 *   - 全部请求失败                          -> offline
 * 被劫持时从响应内容里解析跳转页面 URL (Panabit 302 Location 透传 /
 * meta refresh / location.href / 带 wlanuserip、paip 参数的链接),
 * 得到 portal 服务器 IP:PORT 与认证参数。
 *
 * 性能/并发设计:
 *  - 原实现逐个探测源串行等待, 最坏 4×TIMEOUT; 现改为同时发起全部请求,
 *    谁先给出确定结论就用谁, 正常网络下耗时 ≈ 单个请求 RTT。
 *  - 失败 (error) 不算结论, 继续等其他探测源, 全部失败才判 offline。
 *  - 支持 abort: 页面切前台/离开时可主动取消, 避免残留请求回来后覆盖新状态。
 */

import { request } from './net.js'

var PROBES = [
  { name: '小米', url: 'http://connect.rom.miui.com/generate_204' },
  { name: 'vivo', url: 'http://wifi.vivo.com.cn/generate_204' },
  { name: '华为', url: 'http://connectivitycheck.platform.hicloud.com/generate_204' },
]
var TIMEOUT = 5

/*
 * 返回:
 * {
 *   status: 'free' | 'portal' | 'offline' | 'aborted',
 *   probe: 使用的探测源名, portalPage: 跳转页面 URL,
 *   serverIp, serverPort, serverBase,
 *   params: { wlanuserip, clientmac, vlan, iarmdst, paip, clientip, wlanacname },
 *   pageTitle: 拦截页 <title>, snippet: 原始片段(截断)
 * }
 *
 * opts.signal: 可选, { aborted: bool } 形式的取消标记 (页面离开/重新检测时置位),
 *   置位后不再采纳迟到的响应, 返回 status='aborted'。
 */
export async function checkPortal(opts) {
  var o = opts || {}
  var signal = o.signal || null
  var aborted = function () {
    return !!(signal && signal.aborted)
  }

  var settled = false
  var pending = PROBES.length

  var result = await new Promise(function (resolve) {
    var finish = function (r) {
      if (settled) return
      settled = true
      resolve(r)
    }
    /* 所有探测源并发发起; error 不判决, 等其它源或全部失败 */
    for (var i = 0; i < PROBES.length; i++) {
      ;(function (probe) {
        request({ url: probe.url, timeout: TIMEOUT }).then(function (r) {
          if (aborted()) return finish({ status: 'aborted' })
          var c = classify(r)
          if (c.kind === 'redirect') return finish(portalResult(probe.name, c.url, r))
          if (c.kind === 'empty') return finish(freeResult(probe.name))
          if (c.kind === 'content') return finish(portalResult(probe.name, extractRedirect(r.text), r))
          /* error: 记录后继续等其它源 */
          pending--
          if (pending === 0) {
            var off = offlineResult()
            off.error = probe.name + ': ' + (r.error || '无响应')
            finish(off)
          }
        })
      })(PROBES[i])
    }
  })

  return result
}

/* 单个响应分类: redirect(302+Location) / empty(204) / content / error */
function classify(r) {
  if (!r.ok) return { kind: 'error' }
  if (r.statusCode >= 300 && r.statusCode < 400 && r.headers && r.headers.location) {
    return { kind: 'redirect', url: trimUrl(r.headers.location) }
  }
  if (r.body.length === 0) return { kind: 'empty' }
  return { kind: 'content' }
}

function portalResult(probe, redirectUrl, resp) {
  var bodyText = resp ? resp.text : ''
  var url = redirectUrl || extractRedirect(bodyText)
  var info = parsePortalUrl(url)
  return {
    status: 'portal',
    probe: probe,
    portalPage: url,
    serverIp: info.host,
    serverPort: info.port,
    serverBase: info.base,
    params: info.params,
    pageTitle: extractTitle(bodyText),
    snippet: bodyText.slice(0, 400),
    /* 响应头 (小写键): 供适配器 match() 从 Server 等头识别认证类型 */
    headers: resp ? resp.headers : {},
  }
}

function freeResult(probe) {
  return { status: 'free', probe: probe, portalPage: '', serverIp: '', serverPort: '', serverBase: '', params: {}, pageTitle: '', snippet: '' }
}

function offlineResult() {
  return { status: 'offline', probe: '', portalPage: '', serverIp: '', serverPort: '', serverBase: '', params: {}, pageTitle: '', snippet: '', error: '' }
}

function extractTitle(text) {
  var m = text.match(/<title[^>]*>([^<]*)<\/title>/i)
  return m ? m[1].trim() : ''
}

/*
 * 从被劫持的响应内容里找跳转目标。
 * 优先级: 含 wlanuserip/paip/clientmac 的完整 URL > meta refresh > location 赋值。
 */
export function extractRedirect(text) {
  if (!text) return ''
  var urls = text.match(/https?:\/\/[A-Za-z0-9\-._~:\/?#@!$&*+,;=%\[\]]+/g) || []
  var best = ''
  var weak = ''
  for (var i = 0; i < urls.length; i++) {
    var u = urls[i]
    if (/wlanuserip=|paip=|clientmac=|clientip=/i.test(u)) return trimUrl(u)
    if (/portal|auth|login/i.test(u) && !weak) weak = u
  }
  if (best) return trimUrl(best)
  var m =
    text.match(/http-equiv\s*=\s*["']?refresh["']?[^>]*url\s*=\s*["']?(https?:\/\/[^"'>\s]+)/i) ||
    text.match(/location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']+)["']/i) ||
    text.match(/location\.replace\(\s*["'](https?:\/\/[^"']+)["']\s*\)/i) ||
    text.match(/window\.open\(\s*["'](https?:\/\/[^"']+)["']/i)
  if (m) return trimUrl(m[1])
  if (weak) return trimUrl(weak)
  // 相对路径跳转 (portal.html?...)
  m = text.match(/["'](\/?[\w./-]*portal[^"']*\?[\w=&%.-]*)["']/i)
  return m ? trimUrl(m[1]) : ''
}

function trimUrl(u) {
  return u.replace(/["'>\s]+$/, '')
}

/* 把跳转 URL 拆成 serverBase + 参数 */
export function parsePortalUrl(url) {
  var out = { host: '', port: '', base: '', params: {} }
  if (!url) return out
  var m = url.match(/^https?:\/\/([^\/?#]+)/i)
  if (!m) return out
  var hostPort = m[1]
  var ipv6 = hostPort.match(/^\[([^\]]+)\](?::(\d+))?$/)
  if (ipv6) {
    out.host = ipv6[1]
    out.port = ipv6[2] || '80'
  } else {
    var parts = hostPort.split(':')
    out.host = parts[0]
    out.port = parts.length > 1 ? parts[1] : '80'
  }
  out.base = 'http://' + out.host + (out.port && out.port !== '80' ? ':' + out.port : '')
  var q = url.indexOf('?')
  if (q > -1) {
    var pairs = url.slice(q + 1).split('&')
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split('=')
      if (kv.length === 2 && kv[0]) {
        try {
          out.params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1])
        } catch (e) {
          out.params[kv[0]] = kv[1]
        }
      }
    }
  }
  return out
}
