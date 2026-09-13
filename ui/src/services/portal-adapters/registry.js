/*
 * Portal 适配器注册表 —— 本体 (index/management 页) 只消费这里导出的稳定接口,
 * 不直接依赖任何具体认证协议的实现。
 *
 * 开发者适配新的 WiFi 登入页:
 *   1) 在本目录新增 <协议>.js, 实现下述接口 (必选: match / loadConf / login, 其余可选);
 *   2) 在下方 ADAPTERS 数组注册即可 —— 界面"认证类型"选择列表会自动出现该适配器,
 *      自动识别也会把它纳入评分。
 *
 * 接口契约:
 *   id     : 唯一 ID (存储/外部调用/管理页传参用)
 *   name   : 展示名 (按钮/提示用)
 *
 *   match(ctx) -> 0-100 分
 *     ctx: { portalPage, pageTitle, snippet, params, serverBase, headers }
 *     0 表示不匹配; 注册表取所有适配器中的最高分。
 *
 *   loadConf(serverBase, p, state) -> { status, msg?, code? }
 *     status: 'free'   MAC 免认证已通过, 无需登入
 *             'ready'  账号密码登录可用
 *             'manual' 服务器无响应/地址可能不对, 建议手动输入
 *             'other'  非账号密码认证方式 (框架只提示, 不出登录表单)
 *             'error'  其他业务错误
 *     state: 框架持有的对象, 适配器把 auth_type/scene_str 等写回供后续调用使用;
 *            适配器自身不保留可变状态。
 *
 *   login(serverBase, { params, username, password, remember, state }) -> { ok, msg?, code? }
 *     会话建立/刷新与失败重试由适配器自理 (协议相关), 框架只调用一次。
 *
 *   queryStat(serverBase, { params, state }) -> { ok, stat? }
 *     stat != 0 即已认证; 适配器不支持时返回 { ok: false }, 框架心跳静默。
 *
 *   logout(serverBase, { params, state }) -> { ok, code?, msg? }
 *
 * 可选能力 (存在才在界面暴露对应入口):
 *   sync(serverBase, { ip }, state)                  // 管理页进入前建会话
 *   listDevices(serverBase, { params }) -> { ok, list }   // 有才显示"设备管理"按钮
 *   offOne(serverBase, { addr }) -> { ok, code?, msg? }
 *   offAll(serverBase, { params }) -> { ok, code?, msg? }
 */
import { panabit } from './panabit.js'

var ADAPTERS = [panabit]

/* 全部已注册适配器 (认证类型选择列表) */
export function all() {
  return ADAPTERS
}

/* 按 ID 取适配器; 不存在返回 null */
export function byId(id) {
  if (!id) return null
  for (var i = 0; i < ADAPTERS.length; i++) {
    if (ADAPTERS[i].id === id) return ADAPTERS[i]
  }
  return null
}

/*
 * 自动识别: 遍历适配器 match() 评分, 返回 { adapter, score } (最高分者);
 * 全部 0 分 (探寻不到特征) 返回 null, 由调用方回退到"记住的适配器"或让用户手选。
 */
export function detectAdapter(ctx) {
  var best = null
  for (var i = 0; i < ADAPTERS.length; i++) {
    var a = ADAPTERS[i]
    var s = 0
    try {
      s = a.match(ctx) || 0
    } catch (e) {
      s = 0
    }
    if (!best || s > best.score) best = { adapter: a, score: s }
  }
  return best && best.score > 0 ? best : null
}
