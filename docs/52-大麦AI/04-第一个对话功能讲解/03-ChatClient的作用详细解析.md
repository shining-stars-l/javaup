---
slug: /damai-ai/first-chat/chatclient-deep-dive
description: "ChatClient调用机制深度解析，说明请求组装、提示词注入、Advisor链执行、工具调用与响应输出的关键节点，明确其在AI网关层的核心职责。"
keywords: ["ChatClient", "请求组装", "System Prompt", "Advisor执行链", "工具调用", "流式响应", "上下文参数", "AI网关层"]
---

# ChatClient的作用详细解析

import VipInline from '@site/src/components/VipInline';

## ChatClient 在本项目中的定位
`ChatClient` 是所有 AI 对话调用的统一入口，承担三件事：

1. 组装请求：`system`、`user`、工具、Advisor、上下文参数。
2. 发起调用：同步 `call()` 或流式 `stream()`。
3. 承载扩展：通过 Advisor 链在调用前后插入记忆、日志、统计等能力。

## 典型调用路径
在 `ProgramController` 里可以看到三条主链路：

- `assistantChatClient` -> `/program/chat`
- `markdownChatClient` -> `/program/rag`
- `analysisChatClient` -> `/program/chat/mcp`

统一模式：

```java
chatClient.prompt()
    .user(prompt)
    .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, chatId))
    .stream()
    .content();
```

## 它为什么关键
- 屏蔽底层模型差异（DeepSeek/OpenAI/Ollama）。
- 让“对话+工具+记忆+观测”在一个调用面内完成。
- 支持按 Bean 分场景隔离策略（客服、规则、运维）。


<VipInline />
