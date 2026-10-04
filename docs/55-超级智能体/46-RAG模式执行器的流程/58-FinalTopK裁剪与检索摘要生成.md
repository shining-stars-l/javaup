---
slug: /super-agent/chat-executors/final-topk-and-summary
title: "FinalTopK 裁剪与检索摘要生成：summarizeChannelResults详解"
sidebar_label: "FinalTopK 裁剪与检索摘要生成"
pagination_label: "FinalTopK 裁剪与检索摘要生成"
description: "讲解 RAG 检索流程中 Rerank 之后的 FinalTopK 裁剪、检索摘要生成、通道轨迹构建，以及 trace 观测记录的触发入口。内容进一步围绕summarizeChannelResults、buildChannelTraces、上下文预算等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。"
keywords: [FinalTopK, 检索摘要, summarizeChannelResults, buildChannelTraces, 通道轨迹, 上下文预算]
---

import VipInline from '@site/src/components/VipInline';

# FinalTopK 裁剪与检索摘要生成

上一篇我们讲完了 Rerank 重排序，候选文档已经按照跨编码器给出的相关性分数重新排好了序。但是排好序不代表全部都能用——LLM 的上下文窗口是有限的，塞太多证据进去不仅浪费 token，还可能让模型"注意力分散"，反而降低回答质量。

这一篇我们来看 Rerank 之后的收尾工作：**FinalTopK 裁剪**、**检索摘要生成**、**通道轨迹构建**，以及 **trace 观测记录的触发**。

## FinalTopK 裁剪

```java
// 最终只保留 finalTopK 条证据进入 Prompt，避免证据过多撑爆上下文预算。
List<Document> finalDocuments = rerankedCandidates.stream()
    .limit(properties.getFinalTopK())
    .toList();
```

这段代码很简单：从 Rerank 排好序的候选列表里，只取前 `finalTopK` 条。

### 为什么要做这一步？

你可能会想：前面不是已经有证据闸门过滤了吗？为什么还要再砍一刀？

原因是这样的：证据闸门是按**质量**过滤（分数低于阈值的不要），而 FinalTopK 是按**数量**限制（质量再高，超过预算的也不要）。两者解决的是不同的问题：

- **证据闸门**：过滤掉"不相关"的噪音文档
- **FinalTopK**：控制"相关但太多"的情况，保护上下文预算

:::info 上下文预算
LLM 的上下文窗口是有限的。假设总共 8K token 的上下文预算，系统 Prompt 占了 2K，用户问题和历史对话占了 2K，那留给证据的只有 4K。如果每条证据平均 500 token，那最多只能放 8 条。`finalTopK` 就是这个"最多放几条"的配置。
:::

<VipInline />
