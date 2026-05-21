---
slug: /super-agent/react-agent-executor/react-loop
description: 深入讲解 ReactAgent 底层的 ReAct 推理循环机制，包括图结构、Think/Act/Observe 三步循环、条件边路由决策、循环终止条件，以及一个完整的搜索问答循环轨迹示例。
keywords: [ReAct循环, 推理循环, Think-Act-Observe, ReactAgent, AgentLlmNode, AgentToolNode, makeModelToTools, 条件边路由, 循环终止, 图结构]
---

import VipInline from '@site/src/components/VipInline';

# ReAct推理循环机制详解

## 什么是 ReAct 循环

前面几篇文档讲了 ReactAgentExecutor 怎么被触发、怎么配置、怎么调用 `reactAgent.stream()`。但有一个核心问题一直没展开：**调用 `stream()` 之后，ReactAgent 内部到底是怎么"思考→行动→再思考"的？**

ReAct 是 "Reasoning + Acting" 的缩写。它的核心思想很简单：

1. **Think（思考）**：模型拿到当前所有信息，推理下一步该做什么
2. **Act（行动）**：如果模型认为需要外部信息，就生成一个工具调用请求
3. **Observe（观察）**：工具执行完毕，把结果放回上下文，让模型"看到"
4. **循环**：模型再次推理，决定是继续调用工具还是直接给出最终答案

这个循环会一直转下去，直到模型认为信息足够了，不再请求工具调用，直接输出答案为止。

举个具体的例子。用户问："Java 21 有哪些新特性？"

| 轮次 | 步骤 | 发生了什么 |
|:---|:---|:---|
| 第1轮 | Think | 模型推理："这个问题需要最新信息，我应该搜索一下" |
| 第1轮 | Act | 模型生成工具调用：`tavily_search({query: "Java 21 new features"})` |
| 第1轮 | Observe | Tavily 返回搜索结果，包含 Virtual Threads、Pattern Matching 等内容 |
| 第2轮 | Think | 模型看到搜索结果，推理："信息足够了，我可以组织答案了" |
| 第2轮 | 输出 | 模型直接生成最终答案，不再调用工具，循环结束 |

关键点在于：**这个循环不是写在业务代码里的 while 循环**。它是通过图（Graph）的节点和条件边来实现的——模型节点执行完后，条件边判断是否有工具调用，有就路由到工具节点，工具节点执行完再路由回模型节点。图框架自动驱动这个过程。

<VipInline />