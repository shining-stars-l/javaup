---
slug: /super-agent/rag/modular-rag
description: "前面讲的改写、检索、重排序都是单独的模块，Spring AI的Modular RAG把这些模块用一条流水线串起来。本文拆解每个组件的用法，并给出完整的组装实战"
keywords: ["Modular RAG", "Spring AI", "RetrievalAugmentationAdvisor", "QueryTransformer", "QueryExpander", "DocumentJoiner", "LangChain4j", "RAG流水线"]
---

import VipInline from '@site/src/components/VipInline';

# RAG的组件拼接成流水线

前面几篇文章，我们逐个拆解了RAG的各个环节：问题改写、意图识别、混合检索、重排序、元数据过滤。每个环节都是独立的模块，各自解决一个具体问题。

但在实际项目中，这些模块需要串起来形成一条完整的流水线。手动串联当然可以（前面的代码示例就是这么做的），但如果框架能提供一个标准化的编排机制，开发效率会高很多。

Spring AI的`RetrievalAugmentationAdvisor`就是干这个事的——它定义了一套Modular RAG的标准流水线，把查询预处理、文档检索、后处理、Prompt增强这些步骤用插件化的方式组织起来。

:::info 先说实话
Spring AI的Modular RAG支持目前还比较基础，组件不多，灵活性也有限。但作为一个开箱即用的起点，它能帮你快速搭建一个标准的RAG流程，后续再根据需要替换或扩展其中的组件。
:::

## 流水线长什么样

`RetrievalAugmentationAdvisor`内部的处理流程是这样的：

```plantuml title="Spring AI Modular RAG 流水线" width="50%" align="left"
@startuml
skinparam backgroundColor #FEFEFE
skinparam roundcorner 12
skinparam shadowing false
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 13

skinparam activity {
    BackgroundColor #E8F4FD
    BorderColor #4A90D9
    FontColor #2C3E50
    ArrowColor #4A90D9
}

start
:用户提问;

partition "1. QueryTransformer\n（查询预处理）" {
    :改写/压缩/翻译查询;
}

partition "2. QueryExpander\n（查询扩展）" {
    :一个查询扩展为多个;
}

partition "3. DocumentRetriever\n（文档检索）" {
    :从向量库检索文档;
    note right: 每个扩展查询\n分别检索
}

partition "4. DocumentJoiner\n（文档合并）" {
    :去重 + 按分数排序;
}

partition "5. QueryAugmenter\n（Prompt增强）" {
    :把检索到的文档\n注入到Prompt中;
}

:发送给大模型生成回答;
stop
@enduml
```

五个组件，每个都是可插拔的。你可以只用其中几个，也可以全部用上。

这些组件背后的原理，在前面的文章中都有详细展开，下面这张表方便你快速跳转到对应的讲解：

| 组件 | 对应详细文档 |
|------|------------|
| CompressionQueryTransformer（多轮对话压缩） | [为什么要问题重写](/super-agent/rag/query-rewrite) |
| RewriteQueryTransformer（查询优化） | [为什么要问题重写](/super-agent/rag/query-rewrite) |
| TranslationQueryTransformer（查询翻译） | 本文首次介绍 |
| MultiQueryExpander（查询扩展） | [为什么要问题重写](/super-agent/rag/query-rewrite) |
| VectorStoreDocumentRetriever（文档检索） | [向量检索核心算法深度剖析](/super-agent/rag/vector-search-algorithms)、[元数据的过滤场景](/super-agent/rag/metadata-filtering)、[混合检索的详细剖析](/super-agent/rag/hybrid-search) |
| ConcatenationDocumentJoiner（文档合并） | 本文首次介绍 |
| ContextualQueryAugmenter（Prompt增强） | 本文首次介绍 |

<VipInline />
