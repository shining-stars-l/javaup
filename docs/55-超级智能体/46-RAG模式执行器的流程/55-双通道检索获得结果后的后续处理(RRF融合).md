---
slug: /super-agent/chat-executors/channel-retrieval-rrf
title: "双通道检索获得结果后的后续处理(RRF 融合)：RRF融合、证据闸门、resolveScore详解"
sidebar_label: "双通道检索获得结果后的后续处理(RRF 融合)"
pagination_label: "双通道检索获得结果后的后续处理(RRF 融合)"
description: "讲解双通道检索获得候选文档后的 RRF 融合流程，包括证据闸门过滤、resolveScore 分数解析、通道轨迹构建、RRF 倒数排名融合算法的原理与实现。内容进一步围绕RRF融合、CandidateHolder、accumulateRrf等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。"
keywords: [RRF融合, 证据闸门, resolveScore, 通道轨迹, 倒数排名融合, CandidateHolder, accumulateRrf]
---

import VipInline from '@site/src/components/VipInline';

# 双通道检索获得结果后的后续处理(RRF 融合)

还是回到 `RagRetrievalEngine#retrieveSingleSubQuestion` 这个方法，我们之前已经讲解了它的前半部分：根据子问题和可用通道列表，发起多通道并发检索，并对每个通道设置了独立的超时隔离。

现在我们继续看它的后半部分。

## 等待所有通道完成并过滤空结果

```java
if (futures.isEmpty()) {
    // 如果没有任何通道支持当前计划，直接返回空证据，并写入提示说明。
    notes.add("子问题" + subQuestionIndex + "没有可用的检索通道。");
    return new SubQuestionEvidence(subQuestionIndex, subQuestion, List.of(), new ArrayList<>(), List.of(), 0, 0, 0);
}

// 原始结果保留的是通道直接召回的候选，用于后续观测记录和过滤前后对比。
List<RetrievalChannelResult> rawChannelResults = futures.stream()
    .map(CompletableFuture::join)
    .filter(result -> result.getDocuments() != null)
    .toList();
```

这里先检查是否有可用的通道。如果没有，直接返回空证据。

然后等待所有通道完成（`CompletableFuture::join`），并过滤掉空结果。这里保留的是**原始结果**，也就是通道直接召回的候选，还没有经过任何过滤。

## 应用证据闸门过滤

```java
// 对不同通道应用对应的证据闸门，过滤掉分数过低的候选文档。
List<RetrievalChannelResult> channelResults = rawChannelResults.stream()
    .map(this::applyEvidenceGate)
    .toList();
```

这里调用 `applyEvidenceGate` 方法，对每个通道的结果应用证据闸门。我们来看这个方法的实现：

```java
/**
 * 对单个通道结果应用证据闸门。
 * 不同通道采用不同过滤策略，例如向量通道基于最小相似度，关键词通道基于相对分数下限。
 *
 * @param result 通道原始结果
 * @return 过滤后的通道结果
 */
private RetrievalChannelResult applyEvidenceGate(RetrievalChannelResult result) {
    if (result == null || result.getDocuments() == null || result.getDocuments().isEmpty()) {
        return result;
    }

    // 按通道类型选择不同的过滤策略，避免不同分数体系混用同一阈值。
    List<Document> documents = switch (result.getChannelName()) {
        case "vector" -> filterVectorCandidates(result.getDocuments());
        case "keyword" -> filterKeywordCandidates(result.getDocuments());
        default -> result.getDocuments();
    };
    return new RetrievalChannelResult(result.getChannelName(), documents);
}
```

### 什么是证据闸门？

证据闸门（Evidence Gate）是一个过滤机制，用于过滤掉分数过低的候选文档。不同通道使用不同的过滤策略：

<VipInline />