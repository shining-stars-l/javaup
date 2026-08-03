---
slug: /super-agent/react-agent-executor/execute-main-flow
title: "execute方法的核心执行流程：核心流程、thinking事件、调试轨迹、链路追踪详解"
sidebar_label: "execute方法的核心执行流程"
pagination_label: "execute方法的核心执行流程"
description: "逐行讲解 ReactAgentExecutor#execute 方法的核心执行流程，包括 thinking 事件推送、调试轨迹记录、链路追踪开启、ReactAgent 流式调用以及完成和异常处理。内容进一步围绕execute方法、核心流程、thinking事件、reactAgent.stream、doOnComple…"
keywords: [execute方法, 核心流程, thinking事件, 调试轨迹, 链路追踪, reactAgent.stream, doOnComplete, doOnError, GraphRunnerException]
---

import VipInline from '@site/src/components/VipInline';

# execute方法的核心执行流程

## 进入 execute 方法

当注册表把请求分发到 `ReactAgentExecutor` 后，就会调用它的 `execute(TaskInfo taskInfo)` 方法。这个方法是整个开放式问答的入口，我们来逐段看它的源码。

## 第一步：初始化状态标记

```java
@Override
public Flux<String> execute(TaskInfo taskInfo) {
    // 用原子布尔值记录是否已经收到过模型流式文本，避免最终完成事件再重复输出一遍完整答案。
    AtomicBoolean streamedText = new AtomicBoolean(false);
```

一进来就创建了一个 `AtomicBoolean`，初始值是 `false`。这个标记的作用后面会详细讲，简单说就是：ReactAgent 在流式输出时，既会逐片段推送文本，也会在最后发一个"完成"事件带上完整文本。如果我们已经逐片段输出过了，就不需要再重复输出完成事件里的内容。

## 第二步：推送 thinking 事件

```java
// 向前端推送 thinking 事件，说明当前问题已经进入 ReAct Agent 自主推理和工具调用路径。
ExecutorEventSupport.publishThinking(taskInfo, streamEventWriter, "当前问题进入开放式 Agent 自主执行阶段。");
```

这行代码通过 SSE 向前端推送一条 thinking 类型的事件，让用户在界面上看到"当前问题进入开放式 Agent 自主执行阶段"这样的提示。

我们来看 `ExecutorEventSupport.publishThinking` 的实现：

```java
public static void publishThinking(TaskInfo taskInfo, StreamEventWriter writer, String content) {
    // 任意关键对象为空，或提示内容为空时，不发送事件，避免空指针和无意义前端消息。
    if (taskInfo == null || writer == null || StrUtil.isBlank(content)) {
        return;
    }
    // 先把 thinking 文案保存到任务上下文，最终调试信息和会话记录可以复用这份列表。
    taskInfo.thinkingSteps().add(content);
    // 再把 thinking 事件写入当前请求的 SSE sink，让前端实时看到执行器状态。
    SinkEmitHelper.emitNext(taskInfo.sink(), writer.thinking(content, taskInfo.eventMetadata()));
}
```

<VipInline />