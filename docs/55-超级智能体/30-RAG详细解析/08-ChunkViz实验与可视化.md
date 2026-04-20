---
slug: /super-agent/rag/chunkviz
description: "用ChunkViz可视化工具直观感受不同分块策略的效果差异，通过实验对比固定大小分块与递归分块的优劣"
keywords: ["ChunkViz", "分块可视化", "递归分块", "固定大小分块", "RAG"]
---

import VipInline from '@site/src/components/VipInline';

# ChunkViz实验与可视化

上一篇讲了分块策略的理论，但光看文字描述可能还不够直观。

这篇用一个免费的在线工具——[ChunkViz](https://chunkviz.up.railway.app/)，来可视化地展示不同分块策略的效果，让你亲眼看到"切大了"和"切小了"的区别。

## ChunkViz是什么

ChunkViz是一个免费的在线分块可视化工具，支持两种分块策略：

- **CharacterTextSplitter**：固定大小分块
- **RecursiveCharacterTextSplitter**：递归分块

你可以实时调整chunk_size和overlap参数，页面会用不同颜色高亮显示每个块的范围。

:::tip 推荐先动手试试
建议你在看下面的实验之前，先自己打开ChunkViz玩一玩。把自己项目中的文档内容粘贴进去，调调参数，感受会更深。
:::

## 操作步骤

1. 打开 https://chunkviz.up.railway.app/
2. 在文本框中粘贴你想测试的文本
3. 在右侧选择分块策略：
   - **CharacterTextSplitter**：对应固定大小分块
   - **RecursiveCharacterTextSplitter**：对应递归分块
4. 调整 Chunk Size 和 Chunk Overlap 的滑块
5. 页面会实时用不同颜色高亮显示每个块的范围

**ChunkViz界面：**

<img src="/img/super-agent/rag/ChunkViz界面.png" alt="ChunkViz界面" width="100%" />

<VipInline />
