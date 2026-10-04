---
slug: /agent-up-memory/memory-recall/mcp-authentication-and-routing
description: 从 MCP HTTP 入口依次讲解 Bearer 认证、JSON-RPC 协商、工具清单、参数与权限检查，以及工具结果和协议错误的区别。
keywords: [Agent Up Memory, MCP, JSON-RPC, Bearer, McpAuthenticationFilter, McpServer, tools/call]
---

import VipInline from '@site/src/components/VipInline';

# MCP请求认证与工具路由

## 先认清 MCP 这一层的职责

客户端向 `POST /mcp/v1` 发 JSON-RPC 请求。后端实际顺序是过滤器验令牌，Controller 取可信 principal，`McpServer` 解析协议和工具，最后才调用工具适配器。本篇讲到 `McpToolExecutor.execute()` 被调用；下一篇顺着 `memory_search` 和 `memory_recall` 继续往里走。

MCP 列表里还有 `memory_capture`、`memory_feedback`、`memory_export`、`memory_import`，它们分别进入记忆写入、反馈和导入导出链路。本目录主要讲召回和只读工具，所以这里只说明它们参与同一套路由与 scope 校验，具体业务留给对应章节。

![MCP HTTP 到工具调用](/img/agent-up-memory/讲解/12-记忆召回与MCP工具执行/03-A-mcp-call-chain.drawio.png)

<VipInline />
