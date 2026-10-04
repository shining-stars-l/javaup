---
slug: /agent-up-memory/memory-indexing/embedding-projection-and-vector-index
description: 详细讲解 memory-current 的 Embedding 投影如何读取模型空间、分页构建候选代际、保存可恢复进度、追平并激活 HNSW 向量索引，以及查询侧如何校验模型空间和相似度阈值。
keywords: [Agent Up Memory, Embedding, document space, query space, HNSW, vector index, projection progress, model profile, cosine similarity]
---

import VipInline from '@site/src/components/VipInline';

# Embedding投影与向量检索索引

## 这条链路和文本索引有什么不同

文本 BM25 索引拿到当前内容后可以直接分词写入；Embedding 索引还要调用模型，把每段 L1/L2 内容变成固定维度的向量。模型调用会超时、失败，返回的 profile、revision、dimension 也可能变，所以它不能简单套一层“读事件、写文件”。

这套实现把向量构建拆成几个可以恢复的小步骤：

1. 读取 `DOCUMENT` 模型配置，确定 document embedding space。
2. 用快照首页确定 `snapshotWatermark`，分批扫描 L1/L2 当前项。
3. 每页逐条调用模型并写入候选 generation，成功后保存 cursor 和处理数量。
4. 快照完成后，从快照水位之后连续追平 `projection_change`。
5. 检查候选水位、文档数和 embedding space，最后切换 active generation。
6. 查询侧使用 `QUERY` space 生成查询向量，确认它和文档 space 兼容，再进入 HNSW 查询。

![Embedding 投影的快照、追平与激活](/img/agent-up-memory/讲解/11-记忆投影与检索索引/03-A-embedding-lifecycle.drawio.png)

<VipInline />
