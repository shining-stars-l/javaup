---
slug: /super-agent/mcp/server-development
description: "使用Spring AI框架实战开发MCP Server，涵盖Stdio、SSE、Streamable HTTP三种模式的完整配置与代码示例"
keywords: ["MCP Server开发", "Spring AI MCP", "智能体工具服务", "MCP实战", "工具服务开发"]
---

import VipInline from '@site/src/components/VipInline';

# Spring AI构建MCP服务端实战

## 实战目标

这一篇我们动手搭建一个真实可用的MCP Server。为了让示例更有实际意义，我们以"智能办公助手"为场景，开发以下工具：

| 工具名称 | 功能描述 |
|----------|----------|
| checkAttendance | 查询员工考勤记录 |
| bookMeetingRoom | 预订会议室 |
| queryRoomSchedule | 查询会议室排期 |

我们会分别用Stdio、SSE、Streamable HTTP三种模式来部署这个Server，让你对比体会它们的差异。

<VipInline />
