---
slug: /super-agent/mcp/client-development
description: "使用Spring AI开发MCP Client，掌握配置注入与手动构建两种方式，实现智能助手对接多个MCP Server"
keywords: ["MCP Client开发", "Spring AI MCP客户端", "智能助手集成", "MCP工具调用", "多Server集成"]
---

import VipInline from '@site/src/components/VipInline';

# Spring AI MCP客户端开发指南


上一篇我们开发了MCP Server，现在来做另一半——MCP Client。

想象你要打造一个企业智能助手，它需要具备多种能力：
- 对接HR系统查考勤、查工资
- 对接行政系统订会议室、查排期
- 对接搜索引擎查询实时信息

每种能力来自不同的MCP Server。你的智能助手作为MCP Client，需要同时连接多个Server，把它们的工具能力整合起来。

这一篇我们就来实现这个场景。

## 两种集成方式：自动挡与手动挡

Spring AI提供了两种方式来集成MCP Client：

| 方式 | 特点 | 适用场景 |
|------|------|----------|
| 配置文件注入（自动挡） | 在application.yml配置Server信息，框架自动初始化 | Server相对固定，配置简单 |
| 手动构建（手动挡） | 在代码中显式创建Client | 需要动态控制、特殊配置 |

### 自动挡：配置文件驱动

就像开自动挡的车，你只需要告诉它目的地（配置Server地址），剩下的换挡、油门控制它自己搞定。

### 手动挡：代码完全掌控

像开手动挡的车，每一次换挡、每一脚油门都由你控制。虽然麻烦，但更灵活。

```plantuml title="自动挡与手动挡的集成路径" width="100%" align="left"
@startuml
left to right direction
skinparam backgroundColor transparent
skinparam shadowing false
skinparam defaultFontColor #1E293B
skinparam ArrowColor #2563EB
skinparam ArrowThickness 1.2
skinparam packageStyle rectangle
skinparam packageBorderColor #CBD5E1
skinparam packageBackgroundColor #F8FAFC
skinparam rectangleBorderColor #94A3B8
skinparam rectangleBackgroundColor #FFFFFF
skinparam RectangleFontColor #1E293B
skinparam RoundCorner 18

actor 用户 as User

package "自动挡" as Auto #EFF6FF {
  rectangle "application.yml" as Yaml #FFFFFF
  rectangle "Starter 自动装配" as AutoBoot #FFFFFF
}

package "手动挡" as Manual #F8FAFC {
  rectangle "ManualClientService" as ManualSvc #FFFFFF
  rectangle "手动创建 Transport / Client" as ManualBuild #FFFFFF
}

rectangle "McpSyncClient 列表" as Clients #DBEAFE
rectangle "SyncMcpToolCallbackProvider" as Provider #ECFCCB
rectangle "ChatClient" as Chat #FEF3C7
rectangle "DirectToolService\n按需直接调用工具" as Direct #E0F2FE

Yaml --> AutoBoot
AutoBoot --> Clients
ManualSvc --> ManualBuild
ManualBuild --> Clients
Clients --> Provider
Provider --> Chat
Direct --> Clients
User --> Chat : 走大模型调度
User --> Direct : 走场景化直连调用
@enduml
```

<VipInline />
