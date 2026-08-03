---
slug: /ai-interview/quick-review/mcp-protocol
title: "MCP协议面试速查：MCP面试、Model Context Protocol、传输模式详解"
sidebar_label: "MCP协议面试速查"
pagination_label: "MCP协议面试速查"
description: "MCP协议面试速查：覆盖协议设计理念、与Function Calling的区别、三种传输模式、调用链路源码、企业级开发等考点。内容进一步围绕MCP面试、Model Context Protocol、stdio、SSE、MCP Server等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。"
keywords: ["MCP面试", "Model Context Protocol", "MCP协议", "传输模式", "stdio", "SSE", "MCP Server"]
---

# MCP协议面试速查

:::tip 对应模块
本文对应 [MCP详细解析](/ai-interview/mcp/introduction) 模块全部文档的面试考点提炼。MCP是本项目深入到源码级别的独有内容。
:::

### Q1：MCP协议要解决什么问题？

MCP（Model Context Protocol）是工具调用的标准化协议。之前每个模型厂商的Function Calling格式不同，工具开发者要针对每家写适配代码。MCP统一了"工具怎么暴露、怎么被发现、怎么被调用"的标准。

类比：USB统一了各种设备的连接方式，MCP统一了AI工具的对接方式。

📖 [揭开MCP协议的面纱](/ai-interview/mcp/introduction)

---

### Q2：MCP跟Function Calling是什么关系？是替代还是互补？

**互补，不是替代**。

Function Calling是模型侧的能力——模型决定"调哪个工具、传什么参数"。

MCP是工程侧的协议——规范了工具如何注册、如何被发现、如何通信。

最终链路：用户提问 → 模型通过Function Calling决策要调哪个工具 → 通过MCP协议跟工具服务端通信 → 执行 → 结果返回。

MCP不改变模型的决策逻辑，它改变的是工具的"连接方式"。

📖 [MCP与相关技术的关系](/ai-interview/mcp/tech-relationship)

---

### Q3：MCP的三个核心角色和通信模型？

**MCP Server（工具提供方）**：暴露自己有哪些工具（Tools）、有哪些可用资源（Resources）、有哪些Prompt模板（Prompts）。

**MCP Client（AI应用方）**：发现Server有什么能力，按需调用。

**Transport（通信层）**：定义两端怎么通信。基于JSON-RPC协议。

通信流程：Client → initialize握手 → 获取Server能力列表 → 根据需要调用具体工具 → 收到响应。

📖 [深入MCP通信机制](/ai-interview/mcp/json-rpc)

---

### Q4：三种传输模式（stdio/SSE/WebSocket）各适合什么场景？

**stdio**：Server和Client在同一台机器上，通过标准输入输出通信。最简单，本地CLI工具、IDE插件常用。

**SSE（Server-Sent Events）**：HTTP长连接，服务端向客户端单向推送。适合Web应用调远程MCP服务。穿透防火墙容易，是最常见的生产部署方式。

**WebSocket**：全双工双向通信。需要Server主动推通知给Client时使用（比如实时Agent协作、语音场景中断处理）。

选择逻辑：同机 → stdio；远端Web → SSE；需要双向实时 → WebSocket。

📖 [三种传输模式全面解读](/ai-interview/mcp/transport-modes)

---

### Q5：用Spring AI怎么构建一个MCP Server？

核心步骤：

```java
@McpServer
public class WeatherMcpServer {
    
    @McpTool(description = "查询指定城市的实时天气")
    public WeatherResult getWeather(@Param("city") String city) {
        return weatherService.query(city);
    }
}
```

Spring AI框架做的事：
1. 扫描@McpServer注解的类
2. 把@McpTool方法注册为MCP工具
3. 启动Transport层监听（stdio或HTTP）
4. 处理Client的初始化握手和工具调用请求

配置选择传输模式：
- `spring.ai.mcp.server.transport=stdio`（本地）
- `spring.ai.mcp.server.transport=sse`（远端HTTP）

📖 [Spring AI构建MCP服务端实战](/ai-interview/mcp/server-development)

---

### Q6：MCP调用链路从发起到响应经历了什么？

端到端链路（以SSE传输为例）：

用户提问 → ChatClient处理 → 模型判断需要调工具 → 输出tool_call → MCP Client解析 → 构造JSON-RPC请求 → HTTP POST到MCP Server → Server路由到对应方法执行 → 返回JSON-RPC响应 → Client接收解析 → 结果注入消息列表 → 再次发给模型 → 生成最终回答。

关键细节：
- 握手阶段Client获取Server的能力列表（tools/resources/prompts），缓存起来
- 工具调用是同步阻塞的（Client等Server返回）
- 超时和重试逻辑在Client侧实现

📖 [MCP调用链路源码解密](/ai-interview/mcp/source-code-analysis)

---

### Q7：企业级MCP开发要注意什么？

**安全性**：
- 工具执行需要权限校验（不是模型说调就能调）
- 敏感操作（写入、删除）需要二次确认机制
- 防止通过MCP工具描述做Prompt注入

**性能**：
- 工具执行超时控制
- 高并发下的连接池管理
- 结果缓存（相同参数短时间内不重复调用）

**可观测性**：
- 每次工具调用记trace（耗时、参数、结果）
- 工具成功率监控和告警
- 成本归因（哪些工具调用最频繁）

**版本管理**：
- 工具升级时兼容旧版Client
- 工具废弃时的平滑过渡

📖 [MCP企业级开发进阶技巧](/ai-interview/mcp/enterprise-practices)

---

### Q8：MCP、Function Calling、Skills三者的关系？

可以这么理解它们在不同层次解决问题：

- **Function Calling**：模型层面的"决策能力"——模型知道有哪些工具、决定调哪个
- **MCP**：通信层面的"连接标准"——工具方和调用方用统一协议对接
- **Skills**：上下文层面的"容量管理"——工具太多时，按需加载避免上下文膨胀

一个完整系统中三者协作：Skills控制哪些能力当前可用（L1发现层）→ 被选中的能力通过MCP协议注册/调用 → 模型通过Function Calling机制做调用决策。

📖 [MCP与相关技术的关系](/ai-interview/mcp/tech-relationship)