---
slug: /damai-ai/rules-assistant/rag-chatclient
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



参数通过 Spring 自动注入，包含：

+ `OpenAiChatModel model`：底层对话模型，实际是调用 OpenAI API（阿里百炼）。
+ `ChatMemory chatMemory`：会话记忆组件，用于记录对话上下文（数据库）。
+ `VectorStore vectorStore`：向量数据库，用于存储与检索知识库文档（SimpleVectorStore ）。
+ `MarkdownLoader markdownLoader`：加载 Markdown 文档的工具类（自定义的工具）。
+ `ChatTypeHistoryService chatTypeHistoryService`：管理不同聊天类型的历史记录。
+ `titleChatClient`：另一个 ChatClient，用于单独处理对话标题。

## 加载知识库
```java
List<Document> documentList = markdownLoader.loadMarkdowns();
vectorStore.add(documentList);
```

+ 通过 `MarkdownLoader` 加载本地 Markdown 文件，得到一个文档列表。
+ 将文档批量加入 `VectorStore`，这样后续对话可以基于这些文档进行向量检索，实现知识增强（RAG）。

## 构建 ChatClient
```java
return ChatClient
.builder(model)
```

+ 基于传入的 `OpenAiChatModel` 创建 ChatClient 构建器。

## 设置系统提示词
```java
.defaultSystem(MARK_DOWN_SYSTEM_PROMPT)
```

```java
public static final String MARK_DOWN_SYSTEM_PROMPT = "根据用户的内容在上下文中查找后，进行回答问题，如果遇到上下文没有的问题或者没有查找到，不要随意编造。";
```

## 配置默认 Advisor
```java
.defaultAdvisors(
        new SimpleLoggerAdvisor(),
        ChatTypeHistoryAdvisor.builder(chatTypeHistoryService)
            .type(ChatType.MARKDOWN.getCode())
            .order(CHAT_TYPE_HISTORY_ADVISOR_ORDER)
            .build(),
        ChatTypeTitleAdvisor.builder(chatTypeHistoryService)
            .type(ChatType.MARKDOWN.getCode())
            .chatClient(titleChatClient)
            .chatMemory(chatMemory)
            .order(CHAT_TITLE_ADVISOR_ORDER)
            .build(),
        MessageChatMemoryAdvisor.builder(chatMemory)
            .order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER)
            .build(),
            QuestionAnswerAdvisor.builder(vectorStore)
            .searchRequest(SearchRequest.builder()
                           .similarityThreshold(0.3)
                           .topK(8)
                           .build())
        .build()
)
```



配置了五个 Advisor：

| Advisor | 作用 | 关键点 |
| --- | --- | --- |
| SimpleLoggerAdvisor | 日志打印 | 可能简单记录对话输入输出 |
| ChatTypeHistoryAdvisor | 管理会话类型历史列表 | 在对话前保存会话类型历史列表 |
| MessageChatMemoryAdvisor | 管理会话记忆 | 在对话前后读写 `ChatMemory`<br/>，实现对话上下文记忆 |
| ChatTypeTitleAdvisor | 自动生成对话标题 | 通过自定义的 `chatTypeHistoryService`记录对话类型，调用 `titleChatClient`获取标题，优先级由 `order`决定 |
| QuestionAnswerAdvisor | 基于向量数据库的知识检索<br/><br/> | 使用 `vectorStore`向量库，设置检索相似度阈值为 0.3，返回前 8 个相似文档，进行 RAG 知识增强 |


## 整体执行流程总结
1. **加载 Markdown 知识库，存入向量数据库**
2. **构建 ChatClient，绑定默认系统提示词**
3. **挂载 5 个 Advisor：**
    - 日志记录
    - 会话类型历史列表管理
    - 对话类型记录及标题生成
    - 会话记忆管理
    - 向量检索问答增强
4. **返回可用的 ChatClient 实例**

---

## 执行时序图
```plain
用户请求
   │
   ▼
SimpleLoggerAdvisor.before
   │  （日志记录请求）
   ▼
ChatTypeHistoryAdvisor.before
   │  （保存会话类型历史列表）
   ▼
ChatTypeTitleAdvisor.before
   │  （记录对话类型，准备生成标题）
   ▼
MessageChatMemoryAdvisor.before
   │  （从 ChatMemory 读取历史上下文）
   ▼
QuestionAnswerAdvisor.before
   │  （从 VectorStore 向量检索相关文档，准备知识增强）
   ▼
--- 组装 Prompt（包含系统提示词、用户输入、历史对话、检索结果）---
   ▼
调用 AI 模型（OpenAiChatModel）
   │  （生成答案）
   ▼
QuestionAnswerAdvisor.after
   │  （返回响应）
   ▼   
ChatTypeHistoryAdvisor.after
   │  （返回响应）
   ▼   
SimpleLoggerAdvisor.after
   │  （日志记录响应）
   ▼
MessageChatMemoryAdvisor.after
   │  （将当前对话写入 ChatMemory）
   ▼
ChatTypeTitleAdvisor.after
   │  （调用 titleChatClient，生成并保存对话标题）
   ▼
返回响应结果给用户
```

# 测试
到这里，markdown 解析器已经从文档中读取内容放到向量数据库中了，我们就先测试一下

org.javaup.ai.test.RagAiTest

```java
@Slf4j
@Component
public class RagAiTest {
    
    @Autowired
    private VectorStore vectorStore;
    
    @PostConstruct
    public void testVectorStore(){
        //搜索条件
        SearchRequest request = SearchRequest.builder()
                .query("退票政策")
                .topK(1)
                .similarityThreshold(0.6)
                .similarityThresholdAll()
                .build();
        //查询
        List<Document> docs = vectorStore.similaritySearch(request);
        if (CollectionUtil.isEmpty(docs)) {
            log.info("====没有搜索到任何内容===");
            return;
        }
        log.info("====搜索到内容了===");
        for (Document doc : docs) {
            log.info(doc.getId());
            log.info(String.valueOf(doc.getScore()));
            log.info(doc.getText());
        }
    }
}
```

## 核心逻辑解释：
+ `SearchRequest.builder()`：创建一个向量检索请求。
+ `query("退票政策")`：检索的关键词，表示用户想了解 "退票政策" 相关的内容。
+ `topK(1)`：只返回 **最相似的前 1 个结果**。
+ `similarityThreshold(0.6)`：相似度阈值，只有相似度 **大于等于 0.6** 的文档才会被返回。
+ `similarityThresholdAll()`：表示设置为 **针对所有文档** 应用相似度阈值（可以理解为过滤模式开启）。
+ `vectorStore.similaritySearch(request)`：调用向量存储的 `similaritySearch` 方法，根据查询条件检索与 `query` 向量最相似的文档。

## 结果：
```latex
[damai-ai] 2025-06-18 11:20:31  INFO RagAiTest:41 - ====搜索到内容了===
[damai-ai] 2025-06-18 11:20:31  INFO RagAiTest:43 - 31a15194-6dda-4541-8524-8267662280fc
[damai-ai] 2025-06-18 11:20:31  INFO RagAiTest:44 - 0.7904867683100393
[damai-ai] 2025-06-18 11:20:31  INFO RagAiTest:45 - 若您想了解退票规则：请关注【演出详情页-“服务”或“购票须知”】，
若展示【不支持退】则不支持退票哦~ 若展示【条件退】则本演出支持有条件退款，基于演出的退票政策不同，
具体可支持您申请退款的情形请详见该演出详情页退票政策相关说明或公告。 
若您想了解演出变动情况：大麦将时刻与相关方保持沟通，若演出产生变动，
会以电话或短信通知您，建议您耐心等待关注。 若您购买的是大麦娱乐卡，
如发生退款情况（随时退/过期退），则不支持再次购买。给您带来不便，敬请谅解！
```

# 进行对话
经过测试是没有问题的，那么就可以使用 ChatClient 了，当用户和 ai 对话后，ChatClient 就会在根据用户的对话内容在向量数据库中进行检索

org.javaup.ai.cotroller.ProgramController#rag

```java
@RequestMapping(value = "/rag", produces = "text/html;charset=utf-8")
public Flux<String> rag(@RequestParam("prompt") String prompt,
                         @RequestParam("chatId") String chatId) {
    // 请求模型
    return markdownChatClient.prompt()
            .user(prompt)
            .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, chatId))
            .stream()
            .content();
}
```

<VipInline />