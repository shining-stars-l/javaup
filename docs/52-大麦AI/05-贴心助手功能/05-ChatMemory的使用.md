---
slug: /damai-ai/assistant/chat-memory
description: "ChatMemory使用指南，讲解会话记忆的写入、读取与删除策略，以及在多轮对话中通过记忆窗口控制上下文长度和响应质量。"
keywords: ["ChatMemory", "会话记忆", "历史读取", "记忆删除", "上下文窗口", "Token裁剪", "多轮对话", "记忆管理"]
---

# ChatMemory的使用

import VipInline from '@site/src/components/VipInline';

## 核心实现
在 `DaMaiAiAutoConfiguration` 中：

```java
MessageWindowChatMemory.builder()
    .chatMemoryRepository(chatMemoryRepository)
    .maxMessages(20)
    .build();
```

这表示：
- 使用可持久化的 `ChatMemoryRepository`
- 每个会话保留最近 20 条消息

### 注入方式
通过 `MessageChatMemoryAdvisor` 自动在每次请求前注入历史消息。
调用端只要提供 `CONVERSATION_ID` 即可。

<VipInline />
