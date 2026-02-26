---
slug: /damai-ai/rules-assistant/rag-rules-retrieval
description: "规则RAG检索全链路拆解，从自动装配、文档加载切分、向量化入库到Controller请求处理，完整说明生产级规则问答是如何被执行的。"
keywords: ["自动装配", "文档加载", "文本切分", "向量化入库", "Controller入口", "检索召回", "提示词拼接", "RAG执行链"]
---

# 对规则实现RAG检索

import VipInline from '@site/src/components/VipInline';


## 启动阶段：RAG 能力如何被装配进系统

### 自动装配入口
Spring Boot 会通过以下自动配置导入 RAG 相关配置：

- `org.javaup.ai.config.DaMaiAiAutoConfiguration`
- `org.javaup.ai.config.DaMaiRagAiAutoConfiguration`

其中 `DaMaiRagAiAutoConfiguration` 上有 `@AutoConfigureAfter(DaMaiAiAutoConfiguration.class)`，确保基础 AI Bean 先就绪。

### 关键 Bean 装配
`DaMaiRagAiAutoConfiguration` 在启动时会创建：

1. `MarkdownLoader`
2. `markdownChatClient`（按 `rag.version` 分支）

`markdownChatClient` 创建时会执行：

1. `markdownLoader.loadMarkdowns()`
2. `vectorStore.add(documentList)`

这意味着：规则文档是在 **Bean 初始化阶段** 进入向量库的，不是首次请求时才临时处理。

<VipInline />
