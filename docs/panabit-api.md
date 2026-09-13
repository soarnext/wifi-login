# Panabit Portal API

> 返回 [README](../README.md)

以下协议由内置的 **Panabit 适配器** (`ui/src/services/portal-adapters/panabit.js`)
实现, 作为默认适配器与演示模板 (其他认证系统按 [ADAPTER.md](../ADAPTER.md) 自行适配)。

端点: `http://<portal服务器>[:端口]/api?<查询参数>`, 响应 JSON, `code==0` 成功,
`code==200` 为 MAC 免认证已通过。

| route | action | 参数 | 说明 |
|---|---|---|---|
| portal | load_portal_conf | ip, vlan, mac, device | 加载配置/策略; 建立会话 |
| webauth | user_login | auth_type, ip, mac, username, password(AES), remember_me | 账号密码登录; code 3=锁定(带 left), 2=需改密, 255=账密错误 |
| webauth | query_auth_stat | scene_str, ip, type | 认证状态/心跳; data.stat!=0 即已认证 |
| ucenter | user_offall | ip | 下线所有 |
| ucenter | load_user_list | ip | 在线设备列表 (管理页提取) |
| ucenter | user_offone | addr | 单设备下线 (addr=目标设备在线 IP, 管理页提取) |

密码加密: AES-128-ECB/ZeroPadding, 密钥 `Panabit@1024_key`, 与网页端 `pa_aes_encode`
一致 (实现见 `ui/src/services/aes.js`)。
