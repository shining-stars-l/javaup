---
slug: /damai-ai/conversation-list/custom-title-advisor
title: "自定义标题Advisor：响应后处理、摘要提取、标题持久化、执行优先级、Advisor协同详解"
sidebar_label: "自定义标题Advisor"
pagination_label: "自定义标题Advisor"
description: "自定义标题Advisor实现细节，说明如何在响应后阶段提取摘要、更新会话标题并持久化，同时通过优先级控制保证与记忆Advisor的协同执行。内容进一步围绕响应后处理、摘要提取、标题持久化、执行优先级、Advisor协同等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项…"
keywords: ["标题Advisor", "响应后处理", "摘要提取", "标题持久化", "执行优先级", "Advisor协同", "会话列表", "Spring AI扩展"]
---

# 自定义标题Advisor

import VipInline from '@site/src/components/VipInline';

清楚了多个 Advisor 的执行顺序后，就可以开始自定义更新标题的 Advisor 了，起名叫 ChatTypeTitleAdvisor。

**想让 ChatTypeTitleAdvisor 的 after 方法，在 MessageChatMemoryAdvisor 的 after 方法之后执行，那么就得让 ChatTypeTitleAdvisor 比 MessageChatMemoryAdvisor 先加载，而加载顺序可以使用 order 方法来执行**

## 修改创建 assistantChatClient 的过程
回到创建 assistantChatClient 的过程，指定 MessageChatMemoryAdvisor 和 ChatTypeTitleAdvisor 的加载顺序

```java
@Bean
public ChatClient assistantChatClient(DeepSeekChatModel model, ChatMemory chatMemory, AiProgram aiProgram,
                                      ChatTypeHistoryService chatTypeHistoryService,@Qualifier("titleChatClient")ChatClient titleChatClient) {
    return ChatClient
            .builder(model)
            .defaultSystem(DaMaiConstant.DA_MAI_SYSTEM_PROMPT)
            .defaultAdvisors(
                    new SimpleLoggerAdvisor(),
                    ChatTypeHistoryAdvisor.builder(chatTypeHistoryService).type(ChatType.ASSISTANT.getCode()).order(CHAT_TYPE_HISTORY_ADVISOR_ORDER).build(),
                    ChatTypeTitleAdvisor.builder(chatTypeHistoryService).type(ChatType.ASSISTANT.getCode())
                            .chatClient(titleChatClient).chatMemory(chatMemory).order(CHAT_TITLE_ADVISOR_ORDER).build(),
                    MessageChatMemoryAdvisor.builder(chatMemory).order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER).build()
            )
            .defaultTools(aiProgram)
            .build();
}
```

org.javaup.ai.constants.DaMaiConstant

```java
public static final Integer MESSAGE_CHAT_MEMORY_ADVISOR_ORDER = Ordered.HIGHEST_PRECEDENCE + 1000;

public static final Integer CHAT_TITLE_ADVISOR_ORDER = Ordered.HIGHEST_PRECEDENCE + 999;
```



**ChatTypeTitleAdvisor 设置的 order 值是：Ordered.HIGHEST_PRECEDENCE + 999**

**MessageChatMemoryAdvisor 设置的 order 值是：Ordered.HIGHEST_PRECEDENCE + 1000**


接下来就可以分析 ChatTypeTitleAdvisor 的内容了

<VipInline />
