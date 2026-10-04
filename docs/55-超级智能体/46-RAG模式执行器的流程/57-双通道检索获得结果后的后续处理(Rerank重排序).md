---
slug: /super-agent/chat-executors/channel-retrieval-rerank
title: "双通道检索获得结果后的后续处理(Rerank 重排序)：跨编码器、精排、relevance_score详解"
sidebar_label: "双通道检索获得结果后的后续处理(Rerank 重排序)"
pagination_label: "双通道检索获得结果后的后续处理(Rerank 重排序)"
description: "讲解 RAG 检索流程中的 Rerank 重排序环节，包括粗排与精排的区别、HttpDocumentRerankPostProcessor 的 HTTP 调用实现、请求响应格式、异常兜底机制，以及最终裁剪和证据返回。内容进一步围绕跨编码器、relevance_score等关键主题展开。通过原理拆解、实现步骤与适用场景…"
keywords: [Rerank, 重排序, 跨编码器, HttpDocumentRerankPostProcessor, 精排, relevance_score, 最终裁剪]
---

import VipInline from '@site/src/components/VipInline';

# 双通道检索获得结果后的后续处理(Rerank 重排序)

上一篇我们讲了父块提升，把子块级别的短片段提升为上下文更完整的父块证据。现在候选列表里的文档已经有了足够的上下文，但排序还是基于 RRF 融合分数和父块分数。这一篇我们来看最后的精排阶段——**Rerank 重排序**，用跨编码器模型重新评估每个文档与子问题的相关性，把真正最相关的文档排到最前面。

## Rerank 重排序

```java
// 对父块候选再做 rerank，把与当前子问题最相关的内容排到更前面。
List<Document> rerankedCandidates = applyRerank(subQuestion, parentCandidates, usedChannels);
```

我们来看 `applyRerank` 方法的实现：

```java
/**
 * 对候选文档执行 rerank。
 *
 * @param subQuestion 当前子问题
 * @param candidates 待重排候选
 * @param usedChannels 已使用通道集合
 * @return 重排后的候选列表
 */
private List<Document> applyRerank(String subQuestion,
                                   List<Document> candidates,
                                   List<String> usedChannels) {
    if (!properties.isRerankEnabled() || candidates.isEmpty()) {
        // 未开启 rerank 或没有候选时，直接返回原顺序。
        return candidates;
    }

    // rerank 本身也视作一种"通道 / 能力"使用，需要在调试和落库中体现。
    markUsedChannel(usedChannels, RetrievalChannelEnum.RERANK.getName());
    return rerankPostProcessor.process(new Query(subQuestion), candidates);
}
```

这个方法本身很简单：先判断是否开启了 rerank，如果开启了就调用 `rerankPostProcessor.process` 执行实际的重排序。同时把 rerank 标记为"已使用通道"，方便调试页面展示。

关键逻辑在 `rerankPostProcessor.process` 里面，它的实现类是 `HttpDocumentRerankPostProcessor`。

### 什么是 Rerank？

Rerank（重排序）是一个精排阶段。前面的向量检索、关键词检索、RRF 融合都属于"召回 + 粗排"，它们的目标是从海量文档中快速筛出一批可能相关的候选。但"可能相关"不等于"真的相关"，粗排阶段难免会混入一些不太对的文档。

Rerank 的作用就是：拿到粗排后的候选列表（通常 10-20 个），用一个更强大的模型逐一精细评估每个文档和问题的相关性，然后重新排序。

**粗排 vs 精排的区别**：

- **粗排（向量检索 / 关键词检索）**：用的是双编码器（Bi-Encoder）。问题和文档分别编码成向量，然后算余弦相似度。优点是快（可以预计算文档向量），缺点是问题和文档之间没有交互，理解能力有限。
- **精排（Rerank）**：用的是跨编码器（Cross-Encoder）。把问题和文档拼在一起，让模型同时看到两者，逐 token 交互计算相关性。优点是理解能力强，缺点是慢（每对问题-文档都要跑一次模型）。

打个比方：粗排像是看简历筛人，只看关键词和学历匹配不匹配；精排像是面试，把候选人叫过来一个一个聊，深入了解是否真的合适。

### 为什么要 Rerank？

我们用一个具体场景来说明。假设用户问的是："**Spring Boot 中如何配置 HikariCP 的最大连接数？**"

经过向量检索 + 关键词检索 + RRF 融合后，候选列表可能是这样的：

| 排名 | 文档内容摘要 | 为什么被召回 | 实际相关性 |
|:---:|--------|--------|:---:|
| 1 | Spring Boot 自动配置原理，包括 DataSource 的自动装配流程 | 向量语义相似（都在说 Spring Boot + 数据源） | 中 |
| 2 | HikariCP 连接池参数详解：maximumPoolSize、minimumIdle、connectionTimeout | 关键词命中（HikariCP、连接） | **高** |
| 3 | Spring Boot 中使用 Druid 连接池的配置方法 | 向量语义相似（Spring Boot + 连接池配置） | 低 |
| 4 | application.yml 中 spring.datasource.hikari.maximum-pool-size 的配置示例 | 关键词命中（HikariCP、配置） | **高** |
| 5 | Spring Boot 启动流程与 Bean 生命周期 | 向量语义相似（Spring Boot 相关） | 低 |

可以看到：
- 排名第 1 的文档讲的是自动配置原理，和"如何配置最大连接数"关系不大
- 排名第 3 的文档讲的是 Druid 连接池，用户问的是 HikariCP
- 排名第 5 的文档讲的是启动流程，完全不相关

但粗排阶段很难区分这些细微差别，因为它们在语义上都和"Spring Boot 数据源"沾边。

**经过 Rerank 之后**，跨编码器模型会把问题和每个文档拼在一起仔细分析，结果变成：

| 新排名 | 文档内容摘要 | Rerank 分数 | 原排名 |
|:---:|--------|:---:|:---:|
| 1 | application.yml 中 spring.datasource.hikari.maximum-pool-size 的配置示例 | 0.95 | 4 |
| 2 | HikariCP 连接池参数详解：maximumPoolSize、minimumIdle、connectionTimeout | 0.91 | 2 |
| 3 | Spring Boot 自动配置原理，包括 DataSource 的自动装配流程 | 0.42 | 1 |
| 4 | Spring Boot 中使用 Druid 连接池的配置方法 | 0.28 | 3 |
| 5 | Spring Boot 启动流程与 Bean 生命周期 | 0.12 | 5 |

Rerank 把真正回答了"如何配置最大连接数"的文档（原排名第 4）提到了第 1 位，把讲 Druid 的文档（和问题无关）压到了第 4 位。

<VipInline />