---
slug: /super-agent/react-agent-executor/overview-and-trigger
title: "ReactAgent执行器概述与触发机制：ReactAgentExecutor、开放式问答详解"
sidebar_label: "ReactAgent执行器概述与触发机制"
pagination_label: "ReactAgent执行器概述与触发机制"
description: "当用户在聊天界面选择\"开发问题\"时，系统会将请求路由到 ReactAgentExecutor 执行器，本篇讲解这个执行器的定位、触发条件以及整体执行流程概览。内容进一步围绕开放式问答、REACT_AGENT、执行器触发、ConversationExecutor、执行模式等关键主题展开。通过原理拆解、实现步骤与适用场景…"
keywords: [ReactAgentExecutor, 开放式问答, REACT_AGENT, 执行器触发, ConversationExecutor, 执行模式, Agent自主推理]
---

import VipInline from '@site/src/components/VipInline';

# ReactAgent执行器概述与触发机制

## 什么时候会走到 ReactAgentExecutor？

在前面的章节中，我们已经详细讲解了执行器注册表和模式分发机制。简单回顾一下：当用户发送一条消息后，系统会经过意图识别、问题改写、路由判定等一系列准备流程，最终生成一个 `ConversationExecutionPlan`（执行计划），里面有个关键字段叫 `mode`。

当用户在聊天界面选择的是 **"开发问题"** 这个问答模式时，路由阶段会把执行计划的 `mode` 设为 `ExecutionMode.REACT_AGENT`。接着注册表根据这个模式找到对应的执行器——也就是我们这篇要重点讲的 `ReactAgentExecutor`。

:::info 为什么叫 ReAct？
ReAct 是 "Reasoning + Acting" 的缩写，是一种让大模型交替进行推理和工具调用的 Agent 范式。模型先思考当前应该做什么，然后决定是否调用工具，拿到工具结果后再继续推理，如此循环直到得出最终答案。
:::

## 执行器接口定义

所有执行器都实现了同一个接口 `ConversationExecutor`：

```java
public interface ConversationExecutor {

    ExecutionMode mode();

    Flux<String> execute(TaskInfo taskInfo);
}
```

这个接口非常简洁，就两个方法：
- `mode()` 返回当前执行器负责的执行模式
- `execute(taskInfo)` 接收任务上下文，返回一个流式的文本输出

每个执行器只负责一种模式，通过 `mode()` 方法声明自己是谁。

## REACT_AGENT 模式的定义

在 `ExecutionMode` 枚举中，`REACT_AGENT` 的定义如下：

```java
/**
 * 开放式 ReAct Agent 模式。
 *
 * <p>适用于固定 RAG 或结构图路径无法覆盖的问题，或者需要 Agent 自主判断是否调用工具的场景。
 * 该模式由 {@code ReactAgentExecutor} 执行，会把规划后的 agentQuestion 交给 ReAct Agent，
 * 由 Agent 自主进行推理、工具调用和最终回答输出。</p>
 */
REACT_AGENT,
```

可以看到，这个模式的适用场景是：**固定的 RAG 检索或结构图路径搞不定的问题**。比如用户问的是一个需要联网搜索才能回答的开放性问题，或者问题本身需要 Agent 自己判断该用什么工具、怎么组合信息来回答。

## ReactAgentExecutor 的类声明

```java
@Component
public class ReactAgentExecutor implements ConversationExecutor {

    private final ReactAgent reactAgent;
    private final StreamEventWriter streamEventWriter;

    public ReactAgentExecutor(ReactAgent businessChatReactAgent,
                              StreamEventWriter streamEventWriter) {
        this.reactAgent = businessChatReactAgent;
        this.streamEventWriter = streamEventWriter;
    }

    @Override
    public ExecutionMode mode() {
        return ExecutionMode.REACT_AGENT;
    }
}
```

这里有两个核心依赖：
- **`ReactAgent reactAgent`**：这是 Spring AI Alibaba 提供的 ReAct Agent 图执行引擎，负责真正的推理和工具调用循环
- **`StreamEventWriter streamEventWriter`**：SSE 事件序列化工具，负责把各种事件（thinking、text、error 等）序列化成 JSON 推送给前端

`mode()` 方法直接返回 `ExecutionMode.REACT_AGENT`，告诉注册表"我负责处理开放式问答"。

<VipInline />