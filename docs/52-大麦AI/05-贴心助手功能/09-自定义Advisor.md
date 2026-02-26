---
slug: /damai-ai/assistant/custom-advisor
description: "自定义Advisor实战，讲解如何扩展请求前后回调、注入会话上下文并写入历史数据，同时通过优先级控制保证拦截链协同执行。"
keywords: ["自定义Advisor", "拦截器扩展", "before回调", "after回调", "会话上下文注入", "历史写入", "执行优先级", "Builder模式"]
---

# 自定义Advisor

import VipInline from '@site/src/components/VipInline';

让我们回到和ai对话时，进行添加会话的操作

org.javaup.ai.cotroller.ProgramController#chat

```java
@RequestMapping(value = "/chat", produces = "text/html;charset=utf-8")
public Flux<String> chat(@RequestParam("prompt") String prompt,
                            @RequestParam("chatId") String chatId) {
    chatTypeHistoryService.save(ChatType.ASSISTANT.getCode(), chatId);
    return assistantChatClient.prompt()
            .user(prompt)
            .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, chatId))
            .stream()
            .content();
}
```

这里在和ai进行具体的对话操作之前，调用save方法，就会把会话类型历史进行保存了



但感觉是不是有点不舒服，SpringAI 在对具体回话内容保存的时候，是使用 **.advisors(a -> a.param(ChatMemory.CONVERSATION_ID, chatId))** 进行保存的，充分提到了Spring的拦截切面思想。



而保存我们设计的会话列表的时候，是直接调用 service 了，这样和 SpringAI 的设计是不符合的，最好的方式是也可以用 advisors 来实现，这样就是符合 SpringAI 的设计思想，整体风格也会很统一，如果给别 ChatClient 进行扩展也是非常的方便



所以到这里，就需要我们来自定义 advisor 了


<VipInline />
