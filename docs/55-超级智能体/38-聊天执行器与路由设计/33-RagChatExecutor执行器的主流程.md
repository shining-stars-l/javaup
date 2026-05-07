---
slug: /super-agent/chat-executors/rag-executor-main-flow
description: 深入讲解 RagChatExecutor 执行器的 execute 方法主流程，包括检索阶段的启动、异步执行、阶段追踪和错误处理机制。
keywords: [RagChatExecutor, execute方法, RAG检索, 异步执行, 阶段追踪, 弹性线程池, 知识问答]
---

import VipInline from '@site/src/components/VipInline';

# RagChatExecutor执行器的主流程

上一篇我们搞清楚了执行器是怎么被选中的。当用户选择"当前文档问答"模式时，系统会通过注册表拿到 `RagChatExecutor` 实例，然后调用它的 `execute` 方法。这篇就来拆解这个方法到底做了什么。

## execute 方法的整体结构

先看 `RagChatExecutor` 的完整源码：

```java
/**
 * 知识问答执行器。
 * 该执行器负责标准的 RAG 路径，主流程为：
 * 1. 根据执行计划发起检索
 * 2. 整理检索结果和引用
 * 3. 组装系统 Prompt / 用户 Prompt
 * 4. 调用模型基于证据流式生成答案
 */
@Component
public class RagChatExecutor implements ConversationExecutor {

    private final RagRetrievalEngine ragRetrievalEngine;
    private final RagPromptAssemblyService ragPromptAssemblyService;
    private final StreamEventWriter streamEventWriter;
    private final ObservedChatModelService observedChatModelService;

    public RagChatExecutor(RagRetrievalEngine ragRetrievalEngine,
                           RagPromptAssemblyService ragPromptAssemblyService,
                           StreamEventWriter streamEventWriter,
                           ObservedChatModelService observedChatModelService) {
        this.ragRetrievalEngine = ragRetrievalEngine;
        this.ragPromptAssemblyService = ragPromptAssemblyService;
        this.streamEventWriter = streamEventWriter;
        this.observedChatModelService = observedChatModelService;
    }

    @Override
    public ExecutionMode mode() {
        return ExecutionMode.RETRIEVAL;
    }

    /**
     * 执行 RAG 知识问答主流程。
     *
     * @param taskInfo 当前任务
     * @return 模型输出的流式文本结果
     */
    @Override
    public Flux<String> execute(TaskInfo taskInfo) {
        ConversationExecutionPlan plan = taskInfo.executionPlan();

        // 先通知前端：当前正在进入知识检索规划阶段。
        ExecutorEventSupport.publishThinking(taskInfo, streamEventWriter, "正在根据问题规划知识检索范围。");

        ConversationTraceRecorder.StageHandle retrieveStage = taskInfo.traceRecorder() == null
            ? null
            : taskInfo.traceRecorder().startStage(ConversationTraceStageCode.RAG_RETRIEVE, mode().name(), "正在执行双通道混合检索。", null);

        // 检索通常涉及数据库、向量索引或外部 IO，因此切到弹性线程池执行，避免阻塞响应链路。
        return Mono.fromCallable(() -> ragRetrievalEngine.retrieve(plan, taskInfo.traceRecorder()))
            .subscribeOn(Schedulers.boundedElastic())
            .doOnError(error -> {
                if (taskInfo.traceRecorder() != null) {
                    // 检索阶段失败时，优先把阶段状态标记为失败，便于后续调试。
                    taskInfo.traceRecorder().failStage(retrieveStage, "RAG 检索失败。", error.getMessage(), null);
                }
            })
            .doOnSuccess(context -> {
                if (taskInfo.traceRecorder() != null && context != null) {
                    // 检索成功后，把使用的通道、子问题、引用情况等埋点信息完整记录下来。
                    taskInfo.traceRecorder().completeStage(retrieveStage, "RAG 检索完成。", Map.of(
                        "retrievalQuestion", StrUtil.blankToDefault(context.getRetrievalQuestion(), ""),
                        "usedChannels", context.getUsedChannels() == null ? List.of() : context.getUsedChannels(),
                        "retrievalNotes", context.getRetrievalNotes() == null ? List.of() : context.getRetrievalNotes(),
                        "referenceCount", context.flattenReferences().size(),
                        "subQuestionCount", context.getSubQuestionEvidenceList() == null ? 0 : context.getSubQuestionEvidenceList().size(),
                        // ... 省略详细的子问题和引用信息
                    ));
                }
            })
            // 检索完成后，继续进入"证据整理 -> Prompt 组装 -> 模型回答"的后续链路。
            .flatMapMany(context -> streamFromRetrievalContext(taskInfo, plan, context));
    }
}
```

这个方法看起来不长，但其实包含了 RAG 知识问答的核心逻辑。我们一步步拆解。

## 执行流程的三个阶段

整个 `execute` 方法可以分成三个阶段：

### 阶段一：发送 thinking 状态

```java
// 先通知前端：当前正在进入知识检索规划阶段。
ExecutorEventSupport.publishThinking(taskInfo, streamEventWriter, "正在根据问题规划知识检索范围。");
```

这行代码会通过 SSE 向前端推送一个 `thinking` 事件，告诉用户"我正在思考"。这样用户就不会看到一片空白，体验会好很多。

### 阶段二：启动检索阶段追踪

```java
ConversationTraceRecorder.StageHandle retrieveStage = taskInfo.traceRecorder() == null
    ? null
    : taskInfo.traceRecorder().startStage(ConversationTraceStageCode.RAG_RETRIEVE, mode().name(), "正在执行双通道混合检索。", null);
```

这里启动了一个"阶段追踪句柄"。系统会记录这个检索阶段的开始时间、状态、输入输出等信息，最终落库到调试表中。这样后续可以在调试页面看到每个阶段的耗时和执行情况。

:::info 为什么要追踪阶段？
RAG 问答链路比较长，包括检索、Prompt 组装、模型回答等多个阶段。如果某次回答质量不好或者速度慢，我们需要知道是哪个阶段出了问题。阶段追踪就是为了解决这个问题——每个阶段都会记录开始时间、结束时间、输入输出、成功失败状态，方便后续排查。
:::

<VipInline />