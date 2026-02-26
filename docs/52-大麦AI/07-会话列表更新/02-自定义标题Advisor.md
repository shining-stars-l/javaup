---
slug: /damai-ai/conversation-list/custom-title-advisor
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

# ChatTypeTitleAdvisor
```java
@Slf4j
public class ChatTypeTitleAdvisor implements BaseChatMemoryAdvisor {
    
    private final Integer type;
    
    private final String defaultConversationId;
    
    private final Integer order;
    
    private final ChatTypeHistoryService chatTypeHistoryService;
    
    private final ChatMemory chatMemory;
    
    private Scheduler scheduler = BaseAdvisor.DEFAULT_SCHEDULER;
    
    private ChatClient chatClient;
    
    private ChatTypeTitleAdvisor(Integer type, String defaultConversationId,
                                 ChatTypeHistoryService chatTypeHistoryService, Integer order,
                                 ChatMemory chatMemory, ChatClient chatClient) {
        if (Objects.isNull(type)) {
            throw new IllegalArgumentException("type cannot be null");
        }
        if (StringUtil.isEmpty(defaultConversationId)) {
            throw new IllegalArgumentException("defaultConversationId cannot be empty");
        }
        if (Objects.isNull(chatTypeHistoryService)) {
            throw new IllegalArgumentException("chatHistoryService cannot be null");
        }
        if (Objects.isNull(order)) {
            throw new IllegalArgumentException("order cannot be null");
        }
        this.type = type;
        this.defaultConversationId = defaultConversationId;
        this.chatTypeHistoryService = chatTypeHistoryService;
        this.order = order;
        this.chatMemory = chatMemory;
        this.chatClient = chatClient;
    }
    
    @Override
    public ChatClientRequest before(final ChatClientRequest chatClientRequest, final AdvisorChain advisorChain) {
        return chatClientRequest;
    }
    
    @Override
    public ChatClientResponse after(final ChatClientResponse chatClientResponse, final AdvisorChain advisorChain) {
        String conversationId = getConversationId(chatClientResponse.context(), this.defaultConversationId);
        List<Message> messages = chatMemory.get(conversationId);
        List<ChatHistoryMessageVO> list = messages.stream().map(ChatHistoryMessageVO::new).toList();
        log.info("会话记录: {}", JSON.toJSONString(list));
        
        ChatTypeHistory chatTypeHistory = chatTypeHistoryService.getChatTypeHistory(type, conversationId);
        if (Objects.isNull(chatTypeHistory) || StringUtil.isNotEmpty(chatTypeHistory.getTitle())) {
            return chatClientResponse;
        }
        
        String content = chatClient.prompt().user("请为以下对话总结一句简洁标题\n" + JSON.toJSONString(list) + "\n 只返回标题文本内容，不要其他样式")
                .call().content();
        
        log.info("生成的标题: {}", content);
        
        ChatTypeHistory updatedChatTypeHistory = new ChatTypeHistory();
        updatedChatTypeHistory.setId(chatTypeHistory.getId());
        updatedChatTypeHistory.setTitle(content);
        chatTypeHistoryService.updateById(updatedChatTypeHistory);
        return chatClientResponse;
    }
    
    @Override
    public Flux<ChatClientResponse> adviseStream(final ChatClientRequest chatClientRequest, final StreamAdvisorChain streamAdvisorChain) {
        return Mono.just(chatClientRequest)
                .publishOn(scheduler)
                .map(request -> this.before(request, streamAdvisorChain))
                .flatMapMany(streamAdvisorChain::nextStream)
                .transform(flux -> new ChatClientMessageAggregator()
                        .aggregateChatClientResponse(flux,
                                response -> this.after(response, streamAdvisorChain)));
    }
    
    @Override
    public int getOrder() {
        return order;
    }
    
    public static Builder builder(ChatTypeHistoryService chatTypeHistoryService) {
        return new Builder(chatTypeHistoryService);
    }
    
    public static final class Builder {
        
        private Integer type;
        
        private Integer order = Ordered.HIGHEST_PRECEDENCE + 99;
        
        private ChatTypeHistoryService chatTypeHistoryService;
        
        private ChatMemory chatMemory;
        
        private ChatClient chatClient;
        
        private Builder(ChatTypeHistoryService chatTypeHistoryService) {
            this.chatTypeHistoryService = chatTypeHistoryService;
        }
        
        public ChatTypeTitleAdvisor.Builder type(Integer type) {
            this.type = type;
            return this;
        }
        
        public ChatTypeTitleAdvisor.Builder chatHistoryService(ChatTypeHistoryService chatTypeHistoryService) {
            this.chatTypeHistoryService = chatTypeHistoryService;
            return this;
        }
        
        public ChatTypeTitleAdvisor.Builder order(Integer order) {
            this.order = order;
            return this;
        }
        
        public ChatTypeTitleAdvisor.Builder chatMemory(ChatMemory chatMemory) {
            this.chatMemory = chatMemory;
            return this;
        }
        
        public ChatTypeTitleAdvisor.Builder chatClient(ChatClient chatClient) {
            this.chatClient = chatClient;
            return this;
        }
        
        public ChatTypeTitleAdvisor build() {
            final String conversationId = ChatMemory.DEFAULT_CONVERSATION_ID;
            return new ChatTypeTitleAdvisor(this.type,conversationId, this.chatTypeHistoryService, this.order, 
                    this.chatMemory, this.chatClient);
        }
        
    }
}
```



在创建 SpringAI 已有的 advisor 时，是使用建造者模式进行创建，那么 ChatTypeTitleAdvisor 同样也是使用了建造者模式来创建

# ChatTypeTitleAdvisor 的 after 方法
```java
public ChatClientResponse after(final ChatClientResponse chatClientResponse, final AdvisorChain advisorChain) {
    String conversationId = getConversationId(chatClientResponse.context(), this.defaultConversationId);
    List<Message> messages = chatMemory.get(conversationId);
    List<ChatHistoryMessageVO> list = messages.stream().map(ChatHistoryMessageVO::new).toList();
    log.info("会话记录: {}", JSON.toJSONString(list));
    
    ChatTypeHistory chatTypeHistory = chatTypeHistoryService.getChatTypeHistory(type, conversationId);
    if (Objects.isNull(chatTypeHistory) || StringUtil.isNotEmpty(chatTypeHistory.getTitle())) {
        return chatClientResponse;
    }
    
    String content = chatClient.prompt().user("请为以下对话总结一句简洁标题\n" + JSON.toJSONString(list) + "\n 只返回标题文本内容，不要其他样式")
            .call().content();
    
    log.info("生成的标题: {}", content);
    
    ChatTypeHistory updatedChatTypeHistory = new ChatTypeHistory();
    updatedChatTypeHistory.setId(chatTypeHistory.getId());
    updatedChatTypeHistory.setTitle(content);
    chatTypeHistoryService.updateById(updatedChatTypeHistory);
    return chatClientResponse;
}
```



+ 先获取到 conversationId，也就是 chatId
+ 从 SpringAI 提供的 chatMemory 中，查询到对话具体的内容
+ 通过 chatId 和 type 查询到对应的会话聊天
+ 判断此会话聊天的标题是否为空，不为空表示已经更新了，就不再执行
+ 调用 ai 对查询到对话具体的内容进行总结出标题
+ 将标题更新到数据库中

## 为什么Service层需要定义接口
还记得之前给大家留一个问题，就是为了大麦项目的Service层没有接口只有实现类，而大麦ai项目中的Service层有接口呢？

答案就是在这里，ChatTypeTitleAdvisor 中是使用 chatTypeHistoryService 接口来进行操作的，对于大麦ai项目业务特点来说，更换存储是很有可能的，从数据库切换到Redis，或者其他的类型的数据库中，用接口操作的话，就不需要关心具体是存储到哪里了，只要替换实现类就可以了。

<VipInline />