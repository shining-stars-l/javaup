---
slug: /damai-ai/mcp/detail
description: "MCP协议核心原理讲解，覆盖模型与外部系统通信的标准化方式、核心参与者职责与请求协作机制，帮助构建可扩展的AI工具生态。"
keywords: ["MCP协议", "Model Context Protocol", "工具注册", "资源发现", "协议协作", "AI外部系统集成", "标准化上下文", "Agent能力扩展"]
---

# MCP（Model Context Protocol）详解

import VipInline from '@site/src/components/VipInline';

## 一、MCP 是什么？
**MCP（Model Context Protocol，模型上下文协议）** 是由 Anthropic 公司推出的一个**开源标准协议**，用于连接 AI 应用程序与外部系统。

> 官方定义：MCP is an open-source standard for connecting AI applications to external systems.
>
> 官方文档：[https://modelcontextprotocol.io](https://modelcontextprotocol.io)
>

### 用一个比喻来理解
**官方比喻：MCP 就像 AI 应用的 USB-C 接口**

就像 USB-C 为各种电子设备提供了标准化的连接方式一样，MCP 为 AI 应用程序连接外部系统提供了标准化的方式。

```mermaid
graph LR
    subgraph "传统方式（像各种不同的接口）"
        A1[AI应用1] -->|专用接口A| B1[系统A]
        A2[AI应用2] -->|专用接口B| B2[系统B]
        A3[AI应用3] -->|专用接口C| B3[系统C]
    end
```

```mermaid
graph LR
    subgraph "MCP方式（像USB-C统一接口）"
        A[任意AI应用] -->|MCP协议| M[MCP标准接口]
        M --> B1[文件系统]
        M --> B2[数据库]
        M --> B3[搜索引擎]
        M --> B4[任意外部系统]
    end
```

### 另一个比喻
+ **AI 模型**就像一个非常聪明的"大脑"，它懂很多知识，能回答各种问题
+ 但这个"大脑"**被关在一个房间里**，它看不到外面的世界，也无法操作任何东西
+ **MCP** 就像是给这个房间装了一扇"窗户"和一双"手"，让 AI 能够：
    - 👀 **看到**外部世界的真实数据（文件、数据库、API等）
    - 🤚 **操作**外部系统（读写文件、调用服务等）

<VipInline />
