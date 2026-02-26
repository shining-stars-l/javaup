---
slug: /damai-ai/assistant/chatclient-creation
description: "ChatClient创建优化实践，讲解按业务场景拆分客户端Bean、统一依赖注入与配置解耦，提升AI能力的可扩展性与可维护性。"
keywords: ["ChatClient优化", "场景化Bean", "依赖注入", "配置解耦", "能力隔离", "可扩展性", "资源复用", "Spring AI工程化"]
---

# ChatClient的创建优化

import VipInline from '@site/src/components/VipInline';

## 当前设计
项目没有只用一个 `ChatClient`，而是按场景拆成多个 Bean：

- `chatClient`：通用基础能力
- `assistantChatClient`：客服业务（含工具调用）
- `analysisChatClient`：运维分析（含 MCP 工具）
- `markdownChatClient`：规则 RAG 问答
- `titleChatClient`：只用于生成会话标题

定义位置：`DaMaiAiAutoConfiguration`、`DaMaiRagAiAutoConfiguration`。

### 这样拆分的优势
- 每个客户端都有独立 system prompt。
- Advisor 组合可按业务精细配置。
- 避免“一个客户端服务所有场景”导致策略互相污染。

<VipInline />
