---
slug: /super-agent/feature-guide/rag-retrieval-engine
title: "RAG 检索引擎：RAG检索、双通道、向量检索、关键词检索、RRF融合、父块提升、Rerank详解"
sidebar_label: "RAG 检索引擎"
pagination_label: "RAG 检索引擎"
description: "RAG检索引擎的功能详解，包括双通道检索、RRF融合、父块提升、Rerank重排序、证据预算控制等核心机制。内容进一步围绕向量检索、关键词检索等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目实践建议与技术面试要点。帮助开发者建立完整知识体系，并将结论应用到系统设计…"
keywords: [RAG检索, 双通道, 向量检索, 关键词检索, RRF融合, 父块提升, Rerank, 证据预算]
---

import VipInline from '@site/src/components/VipInline';

# RAG 检索引擎

RAG（Retrieval-Augmented Generation）检索引擎是这个项目里最复杂的模块之一。它不是简单地"搜一下然后丢给模型"，而是有一套完整的流水线：双通道并行检索 → 质量过滤 → RRF 融合 → 父块提升 → Rerank 重排序 → 证据预算控制 → Prompt 组装。

## 检索引擎总入口

### RagRetrievalEngine

**包路径：** `org.javaup.ai.chatagent.rag.service`

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `retrieve(plan, traceRecorder)` | `RagRetrievalContext` | 检索主入口，返回完整的检索上下文 |

### 检索流水线（每个子问题）

对于执行计划中的每个子问题，引擎会并行执行以下步骤：

```
子问题
  ↓
并行扇出到所有检索通道（向量 + 关键词）
  ↓
各通道独立检索，带超时保护
  ↓
证据门控过滤（分数阈值）
  ↓
RRF 融合排序（K=60）
  ↓
父块提升（小块→大块）
  ↓
Rerank 重排序（外部模型）
  ↓
FinalTopK 裁剪
  ↓
分配引用编号
```

多个子问题之间也是并行执行的，最后汇总所有子问题的证据。

<VipInline />