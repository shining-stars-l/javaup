---
slug: /damai-ai/assistant/base-chat-memory-advisor
description: "会话记忆Advisor基类机制解析，说明基于会话上下文实现记忆读写、请求增强和响应后处理的扩展方式，支撑多轮对话能力复用。"
keywords: ["会话记忆Advisor", "上下文读取", "记忆写入", "请求增强", "响应后处理", "执行链扩展", "多轮对话", "Spring AI扩展"]
---

# BaseChatMemoryAdvisor的作用

import VipInline from '@site/src/components/VipInline';

## 它是什么
`BaseChatMemoryAdvisor` 是 Spring AI 的一个基础接口，适合实现“依赖会话上下文”的拦截能力。

本项目多个自定义 Advisor 都实现了它：

- `ChatTypeHistoryAdvisor`
- `ChatTypeTitleAdvisor`
- `AiObservabilityAdvisor`

### 为什么用它
相比普通 `BaseAdvisor`，它提供了获取会话 ID 的通用能力（基于上下文中的 `CONVERSATION_ID`），更适合多轮会话场景。

### 在项目中的典型用途
- 在 `before` 中记录会话类型（保存会话主记录）。
- 在 `after` 中读取 `ChatMemory` 生成标题。
- 在 `after` 中统计 token/耗时/费用并落库。

<VipInline />
