---
slug: /super-agent/mcp/json-rpc
description: "深入理解MCP底层的JSON-RPC通信协议，掌握数据层标准化的实现原理与完整生命周期"
keywords: ["JSON-RPC", "MCP通信协议", "MCP数据层", "RPC协议", "智能体通信机制"]
---

import VipInline from '@site/src/components/VipInline';

# 深入MCP通信机制

在设计一个通信协议时，有很多选择：RESTful API、GraphQL、gRPC、自定义二进制协议......MCP最终选择了JSON-RPC。这个选择背后有什么考量？

先来看看JSON-RPC的几个特点：

**极简主义**

JSON-RPC的核心理念是"只做一件事"：调用远程方法。不像RESTful API那样需要关心资源路径、HTTP方法（GET/POST/PUT/DELETE）、状态码含义，JSON-RPC就三个要素：方法名、参数、响应。

**语言无关**

JSON是几乎所有编程语言都支持的格式。Java能解析、Python能解析、JavaScript能解析、Go也能解析。这对MCP很重要——它要让各种语言写的工具服务能够互通。

**人类可读**

和二进制协议相比，JSON是文本格式，用眼睛就能看懂。调试的时候，直接看请求响应的JSON内容，比看一堆二进制字节方便太多了。

这几个特点恰好契合MCP的需求：
- 跨语言互通是MCP的核心目标
- 智能体场景下调试很重要，可读性有价值
- MCP不追求极致性能，简单够用就行

## 像对讲机一样理解JSON-RPC

JSON-RPC的通信模式可以用对讲机来类比。

想象两个人用对讲机通话：

**一问一答模式**

甲按下发送键说："小王，仓库还有多少矿泉水？Over。"（请求）

乙收到后按发送键回复："收到，库存还有50箱。Over。"（响应）

每次通话都是独立的，对讲机不记录之前说过什么。这就是JSON-RPC的"无状态"特性。

**统一的沟通格式**

为了高效沟通，他们约定了固定的格式：
- 先说对方名字（方法名）
- 再说具体问题（参数）
- 最后说"Over"表示结束

JSON-RPC也有固定的格式，所有请求和响应都按照约定的结构来。

<VipInline />
