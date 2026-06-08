---
slug: /ai-interview/rag/spring-splitter
description: "Spring AI和Spring AI Alibaba的文档分片代码实战，包含TokenTextSplitter、自定义Overlap分片器、RecursiveCharacterTextSplitter的完整示例和执行结果"
keywords: ["Spring AI", "Spring AI Alibaba", "TokenTextSplitter", "RecursiveCharacterTextSplitter", "文档分片"]
---

import VipInline from '@site/src/components/VipInline';

# 分片代码实战：Spring系列

前面讲了分块策略的理论和ChunkViz可视化实验，这篇开始写具体的实现代码。

Java生态中主要有三个框架支持文档分片：

| 框架 | 特点 | 推荐度 |
|:-----|:-----|:------|
| Spring AI | 官方只提供TokenTextSplitter，功能较弱 | 入门可用 |
| Spring AI Alibaba | 扩展了Spring AI，支持递归分片 | **推荐** |
| LangChain4J | 功能最丰富，支持语义分片 | 进阶使用 |

## Spring AI的TokenTextSplitter

### 框架原生能力

在Spring AI的ETL Pipeline模块中，TextSplitter是所有文本拆分器的抽象基类。但目前官方**只提供了一个具体实现**：TokenTextSplitter——按token数量拆分文本。

:::warning Spring AI的分片功能较弱
Spring AI的TokenTextSplitter有两个明显的缺陷：
1. **不支持overlap**（相邻块重叠），相邻文本块之间没有共享内容
2. **不支持按段落或自然语言结构分割**，只能按token数硬切

如果需要更高级的分片功能，要么用Spring AI Alibaba，要么用LangChain4J，要么自己实现。
:::

### 核心参数

| 参数 | 说明 | 默认值 |
|:-----|:-----|:------|
| chunkSize | 每个文本块的目标大小（以token为单位） | 800 |
| minChunkSizeChars | 每个文本块的最小字符数，太短的块会被丢弃或合并 | 350 |
| minChunkLengthToEmbed | 只有长度超过此值的块才会发送给向量模型 | 5 |
| maxNumChunks | 单个文档允许拆分出的最大块数 | 10000 |
| keepSeparator | 是否在块中保留分隔符（如换行符） | true |

<VipInline />
