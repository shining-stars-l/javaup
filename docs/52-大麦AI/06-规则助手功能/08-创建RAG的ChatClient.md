---
slug: /damai-ai/rules-assistant/rag-chatclient
title: "创建RAG的ChatClient：RAG ChatClient、知识库加载、检索顾问详解"
sidebar_label: "创建RAG的ChatClient"
pagination_label: "创建RAG的ChatClient"
description: "RAG版ChatClient构建实战，覆盖知识库加载、检索顾问装配、系统提示词约束与调用时序，形成规则问答的完整执行链。内容进一步围绕RAG ChatClient、向量检索、执行时序、Spring AI等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目实践建议与技术…"
keywords: ["RAG ChatClient", "知识库加载", "检索顾问", "系统提示词", "向量检索", "执行时序", "规则问答", "Spring AI"]
---

# 创建RAG的ChatClient

import VipInline from '@site/src/components/VipInline';

RAG、向量数据库、markdown 解析器有了后，接下来就是创建 ChatClient

## 创建 ChatClient
```java
@AutoConfigureAfter(DaMaiAiAutoConfiguration.class)
public class DaMaiRagAiAutoConfiguration {
    
    @Bean
    public MarkdownLoader markdownLoader(ResourcePatternResolver resourcePatternResolver){
        return new MarkdownLoader(resourcePatternResolver);
    }

    @Bean
    public ChatClient markdownChatClient(OpenAiChatModel model, ChatMemory chatMemory, VectorStore vectorStore,
                                         MarkdownLoader markdownLoader, ChatTypeHistoryService chatTypeHistoryService, 
                                         @Qualifier("titleChatClient")ChatClient titleChatClient) {
        List<Document> documentList = markdownLoader.loadMarkdowns();
        vectorStore.add(documentList);
        
        return ChatClient
                .builder(model)
                .defaultSystem(MARK_DOWN_SYSTEM_PROMPT)
                .defaultAdvisors(
                        new SimpleLoggerAdvisor(),
                        ChatTypeHistoryAdvisor.builder(chatTypeHistoryService).type(ChatType.MARKDOWN.getCode()).order(CHAT_TYPE_HISTORY_ADVISOR_ORDER).build(),
                        ChatTypeTitleAdvisor.builder(chatTypeHistoryService).type(ChatType.MARKDOWN.getCode())
                                .chatClient(titleChatClient).chatMemory(chatMemory).order(CHAT_TITLE_ADVISOR_ORDER).build(),
                        MessageChatMemoryAdvisor.builder(chatMemory).order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER).build(),
                        QuestionAnswerAdvisor.builder(vectorStore)
                                .searchRequest(SearchRequest.builder()
                                        .similarityThreshold(0.3)
                                        .topK(8)
                                        .build())
                                .build()
                )
                .build();
    }
}
```

<VipInline />
