---
slug: /super-agent/conversation-memory/five-strategies-and-java-implementation
description: "详解会话记忆的五种核心策略，深入讲解Token预算分配，以及完整的Java代码实现（滑动窗口、摘要压缩），并对比不同存储方案"
keywords: ["会话记忆", "滑动窗口", "Token截断", "摘要压缩", "混合策略", "Java实现", "Redis存储", "Token预算"]
---

# 会话记忆策略与Java实战

前面聊了大模型没有记忆、直接把历史全塞进去会Token爆炸。那有没有什么办法，既能让AI记住重要的对话内容，又不会让Token失控呢？

今天这篇是实操专场：先讲五种主流的会话记忆策略，再手把手用Java代码实现，最后聊聊生产环境的存储选型和Token预算管理。

## 先看效果：有记忆和没记忆差多远

在写代码之前，先直观地感受一下"有记忆"和"没记忆"的差别到底有多大。

### 无记忆模式：每轮都是陌生人

```java
/**
 * 无记忆模式：每次只发当前问题，不带历史
 */
static void noMemoryDemo() throws IOException {
    // 第1轮
    String answer1 = chat(List.of(
            message("system", "你是一个Java编程导师，用通俗易懂的方式解答学生问题。"),
            message("user", "HashMap 和 ConcurrentHashMap 有什么区别？")
    ));
    System.out.println("学生：HashMap 和 ConcurrentHashMap 有什么区别？");
    System.out.println("导师：" + answer1);

    // 第2轮：不带历史，导师不知道"它"是什么
    String answer2 = chat(List.of(
            message("system", "你是一个Java编程导师，用通俗易懂的方式解答学生问题。"),
            message("user", "那它在JDK8里是怎么实现线程安全的？")
    ));
    System.out.println("\n学生：那它在JDK8里是怎么实现线程安全的？");
    System.out.println("导师：" + answer2);
}
```

### 有记忆模式：聊天连贯

```java
/**
 * 有记忆模式：每次请求带上完整历史
 */
static void withMemoryDemo() throws IOException {
    List<JsonObject> history = new ArrayList<>();
    history.add(message("system", "你是一个Java编程导师，用通俗易懂的方式解答学生问题。"));

    // 第1轮
    history.add(message("user", "HashMap 和 ConcurrentHashMap 有什么区别？"));
    String answer1 = chat(history);
    history.add(message("assistant", answer1));
    System.out.println("学生：HashMap 和 ConcurrentHashMap 有什么区别？");
    System.out.println("导师：" + answer1);

    // 第2轮：带上第1轮的历史，导师知道"它"指ConcurrentHashMap
    history.add(message("user", "那它在JDK8里是怎么实现线程安全的？"));
    String answer2 = chat(history);
    history.add(message("assistant", answer2));
    System.out.println("\n学生：那它在JDK8里是怎么实现线程安全的？");
    System.out.println("导师：" + answer2);
}
```

**运行结果对比**：

```
===== 无记忆模式 =====
学生：HashMap 和 ConcurrentHashMap 有什么区别？
导师：HashMap是非线程安全的，ConcurrentHashMap是线程安全的...（正常回答）

学生：那它在JDK8里是怎么实现线程安全的？
导师：请问您指的是哪个类？不同类实现线程安全的方式不同...
❌ 导师不知道"它"是什么

===== 有记忆模式 =====
学生：HashMap 和 ConcurrentHashMap 有什么区别？
导师：HashMap是非线程安全的，ConcurrentHashMap是线程安全的...（正常回答）

学生：那它在JDK8里是怎么实现线程安全的？
导师：ConcurrentHashMap在JDK8中放弃了分段锁，改用CAS + synchronized...
✅ 导师清楚知道"它"指的是ConcurrentHashMap
```

效果一目了然：无记忆模式下第2轮就"断片"了，有记忆模式下可以顺畅地深入讨论。

## 五种会话记忆策略

### 策略一：完整历史——简单粗暴全都要

**思路**：把所有对话历史一股脑儿塞进messages数组，一条都不丢。

```java
List<Message> messages = new ArrayList<>();
messages.add(new Message("system", systemPrompt));
messages.addAll(conversationHistory);  // 全部历史
messages.add(new Message("user", currentQuestion));
```

| 维度 | 说明 |
|------|------|
| **优点** | 信息零丢失，实现极简 |
| **缺点** | Token无限膨胀，迟早超限或费用失控 |
| **适用场景** | 对话确定不超过5轮的简单场景 |

### 策略二：滑动窗口——最常用的方案

**思路**：只保留最近N轮对话，更早的对话直接丢弃。就像一条传送带，新的上来，旧的掉下去。

```
保留窗口N=3时的对话变化：

第1轮结束：[ 第1轮 ]
第2轮结束：[ 第1轮, 第2轮 ]
第3轮结束：[ 第1轮, 第2轮, 第3轮 ]     ← 窗口满了
第4轮结束：[ 第2轮, 第3轮, 第4轮 ]     ← 第1轮被丢弃
第5轮结束：[ 第3轮, 第4轮, 第5轮 ]     ← 第2轮被丢弃
```

**N取多大合适？** 没有标准答案，参考经验值：

| 业务场景 | 推荐N值 | 原因 |
|---------|---------|------|
| 简单FAQ问答 | 3~5 | 2~3轮就能答完 |
| 电商客服 | 5~8 | 退货/售后需要来回确认 |
| 技术支持 | 8~10 | 问题排查需要较长上下文 |
| 复杂咨询 | 10~15 | 建议配合摘要压缩使用 |

:::tip 经验法则
从N=5开始试。如果用户经常遇到"你怎么忘了我之前说的"的情况，就增大N；如果Token成本太高，就减小N。
:::

### 策略三：Token截断——比滑动窗口更精确

**滑动窗口的盲区**：按轮数截断，但每轮消息长度差异可能很大。

- 用户说"好的"——3个Token
- 用户贴了一段50行代码——800个Token
- AI详细讲解设计模式——1,200个Token

如果N=5，其中有一轮AI回复特别长，5轮可能占4,000 Token；如果每轮都很简短，5轮可能只占300 Token。

**Token截断的做法**：给对话历史设一个Token上限（比如4,000），从最新的消息往前倒着算，超出上限的消息统统丢弃。

```
Token上限：4,000

当前历史消息（从旧到新）：
- 第1轮 user：    100 Token  ← 超出，丢弃
- 第1轮 assistant：600 Token  ← 超出，丢弃
- 第2轮 user：    80 Token   ← 超出，丢弃
- 第2轮 assistant：400 Token  ← 超出，丢弃
- 第3轮 user：    300 Token  ✓ 保留
- 第3轮 assistant：900 Token  ✓ 保留
- ... 后续保留 ...
```

:::warning 注意成对丢弃
截断时必须保证user和assistant消息**成对保留或成对丢弃**。如果只丢了user留了assistant，模型看到的就是一个"没有问题的回答"，会造成理解混乱。
:::

### 策略四：摘要压缩——用AI帮AI做笔记

**前三种策略的共同缺陷**：被丢弃的历史信息就再也找不回来了。

**摘要压缩的思路**：不是丢掉早期对话，而是用大模型把早期对话"浓缩"成一段简短的摘要。

类比一下：你接手一个同事之前对接的辅导工单。同事跟学生聊了15轮，你不需要逐条看完所有记录，同事给你一段交接说明就行：

> "这位同学在做一个在线商城项目，用的Spring Boot 3.2 + JDK 21 + MyBatis-Plus。目前在实现订单模块，遇到了乐观锁并发更新的问题。已经确认了数据库表结构没问题，初步判断是version字段没有正确参与WHERE条件。学生基础不错，能看懂源码。"

原来15轮对话可能有6,000 Token，这段摘要只有200~400 Token，但关键信息都保留了。

**摘要Prompt怎么写**：

```
请把以下对话记录压缩成一段简洁的背景摘要，要求：
1. 保留用户的核心问题和学习目标
2. 保留所有关键技术细节（技术栈、版本号、错误信息等）
3. 保留已经得出的结论和已尝试的方案
4. 保留尚未解决的问题
5. 去掉寒暄、重复确认、和主题无关的闲聊
6. 用第三人称描述，控制在200字以内

对话记录：
{conversation_history}
```

**什么时候触发摘要**：推荐用**按Token阈值**的方式。比如设定3,000 Token为阈值，一旦对话历史超过这个值，就把最早的若干轮压缩成摘要，只保留最近2~3轮完整对话。

### 策略五：混合策略——生产环境的首选方案

**思路**：早期对话压缩成摘要 + 最近N轮保留完整内容。兼顾了长期信息和短期精度。

```json
{
  "messages": [
    {
      "role": "system",
      "content": "你是一个在线编程学习平台的Java导师..."
    },
    {
      "role": "system",
      "content": "【对话背景摘要】该学员正在开发一个Spring Boot在线商城项目（JDK 21 + MyBatis-Plus）。已完成用户和商品模块。当前在实现订单模块，遇到并发下单时库存扣减不一致的问题。已排除数据库连接池配置问题，初步定位到事务隔离级别和乐观锁实现上。"
    },
    {
      "role": "user",
      "content": "我试了加@Version注解，但是高并发时还是有超卖现象"
    },
    {
      "role": "assistant",
      "content": "MyBatis-Plus的@Version乐观锁在高并发场景确实可能出现超卖..."
    },
    {
      "role": "user",
      "content": "那如果加重试的话，重试几次比较合适？有没有可能死循环？"
    }
  ]
}
```

**关键点**：
1. 摘要放在system消息里，紧跟在角色定义之后
2. 最近1~2轮完整保留，保证模型精准理解当前讨论的细节
3. 总Token可控：System Prompt + 摘要（约300 Token）+ 最近几轮（约600 Token）

### 五种策略对比速查表

| 策略 | Token控制 | 信息保留 | 实现难度 | 额外API开销 | 适用场景 |
|-----|-----------|---------|---------|-------------|---------|
| 完整历史 | 无控制 | 完整 | 极低 | 无 | 对话不超过5轮 |
| 滑动窗口 | 按轮数控制 | 丢失早期 | 低 | 无 | 大多数中等长度对话 |
| Token截断 | 按Token精确控制 | 丢失早期 | 中 | 无 | 消息长度差异大 |
| 摘要压缩 | 大幅压缩 | 保留关键信息 | 高 | 每次压缩调1次LLM | 长对话、需要长期上下文 |
| **混合策略** | **精确可控** | **长期摘要+短期完整** | **高** | **触发时调1次** | **生产级系统（推荐）** |

## Java代码实战

### 实现一：滑动窗口记忆管理器

前面我们写的是思路版伪代码，真到了 Spring Boot 项目里，更推荐直接用 Spring AI 自带的消息体系来落。这样做有两个好处：

1. 不需要自己再维护 `role + content` 的 JSON 结构
2. 可以直接复用 Spring AI 的 `ChatMemory`、`Advisor`、`Message`、`Prompt` 这些能力

我在示例模块 `super-ai-hub/ai-example/ai-example-memory/ai-example-spring-ai-memory` 里，专门做了一个能直接跑的版本。滑动窗口这里，核心思路就是：

- 底层存储用 `MessageWindowChatMemory`
- 每次发起对话时，用 `MessageChatMemoryAdvisor` 自动把历史消息拼进 Prompt
- 窗口大小按“轮数”配置，但真正传给 Spring AI 的是“消息条数”

```java
@Service
public class SlidingWindowMemoryChatService {

    private final ChatClient.Builder chatClientBuilder;
    private final ChatMemory chatMemory;
    private final String systemPrompt;

    public SlidingWindowMemoryChatService(
        ChatClient.Builder chatClientBuilder,
        @Value("${app.ai.memory.default-system-prompt}") String systemPrompt,
        @Value("${app.ai.memory.sliding-window.max-rounds:3}") int maxRounds) {
        this.chatClientBuilder = chatClientBuilder;
        this.systemPrompt = systemPrompt;
        this.chatMemory = MessageWindowChatMemory.builder()
            .maxMessages(Math.max(2, maxRounds * 2))
            .build();
    }

    public MemoryChatResponse chat(String sessionId, String question) {
        String normalizedSessionId = MemoryPromptSupport.normalizeSessionId(sessionId, "sliding-window-demo");
        List<Message> historyBeforeCall = this.chatMemory.get(normalizedSessionId);

        String answer = this.chatClientBuilder.build()
            .prompt()
            .system(this.systemPrompt)
            .advisors(MessageChatMemoryAdvisor.builder(this.chatMemory)
                .conversationId(normalizedSessionId)
                .build())
            .user(question)
            .call()
            .content();

        List<Message> historyAfterCall = this.chatMemory.get(normalizedSessionId);
        int promptTokens = MemoryPromptSupport.estimateTokens(this.systemPrompt)
            + MemoryPromptSupport.estimateTokens(question)
            + MemoryPromptSupport.estimateTokens(historyBeforeCall);

        return new MemoryChatResponse(
            "sliding-window",
            normalizedSessionId,
            question,
            answer,
            promptTokens,
            "",
            0,
            MemoryPromptSupport.toViews(historyAfterCall)
        );
    }
}
```

这里有个很实用的小细节，很多人第一次接 Spring AI 记忆都会忽略：

- `MessageWindowChatMemory` 控制的是**消息条数**
- 但我们平时聊“保留 3 轮”，说的是 **3 组 user + assistant**

所以示例里才会写 `maxRounds * 2`。这样你配置 `3` 的时候，真正保留的是最近 3 轮完整问答，而不是最近 3 条零散消息。

:::tip 这个实现为什么更像生产代码
它不是把历史先手动拼成一个 `List<Map<String, Object>>` 再发请求，而是直接交给 Spring AI 的 `Advisor` 体系去处理。后面如果你想把内存存储换成 JDBC、Redis，或者接入别的 ChatMemoryRepository，迁移成本会低很多。
:::

### 实现二：摘要压缩记忆管理器

滑动窗口已经够解决不少问题了，但它的短板也很明显：窗口外的内容会直接消失。  
所以第二种实现我没有继续用“手动拼 JSON + 自己调 chat()”那一套，而是换成 Spring AI 的 `Message`、`Prompt`、`ChatModel` 来做摘要压缩。

这个版本的思路是：

- 正常对话仍然维护最近几轮完整消息
- 一旦最近消息的 Token 粗估超过阈值，就把更早的部分拿出来做摘要
- 摘要本身放进下一轮请求的 `SystemMessage`
- 最近几轮完整消息继续保留，保证模型对当前追问仍然敏感

```java
@Service
public class SummaryCompressionMemoryChatService {

    private final ChatModel chatModel;
    private final String systemPrompt;
    private final int tokenThreshold;
    private final int keepRecentRounds;
    private final Map<String, SummaryConversationState> sessionStore = new ConcurrentHashMap<>();

    public MemoryChatResponse chat(String sessionId, String question) {
        String normalizedSessionId = MemoryPromptSupport.normalizeSessionId(sessionId, "summary-memory-demo");
        SummaryConversationState state = this.sessionStore.computeIfAbsent(
            normalizedSessionId,
            key -> new SummaryConversationState()
        );

        synchronized (state) {
            List<Message> promptMessages = buildPromptMessages(state, question);
            String answer = MemoryPromptSupport.extractText(this.chatModel.call(new Prompt(promptMessages)));

            state.recentMessages.add(new UserMessage(question));
            state.recentMessages.add(new AssistantMessage(answer));
            compressIfNecessary(state);

            return new MemoryChatResponse(
                "summary-compression",
                normalizedSessionId,
                question,
                answer,
                MemoryPromptSupport.estimateTokens(promptMessages),
                state.summary,
                state.compressionCount,
                MemoryPromptSupport.toViews(state.recentMessages)
            );
        }
    }

    private void compressIfNecessary(SummaryConversationState state) {
        if (MemoryPromptSupport.estimateTokens(state.recentMessages) <= this.tokenThreshold) {
            return;
        }

        int keepCount = Math.max(2, this.keepRecentRounds * 2);
        if (state.recentMessages.size() <= keepCount) {
            return;
        }

        List<Message> overflowMessages = new ArrayList<>(
            state.recentMessages.subList(0, state.recentMessages.size() - keepCount)
        );
        List<Message> recentMessages = new ArrayList<>(
            state.recentMessages.subList(state.recentMessages.size() - keepCount, state.recentMessages.size())
        );

        state.summary = mergeSummary(state.summary, overflowMessages);
        state.recentMessages.clear();
        state.recentMessages.addAll(recentMessages);
        state.compressionCount++;
    }

    private String mergeSummary(String existingSummary, List<Message> overflowMessages) {
        String summaryPrompt = """
            请把下面的已有摘要和新增对话合并成一段新的背景摘要。
            输出要求：
            1. 直接输出摘要正文，不要加标题。
            2. 保留用户当前关注的主题、关键技术点、已经确认的结论和待解决问题。
            3. 合并重复内容，别把对话原文逐句照搬。
            4. 控制在 180 到 220 字之间。

            已有摘要：
            %s

            新增对话：
            %s
            """.formatted(existingSummary.isBlank() ? "暂无" : existingSummary,
            MemoryPromptSupport.toTranscript(overflowMessages));

        List<Message> summaryMessages = List.of(
            new SystemMessage(SUMMARY_SYSTEM_PROMPT),
            new UserMessage(summaryPrompt)
        );
        return MemoryPromptSupport.extractText(this.chatModel.call(new Prompt(summaryMessages)));
    }
}
```

你会发现，这版代码跟前面的滑动窗口有个明显区别：

- 滑动窗口主要依赖 Spring AI 自带的 `ChatMemory`
- 摘要压缩更像是在 Spring AI 之上自定义一层“记忆编排逻辑”

这也是实际项目里很常见的做法。  
不是所有东西都要硬套框架现成类，有时候最稳的办法就是：

- **消息结构** 用 Spring AI 原生 `Message`
- **请求发起** 用 Spring AI 原生 `Prompt` / `ChatModel`
- **压缩规则** 自己按业务写

这样代码既不会太散，也不会为了追求“框架感”把一个简单示例弄得很重。

### 效果对比：三种策略同时跑

文档里只讲文字效果不够过瘾，所以我在示例模块里又补了一个专门的对比服务，直接用固定脚本把三种策略同时跑一遍。  
这个脚本还是拿“连续追问 Spring Bean 作用域”做例子，因为这个场景特别适合观察记忆策略差异：

- 第 2 轮开始出现“它”这种指代
- 中间会继续追问线程安全、生命周期
- 最后一轮又回到第一轮最早的话题

代码长这样：

```java
@Service
public class MemoryComparisonService {

    private static final List<String> QUESTIONS = List.of(
        "Spring Bean 的作用域有哪些？",
        "默认用的是哪一种？",
        "那它在并发下会不会有线程安全问题？",
        "如果换成 prototype，还会走完整生命周期回调吗？",
        "那在项目里，我该怎么判断一个组件更适合 singleton 还是 prototype？",
        "回到最开始那个问题，除了常见那几种作用域，还能自己扩展吗？"
    );

    public MemoryComparisonResponse runDefaultComparison() {
        String slidingSessionId = "compare-sliding-window";
        String summarySessionId = "compare-summary-memory";

        this.slidingWindowMemoryChatService.clear(slidingSessionId);
        this.summaryCompressionMemoryChatService.clear(summarySessionId);

        List<ComparisonTurnResponse> turns = new ArrayList<>();
        int round = 1;
        for (String question : QUESTIONS) {
            MemoryChatResponse noMemoryResponse = this.noMemoryChatService.chat(question);
            MemoryChatResponse slidingWindowResponse = this.slidingWindowMemoryChatService.chat(slidingSessionId, question);
            MemoryChatResponse summaryResponse = this.summaryCompressionMemoryChatService.chat(summarySessionId, question);

            turns.add(new ComparisonTurnResponse(
                round++,
                question,
                noMemoryResponse.answer(),
                slidingWindowResponse.answer(),
                summaryResponse.answer(),
                summaryResponse.summary(),
                summaryResponse.compressionCount()
            ));
        }

        return new MemoryComparisonResponse(
            "Spring Bean 作用域六轮追问",
            turns,
            this.slidingWindowMemoryChatService.snapshot(slidingSessionId),
            this.summaryCompressionMemoryChatService.snapshot(summarySessionId)
        );
    }
}
```

如果你启动示例项目，可以直接调这个接口：

```http
GET /memory/compare
```

这个接口返回的 JSON 里会把每一轮的三种回答都列出来，另外还会带上：

- 滑动窗口最终保留下来的消息列表
- 摘要压缩最终留下的最近消息
- 当前摘要内容
- 摘要一共触发了几次压缩

所以你在本地跑一遍，马上就能看到这三种现象：

1. **无记忆模式**：第二轮开始就容易听不懂“它”指什么
2. **滑动窗口模式**：中间几轮通常没问题，但最后可能把最早信息挤掉
3. **摘要压缩模式**：即使前面的完整对话不在了，只要摘要保留得够好，最后仍然能接得上

:::info 这套示例为什么故意没做复杂
这里只是用来展示“记忆策略”本身，所以我没有额外接 Redis、数据库，也没有引入 Agent、Graph、Workflow 这些更重的能力。目的很明确，就是让你一眼看懂：

- Spring AI 自带能力适合解决什么
- 哪些地方要自己补业务逻辑
- 三种策略在真实多轮对话里的效果差在哪里
:::

## RAG场景的Token预算分配

在纯聊天场景下，Context里主要是System Prompt和对话历史。但在RAG场景下，还要塞进检索回来的知识文档，Token预算就紧张了。

### 推荐的Token分配方案（以32K窗口为例）

| 部分 | 推荐预算 | 说明 |
|------|---------|------|
| System Prompt | 1,000 Token | 角色定义 + 行为约束 + 输出格式要求 |
| 对话历史/摘要 | 4,000 Token | 摘要 + 最近3~5轮完整对话 |
| RAG检索内容 | 5,000 Token | Top-3到Top-5个相关文档片段 |
| 当前用户问题 | 100 Token | 通常很短 |
| 预留生成空间 | 2,000 Token | 模型回答的最大长度 |
| **总计** | **~12,100 Token** | 远低于32K上限，留有余量 |

:::warning 容易忽略的点
上下文窗口 = 输入Token + 输出Token。如果你用的是32K模型，那输入+输出加起来不能超过32K，不是说输入可以用满32K。
:::

### 各部分的优先级排序

当Token预算紧张时（比如用了8K窗口的小模型），哪些该保、哪些该砍？

**优先级从高到低**：

1. **System Prompt** —— 定义模型的行为底线，没有它模型可能乱说话、编答案
2. **预留生成空间** —— 不够的话回答会被截断，用户看到半句话
3. **最近2~3轮对话** —— 理解当前意图的关键。用户说"那个怎么办"，没有最近几轮就不知道"那个"是什么
4. **RAG检索内容** —— RAG的核心价值所在，没有它模型只能用自己的"旧知识"回答
5. **更早的对话历史** —— 优先级最低，可以压缩成摘要或直接丢弃

### 动态调整策略

```java
/**
 * 根据对话历史占用的Token，动态计算可分配给检索内容的Token预算
 */
public int calculateChunkBudget(int historyTokens) {
    int totalBudget = 12000;           // 总Token预算
    int systemPromptTokens = 1000;     // System Prompt固定开销
    int reservedForOutput = 2000;      // 预留给模型输出的空间
    int queryTokens = 100;             // 当前问题

    int availableForChunks = totalBudget - systemPromptTokens
            - reservedForOutput - queryTokens - historyTokens;

    // 至少保证能放1个文档片段（约500 Token）
    return Math.max(500, availableForChunks);
}
```

**效果**：
- 对话刚开始（历史Token少）→ 可以多召回几个文档，信息更丰富
- 对话中期（历史Token适中）→ 文档数量正常
- 对话后期（历史Token多）→ 减少文档数量，或者触发摘要压缩腾出空间

## 对话历史存在哪——存储方案选型

### 方案一：内存（HashMap/ConcurrentHashMap）

最简单的方案，直接用Map存。

```java
Map<String, List<Message>> memoryStore = new ConcurrentHashMap<>();
```

**优点**：快得飞起——读写都是内存操作，纳秒级。

**缺点**：服务一重启数据全丢，而且只能单机用，对话多了内存扛不住。

**适合**：开发调试、Demo演示。

### 方案二：Redis

用Redis存序列化后的消息列表，天然适合这种"带过期时间的临时数据"。

```java
// 存：JSON序列化后写入Redis，设30分钟过期
String key = "chat:session:" + sessionId;
redisTemplate.opsForValue().set(key, gson.toJson(messages), 30, TimeUnit.MINUTES);

// 取：从Redis读出后反序列化
String json = redisTemplate.opsForValue().get(key);
List<Message> messages = gson.fromJson(json, new TypeToken<List<Message>>(){}.getType());
```

**优点**：分布式多实例共享、高性能、自带TTL过期清理。

**缺点**：需要序列化/反序列化，Redis本身重启也可能丢数据（除非开启持久化）。

**适合**：生产环境。

### 方案三：MySQL

用数据库表存储每条消息，结构清晰、可审计。

```sql
CREATE TABLE conversation_message (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id VARCHAR(64) NOT NULL,
    role VARCHAR(16) NOT NULL COMMENT 'system / user / assistant',
    content TEXT NOT NULL,
    token_count INT DEFAULT 0 COMMENT '该消息估算的Token数',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id)
);
```

**优点**：数据持久化、可审计、方便做数据分析。

**缺点**：读写性能比内存和Redis低一个量级。

**适合**：需要审计和数据分析的企业场景。

### 选型对照表

| 维度 | 内存 | Redis | MySQL |
|------|------|-------|-------|
| 读写性能 | 极快（纳秒） | 快（毫秒） | 较慢（毫秒~十毫秒） |
| 持久化 | 不支持 | 可选（AOF/RDB） | 天然支持 |
| 分布式 | 不支持 | 天然支持 | 支持 |
| 过期清理 | 需自行实现 | 原生TTL支持 | 需定时任务 |
| 实现复杂度 | 极低 | 低 | 中 |

:::tip 生产环境推荐方案
**Redis做主存储 + MySQL做归档**。对话进行中，消息存Redis（快速读写）；对话结束后，异步写入MySQL（持久化+审计）。这样既保证了对话时的响应速度，也不丢数据。
:::

## 上线前必须考虑的三件事

### 会话超时与资源清理

不管用哪种存储，都要设置会话过期时间。用户关掉页面、30分钟没说话，对话历史就应该被清理。

- **内存**：用Caffeine或Guava Cache的过期淘汰机制
- **Redis**：设置TTL，Redis自动过期
- **MySQL**：可以标记为"已关闭"，定时任务清理

不做清理的后果：内存持续膨胀导致OOM，Redis内存不足开始驱逐数据。

### 敏感信息脱敏

对话历史中可能包含用户的隐私数据：手机号、身份证号、银行卡号等。存储时要考虑：

- **脱敏存储**：敏感字段做掩码处理（如手机号显示为138\*\*\*\*1234）
- **加密存储**：对消息内容整体加密，读取时解密
- **访问控制**：限制谁能查看对话历史，记录访问日志

在金融、医疗等合规要求严格的行业，这一点是必须做的。

### 可观测性

生产环境中，建议监控以下指标：

| 指标 | 为什么重要 |
|------|-----------|
| 每轮对话的Token消耗 | 发现异常的长对话，防止费用失控 |
| 摘要压缩的触发频率 | 判断Token阈值是否设置合理 |
| 压缩前后的Token变化量 | 评估摘要质量——压缩太狠可能丢关键信息 |
| 端到端响应时间 | 发现摘要压缩、检索等环节的性能瓶颈 |
| 用户追问时的"断片"率 | 判断记忆策略是否满足业务需求 |

## 本章小结

1. 无记忆 vs 有记忆的效果差异是天壤之别——第2轮就"断片" vs 多轮顺畅追问
2. **滑动窗口**实现简单，适合大多数场景，但超出窗口的信息会丢失
3. **摘要压缩**通过LLM浓缩早期对话，保留关键信息，是生产环境搭配滑动窗口的推荐方案
4. Token预算要合理分配，各部分有明确的优先级
5. 存储选型：开发用内存，**生产用Redis + MySQL双存储**
6. 上线前必须考虑：会话超时清理、敏感信息脱敏、可观测性指标监控

到这里，**短期记忆**（会话内记忆）的方案已经讲完了。但还有一个更大的挑战没有解决——如果用户三个月前说过"我在学分布式系统"，三个月后再来问问题，短期记忆早就清空了。

下一节我们来聊**长期记忆**——怎么让AI真正"记住"用户，跨越会话的边界。
