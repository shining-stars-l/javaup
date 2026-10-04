---
slug: /agent-up-memory/model-runtime/chat-http-streaming
description: 沿着一次聊天模型调用的真实执行顺序，讲清输入校验、快照重查、OpenAI 兼容请求、完整结果、SSE 流、工具片段、取消和失败记录。
keywords: [Agent Up Memory, 聊天模型, OpenAI Compatible, HTTP, SSE, 流式调用, 工具调用, 取消]
---

import VipInline from '@site/src/components/VipInline';

# 聊天模型HTTP与流式结果收口

## `LanguageModelRuntime` 是业务和供应商之间的最后一道边界

记忆处理模块拿到的是 `CanonicalRequest`，它不知道 `Authorization`、`/v1/chat/completions` 或 SSE 细节。真正的供应商适配器是 `OpenAiCompatibleChatRuntime`，对外只暴露两个方法：

```java
public interface LanguageModelRuntime {
    ModelInvocationResult complete(ChatRuntimeCommand command);

    ModelInvocationResult stream(ChatRuntimeCommand command, ModelStreamObserver observer);
}
```

当前记忆生成走 `complete()`，因为 L1/L2/L3 要拿到完整结构化 JSON 才能解析和落库。`stream()` 给需要边收边处理的后端调用方使用，虽然这个项目的记忆生成入口没有拿它来拼记忆结果，但它仍然是 model-runtime 的真实能力。

<VipInline />
