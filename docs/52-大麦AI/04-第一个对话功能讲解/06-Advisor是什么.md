---
slug: /damai-ai/first-chat/what-is-advisor
title: "Advisor是什么：Advisor拦截器、before回调、after回调、执行顺序详解"
sidebar_label: "Advisor是什么"
pagination_label: "Advisor是什么"
description: "Advisor机制入门，解释Spring AI拦截器链在请求前后处理中的作用，包含执行顺序、上下文增强与响应后处理等关键技术点。内容进一步围绕Advisor拦截器、before回调、after回调、请求增强、会话上下文等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项…"
keywords: ["Advisor拦截器", "before回调", "after回调", "执行顺序", "请求增强", "响应后处理", "会话上下文", "Spring AI"]
---

# Advisor是什么

import VipInline from '@site/src/components/VipInline';

## 概念
在 Spring AI 中，Advisor 可以理解为“AI 调用拦截器链”。
它和 Web 拦截器类似，但作用对象是 `ChatClient` 请求/响应。

你可以在调用前后注入能力：

- 请求前：改写 query、注入上下文、记录会话。
- 响应后：落库统计、生成标题、二次处理。

## 本项目里的 Advisor
- `SimpleLoggerAdvisor`：基础日志。
- `MessageChatMemoryAdvisor`：会话记忆注入。
- `ChatTypeHistoryAdvisor`：记录会话 ID 与业务类型。
- `ChatTypeTitleAdvisor`：自动生成会话标题。
- `AiObservabilityAdvisor`：token/延迟/费用追踪。
- `QueryRewriteAdvisor`：检索前 query 优化（RAG v2）。

<VipInline />
