/*
 * Panabit 上网认证 Portal 适配器 (内置的第一个适配器模块)。
 * 协议从 portal 页面 (登入/index.html + assert/portal.js + assert/panabit.js) 提取:
 *   - 端点: http://<portal服务器>[:端口]/api?<查询参数>
 *   - 配置/策略:    route=portal&action=load_portal_conf
 *   - 账号密码登录: route=webauth&action=user_login
 *   - 认证状态查询: route=webauth&action=query_auth_stat (data.stat != 0 即已认证)
 *   - 下线当前设备: route=ucenter&action=user_offall
 *   - 在线设备列表: route=ucenter&action=load_user_list
 *   - 单设备下线:   route=ucenter&action=user_offone&addr=<在线IP>
 *   - 响应: JSON, code==0 成功 / 200 MAC免认证已通过; 中文为 GB2312, 只保留 ASCII
 *   - password 用 AES-128-ECB/ZeroPadding 加密后传 hex (见 ../aes.js)
 *
 * 自动识别特征 (match): Panabit 302 跳转 URL 携带 wlanuserip/paip/iarmdst 参数,
 * 页面内容/标题常含 "Panabit" 字样; 按特征加权评分。
 *
 * ⚠️ user_offone 的 addr 是目标设备的在线 IP, 不是 uid。
 */
import { request, describeErr } from '../net.js'
import { paAesEncode } from '../aes.js'
import { qs, sanitize } from './adapter-api.js'

/* 服务端返回码 -> 本地文案 (只映射 Panabit 特有语义, GBK 中文不依赖) */
function serverMsg(code, msg) {
  var m = sanitize(msg)
  switch (code) {
    case 2:
      return '账号需要修改密码，请在网页认证页处理'
    case 255:
      if (/INV_NAMEORPWD/i.test(m)) return '账号或密码错误'
      break
  }
  return m || '服务器返回 code=' + code
}

/* 发请求 + 归一化: 永不 throw; 返回 { ok, code, msg, data } */
async function apiCall(serverBase, params) {
  if (!serverBase) {
    return { ok: false, code: -1, msg: '未获取到认证服务器地址', data: null }
  }
  var url = serverBase + '/api?' + qs(params)
  var r = await request({ url: url, timeout: 8 })
  if (!r.ok) {
    return { ok: false, code: -1, msg: r.error || '无法连接认证服务器', data: null }
  }
  var text = sanitize(r.text)
  if (!text) {
    return { ok: false, code: -1, msg: '服务器返回空响应', data: null }
  }
  try {
    var json = JSON.parse(text)
    return {
      ok: json.code === 0 || json.code === 200,
      code: typeof json.code === 'number' ? json.code : -1,
      msg: serverMsg(json.code, json.msg),
      rawMsg: json.msg,
      data: json.data === undefined ? null : json.data,
    }
  } catch (e) {
    return { ok: false, code: -1, msg: '响应解析失败: ' + describeErr(e), data: null }
  }
}

/* load_portal_conf: 建会话 + 读策略 (auth_type/scene_str 写入 state 供后续调用使用) */
async function loadConf(serverBase, p, state) {
  var res = await apiCall(serverBase, {
    route: 'portal',
    action: 'load_portal_conf',
    ip: (p && p.wlanuserip) || '',
    vlan: (p && p.vlan) || '',
    mac: (p && p.clientmac) || '',
    device: 'mobile',
  })
  if (res.ok && res.code === 200) {
    return { status: 'free', code: 200 }
  }
  if (res.ok && res.code === 0 && res.data && res.data.policy) {
    var policy = res.data.policy
    if (state) {
      state.authType = policy.auth1 || 'panabit'
      state.sceneStr = policy.scene_str || ''
    }
    if ((policy.auth1 || 'panabit') !== 'panabit') {
      return { status: 'other', msg: '该网络当前认证方式非账号密码，请在网页认证页操作' }
    }
    return { status: 'ready', code: 0 }
  }
  if (res.code === -1) {
    return { status: 'manual', msg: res.msg }
  }
  return { status: 'error', msg: res.msg, code: res.code }
}

/*
 * 账号密码登录。
 * 请求格式与网页端抓包一致:
 * /api?route=webauth&action=user_login&auth_type=panabit&ip=&mac=&code=&
 * username=<明文>&password=<AES hex>&remember_me=<0|1>
 * 登录前自动重新 load_portal_conf 刷新会话 (等价网页端刷新页面);
 * 会话过期类失败 (code 非 2/3/255) 自动刷新重试一次。
 */
async function login(serverBase, o) {
  var p = o.params || {}
  var state = o.state || {}
  var buildOpts = function () {
    return {
      authType: state.authType || 'panabit',
      ip: p.wlanuserip || '',
      mac: p.clientmac || '',
      code: '',
      username: o.username || '',
      password: o.password || '',
      remember: o.remember === true,
    }
  }
  var syncSession = async function () {
    // 等价网页端"刷新页面": 重新 load_portal_conf 换取新认证会话
    var r = await apiCall(serverBase, {
      route: 'portal',
      action: 'load_portal_conf',
      ip: p.wlanuserip || '',
      vlan: p.vlan || '',
      mac: p.clientmac || '',
      device: 'mobile',
    })
    if (r && r.ok && r.code === 0 && r.data && r.data.policy) {
      state.authType = r.data.policy.auth1 || 'panabit'
      state.sceneStr = r.data.policy.scene_str || ''
    }
    return r
  }

  var sync = await syncSession()
  if (sync && sync.code === 200) {
    // MAC 免认证已通过, 无需账号密码
    return { ok: true, code: 200, msg: '该设备已通过认证，无需登入' }
  }

  var res = await apiCall(serverBase, {
    route: 'webauth',
    action: 'user_login',
    auth_type: buildOpts().authType,
    ip: buildOpts().ip,
    mac: buildOpts().mac,
    code: '',
    username: buildOpts().username,
    password: paAesEncode(buildOpts().password),
    remember_me: buildOpts().remember ? 1 : 0,
  })

  // 会话过期类失败 (code 非 2/3/255 的应用层错误): 自动刷新会话重试一次
  if (!res.ok && res.code >= 0 && res.code !== 2 && res.code !== 3 && res.code !== 255) {
    await syncSession()
    res = await apiCall(serverBase, {
      route: 'webauth',
      action: 'user_login',
      auth_type: buildOpts().authType,
      ip: buildOpts().ip,
      mac: buildOpts().mac,
      code: '',
      username: buildOpts().username,
      password: paAesEncode(buildOpts().password),
      remember_me: buildOpts().remember ? 1 : 0,
    })
  }

  if (!res.ok) {
    var msg = res.msg || '认证失败'
    if (res.code === 3 && res.data && res.data.left) {
      msg = '尝试过多，已锁定 ' + res.data.left + ' 秒'
    }
    return { ok: false, code: res.code, msg: msg }
  }
  return { ok: true, code: res.code }
}

/* 认证状态查询: data.stat != 0 即已认证 (网页端 5 秒心跳的等价实现) */
async function queryStat(serverBase, o) {
  var p = (o && o.params) || {}
  var state = (o && o.state) || {}
  var res = await apiCall(serverBase, {
    route: 'webauth',
    action: 'query_auth_stat',
    scene_str: state.sceneStr || '',
    ip: p.wlanuserip || p.ip || '',
    type: state.authType || 'panabit',
  })
  if (!res.ok) return { ok: false }
  return { ok: true, stat: res.data && res.data.stat ? res.data.stat : 0 }
}

/* 下线当前 IP (ucenter user_offall) */
async function logout(serverBase, o) {
  var p = (o && o.params) || {}
  var res = await apiCall(serverBase, {
    route: 'ucenter',
    action: 'user_offall',
    ip: p.wlanuserip || p.ip || (o && o.ip) || '',
  })
  return { ok: res.ok, code: res.code, msg: res.msg }
}

/* 管理页进入前同步会话 (可选能力) */
async function sync(serverBase, p, state) {
  var res = await apiCall(serverBase, {
    route: 'portal',
    action: 'load_portal_conf',
    ip: (p && p.ip) || '',
    vlan: '',
    mac: '',
    device: 'mobile',
  })
  if (res.ok && res.code === 0 && res.data && res.data.policy && state) {
    state.authType = res.data.policy.auth1 || 'panabit'
    state.sceneStr = res.data.policy.scene_str || ''
  }
  return res
}

/* 在线设备列表 (ucenter load_user_list) */
async function listDevices(serverBase, o) {
  var p = (o && o.params) || {}
  var res = await apiCall(serverBase, {
    route: 'ucenter',
    action: 'load_user_list',
    ip: p.ip || p.wlanuserip || '',
  })
  if (!res.ok) return { ok: false, code: res.code, msg: res.msg }
  return { ok: true, list: Array.isArray(res.data) ? res.data : [] }
}

/* 单设备下线 (ucenter user_offone), addr = 目标设备在线 IP */
async function offOne(serverBase, o) {
  var res = await apiCall(serverBase, {
    route: 'ucenter',
    action: 'user_offone',
    addr: (o && o.addr) || '',
  })
  return { ok: res.ok, code: res.code, msg: res.msg }
}

/* 全部下线 (ucenter user_offall) */
async function offAll(serverBase, o) {
  var p = (o && o.params) || {}
  var res = await apiCall(serverBase, {
    route: 'ucenter',
    action: 'user_offall',
    ip: p.ip || p.wlanuserip || '',
  })
  return { ok: res.ok, code: res.code, msg: res.msg }
}

/*
 * 自动识别评分 (0-100):
 *   Panabit 302 跳转 URL 携带 wlanuserip/paip/iarmdst 参数 (60 分)
 *   页面标题/内容含 Panabit 字样 (30 分)
 *   URL 携带 clientmac/clientip (10 分)
 *   URL 路径含 webauth/portal.html (10 分)
 */
function match(ctx) {
  var score = 0
  var u = String((ctx && ctx.portalPage) || '')
  var text = String((ctx && ctx.snippet) || '') + ' ' + String((ctx && ctx.pageTitle) || '')
  if (/wlanuserip=|paip=|iarmdst=/i.test(u)) score += 60
  if (/clientmac=|clientip=/i.test(u)) score += 10
  if (/panabit/i.test(text)) score += 30
  if (/webauth|portal\.html/i.test(u)) score += 10
  return Math.min(score, 100)
}

export const panabit = {
  id: 'panabit',
  name: 'Panabit 认证',
  match: match,
  loadConf: loadConf,
  login: login,
  queryStat: queryStat,
  logout: logout,
  sync: sync,
  listDevices: listDevices,
  offOne: offOne,
  offAll: offAll,
}
