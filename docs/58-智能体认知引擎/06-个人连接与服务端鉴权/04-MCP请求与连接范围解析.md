---
slug: /agent-up-memory/external-connections/mcp-request-and-connection-resolution
description: 顺着 MCP JSON-RPC 请求进入服务端的顺序，讲解协议校验、工具 scope、身份字段禁止覆盖、连接范围解析和记忆工具执行。
keywords: [MCP, JSON-RPC, memory_recall, memory_search, memory_capture, 连接范围, scope, ExternalConnectionContextResolver]
---

import VipInline from '@site/src/components/VipInline';

# MCP请求与连接范围解析

## MCP 过滤器放行以后，身份还没有完成授权

`McpAuthenticationFilter` 只负责把 Bearer Token 转成 API Token principal，并复核当前凭据。请求进入 `McpController` 后，还要经过 `McpServer` 的协议校验、工具 scope 校验和连接范围解析。

```text
POST /mcp/v1
  -> McpAuthenticationFilter
     -> Bearer 解析、Token 认证、当前凭据复核
  -> McpController.handle
     -> 取 request principal
     -> McpServer.handle
        -> JSON-RPC 版本、method、id、correlationId
        -> initialize / tools/list / tools/call
        -> 工具名称、参数和 required scope
        -> McpSharedMemoryToolExecutor
           -> ExternalConnectionContextResolver.resolve
           -> 重新得到 project、default memory asset、eligibility
           -> 调用 recall/search/capture/feedback/import/export
```

![MCP 请求分层调用链](/img/agent-up-memory/讲解/06-个人连接与服务端鉴权/07-MCP请求分层调用链.drawio.png)

<VipInline />
