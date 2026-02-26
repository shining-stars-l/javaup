---
slug: /damai-ai/assistant/custom-advisor
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

## 自定义 advisor
小伙伴不要觉得自定义 advisor 很困难，其实 SpringAI 也是鼓励我们这么做的，本身做了非常容易得扩展，来留给我们实现的

让我们回到 ChatClient 创建的过程

```java
@Bean
public ChatClient assistantChatClient(DeepSeekChatModel model, ChatMemory chatMemory, AiProgram aiProgram) {
    return ChatClient
            .builder(model)
            .defaultSystem(DaMaiConstant.DA_MAI_SYSTEM_PROMPT)
            .defaultAdvisors(
                    new SimpleLoggerAdvisor(),
                    MessageChatMemoryAdvisor.builder(chatMemory).order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER).build()
            )
            .defaultTools(aiProgram)
            .build();
}
```



在这里是使用了 MessageChatMemoryAdvisor 实现的保存会话内容的功能，那就进去看一下 MessageChatMemoryAdvisor 里面是什么样的结构

```java
public final class MessageChatMemoryAdvisor implements BaseChatMemoryAdvisor {

	private final ChatMemory chatMemory;

	private final String defaultConversationId;

	private final int order;

	private final Scheduler scheduler;

	private MessageChatMemoryAdvisor(ChatMemory chatMemory, String defaultConversationId, int order,
			Scheduler scheduler) {
		Assert.notNull(chatMemory, "chatMemory cannot be null");
		Assert.hasText(defaultConversationId, "defaultConversationId cannot be null or empty");
		Assert.notNull(scheduler, "scheduler cannot be null");
		this.chatMemory = chatMemory;
		this.defaultConversationId = defaultConversationId;
		this.order = order;
		this.scheduler = scheduler;
	}

	@Override
	public int getOrder() {
		return this.order;
	}

	@Override
	public Scheduler getScheduler() {
		return this.scheduler;
	}

	@Override
	public ChatClientRequest before(ChatClientRequest chatClientRequest, AdvisorChain advisorChain) {
		String conversationId = getConversationId(chatClientRequest.context(), this.defaultConversationId);

		// 1. Retrieve the chat memory for the current conversation.
		List<Message> memoryMessages = this.chatMemory.get(conversationId);

		// 2. Advise the request messages list.
		List<Message> processedMessages = new ArrayList<>(memoryMessages);
		processedMessages.addAll(chatClientRequest.prompt().getInstructions());

		// 3. Create a new request with the advised messages.
		ChatClientRequest processedChatClientRequest = chatClientRequest.mutate()
			.prompt(chatClientRequest.prompt().mutate().messages(processedMessages).build())
			.build();

		// 4. Add the new user message to the conversation memory.
		UserMessage userMessage = processedChatClientRequest.prompt().getUserMessage();
		this.chatMemory.add(conversationId, userMessage);

		return processedChatClientRequest;
	}

	@Override
	public ChatClientResponse after(ChatClientResponse chatClientResponse, AdvisorChain advisorChain) {
		List<Message> assistantMessages = new ArrayList<>();
		if (chatClientResponse.chatResponse() != null) {
			assistantMessages = chatClientResponse.chatResponse()
				.getResults()
				.stream()
				.map(g -> (Message) g.getOutput())
				.toList();
		}
		this.chatMemory.add(this.getConversationId(chatClientResponse.context(), this.defaultConversationId),
				assistantMessages);
		return chatClientResponse;
	}

	@Override
	public Flux<ChatClientResponse> adviseStream(ChatClientRequest chatClientRequest,
			StreamAdvisorChain streamAdvisorChain) {
		// Get the scheduler from BaseAdvisor
		Scheduler scheduler = this.getScheduler();

		// Process the request with the before method
		return Mono.just(chatClientRequest)
			.publishOn(scheduler)
			.map(request -> this.before(request, streamAdvisorChain))
			.flatMapMany(streamAdvisorChain::nextStream)
			.transform(flux -> new ChatClientMessageAggregator().aggregateChatClientResponse(flux,
					response -> this.after(response, streamAdvisorChain)));
	}

	public static Builder builder(ChatMemory chatMemory) {
		return new Builder(chatMemory);
	}

	public static final class Builder {

		private String conversationId = ChatMemory.DEFAULT_CONVERSATION_ID;

		private int order = Advisor.DEFAULT_CHAT_MEMORY_PRECEDENCE_ORDER;

		private Scheduler scheduler = BaseAdvisor.DEFAULT_SCHEDULER;

		private ChatMemory chatMemory;

		private Builder(ChatMemory chatMemory) {
			this.chatMemory = chatMemory;
		}

		/**
		 * Set the conversation id.
		 * @param conversationId the conversation id
		 * @return the builder
		 */
		public Builder conversationId(String conversationId) {
			this.conversationId = conversationId;
			return this;
		}

		/**
		 * Set the order.
		 * @param order the order
		 * @return the builder
		 */
		public Builder order(int order) {
			this.order = order;
			return this;
		}

		public Builder scheduler(Scheduler scheduler) {
			this.scheduler = scheduler;
			return this;
		}

		/**
		 * Build the advisor.
		 * @return the advisor
		 */
		public MessageChatMemoryAdvisor build() {
			return new MessageChatMemoryAdvisor(this.chatMemory, this.conversationId, this.order, this.scheduler);
		}

	}

}
```

里面的具体逻辑我们不需要关心，先注意到 MessageChatMemoryAdvisor 是继承了 BaseChatMemoryAdvisor ，实现了这两个方法 before 和 after，这是不是 AOP 切面很像很像！没错，这就是和切面一个意思

## 什么是 `BaseChatMemoryAdvisor`
`BaseChatMemoryAdvisor` 是 Spring AI 提供的一个抽象类，目的是允许开发者在 AI 请求执行的前后对 **对话记忆（Chat Memory）** 进行拦截和处理。

+ 它实现了 Spring AOP 的 `Advisor`，可以与 AI 的 `ChatClient` 流程集成。
+ 它提供了两个关键的钩子方法：
    - `before`
    - `after`

通过继承 `BaseChatMemoryAdvisor`，你可以自定义对话记忆的读写策略、日志记录、上下文注入等。

### 核心方法解析
#### 1. `before`
+ **执行时机**：在 AI 请求执行之前。
+ **用途**：
    - 加载对话记忆（从数据库、缓存、Session 等）。
    - 注入上下文信息到 Prompt（提示词）。
    - 进行权限检查或参数调整。
+ **典型应用**：
    - 从 Redis 读取历史消息，注入到请求参数。
    - 记录请求时间、追踪 ID。

#### 2. `after`
+ **执行时机**：在 AI 请求执行完成之后（无论成功还是异常都会调用）。
+ **用途**：
    - 保存新的对话消息到记忆存储（Memory Store）。
    - 记录日志、处理异常。
    - 更新 Session 或用户上下文。
+ **典型应用**：
    - 将 AI 返回的消息存入 Redis 或数据库，形成完整的对话历史。
    - 处理异常场景，比如记忆回滚或补偿。

## 建造者模式
最关键的看完了，再看下面的这些部分

```java
public static Builder builder(ChatMemory chatMemory) {
    return new Builder(chatMemory);
}

public static final class Builder {

    private String conversationId = ChatMemory.DEFAULT_CONVERSATION_ID;

    private int order = Advisor.DEFAULT_CHAT_MEMORY_PRECEDENCE_ORDER;

    private Scheduler scheduler = BaseAdvisor.DEFAULT_SCHEDULER;

    private ChatMemory chatMemory;

    private Builder(ChatMemory chatMemory) {
        this.chatMemory = chatMemory;
    }

    /**
     * Set the conversation id.
     * @param conversationId the conversation id
     * @return the builder
     */
    public Builder conversationId(String conversationId) {
        this.conversationId = conversationId;
        return this;
    }

    /**
     * Set the order.
     * @param order the order
     * @return the builder
     */
    public Builder order(int order) {
        this.order = order;
        return this;
    }

    public Builder scheduler(Scheduler scheduler) {
        this.scheduler = scheduler;
        return this;
    }

    /**
     * Build the advisor.
     * @return the advisor
     */
    public MessageChatMemoryAdvisor build() {
        return new MessageChatMemoryAdvisor(this.chatMemory, this.conversationId, this.order, this.scheduler);
    }

}
```

这部分其实就是通过建造者模式，来构建出 MessageChatMemoryAdvisor 对象，相比与直接new的操作，建造者模式可以更加准确的控制每个属性的设置

# ChatTypeHistoryAdvisor
到这里就是自定义 advisor 了，这里起名叫 ChatTypeHistoryAdvisor

```java
@Slf4j
public class ChatTypeHistoryAdvisor implements BaseChatMemoryAdvisor {
    
    private final Integer type;
    
    private final String defaultConversationId;
    
    private final Integer order;
    
    private final ChatTypeHistoryService chatTypeHistoryService;
    
    private ChatTypeHistoryAdvisor(Integer type, String defaultConversationId, ChatTypeHistoryService chatTypeHistoryService, Integer order) {
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
    }
    
    @Override
    public ChatClientRequest before(final ChatClientRequest chatClientRequest, final AdvisorChain advisorChain) {
        String conversationId = getConversationId(chatClientRequest.context(), this.defaultConversationId);
        chatTypeHistoryService.save(type,conversationId);
        return chatClientRequest;
    }
    
    @Override
    public ChatClientResponse after(final ChatClientResponse chatClientResponse, final AdvisorChain advisorChain) {
        return chatClientResponse;
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
        
        private Builder(ChatTypeHistoryService chatTypeHistoryService) {
            this.chatTypeHistoryService = chatTypeHistoryService;
        }
        
        public ChatTypeHistoryAdvisor.Builder type(Integer type) {
            this.type = type;
            return this;
        }
        
        public ChatTypeHistoryAdvisor.Builder chatHistoryService(ChatTypeHistoryService chatTypeHistoryService) {
            this.chatTypeHistoryService = chatTypeHistoryService;
            return this;
        }
        
        public ChatTypeHistoryAdvisor.Builder order(Integer order) {
            this.order = order;
            return this;
        }
        
        public ChatTypeHistoryAdvisor build() {
            final String conversationId = ChatMemory.DEFAULT_CONVERSATION_ID;
            return new ChatTypeHistoryAdvisor(this.type,conversationId, this.chatTypeHistoryService, this.order);
        }
        
    }
}
```



实现起来真的非常的简单，也是继承了 BaseChatMemoryAdvisor，实现了 before 和 after 方法，因为我们是要在AI执行真正操作之前，把会话列表进行保存，所以要在before方法里来操作

```java
@Override
public ChatClientRequest before(final ChatClientRequest chatClientRequest, final AdvisorChain advisorChain) {
    String conversationId = getConversationId(chatClientRequest.context(), this.defaultConversationId);
    chatTypeHistoryService.save(type,conversationId);
    return chatClientRequest;
}
```

getConversationId 方法是从这里会话的上下文中拿去到会话id，也就是chatId。那它是什么时候放进去的呢？让我们继续往下看



有了自定义的 **ChatTypeHistoryAdvisor** 后，接下来就是把它添加到 ChatClient 中了，回到ChatClient创建的部分

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
                    MessageChatMemoryAdvisor.builder(chatMemory).order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER).build()
            )
            .defaultTools(aiProgram)
            .build();
}
```

这里多了一行：

```java
ChatTypeHistoryAdvisor.builder(chatTypeHistoryService).type(ChatType.ASSISTANT.getCode()).order(CHAT_TYPE_HISTORY_ADVISOR_ORDER).build()
```

这样就把 ChatTypeHistoryAdvisor 放到了 advisors 中



还记得刚才说的 getConversationId 方法是从这里会话的上下文中拿去到会话id，也就是chatId，是什么时候放入的呢？答案就是在这里：

```java
.advisors(a -> a.param(ChatMemory.CONVERSATION_ID, chatId))
```

通过此方法，就能让chatId在本次会话的整个 advisors 中，都能够获取到 chatId 了。


<VipInline />