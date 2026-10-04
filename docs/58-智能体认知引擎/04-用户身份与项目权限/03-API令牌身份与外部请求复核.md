---
slug: /agent-up-memory/identity-and-access/api-token-and-external-request
description: 讲解 API Token 的创建约束、Bearer 解析、MCP 专用认证过滤器、Token 轮换窗口和 AuthenticatedPrincipalAuthority 二次复核，说明令牌身份如何进入项目权限判断。
keywords: [API Token, Bearer, MCP认证, McpAuthenticationFilter, AuthenticatedPrincipalAuthority, Token轮换, credential epoch, Token Scope]
---

import VipInline from '@site/src/components/VipInline';

# API令牌身份与外部请求复核

## 两个 HTTP 入口

浏览器页面使用 `AUM_SESSION` Cookie，MCP 和自动召回、自动采集适配器使用 API Token，它至少带着三类限制：用户身份、用途 scope、项目连接绑定。

这一篇先把身份层讲清楚。项目和记忆库的最终资格判断在下一篇，外部请求只有先通过这里，才有机会进入 `workspace-governance`。

普通 `/api/v1/*` 请求由 `IdentityAuthenticationFilter` 统一处理，允许 Cookie 或 `Authorization: Bearer` 二选一。MCP `/mcp/v1` 单独注册 `McpAuthenticationFilter`，它拒绝 Cookie，只接受 Bearer，避免浏览器登录态误打到外部工具入口。

```text
浏览器或普通 API
  -> IdentityAuthenticationFilter
     -> Cookie / Bearer 二选一
     -> IdentityAuthentication 或 ApiTokenAuthentication
     -> request principal

MCP /mcp/v1
  -> McpAuthenticationFilter
     -> 只接受一个 Authorization: Bearer
     -> JdbcApiTokenAuthentication.authenticateToken
     -> JdbcAuthenticatedPrincipalAuthority.requireCurrentCredential
     -> MCP handler
```

![Cookie 与 Bearer Token 请求分流](/img/agent-up-memory/讲解/04-用户身份与项目权限/04-Cookie与Bearer请求分流.drawio.png)

<VipInline />
