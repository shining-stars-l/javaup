---
slug: /super-agent/chat-executors/rag-retrieval-engine
description: 深入讲解 RagRetrievalEngine 的 retrieve 方法，包括子问题并发检索、通道级超时隔离、证据闸门过滤、RRF 融合、父块提升和 rerank 等核心机制。
keywords: [RagRetrievalEngine, retrieve方法, 子问题检索, 并发检索, 超时隔离, 证据闸门, RRF融合, 父块提升, rerank]
---

import VipInline from '@site/src/components/VipInline';

# RAG检索引擎的核心流程

上一篇我们看到 `RagChatExecutor.execute` 方法会调用 `ragRetrievalEngine.retrieve()` 进行知识检索。这个方法是整个 RAG 问答链路的核心，负责把用户的问题转换成可用的证据。这篇就来详细拆解这个检索引擎是怎么工作的。

## RagRetrievalEngine 的职责

先看类注释，了解这个组件的定位：

```java
/**
 * RAG 检索引擎。
 * 该组件负责把编排阶段产出的检索问题真正落到多通道检索执行上，并完成：
 * 1. 子问题拆分后的并发检索
 * 2. 通道级超时隔离与降级
 * 3. 向量 / 关键词结果闸门过滤
 * 4. 多通道 RRF 融合
 * 5. 父块提升与 rerank
 * 6. 最终证据裁剪、引用编号和检索观测记录
 */
@Slf4j
@Service
public class RagRetrievalEngine {

    private static final int RRF_K = 60;

    private final List<RetrievalChannel> retrievalChannels;
    private final ChatRagProperties properties;
    private final DocumentPostProcessor rerankPostProcessor;
    private final DocumentKnowledgeService documentKnowledgeService;
    private final ExecutorService executorService;

    public RagRetrievalEngine(List<RetrievalChannel> retrievalChannels,
                              ChatRagProperties properties,
                              HttpDocumentRerankPostProcessor rerankPostProcessor,
                              DocumentKnowledgeService documentKnowledgeService,
                              @Qualifier("chatRagExecutorService") ExecutorService executorService) {
        this.retrievalChannels = retrievalChannels;
        this.properties = properties;
        this.rerankPostProcessor = rerankPostProcessor;
        this.documentKnowledgeService = documentKnowledgeService;
        this.executorService = executorService;
    }
}
```

从依赖注入可以看出，这个引擎需要：

- **retrievalChannels**：所有可用的检索通道（向量检索、关键词检索等）
- **properties**：RAG 配置参数（超时时间、topK、阈值等）
- **rerankPostProcessor**：重排序处理器
- **documentKnowledgeService**：文档知识服务（用于父块提升）
- **executorService**：线程池（用于并发检索）

## retrieve 方法的整体结构

先看完整的方法签名和主流程：

```java
/**
 * 执行整轮 RAG 检索。
 * 这是知识问答链路中的核心入口，会把总检索问题拆成多个子问题并发执行，
 * 然后收集每个子问题的证据、引用、使用通道和调试备注，最终汇总成统一的检索上下文。
 *
 * @param plan 编排阶段产出的执行计划
 * @param traceRecorder 会话追踪记录器，可为空
 * @return 汇总后的检索上下文
 */
public RagRetrievalContext retrieve(ConversationExecutionPlan plan, ConversationTraceRecorder traceRecorder) {
    RagRetrievalContext context = new RagRetrievalContext();

    // 记录本轮实际用于检索的问题文本，后续调试页面和埋点会直接使用这里的值。
    context.setRetrievalQuestion(plan.getRetrievalQuestion());

    // usedChannels / retrievalNotes 在子问题并发检索过程中会被多个线程写入，因此使用同步列表。
    context.setUsedChannels(Collections.synchronizedList(new ArrayList<>()));
    context.setRetrievalNotes(Collections.synchronizedList(new ArrayList<>()));

    // 如果编排阶段没有拆子问题，则退化为只检索总问题本身。
    List<String> subQuestions = plan.getRetrievalSubQuestions() == null || plan.getRetrievalSubQuestions().isEmpty()
        ? List.of(plan.getRetrievalQuestion())
        : plan.getRetrievalSubQuestions();

    List<CompletableFuture<SubQuestionEvidence>> futures = new ArrayList<>();
    for (int index = 0; index < subQuestions.size(); index++) {
        final int subQuestionIndex = index + 1;
        final String subQuestion = subQuestions.get(index);

        // 每个子问题独立并发检索，彼此隔离，这样某个子问题超时不会拖垮整轮检索。
        futures.add(CompletableFuture.supplyAsync(
                () -> retrieveSingleSubQuestion(subQuestionIndex, subQuestion, plan, context.getUsedChannels(), context.getRetrievalNotes(), traceRecorder),
                executorService
            )
            // 为每个子问题单独设置超时，避免极端慢查询卡住整轮回答。
            .orTimeout(Math.max(properties.getSubQuestionTimeoutMs(), 1L), TimeUnit.MILLISECONDS)
            .exceptionally(throwable -> {

                // 超时、线程池封装异常等都先展开到根因，方便日志诊断。
                Throwable rootCause = unwrapThrowable(throwable);
                log.warn("子问题检索失败: subQuestionIndex={}, subQuestion='{}', exceptionType={}, message={}",
                    subQuestionIndex,
                    subQuestion,
                    rootCause == null ? "" : rootCause.getClass().getName(),
                    rootCause == null ? "" : rootCause.getMessage(),
                    throwable);
                context.getRetrievalNotes().add("子问题" + subQuestionIndex + "检索失败或超时，已自动忽略。");
                // 单个子问题失败时不抛出整轮异常，而是返回一个空证据对象，体现"局部失败、整体降级"策略。
                return new SubQuestionEvidence(subQuestionIndex, subQuestion, List.of(), new ArrayList<>(), List.of(), 0, 0, 0);
            }));
    }

    // join 会等待每个子问题都回到"成功结果或降级结果"状态，这里不会再向外抛单个子问题异常。
    List<SubQuestionEvidence> evidenceList = futures.stream()
        .map(CompletableFuture::join)
        .toList();

    // 统计有多少个子问题真正取回了文档证据，便于日志观察检索命中率。
    int acceptedCount = (int) evidenceList.stream().filter(item -> item.getDocuments() != null && !item.getDocuments().isEmpty()).count();
    log.info("RAG 检索完成: retrievalQuestion='{}', originalSubQuestionCount={}, acceptedSubQuestionCount={}, notes={}",
        plan.getRetrievalQuestion(),
        evidenceList.size(),
        acceptedCount,
        context.getRetrievalNotes());

    // 统一为所有子问题下的引用分配稳定、连续的 referenceId，便于前端展示和答案内引用映射。
    assignReferenceIds(evidenceList);
    context.setSubQuestionEvidenceList(evidenceList);
    return context;
}
```

<VipInline />

