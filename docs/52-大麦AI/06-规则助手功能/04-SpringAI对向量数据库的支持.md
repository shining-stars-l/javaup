---
slug: /damai-ai/rules-assistant/springai-vector-support
title: "SpringAI对向量数据库的支持：Spring AI、VectorStore、文档写入详解"
sidebar_label: "SpringAI对向量数据库的支持"
pagination_label: "SpringAI对向量数据库的支持"
description: "Spring AI向量检索能力讲解，聚焦VectorStore统一接口、文档写入与相似度查询API，以及在项目中接入RAG能力的配置与调用方式。内容进一步围绕EmbeddingModel、向量库适配、RAG集成、检索接口等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、…"
keywords: ["Spring AI", "VectorStore", "文档写入", "相似度查询", "EmbeddingModel", "向量库适配", "RAG集成", "检索接口"]
---

# SpringAI对向量数据库的支持

import VipInline from '@site/src/components/VipInline';

大麦功能助手因为是使用RAG功能来向量数据中进行检索，所以要先创建出向量数据库出来，而 SpringAI 也提供了向量数据的支持。

VectorStore 是 Spring AI 中用于管理和查询向量数据库的核心接口，它抽象出了一套统一的文档（Document）写入与相似度检索的操作，使得应用可以无缝切换底层向量存储实现。

## VectorStore 接口概述
+ **包路径**  
  org.springframework.ai.vectorstore
+ **责任**
    - 向向量数据库添加、删除文档
    - 基于查询文本或元数据过滤执行相似度搜索
    - 可选地访问底层“原生”客户端

### 核心方法
| 方法签名 | 说明 |
| --- | --- |
| `void add(List<Document> documents)` | 批量添加文档到向量存储 |
| `void delete(List<String> idList)` | 根据文档 ID 列表删除文档 |
| `void delete(Filter.Expression filterExpression)` | 根据过滤表达式删除文档 |
| `List<Document> similaritySearch(String query)` | 直接以文本生成 Embedding 并搜索最相似文档 |
| `List<Document> similaritySearch(SearchRequest request)` | 支持指定 Top‑K、相似度阈值、元数据过滤等参数的高级检索 |
| `<T> Optional<T> getNativeClient()` | 获取底层向量数据库客户端（如 RedisClient、PineconeClient 等），进行更细粒度操作 |
| `static <T extends VectorStore.Builder<T>> VectorStore.Builder<T> builder(String name)` | 构建器，用于以流式 API 配置并实例化 VectorStore 实现 |


## 支持的向量数据库实现
Spring AI 通过一系列 `*VectorStore` 实现类，支持主流及云端、自建向量存储系统。

<VipInline />
