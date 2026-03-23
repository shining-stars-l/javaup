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

### 示例中项目地址

- 项目地址：[https://gitee.com/shining-stars-l/super-ai-hub](https://gitee.com/shining-stars-l/super-ai-hub)
- 项目模块：`ai-example-spring-ai-memory`

### 实现一：无记忆

这种是不存在记忆的，每次对话都只发当前问题，不带任何历史消息，问了下句不会知道上句的意思。

### 对应接口调用示例

对应接口：

- `GET /memory/no-memory/chat`

#### 无记忆模式：第一次对话

```bash
# 无记忆模式：第一次对话
curl "http://localhost:8091/memory/no-memory/chat?question=Spring Bean 的作用域有哪些？"
```

结果：
```json
{
  "strategy": "no-memory",
  "sessionId": "stateless-demo",
  "question": "Spring Bean 的作用域有哪些？",
  "answer": "Spring Bean 的作用域是指在 Spring 容器中管理 Bean 实例的方式。Spring 容器支持以下几种作用域：\n\n1. **单例（Singleton）**：这是默认的作用域。Spring 容器只会创建一个 Bean 的实例，并将其缓存。每次请求都会返回缓存中的同一个实例。这种方式适用于大多数场景，因为大多数情况下，共享一个 Bean 实例是安全且高效的。\n\n2. **原型（Prototype）**：每次请求该 Bean 时，Spring 容器都会创建一个新的实例。这种方式适用于需要每次请求都获得独立的实例的情况，比如当 Bean 包含状态信息时，这些状态信息在多个实例之间不应该共享。\n\n3. **请求（Request）**：这种作用域仅限于 Web 应用程序中使用。Spring 会在 HTTP 请求的生命周期内保持 Bean 的存在，每个 HTTP 请求都会创建一个 Bean 实例，每个请求结束后，该实例会被销毁。\n\n4. **会话（Session）**：也仅限于 Web 应用程序。这种作用域会在 HTTP 会话的生命周期内保持 Bean 的存在，每个会话都会创建一个 Bean 实例，当会话结束时，该实例会被销毁。\n\n5. **应用（Application）**：这种作用域仅限于 Web 应用程序。Spring 会在 Web 应用程序的生命周期内保持 Bean 的存在。每个 Web 应用程序启动时都会创建一个 Bean 实例，直到应用程序关闭。\n\n6. **对话（Conversation）**：这种作用域是 Spring 3.1 引入的，主要用于 Web 应用的长会话。它允许在特定的对话周期内保持 Bean 的存在。\n\n7. **全局对话（Global Session）**：用于支持多个会话，当用户在多个窗口或标签页中打开应用程序时，可以保持一个全局的对话作用域。\n\n在实际工程中，选择合适的作用域对于资源管理、性能优化以及应用程序的正确性至关重要。例如，单例适用于大多数业务逻辑 Bean，而原型适用于需要独立状态的 Bean。对于 Web 应用，请求作用域和会话作用域可以帮助管理用户会话和会话状态。",
  "estimatedPromptTokens": 138,
  "summary": "",
  "compressionCount": 0,
  "memoryMessages": []
}
```

#### 无记忆模式：第二次对话

```bash
# 无记忆模式：第二次对话
curl "http://localhost:8091/memory/no-memory/chat?question=那它默认是哪一种？"
```

结果：
```json
{
  "strategy": "no-memory",
  "sessionId": "stateless-demo",
  "question": "那它默认是哪一种？",
  "answer": "您提到的“它”没有上下文信息，我需要知道您具体指的是什么内容或者场景。例如，是关于Java中的某种特性、配置、编程习惯，还是其他方面的内容？请您提供更多的信息，以便我能更准确地回答您的问题。",
  "estimatedPromptTokens": 137,
  "summary": "",
  "compressionCount": 0,
  "memoryMessages": []
}
```

### 实现二：滑动窗口记忆管理器

在示例的项目中，专门做了一个能直接跑的版本。滑动窗口这里，核心思路就是：

- 底层存储用 `MessageWindowChatMemory`
- 每次发起对话时，用 `MessageChatMemoryAdvisor` 自动把历史消息拼进 Prompt
- 窗口大小按“轮数”配置，但真正传给 Spring AI 的是“消息条数”

```java
public class SlidingWindowMemoryChatService {

    private static final String DEFAULT_SESSION_ID = "sliding-window-demo";

    private final ChatClient.Builder chatClientBuilder;
    private final ChatMemory chatMemory;
    private final String systemPrompt;

    public SlidingWindowMemoryChatService(
        ChatClient.Builder chatClientBuilder,
        @Value("${app.ai.memory.default-system-prompt}") String systemPrompt,
        @Value("${app.ai.memory.sliding-window.max-rounds:3}") int maxRounds) {
        this.chatClientBuilder = chatClientBuilder;
        this.systemPrompt = systemPrompt;
        // Spring AI 的 MessageWindowChatMemory 按“消息条数”裁剪，不是按“轮数”裁剪。
        // 所以这里把 maxRounds 转成 maxRounds * 2，表示 user + assistant 为一组完整轮次。
        this.chatMemory = MessageWindowChatMemory.builder()
            .maxMessages(Math.max(2, maxRounds * 2))
            .build();
    }

    /**
     * 发起一轮带滑动窗口记忆的对话。
     * <p>
     * 调用过程可以拆成三步：
     * 1. 先根据 sessionId 取出该会话已有的历史消息。
     * 2. 再通过 Advisor 自动把历史消息拼到本轮 Prompt 前面。
     * 3. 调用结束后，Spring AI 会自动把本轮 user / assistant 消息写回 memory。
     */
    public MemoryChatResponse chat(String sessionId, String question) {
        String normalizedSessionId = MemoryPromptSupport.normalizeSessionId(sessionId, DEFAULT_SESSION_ID);
        // 这里先拿“调用前”的历史，是为了估算本轮请求真正发给模型的大致 Token 体积。
        List<Message> historyBeforeCall = this.chatMemory.get(normalizedSessionId);

        String answer = this.chatClientBuilder.build()
            .prompt()
            .system(this.systemPrompt)
            // MessageChatMemoryAdvisor 会在请求前取历史，在响应后把回答追加回去。
            .advisors(MessageChatMemoryAdvisor.builder(this.chatMemory)
                .conversationId(normalizedSessionId)
                .build())
            .user(question)
            .call()
            .content();

        List<Message> historyAfterCall = this.chatMemory.get(normalizedSessionId);
        // 这里只估算“输入”大小，不包含模型输出 Token。
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

    /**
     * 查看某个会话当前窗口里还剩下哪些消息。
     * <p>
     * 演示时这个接口很有用，因为它能直接证明最老的消息已经被窗口挤出去了。
     */
    public MemoryChatResponse snapshot(String sessionId) {
        String normalizedSessionId = MemoryPromptSupport.normalizeSessionId(sessionId, DEFAULT_SESSION_ID);
        List<Message> messages = this.chatMemory.get(normalizedSessionId);
        return new MemoryChatResponse(
            "sliding-window",
            normalizedSessionId,
            "",
            "",
            0,
            "",
            0,
            MemoryPromptSupport.toViews(messages)
        );
    }

    /**
     * 清理某个会话的窗口数据。
     */
    public void clear(String sessionId) {
        this.chatMemory.clear(MemoryPromptSupport.normalizeSessionId(sessionId, DEFAULT_SESSION_ID));
    }

}
```

这里有个很实用的小细节，很多人第一次接触到 Spring AI 记忆都会忽略的问题：

- `MessageWindowChatMemory` 控制的是**消息条数**
- 但我们平时聊“保留 3 轮”，说的是 **3 组 user + assistant**

所以示例里才会写 `maxRounds * 2`。这样当配置 `3` 的时候，真正保留的是最近 3 轮完整问答，而不是最近 3 条零散消息。

:::tip 和生产环境的适配
这里不是把历史先手动拼成一个 `List<Map<String, Object>>` 再发请求，而是直接交给 Spring AI 的 `Advisor` 体系去处理。
后面如果想把内存存储换成 JDBC、Redis，或者接入别的 ChatMemoryRepository，迁移成本会低很多。
:::

### 对应接口调用示例

对应接口：

- `GET /memory/sliding-window/chat`
- `GET /memory/sessions/{sessionId}`

#### 滑动窗口模式：第一次对话

```bash
# 滑动窗口模式：第一次对话
curl "http://localhost:8091/memory/sliding-window/chat?sessionId=demo-memory-001&question=Spring Bean 的作用域有哪些？"
```

结果：
```json
{
  "strategy": "sliding-window",
  "sessionId": "demo-memory-001",
  "question": "Spring Bean 的作用域有哪些？",
  "answer": "Spring Bean 的作用域是指 Spring 容器中实例化的 Bean 的生命周期和可见性范围。Spring 提供了五种内置的作用域，分别是 Singleton、Prototype、Request、Session 和 GlobalSession。下面逐一介绍：\n\n1. **Singleton（单例）**：这是默认的作用域，每个 Spring 容器中只存在一个单例 Bean 的实例。应用启动时将会初始化这个实例，并且在整个应用生命周期中都将使用这个实例。这种作用域适用于那些共享状态的 Bean，但不适合多线程环境。\n\n2. **Prototype（原型）**：每次从容器中获取该 Bean 的实例时，都会创建一个新的实例。这意味着每次调用容器的 `getBean` 方法来获取这个 Bean 的实例时，都会返回一个新的实例。这种作用域适用于需要每次创建都得到不同状态的 Bean 的场景。\n\n3. **Request（请求）**：在基于 Web 的应用中有效，一个 HTTP 请求会创建一个 Bean 实例，每次请求都会创建一个新的实例，请求结束后该实例会被销毁。这种作用域通常与 Spring MVC 中的控制器相关联。\n\n4. **Session（会话）**：与用户的会话相关联。当用户访问 Web 应用时，一个会话开始，当用户离开时，会话结束。容器会在一个会话开始时创建一个 Bean 实例，并在会话结束时销毁该实例。这种作用域适用于需要在用户会话中保持状态的场景。\n\n5. **GlobalSession（全局会话）**：主要用于 WebSphere 中，作用范围与 `Session` 相同，但在 WebSphere 框架下提供更高级的功能。这种作用域需要特定的框架支持。\n\n在实际应用中，根据不同的需求选择合适的作用域是关键。例如，对于那些需要在整个应用中共享状态的组件，可以使用 `Singleton`；对于那些需要每次请求都创建新实例的组件，可以使用 `Prototype`。在 Web 应用中，`Request` 和 `Session` 作用域根据应用需求进行选择。\n\n这些作用域不仅影响 Bean 的生命周期，还影响其可访问性和配置。在配置 Bean 时，可以通过 `@Scope` 注解来指定作用域，或者在 XML 配置文件中使用 `<bean>` 元素的 `scope` 属性来设置。",
  "estimatedPromptTokens": 138,
  "summary": "",
  "compressionCount": 0,
  "memoryMessages": [
    {
      "role": "user",
      "content": "Spring Bean 的作用域有哪些？"
    },
    {
      "role": "assistant",
      "content": "Spring Bean 的作用域是指 Spring 容器中实例化的 Bean 的生命周期和可见性范围。Spring 提供了五种内置的作用域，分别是 Singleton、Prototype、Request、Session 和 GlobalSession。下面逐一介绍：\n\n1. **Singleton（单例）**：这是默认的作用域，每个 Spring 容器中只存在一个单例 Bean 的实例。应用启动时将会初始化这个实例，并且在整个应用生命周期中都将使用这个实例。这种作用域适用于那些共享状态的 Bean，但不适合多线程环境。\n\n2. **Prototype（原型）**：每次从容器中获取该 Bean 的实例时，都会创建一个新的实例。这意味着每次调用容器的 `getBean` 方法来获取这个 Bean 的实例时，都会返回一个新的实例。这种作用域适用于需要每次创建都得到不同状态的 Bean 的场景。\n\n3. **Request（请求）**：在基于 Web 的应用中有效，一个 HTTP 请求会创建一个 Bean 实例，每次请求都会创建一个新的实例，请求结束后该实例会被销毁。这种作用域通常与 Spring MVC 中的控制器相关联。\n\n4. **Session（会话）**：与用户的会话相关联。当用户访问 Web 应用时，一个会话开始，当用户离开时，会话结束。容器会在一个会话开始时创建一个 Bean 实例，并在会话结束时销毁该实例。这种作用域适用于需要在用户会话中保持状态的场景。\n\n5. **GlobalSession（全局会话）**：主要用于 WebSphere 中，作用范围与 `Session` 相同，但在 WebSphere 框架下提供更高级的功能。这种作用域需要特定的框架支持。\n\n在实际应用中，根据不同的需求选择合适的作用域是关键。例如，对于那些需要在整个应用中共享状态的组件，可以使用 `Singleton`；对于那些需要每次请求都创建新实例的组件，可以使用 `Prototype`。在 Web 应用中，`Request` 和 `Session` 作用域根据应用需求进行选择。\n\n这些作用域不仅影响 Bean 的生命周期，还影响其可访问性和配置。在配置 Bean 时，可以通过 `@Scope` 注解来指定作用域，或者在 XML 配置文件中使用 `<bean>` 元素的 `scope` 属性来设置。"
    }
  ]
}
```

#### 滑动窗口模式：第二次对话

```bash
# 滑动窗口模式：第二次对话
curl "http://localhost:8091/memory/sliding-window/chat?sessionId=demo-memory-001&question=那它默认是哪一种？"
```

结果：
```json
{
    "strategy": "sliding-window",
    "sessionId": "demo-memory-001",
    "question": "那它默认是哪一种？",
    "answer": "在 Spring 容器中，默认的作用域是 **Singleton**。这意味着当你在 Spring 配置文件或使用注解配置 Bean 时，如果没有明确指定作用域，Spring 会默认将 Bean 的作用域设置为 `Singleton`。\n\n具体来说，Spring 会自动创建一个单例实例，并在整个应用的生命周期中使用这个实例。这种默认设置适用于大多数情况下，特别是那些不需要每个请求或会话都重新创建实例的场景。\n\n例如，如果你在配置文件中定义一个 Bean 而没有指定 `scope` 属性，Spring 会将其默认为 `Singleton`。\n\n```xml\n<!-- XML 配置文件中默认作用域 -->\n<bean id=\"exampleBean\" class=\"com.example.ExampleBean\"/>\n```\n\n或者使用注解配置：\n\n```java\n// 使用 @Component 注解，默认作用域为 Singleton\n@Component\npublic class ExampleBean {\n    // Bean 实现\n}\n```\n\n如果你需要其他的作用域，可以在配置文件或注解中显式指定：\n\n```xml\n<!-- 指定作用域为 Prototype -->\n<bean id=\"exampleBean\" class=\"com.example.ExampleBean\" scope=\"prototype\"/>\n```\n\n```java\n// 指定作用域为 Prototype\n@Bean\n@Scope(\"prototype\")\npublic ExampleBean exampleBean() {\n    return new ExampleBean();\n}\n```\n\n通过明确指定作用域，你可以更好地控制 Bean 的生命周期和实例化方式，从而更好地满足应用的需求。",
    "estimatedPromptTokens": 1075,
    "summary": "",
    "compressionCount": 0,
    "memoryMessages": [
        {
            "role": "user",
            "content": "Spring Bean 的作用域有哪些？"
        },
        {
            "role": "assistant",
            "content": "Spring Bean 的作用域是指 Spring 容器中实例化的 Bean 的生命周期和可见性范围。Spring 提供了五种内置的作用域，分别是 Singleton、Prototype、Request、Session 和 GlobalSession。下面逐一介绍：\n\n1. **Singleton（单例）**：这是默认的作用域，每个 Spring 容器中只存在一个单例 Bean 的实例。应用启动时将会初始化这个实例，并且在整个应用生命周期中都将使用这个实例。这种作用域适用于那些共享状态的 Bean，但不适合多线程环境。\n\n2. **Prototype（原型）**：每次从容器中获取该 Bean 的实例时，都会创建一个新的实例。这意味着每次调用容器的 `getBean` 方法来获取这个 Bean 的实例时，都会返回一个新的实例。这种作用域适用于需要每次创建都得到不同状态的 Bean 的场景。\n\n3. **Request（请求）**：在基于 Web 的应用中有效，一个 HTTP 请求会创建一个 Bean 实例，每次请求都会创建一个新的实例，请求结束后该实例会被销毁。这种作用域通常与 Spring MVC 中的控制器相关联。\n\n4. **Session（会话）**：与用户的会话相关联。当用户访问 Web 应用时，一个会话开始，当用户离开时，会话结束。容器会在一个会话开始时创建一个 Bean 实例，并在会话结束时销毁该实例。这种作用域适用于需要在用户会话中保持状态的场景。\n\n5. **GlobalSession（全局会话）**：主要用于 WebSphere 中，作用范围与 `Session` 相同，但在 WebSphere 框架下提供更高级的功能。这种作用域需要特定的框架支持。\n\n在实际应用中，根据不同的需求选择合适的作用域是关键。例如，对于那些需要在整个应用中共享状态的组件，可以使用 `Singleton`；对于那些需要每次请求都创建新实例的组件，可以使用 `Prototype`。在 Web 应用中，`Request` 和 `Session` 作用域根据应用需求进行选择。\n\n这些作用域不仅影响 Bean 的生命周期，还影响其可访问性和配置。在配置 Bean 时，可以通过 `@Scope` 注解来指定作用域，或者在 XML 配置文件中使用 `<bean>` 元素的 `scope` 属性来设置。"
        },
        {
            "role": "user",
            "content": "那它默认是哪一种？"
        },
        {
            "role": "assistant",
            "content": "在 Spring 容器中，默认的作用域是 **Singleton**。这意味着当你在 Spring 配置文件或使用注解配置 Bean 时，如果没有明确指定作用域，Spring 会默认将 Bean 的作用域设置为 `Singleton`。\n\n具体来说，Spring 会自动创建一个单例实例，并在整个应用的生命周期中使用这个实例。这种默认设置适用于大多数情况下，特别是那些不需要每个请求或会话都重新创建实例的场景。\n\n例如，如果你在配置文件中定义一个 Bean 而没有指定 `scope` 属性，Spring 会将其默认为 `Singleton`。\n\n```xml\n<!-- XML 配置文件中默认作用域 -->\n<bean id=\"exampleBean\" class=\"com.example.ExampleBean\"/>\n```\n\n或者使用注解配置：\n\n```java\n// 使用 @Component 注解，默认作用域为 Singleton\n@Component\npublic class ExampleBean {\n    // Bean 实现\n}\n```\n\n如果你需要其他的作用域，可以在配置文件或注解中显式指定：\n\n```xml\n<!-- 指定作用域为 Prototype -->\n<bean id=\"exampleBean\" class=\"com.example.ExampleBean\" scope=\"prototype\"/>\n```\n\n```java\n// 指定作用域为 Prototype\n@Bean\n@Scope(\"prototype\")\npublic ExampleBean exampleBean() {\n    return new ExampleBean();\n}\n```\n\n通过明确指定作用域，你可以更好地控制 Bean 的生命周期和实例化方式，从而更好地满足应用的需求。"
        }
    ]
}
```

#### 滑动窗口模式：第三次对话

```bash
# 滑动窗口模式：第三次对话
curl "http://localhost:8091/memory/sliding-window/chat?sessionId=demo-memory-001&question=如果是 singleton，在并发下会不会有线程安全问题？"
```

结果：
```json
{
    "strategy": "sliding-window",
    "sessionId": "demo-memory-001",
    "question": "如果是 singleton，在并发下会不会有线程安全问题？",
    "answer": "在 Spring 中，`Singleton` 是默认的作用域。当一个 Bean 被配置为 `Singleton` 时，Spring 容器在整个应用的生命周期中只会创建一个实例，并且所有对该 Bean 的访问都会使用这个唯一的实例。\n\n然而，即使 Bean 是 `Singleton`，其线程安全性依然需要根据具体情况来判断。具体来说，线程安全性取决于 Bean 中的代码是否能够安全地被多个线程同时访问。以下是一些关键点：\n\n1. **不可变对象**：如果 Bean 是一个不可变对象（即对象的状态在创建后不会改变，并且所有方法都是 `final` 和 `synchronized`），那么它是线程安全的。不可变对象中的状态是不可变的，因此不会因为多个线程同时访问而产生冲突。\n\n2. **线程安全的集合和数据结构**：如果 Bean 中使用了线程安全的集合和数据结构（如 `Collections.synchronizedList()` 或 `ConcurrentHashMap`），那么这些集合和数据结构可以在多线程环境中安全地使用。\n\n3. **同步方法和代码块**：如果 Bean 中的方法或代码块使用了 `synchronized` 关键字进行同步，那么这些方法或代码块可以确保在同一时间只有一个线程在执行。但这种方式可能会影响性能。\n\n4. **内部状态的管理**：如果 Bean 中有共享的可变状态（即状态可以在多个线程之间共享和修改），那么必须确保这些状态的访问和修改是线程安全的。通常可以通过以下方式来实现：\n   - 使用 `synchronized` 方法或代码块。\n   - 使用 `volatile` 关键字确保可见性。\n   - 使用 `java.util.concurrent` 包中的原子类（如 `AtomicInteger`）。\n   - 使用线程安全的集合和数据结构。\n\n### 示例代码\n\n以下是一个简单的 `Singleton` Bean 示例，展示了如何确保线程安全：\n\n```java\nimport java.util.concurrent.atomic.AtomicInteger;\n\npublic class SafeCounter {\n    private final AtomicInteger count = new AtomicInteger(0);\n\n    public int increment() {\n        return count.incrementAndGet();\n    }\n\n    public int getValue() {\n        return count.get();\n    }\n}\n```\n\n在这个示例中，`AtomicInteger` 是线程安全的，因此 `increment` 和 `getValue` 方法都是线程安全的。\n\n### 总结\n\n- **默认作用域**：`Singleton` 是 Spring 的默认作用域。\n- **线程安全性**：即使 Bean 是 `Singleton`，其线程安全性仍需根据具体实现来判断。\n- **实现线程安全**：可以通过使用线程安全的集合、同步方法、原子类等方法来确保线程安全。\n\n如果你有具体的代码示例或场景，可以进一步讨论如何实现线程安全。",
    "estimatedPromptTokens": 1608,
    "summary": "",
    "compressionCount": 0,
    "memoryMessages": [
        {
            "role": "user",
            "content": "Spring Bean 的作用域有哪些？"
        },
        {
            "role": "assistant",
            "content": "Spring Bean 的作用域是指 Spring 容器中实例化的 Bean 的生命周期和可见性范围。Spring 提供了五种内置的作用域，分别是 Singleton、Prototype、Request、Session 和 GlobalSession。下面逐一介绍：\n\n1. **Singleton（单例）**：这是默认的作用域，每个 Spring 容器中只存在一个单例 Bean 的实例。应用启动时将会初始化这个实例，并且在整个应用生命周期中都将使用这个实例。这种作用域适用于那些共享状态的 Bean，但不适合多线程环境。\n\n2. **Prototype（原型）**：每次从容器中获取该 Bean 的实例时，都会创建一个新的实例。这意味着每次调用容器的 `getBean` 方法来获取这个 Bean 的实例时，都会返回一个新的实例。这种作用域适用于需要每次创建都得到不同状态的 Bean 的场景。\n\n3. **Request（请求）**：在基于 Web 的应用中有效，一个 HTTP 请求会创建一个 Bean 实例，每次请求都会创建一个新的实例，请求结束后该实例会被销毁。这种作用域通常与 Spring MVC 中的控制器相关联。\n\n4. **Session（会话）**：与用户的会话相关联。当用户访问 Web 应用时，一个会话开始，当用户离开时，会话结束。容器会在一个会话开始时创建一个 Bean 实例，并在会话结束时销毁该实例。这种作用域适用于需要在用户会话中保持状态的场景。\n\n5. **GlobalSession（全局会话）**：主要用于 WebSphere 中，作用范围与 `Session` 相同，但在 WebSphere 框架下提供更高级的功能。这种作用域需要特定的框架支持。\n\n在实际应用中，根据不同的需求选择合适的作用域是关键。例如，对于那些需要在整个应用中共享状态的组件，可以使用 `Singleton`；对于那些需要每次请求都创建新实例的组件，可以使用 `Prototype`。在 Web 应用中，`Request` 和 `Session` 作用域根据应用需求进行选择。\n\n这些作用域不仅影响 Bean 的生命周期，还影响其可访问性和配置。在配置 Bean 时，可以通过 `@Scope` 注解来指定作用域，或者在 XML 配置文件中使用 `<bean>` 元素的 `scope` 属性来设置。"
        },
        {
            "role": "user",
            "content": "那它默认是哪一种？"
        },
        {
            "role": "assistant",
            "content": "在 Spring 容器中，默认的作用域是 **Singleton**。这意味着当你在 Spring 配置文件或使用注解配置 Bean 时，如果没有明确指定作用域，Spring 会默认将 Bean 的作用域设置为 `Singleton`。\n\n具体来说，Spring 会自动创建一个单例实例，并在整个应用的生命周期中使用这个实例。这种默认设置适用于大多数情况下，特别是那些不需要每个请求或会话都重新创建实例的场景。\n\n例如，如果你在配置文件中定义一个 Bean 而没有指定 `scope` 属性，Spring 会将其默认为 `Singleton`。\n\n```xml\n<!-- XML 配置文件中默认作用域 -->\n<bean id=\"exampleBean\" class=\"com.example.ExampleBean\"/>\n```\n\n或者使用注解配置：\n\n```java\n// 使用 @Component 注解，默认作用域为 Singleton\n@Component\npublic class ExampleBean {\n    // Bean 实现\n}\n```\n\n如果你需要其他的作用域，可以在配置文件或注解中显式指定：\n\n```xml\n<!-- 指定作用域为 Prototype -->\n<bean id=\"exampleBean\" class=\"com.example.ExampleBean\" scope=\"prototype\"/>\n```\n\n```java\n// 指定作用域为 Prototype\n@Bean\n@Scope(\"prototype\")\npublic ExampleBean exampleBean() {\n    return new ExampleBean();\n}\n```\n\n通过明确指定作用域，你可以更好地控制 Bean 的生命周期和实例化方式，从而更好地满足应用的需求。"
        },
        {
            "role": "user",
            "content": "如果是 singleton，在并发下会不会有线程安全问题？"
        },
        {
            "role": "assistant",
            "content": "在 Spring 中，`Singleton` 是默认的作用域。当一个 Bean 被配置为 `Singleton` 时，Spring 容器在整个应用的生命周期中只会创建一个实例，并且所有对该 Bean 的访问都会使用这个唯一的实例。\n\n然而，即使 Bean 是 `Singleton`，其线程安全性依然需要根据具体情况来判断。具体来说，线程安全性取决于 Bean 中的代码是否能够安全地被多个线程同时访问。以下是一些关键点：\n\n1. **不可变对象**：如果 Bean 是一个不可变对象（即对象的状态在创建后不会改变，并且所有方法都是 `final` 和 `synchronized`），那么它是线程安全的。不可变对象中的状态是不可变的，因此不会因为多个线程同时访问而产生冲突。\n\n2. **线程安全的集合和数据结构**：如果 Bean 中使用了线程安全的集合和数据结构（如 `Collections.synchronizedList()` 或 `ConcurrentHashMap`），那么这些集合和数据结构可以在多线程环境中安全地使用。\n\n3. **同步方法和代码块**：如果 Bean 中的方法或代码块使用了 `synchronized` 关键字进行同步，那么这些方法或代码块可以确保在同一时间只有一个线程在执行。但这种方式可能会影响性能。\n\n4. **内部状态的管理**：如果 Bean 中有共享的可变状态（即状态可以在多个线程之间共享和修改），那么必须确保这些状态的访问和修改是线程安全的。通常可以通过以下方式来实现：\n   - 使用 `synchronized` 方法或代码块。\n   - 使用 `volatile` 关键字确保可见性。\n   - 使用 `java.util.concurrent` 包中的原子类（如 `AtomicInteger`）。\n   - 使用线程安全的集合和数据结构。\n\n### 示例代码\n\n以下是一个简单的 `Singleton` Bean 示例，展示了如何确保线程安全：\n\n```java\nimport java.util.concurrent.atomic.AtomicInteger;\n\npublic class SafeCounter {\n    private final AtomicInteger count = new AtomicInteger(0);\n\n    public int increment() {\n        return count.incrementAndGet();\n    }\n\n    public int getValue() {\n        return count.get();\n    }\n}\n```\n\n在这个示例中，`AtomicInteger` 是线程安全的，因此 `increment` 和 `getValue` 方法都是线程安全的。\n\n### 总结\n\n- **默认作用域**：`Singleton` 是 Spring 的默认作用域。\n- **线程安全性**：即使 Bean 是 `Singleton`，其线程安全性仍需根据具体实现来判断。\n- **实现线程安全**：可以通过使用线程安全的集合、同步方法、原子类等方法来确保线程安全。\n\n如果你有具体的代码示例或场景，可以进一步讨论如何实现线程安全。"
        }
    ]
}
```

#### 查看当前会话记忆

```bash
# 查看滑动窗口当前还保留了哪些消息
curl "http://localhost:8091/memory/sessions/demo-memory-001"
```

结果：
```json
{
  "sessionId": "demo-memory-001",
  "slidingWindow": {
    "strategy": "sliding-window",
    "sessionId": "demo-memory-001",
    "question": "",
    "answer": "",
    "estimatedPromptTokens": 0,
    "summary": "",
    "compressionCount": 0,
    "memoryMessages": [
      {
        "role": "user",
        "content": "Spring Bean 的作用域有哪些？"
      },
      {
        "role": "assistant",
        "content": "Spring Bean 的作用域是指 Spring 容器中实例化的 Bean 的生命周期和可见性范围。Spring 提供了五种内置的作用域，分别是 Singleton、Prototype、Request、Session 和 GlobalSession。下面逐一介绍：\n\n1. **Singleton（单例）**：这是默认的作用域，每个 Spring 容器中只存在一个单例 Bean 的实例。应用启动时将会初始化这个实例，并且在整个应用生命周期中都将使用这个实例。这种作用域适用于那些共享状态的 Bean，但不适合多线程环境。\n\n2. **Prototype（原型）**：每次从容器中获取该 Bean 的实例时，都会创建一个新的实例。这意味着每次调用容器的 `getBean` 方法来获取这个 Bean 的实例时，都会返回一个新的实例。这种作用域适用于需要每次创建都得到不同状态的 Bean 的场景。\n\n3. **Request（请求）**：在基于 Web 的应用中有效，一个 HTTP 请求会创建一个 Bean 实例，每次请求都会创建一个新的实例，请求结束后该实例会被销毁。这种作用域通常与 Spring MVC 中的控制器相关联。\n\n4. **Session（会话）**：与用户的会话相关联。当用户访问 Web 应用时，一个会话开始，当用户离开时，会话结束。容器会在一个会话开始时创建一个 Bean 实例，并在会话结束时销毁该实例。这种作用域适用于需要在用户会话中保持状态的场景。\n\n5. **GlobalSession（全局会话）**：主要用于 WebSphere 中，作用范围与 `Session` 相同，但在 WebSphere 框架下提供更高级的功能。这种作用域需要特定的框架支持。\n\n在实际应用中，根据不同的需求选择合适的作用域是关键。例如，对于那些需要在整个应用中共享状态的组件，可以使用 `Singleton`；对于那些需要每次请求都创建新实例的组件，可以使用 `Prototype`。在 Web 应用中，`Request` 和 `Session` 作用域根据应用需求进行选择。\n\n这些作用域不仅影响 Bean 的生命周期，还影响其可访问性和配置。在配置 Bean 时，可以通过 `@Scope` 注解来指定作用域，或者在 XML 配置文件中使用 `<bean>` 元素的 `scope` 属性来设置。"
      },
      {
        "role": "user",
        "content": "那它默认是哪一种？"
      },
      {
        "role": "assistant",
        "content": "在 Spring 容器中，默认的作用域是 **Singleton**。这意味着当你在 Spring 配置文件或使用注解配置 Bean 时，如果没有明确指定作用域，Spring 会默认将 Bean 的作用域设置为 `Singleton`。\n\n具体来说，Spring 会自动创建一个单例实例，并在整个应用的生命周期中使用这个实例。这种默认设置适用于大多数情况下，特别是那些不需要每个请求或会话都重新创建实例的场景。\n\n例如，如果你在配置文件中定义一个 Bean 而没有指定 `scope` 属性，Spring 会将其默认为 `Singleton`。\n\n```xml\n<!-- XML 配置文件中默认作用域 -->\n<bean id=\"exampleBean\" class=\"com.example.ExampleBean\"/>\n```\n\n或者使用注解配置：\n\n```java\n// 使用 @Component 注解，默认作用域为 Singleton\n@Component\npublic class ExampleBean {\n    // Bean 实现\n}\n```\n\n如果你需要其他的作用域，可以在配置文件或注解中显式指定：\n\n```xml\n<!-- 指定作用域为 Prototype -->\n<bean id=\"exampleBean\" class=\"com.example.ExampleBean\" scope=\"prototype\"/>\n```\n\n```java\n// 指定作用域为 Prototype\n@Bean\n@Scope(\"prototype\")\npublic ExampleBean exampleBean() {\n    return new ExampleBean();\n}\n```\n\n通过明确指定作用域，你可以更好地控制 Bean 的生命周期和实例化方式，从而更好地满足应用的需求。"
      },
      {
        "role": "user",
        "content": "如果是 singleton，在并发下会不会有线程安全问题？"
      },
      {
        "role": "assistant",
        "content": "在 Spring 中，`Singleton` 是默认的作用域。当一个 Bean 被配置为 `Singleton` 时，Spring 容器在整个应用的生命周期中只会创建一个实例，并且所有对该 Bean 的访问都会使用这个唯一的实例。\n\n然而，即使 Bean 是 `Singleton`，其线程安全性依然需要根据具体情况来判断。具体来说，线程安全性取决于 Bean 中的代码是否能够安全地被多个线程同时访问。以下是一些关键点：\n\n1. **不可变对象**：如果 Bean 是一个不可变对象（即对象的状态在创建后不会改变，并且所有方法都是 `final` 和 `synchronized`），那么它是线程安全的。不可变对象中的状态是不可变的，因此不会因为多个线程同时访问而产生冲突。\n\n2. **线程安全的集合和数据结构**：如果 Bean 中使用了线程安全的集合和数据结构（如 `Collections.synchronizedList()` 或 `ConcurrentHashMap`），那么这些集合和数据结构可以在多线程环境中安全地使用。\n\n3. **同步方法和代码块**：如果 Bean 中的方法或代码块使用了 `synchronized` 关键字进行同步，那么这些方法或代码块可以确保在同一时间只有一个线程在执行。但这种方式可能会影响性能。\n\n4. **内部状态的管理**：如果 Bean 中有共享的可变状态（即状态可以在多个线程之间共享和修改），那么必须确保这些状态的访问和修改是线程安全的。通常可以通过以下方式来实现：\n   - 使用 `synchronized` 方法或代码块。\n   - 使用 `volatile` 关键字确保可见性。\n   - 使用 `java.util.concurrent` 包中的原子类（如 `AtomicInteger`）。\n   - 使用线程安全的集合和数据结构。\n\n### 示例代码\n\n以下是一个简单的 `Singleton` Bean 示例，展示了如何确保线程安全：\n\n```java\nimport java.util.concurrent.atomic.AtomicInteger;\n\npublic class SafeCounter {\n    private final AtomicInteger count = new AtomicInteger(0);\n\n    public int increment() {\n        return count.incrementAndGet();\n    }\n\n    public int getValue() {\n        return count.get();\n    }\n}\n```\n\n在这个示例中，`AtomicInteger` 是线程安全的，因此 `increment` 和 `getValue` 方法都是线程安全的。\n\n### 总结\n\n- **默认作用域**：`Singleton` 是 Spring 的默认作用域。\n- **线程安全性**：即使 Bean 是 `Singleton`，其线程安全性仍需根据具体实现来判断。\n- **实现线程安全**：可以通过使用线程安全的集合、同步方法、原子类等方法来确保线程安全。\n\n如果你有具体的代码示例或场景，可以进一步讨论如何实现线程安全。"
      }
    ]
  },
  "summaryCompression": {
    "strategy": "summary-compression",
    "sessionId": "demo-memory-001",
    "question": "",
    "answer": "",
    "estimatedPromptTokens": 0,
    "summary": "",
    "compressionCount": 0,
    "memoryMessages": []
  }
}
```

### 实现三：摘要压缩记忆管理器

滑动窗口已经够解决不少问题了，但它的短板也很明显：窗口外的内容会直接消失。  

摘要压缩记忆的思路是：

- 正常对话仍然维护最近几轮完整消息
- 一旦最近消息的 Token 粗估超过阈值，就把更早的部分拿出来做摘要
- 摘要本身放进下一轮请求的 `SystemMessage`
- 最近几轮完整消息继续保留，保证模型对当前追问仍然敏感

```java
public class SummaryCompressionMemoryChatService {

    private static final String DEFAULT_SESSION_ID = "summary-memory-demo";

    private static final String SUMMARY_SYSTEM_PROMPT = """
        你是一个会话压缩助手。
        你的任务不是回答业务问题，而是把历史对话整理成下一轮还能继续接话的背景摘要。
        重点保留：
        1. 用户真正关心的主题和目标。
        2. 关键技术细节、版本、报错和结论。
        3. 已经排除的方案，以及还没解决的问题。
        忽略寒暄、重复确认和无关闲聊。
        直接输出摘要正文，不要加标题，不要输出 Markdown。
        """;

    private final ChatModel chatModel;
    private final String systemPrompt;
    private final int tokenThreshold;
    private final int keepRecentRounds;
    private final Map<String, SummaryConversationState> sessionStore = new ConcurrentHashMap<>();

    public SummaryCompressionMemoryChatService(
        ChatModel chatModel,
        @Value("${app.ai.memory.default-system-prompt}") String systemPrompt,
        @Value("${app.ai.memory.summary.token-threshold:700}") int tokenThreshold,
        @Value("${app.ai.memory.summary.keep-recent-rounds:2}") int keepRecentRounds) {
        this.chatModel = chatModel;
        this.systemPrompt = systemPrompt;
        this.tokenThreshold = tokenThreshold;
        this.keepRecentRounds = keepRecentRounds;
    }

    /**
     * 发起一轮带摘要压缩记忆的对话。
     * <p>
     * 整体流程如下：
     * 1. 先把 system prompt、历史摘要、最近几轮原始对话、本轮问题组装成 Prompt。
     * 2. 调模型拿到回答后，把本轮 user / assistant 原文先写入 recentMessages。
     * 3. 如果 recentMessages 太长，就把更早的部分压缩成新的 summary。
     */
    public MemoryChatResponse chat(String sessionId, String question) {
        String normalizedSessionId = MemoryPromptSupport.normalizeSessionId(sessionId, DEFAULT_SESSION_ID);
        SummaryConversationState state = this.sessionStore.computeIfAbsent(normalizedSessionId,
            key -> new SummaryConversationState());

        // 同一个 sessionId 下可能被连续调用，所以这里对单个会话状态做串行保护，
        // 避免摘要和 recentMessages 在并发演示时互相覆盖。
        synchronized (state) {
            List<Message> promptMessages = buildPromptMessages(state, question);
            String answer = MemoryPromptSupport.extractText(this.chatModel.call(new Prompt(promptMessages)));

            // 先保留原始问答，后面再根据阈值判断是否需要压缩。
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

    /**
     * 查看某个会话当前的摘要和最近保留消息。
     */
    public MemoryChatResponse snapshot(String sessionId) {
        String normalizedSessionId = MemoryPromptSupport.normalizeSessionId(sessionId, DEFAULT_SESSION_ID);
        SummaryConversationState state = this.sessionStore.get(normalizedSessionId);
        if (state == null) {
            return new MemoryChatResponse("summary-compression", normalizedSessionId, "", "", 0, "", 0, List.of());
        }
        synchronized (state) {
            return new MemoryChatResponse(
                "summary-compression",
                normalizedSessionId,
                "",
                "",
                0,
                state.summary,
                state.compressionCount,
                MemoryPromptSupport.toViews(state.recentMessages)
            );
        }
    }

    /**
     * 清空指定会话的摘要和最近消息。
     */
    public void clear(String sessionId) {
        this.sessionStore.remove(MemoryPromptSupport.normalizeSessionId(sessionId, DEFAULT_SESSION_ID));
    }

    /**
     * 组装本轮真正送给模型的消息列表。
     * <p>
     * 顺序非常关键：
     * 1. system prompt 先告诉模型它是谁、应该怎么回答。
     * 2. 如果有摘要，作为额外 system message 注入，给模型补上长期背景。
     * 3. recentMessages 保留最近几轮完整细节。
     * 4. 最后追加当前用户问题。
     */
    private List<Message> buildPromptMessages(SummaryConversationState state, String question) {
        List<Message> messages = new ArrayList<>();
        messages.add(new SystemMessage(this.systemPrompt));
        if (!state.summary.isBlank()) {
            messages.add(new SystemMessage("【历史摘要】" + state.summary));
        }
        messages.addAll(state.recentMessages);
        messages.add(new UserMessage(question));
        return messages;
    }

    /**
     * 判断是否需要把更早的对话压缩成摘要。
     * <p>
     * 这里用的是“粗略 Token 估算”而不是精确 tokenizer，原因很简单：
     * 这是演示项目，重点是把策略行为展示清楚，不需要为了精确计数把示例写复杂。
     */
    private void compressIfNecessary(SummaryConversationState state) {
        if (MemoryPromptSupport.estimateTokens(state.recentMessages) <= this.tokenThreshold) {
            return;
        }

        // keepRecentRounds 代表要保留多少轮完整问答，所以这里同样按 2 倍消息数换算。
        int keepCount = Math.max(2, this.keepRecentRounds * 2);
        if (state.recentMessages.size() <= keepCount) {
            return;
        }

        // overflowMessages 是“要被压缩成摘要”的那一段较早历史。
        List<Message> overflowMessages = new ArrayList<>(
            state.recentMessages.subList(0, state.recentMessages.size() - keepCount)
        );
        // recentMessages 则是继续保留原文的最近几轮内容。
        List<Message> recentMessages = new ArrayList<>(
            state.recentMessages.subList(state.recentMessages.size() - keepCount, state.recentMessages.size())
        );

        state.summary = mergeSummary(state.summary, overflowMessages);
        state.recentMessages.clear();
        state.recentMessages.addAll(recentMessages);
        state.compressionCount++;
    }

    /**
     * 把已有摘要和新溢出的历史对话合并成一个新的摘要。
     * <p>
     * 这样做的好处是：摘要不会无限增长，而是每次都重新折叠成一段更紧凑的背景说明。
     */
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
            """.formatted(
            existingSummary.isBlank() ? "暂无" : existingSummary,
            MemoryPromptSupport.toTranscript(overflowMessages)
        );

        List<Message> summaryMessages = List.of(
            new SystemMessage(SUMMARY_SYSTEM_PROMPT),
            new UserMessage(summaryPrompt)
        );
        return MemoryPromptSupport.extractText(this.chatModel.call(new Prompt(summaryMessages)));
    }

    /**
     * 单个会话的内存状态。
     * <p>
     * summary 负责保留长期背景，recentMessages 负责保留短期细节。
     * compressionCount 主要是给演示用的，方便观察摘要到底触发了几次。
     */
    private static final class SummaryConversationState {

        private String summary = "";
        private int compressionCount = 0;
        private final List<Message> recentMessages = new ArrayList<>();

    }

}
```

这版跟前面的滑动窗口有个明显区别：

- 滑动窗口主要依赖 Spring AI 自带的 `ChatMemory`
- 摘要压缩更像是在 Spring AI 之上自定义一层“记忆编排逻辑”

这也是实际项目里很常见的做法。不是所有东西都要硬套框架现成类，有时候最稳的办法就是：

- **消息结构** 用 Spring AI 原生 `Message`
- **请求发起** 用 Spring AI 原生 `Prompt` / `ChatModel`
- **压缩规则** 自己按业务写

### 对应接口调用示例

对应接口：

- `GET /memory/summary/chat`
- `GET /memory/sessions/{sessionId}`

#### 摘要压缩模式：第一次对话

```bash
# 摘要压缩模式：第一次对话
curl "http://localhost:8091/memory/summary/chat?sessionId=demo-summary-001&question=Spring Bean 的作用域有哪些？"
```

结果：
```json
{
  "strategy": "summary-compression",
  "sessionId": "demo-summary-001",
  "question": "Spring Bean 的作用域有哪些？",
  "answer": "Spring Bean 的作用域决定了 Spring 容器在多长时间内以及在多少个请求中保持 Bean 的单例状态。Spring 容器中定义了五种作用域，分别是：\n\n1. **singleton（单例）**：这是默认的作用域，Spring 容器在容器的生命周期内只会创建一个 Bean 的实例。同一个 Bean 的名字在整个容器中只会被实例化一次。\n\n2. **prototype（原型）**：每次请求这个 Bean 时，都会创建一个新的实例，也就是说，Spring 容器会为每个请求返回一个新的 Bean 实例。\n\n3. **request（请求）**：在 Web 应用程序中，Spring 会为每个 HTTP 请求创建一个新的 Bean 实例，并且在请求结束后销毁该实例。也就是说，每个用户请求都会有一个独立的 Bean 实例。\n\n4. **session（会话）**：在 Web 应用程序中，Spring 会为每个 HTTP Session 创建一个新的 Bean 实例，并且在会话结束时销毁该实例。也就是说，每个用户会话都会有一个独立的 Bean 实例。\n\n5. **global-session（全局会话）**：此作用域仅在基于portlet的环境中生效，Spring 会为每个全局会话创建一个新的 Bean 实例，并在全局会话结束时销毁该实例。\n\n在实际工程中，开发者通常会根据应用的需求选择合适的作用域。例如当 Bean 中包含大量状态信息时，可能会选择 `prototype` 作用域；而当多个请求需要共享一个资源时，会选择 `singleton` 作用域。",
  "estimatedPromptTokens": 138,
  "summary": "",
  "compressionCount": 0,
  "memoryMessages": [
    {
      "role": "user",
      "content": "Spring Bean 的作用域有哪些？"
    },
    {
      "role": "assistant",
      "content": "Spring Bean 的作用域决定了 Spring 容器在多长时间内以及在多少个请求中保持 Bean 的单例状态。Spring 容器中定义了五种作用域，分别是：\n\n1. **singleton（单例）**：这是默认的作用域，Spring 容器在容器的生命周期内只会创建一个 Bean 的实例。同一个 Bean 的名字在整个容器中只会被实例化一次。\n\n2. **prototype（原型）**：每次请求这个 Bean 时，都会创建一个新的实例，也就是说，Spring 容器会为每个请求返回一个新的 Bean 实例。\n\n3. **request（请求）**：在 Web 应用程序中，Spring 会为每个 HTTP 请求创建一个新的 Bean 实例，并且在请求结束后销毁该实例。也就是说，每个用户请求都会有一个独立的 Bean 实例。\n\n4. **session（会话）**：在 Web 应用程序中，Spring 会为每个 HTTP Session 创建一个新的 Bean 实例，并且在会话结束时销毁该实例。也就是说，每个用户会话都会有一个独立的 Bean 实例。\n\n5. **global-session（全局会话）**：此作用域仅在基于portlet的环境中生效，Spring 会为每个全局会话创建一个新的 Bean 实例，并在全局会话结束时销毁该实例。\n\n在实际工程中，开发者通常会根据应用的需求选择合适的作用域。例如当 Bean 中包含大量状态信息时，可能会选择 `prototype` 作用域；而当多个请求需要共享一个资源时，会选择 `singleton` 作用域。"
    }
  ]
}
```

#### 摘要压缩模式：第二次对话

```bash
# 摘要压缩模式：第二次对话
curl "http://localhost:8091/memory/summary/chat?sessionId=demo-summary-001&question=默认用的是哪一种？"
```

结果：
```json
{
  "strategy": "summary-compression",
  "sessionId": "demo-summary-001",
  "question": "那它默认是哪一种？",
  "answer": "你提到的“它”指的是 Spring Bean 的默认作用域。Spring Bean 的默认作用域是 `singleton`，也就是说，如果没有显式地指定 Bean 的作用域，Spring 容器会默认将 Bean 的作用域设置为 `singleton`。\n\n具体来说，当你在配置文件（如 `applicationContext.xml`）中定义一个 Bean 时，如果没有提供 `scope` 属性，Spring 会自动将其作用域设置为 `singleton`。例如：\n\n```xml\n<bean id=\"myBean\" class=\"com.example.MyBean\"/>\n```\n\n在这个例子中，`myBean` 的默认作用域是 `singleton`。\n\n如果你需要定义其他的作用域，可以在 `bean` 元素中明确指定 `scope` 属性。例如：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\"/>\n```\n\n在这个例子中，`myPrototypeBean` 的作用域被显式地设置为 `prototype`。\n\n在实际开发中，选择合适的作用域可以有效管理 Bean 的生命周期和资源的使用。",
  "estimatedPromptTokens": 756,
  "summary": "",
  "compressionCount": 0,
  "memoryMessages": [
    {
      "role": "user",
      "content": "Spring Bean 的作用域有哪些？"
    },
    {
      "role": "assistant",
      "content": "Spring Bean 的作用域决定了 Spring 容器在多长时间内以及在多少个请求中保持 Bean 的单例状态。Spring 容器中定义了五种作用域，分别是：\n\n1. **singleton（单例）**：这是默认的作用域，Spring 容器在容器的生命周期内只会创建一个 Bean 的实例。同一个 Bean 的名字在整个容器中只会被实例化一次。\n\n2. **prototype（原型）**：每次请求这个 Bean 时，都会创建一个新的实例，也就是说，Spring 容器会为每个请求返回一个新的 Bean 实例。\n\n3. **request（请求）**：在 Web 应用程序中，Spring 会为每个 HTTP 请求创建一个新的 Bean 实例，并且在请求结束后销毁该实例。也就是说，每个用户请求都会有一个独立的 Bean 实例。\n\n4. **session（会话）**：在 Web 应用程序中，Spring 会为每个 HTTP Session 创建一个新的 Bean 实例，并且在会话结束时销毁该实例。也就是说，每个用户会话都会有一个独立的 Bean 实例。\n\n5. **global-session（全局会话）**：此作用域仅在基于portlet的环境中生效，Spring 会为每个全局会话创建一个新的 Bean 实例，并在全局会话结束时销毁该实例。\n\n在实际工程中，开发者通常会根据应用的需求选择合适的作用域。例如当 Bean 中包含大量状态信息时，可能会选择 `prototype` 作用域；而当多个请求需要共享一个资源时，会选择 `singleton` 作用域。"
    },
    {
      "role": "user",
      "content": "那它默认是哪一种？"
    },
    {
      "role": "assistant",
      "content": "你提到的“它”指的是 Spring Bean 的默认作用域。Spring Bean 的默认作用域是 `singleton`，也就是说，如果没有显式地指定 Bean 的作用域，Spring 容器会默认将 Bean 的作用域设置为 `singleton`。\n\n具体来说，当你在配置文件（如 `applicationContext.xml`）中定义一个 Bean 时，如果没有提供 `scope` 属性，Spring 会自动将其作用域设置为 `singleton`。例如：\n\n```xml\n<bean id=\"myBean\" class=\"com.example.MyBean\"/>\n```\n\n在这个例子中，`myBean` 的默认作用域是 `singleton`。\n\n如果你需要定义其他的作用域，可以在 `bean` 元素中明确指定 `scope` 属性。例如：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\"/>\n```\n\n在这个例子中，`myPrototypeBean` 的作用域被显式地设置为 `prototype`。\n\n在实际开发中，选择合适的作用域可以有效管理 Bean 的生命周期和资源的使用。"
    }
  ]
}
```

#### 摘要压缩模式：第三次对话
```bash
# 摘要压缩模式：第三次对话
curl "http://localhost:8091/memory/summary/chat?sessionId=demo-summary-001&question=那它在并发下会不会有线程安全问题？"
```

结果：
```json
{
  "strategy": "summary-compression",
  "sessionId": "demo-summary-001",
  "question": "那它在并发下会不会有线程安全问题？",
  "answer": "在并发环境下，Spring Bean 的作用域对线程安全性有直接影响。具体来说：\n\n1. **singleton（单例）**：\n   - **线程安全性**：默认的 `singleton` 作用域在多线程环境下是线程安全的，因为 Spring 容器在整个应用的生命周期内只会创建一个 Bean 实例。\n   - **原理**：由于只有一个实例，所以不需要进行线程同步或其他额外的线程安全处理。\n   - **工程落地**：在大多数情况下，`singleton` 作用域是线程安全的，但如果你的 Bean 包含了共享状态或不可变对象，可以使用 `final` 关键字保证不可变性。\n\n2. **prototype（原型）**：\n   - **线程安全性**：每次请求该 Bean 时，Spring 容器都会创建一个新的实例，因此每个线程都会有一个独立的实例。因此，默认情况下，`prototype` 作用域的 Bean 是线程安全的。\n   - **原理**：每个线程都有自己的 Bean 实例，因此不存在共享状态的问题。\n   - **工程落地**：虽然默认情况下 `prototype` 作用域是线程安全的，但如果你的 Bean 包含了共享状态或不可变对象，也需要进行相应的线程安全处理。\n\n3. **request（请求）**：\n   - **线程安全性**：在 Web 应用中，每个 HTTP 请求都会创建一个新的 Bean 实例，因此每个请求都有独立的 Bean 实例。\n   - **原理**：每个请求都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n4. **session（会话）**：\n   - **线程安全性**：在 Web 应用中，每个 HTTP Session 都会创建一个新的 Bean 实例，因此每个会话都有独立的 Bean 实例。\n   - **原理**：每个会话都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n5. **global-session（全局会话）**：\n   - **线程安全性**：在基于 Portlet 的环境中，每个全局会话都会创建一个新的 Bean 实例，因此每个全局会话都有独立的 Bean 实例。\n   - **原理**：每个全局会话都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n### 总结\n- **`singleton` 作用域**：默认的线程安全，但需要注意 Bean 中的共享状态。\n- **`prototype` 作用域**：默认线程安全，因为每次请求都会创建新的实例。\n- **`request`、`session` 和 `global-session` 作用域**：默认线程安全，因为每个请求、会话或全局会话都会创建新的实例。\n\n在实际工程中，如果需要确保 Bean 的线程安全性，可以考虑以下几点：\n- 使用 `final` 关键字保证 Bean 的不可变性。\n- 使用线程安全的数据结构和容器。\n- 避免在 Bean 中持有共享状态，或确保共享状态在多线程环境下的安全访问。",
  "estimatedPromptTokens": 1130,
  "summary": "Spring Bean 的作用域包括 singleton（单例）、prototype（原型）、request（请求）、session（会话）和 global-session（全局会话）。singleton 是默认作用域，容器在整个生命周期中只创建一个实例。prototype 每次请求都会创建新的实例。request 和 session 分别在 HTTP 请求和会话生命周期内创建和销毁实例。global-session 仅在基于portlet的环境中为每个全局会话创建实例。开发者需根据应用需求选择合适的作用域，如状态信息丰富的场景可能使用 prototype，共享资源则可能用 singleton。",
  "compressionCount": 1,
  "memoryMessages": [
    {
      "role": "user",
      "content": "那它默认是哪一种？"
    },
    {
      "role": "assistant",
      "content": "你提到的“它”指的是 Spring Bean 的默认作用域。Spring Bean 的默认作用域是 `singleton`，也就是说，如果没有显式地指定 Bean 的作用域，Spring 容器会默认将 Bean 的作用域设置为 `singleton`。\n\n具体来说，当你在配置文件（如 `applicationContext.xml`）中定义一个 Bean 时，如果没有提供 `scope` 属性，Spring 会自动将其作用域设置为 `singleton`。例如：\n\n```xml\n<bean id=\"myBean\" class=\"com.example.MyBean\"/>\n```\n\n在这个例子中，`myBean` 的默认作用域是 `singleton`。\n\n如果你需要定义其他的作用域，可以在 `bean` 元素中明确指定 `scope` 属性。例如：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\"/>\n```\n\n在这个例子中，`myPrototypeBean` 的作用域被显式地设置为 `prototype`。\n\n在实际开发中，选择合适的作用域可以有效管理 Bean 的生命周期和资源的使用。"
    },
    {
      "role": "user",
      "content": "那它在并发下会不会有线程安全问题？"
    },
    {
      "role": "assistant",
      "content": "在并发环境下，Spring Bean 的作用域对线程安全性有直接影响。具体来说：\n\n1. **singleton（单例）**：\n   - **线程安全性**：默认的 `singleton` 作用域在多线程环境下是线程安全的，因为 Spring 容器在整个应用的生命周期内只会创建一个 Bean 实例。\n   - **原理**：由于只有一个实例，所以不需要进行线程同步或其他额外的线程安全处理。\n   - **工程落地**：在大多数情况下，`singleton` 作用域是线程安全的，但如果你的 Bean 包含了共享状态或不可变对象，可以使用 `final` 关键字保证不可变性。\n\n2. **prototype（原型）**：\n   - **线程安全性**：每次请求该 Bean 时，Spring 容器都会创建一个新的实例，因此每个线程都会有一个独立的实例。因此，默认情况下，`prototype` 作用域的 Bean 是线程安全的。\n   - **原理**：每个线程都有自己的 Bean 实例，因此不存在共享状态的问题。\n   - **工程落地**：虽然默认情况下 `prototype` 作用域是线程安全的，但如果你的 Bean 包含了共享状态或不可变对象，也需要进行相应的线程安全处理。\n\n3. **request（请求）**：\n   - **线程安全性**：在 Web 应用中，每个 HTTP 请求都会创建一个新的 Bean 实例，因此每个请求都有独立的 Bean 实例。\n   - **原理**：每个请求都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n4. **session（会话）**：\n   - **线程安全性**：在 Web 应用中，每个 HTTP Session 都会创建一个新的 Bean 实例，因此每个会话都有独立的 Bean 实例。\n   - **原理**：每个会话都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n5. **global-session（全局会话）**：\n   - **线程安全性**：在基于 Portlet 的环境中，每个全局会话都会创建一个新的 Bean 实例，因此每个全局会话都有独立的 Bean 实例。\n   - **原理**：每个全局会话都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n### 总结\n- **`singleton` 作用域**：默认的线程安全，但需要注意 Bean 中的共享状态。\n- **`prototype` 作用域**：默认线程安全，因为每次请求都会创建新的实例。\n- **`request`、`session` 和 `global-session` 作用域**：默认线程安全，因为每个请求、会话或全局会话都会创建新的实例。\n\n在实际工程中，如果需要确保 Bean 的线程安全性，可以考虑以下几点：\n- 使用 `final` 关键字保证 Bean 的不可变性。\n- 使用线程安全的数据结构和容器。\n- 避免在 Bean 中持有共享状态，或确保共享状态在多线程环境下的安全访问。"
    }
  ]
}
```

#### 摘要压缩模式：第四次对话

```bash
# 摘要压缩模式：第四次对话
curl "http://localhost:8091/memory/summary/chat?sessionId=demo-summary-001&question=如果换成 prototype，还会走完整生命周期回调吗？"
```

结果：
```json
{
  "strategy": "summary-compression",
  "sessionId": "demo-summary-001",
  "question": "如果换成 prototype，还会走完整生命周期回调吗？",
  "answer": "在 Spring 中，`prototype` 作用域的 Bean 每次请求时都会创建一个新的实例。因此，`prototype` 作用域的 Bean 不会走 Spring 容器中默认的生命周期回调方法（如 `init-method` 和 `destroy-method`），除非你在每次创建实例时显式地调用相关方法。\n\n### 生命周期回调方法\nSpring 提供了 `init-method` 和 `destroy-method` 属性，用于指定在 Bean 初始化和销毁时调用的方法。这些方法通常用于执行初始化和清理工作。\n\n#### `init-method`\n`init-method` 指定在 Bean 创建并初始化后调用的方法。例如：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\" init-method=\"init\"/>\n```\n\n#### `destroy-method`\n`destroy-method` 指定在 Bean 被销毁前调用的方法。例如：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\" destroy-method=\"destroy\"/>\n```\n\n### 工程落地\n当你使用 `prototype` 作用域时，每次创建新的 Bean 实例时，Spring 会调用相应的 `init-method` 方法（如果定义了）。因此，如果你需要在每次创建实例时执行初始化操作，可以在配置文件中指定 `init-method`。\n\n例如，假设你有一个 `MyBean` 类，你需要在创建实例时执行初始化操作：\n\n```java\npublic class MyBean {\n    public void init() {\n        // 初始化操作\n        System.out.println(\"Initializing MyBean\");\n    }\n\n    // 其他代码\n}\n```\n\n在 XML 配置文件中，你可以这样配置：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\" init-method=\"init\"/>\n```\n\n### 总结\n- **`prototype` 作用域**：每次请求都会创建一个新的实例，不会自动走生命周期回调方法，但可以通过 `init-method` 和 `destroy-method` 手动指定在每次创建和销毁实例时调用的方法。\n- **`init-method` 和 `destroy-method`**：在每次创建或销毁 `prototype` 作用域的 Bean 时，可以通过这些属性手动调用相应的初始化和销毁方法。\n\n这样，你可以在每次创建 `prototype` 作用域的 Bean 时执行必要的初始化工作，确保 Bean 在每次使用时处于正确的状态。",
  "estimatedPromptTokens": 1928,
  "summary": "Spring Bean 的作用域包括 singleton（默认作用域，容器在整个生命周期中只创建一个实例）、prototype（每次请求都会创建新的实例）、request（HTTP 请求内创建和销毁实例）、session（会话生命周期内创建和销毁实例）和 global-session（基于portlet环境中为每个全局会话创建实例）。开发者需根据应用需求选择合适的作用域，如状态信息丰富的场景可能使用 prototype，共享资源则可能用 singleton。默认情况下，Spring Bean 的作用域是 singleton。若需定义其他作用域，如 prototype，需要在配置文件中明确指定 `scope` 属性。",
  "compressionCount": 2,
  "memoryMessages": [
    {
      "role": "user",
      "content": "那它在并发下会不会有线程安全问题？"
    },
    {
      "role": "assistant",
      "content": "在并发环境下，Spring Bean 的作用域对线程安全性有直接影响。具体来说：\n\n1. **singleton（单例）**：\n   - **线程安全性**：默认的 `singleton` 作用域在多线程环境下是线程安全的，因为 Spring 容器在整个应用的生命周期内只会创建一个 Bean 实例。\n   - **原理**：由于只有一个实例，所以不需要进行线程同步或其他额外的线程安全处理。\n   - **工程落地**：在大多数情况下，`singleton` 作用域是线程安全的，但如果你的 Bean 包含了共享状态或不可变对象，可以使用 `final` 关键字保证不可变性。\n\n2. **prototype（原型）**：\n   - **线程安全性**：每次请求该 Bean 时，Spring 容器都会创建一个新的实例，因此每个线程都会有一个独立的实例。因此，默认情况下，`prototype` 作用域的 Bean 是线程安全的。\n   - **原理**：每个线程都有自己的 Bean 实例，因此不存在共享状态的问题。\n   - **工程落地**：虽然默认情况下 `prototype` 作用域是线程安全的，但如果你的 Bean 包含了共享状态或不可变对象，也需要进行相应的线程安全处理。\n\n3. **request（请求）**：\n   - **线程安全性**：在 Web 应用中，每个 HTTP 请求都会创建一个新的 Bean 实例，因此每个请求都有独立的 Bean 实例。\n   - **原理**：每个请求都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n4. **session（会话）**：\n   - **线程安全性**：在 Web 应用中，每个 HTTP Session 都会创建一个新的 Bean 实例，因此每个会话都有独立的 Bean 实例。\n   - **原理**：每个会话都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n5. **global-session（全局会话）**：\n   - **线程安全性**：在基于 Portlet 的环境中，每个全局会话都会创建一个新的 Bean 实例，因此每个全局会话都有独立的 Bean 实例。\n   - **原理**：每个全局会话都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n### 总结\n- **`singleton` 作用域**：默认的线程安全，但需要注意 Bean 中的共享状态。\n- **`prototype` 作用域**：默认线程安全，因为每次请求都会创建新的实例。\n- **`request`、`session` 和 `global-session` 作用域**：默认线程安全，因为每个请求、会话或全局会话都会创建新的实例。\n\n在实际工程中，如果需要确保 Bean 的线程安全性，可以考虑以下几点：\n- 使用 `final` 关键字保证 Bean 的不可变性。\n- 使用线程安全的数据结构和容器。\n- 避免在 Bean 中持有共享状态，或确保共享状态在多线程环境下的安全访问。"
    },
    {
      "role": "user",
      "content": "如果换成 prototype，还会走完整生命周期回调吗？"
    },
    {
      "role": "assistant",
      "content": "在 Spring 中，`prototype` 作用域的 Bean 每次请求时都会创建一个新的实例。因此，`prototype` 作用域的 Bean 不会走 Spring 容器中默认的生命周期回调方法（如 `init-method` 和 `destroy-method`），除非你在每次创建实例时显式地调用相关方法。\n\n### 生命周期回调方法\nSpring 提供了 `init-method` 和 `destroy-method` 属性，用于指定在 Bean 初始化和销毁时调用的方法。这些方法通常用于执行初始化和清理工作。\n\n#### `init-method`\n`init-method` 指定在 Bean 创建并初始化后调用的方法。例如：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\" init-method=\"init\"/>\n```\n\n#### `destroy-method`\n`destroy-method` 指定在 Bean 被销毁前调用的方法。例如：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\" destroy-method=\"destroy\"/>\n```\n\n### 工程落地\n当你使用 `prototype` 作用域时，每次创建新的 Bean 实例时，Spring 会调用相应的 `init-method` 方法（如果定义了）。因此，如果你需要在每次创建实例时执行初始化操作，可以在配置文件中指定 `init-method`。\n\n例如，假设你有一个 `MyBean` 类，你需要在创建实例时执行初始化操作：\n\n```java\npublic class MyBean {\n    public void init() {\n        // 初始化操作\n        System.out.println(\"Initializing MyBean\");\n    }\n\n    // 其他代码\n}\n```\n\n在 XML 配置文件中，你可以这样配置：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\" init-method=\"init\"/>\n```\n\n### 总结\n- **`prototype` 作用域**：每次请求都会创建一个新的实例，不会自动走生命周期回调方法，但可以通过 `init-method` 和 `destroy-method` 手动指定在每次创建和销毁实例时调用的方法。\n- **`init-method` 和 `destroy-method`**：在每次创建或销毁 `prototype` 作用域的 Bean 时，可以通过这些属性手动调用相应的初始化和销毁方法。\n\n这样，你可以在每次创建 `prototype` 作用域的 Bean 时执行必要的初始化工作，确保 Bean 在每次使用时处于正确的状态。"
    }
  ]
}
```

#### 查看当前会话记忆

```bash
# 查看摘要压缩模式下的摘要和最近消息
curl "http://localhost:8091/memory/sessions/demo-summary-001"
```

```json
{
  "sessionId": "demo-summary-001",
  "slidingWindow": {
    "strategy": "sliding-window",
    "sessionId": "demo-summary-001",
    "question": "",
    "answer": "",
    "estimatedPromptTokens": 0,
    "summary": "",
    "compressionCount": 0,
    "memoryMessages": []
  },
  "summaryCompression": {
    "strategy": "summary-compression",
    "sessionId": "demo-summary-001",
    "question": "",
    "answer": "",
    "estimatedPromptTokens": 0,
    "summary": "Spring Bean 的作用域包括 singleton（默认作用域，容器在整个生命周期中只创建一个实例）、prototype（每次请求都会创建新的实例）、request（HTTP 请求内创建和销毁实例）、session（会话生命周期内创建和销毁实例）和 global-session（基于portlet环境中为每个全局会话创建实例）。开发者需根据应用需求选择合适的作用域，如状态信息丰富的场景可能使用 prototype，共享资源则可能用 singleton。默认情况下，Spring Bean 的作用域是 singleton。若需定义其他作用域，如 prototype，需要在配置文件中明确指定 `scope` 属性。",
    "compressionCount": 2,
    "memoryMessages": [
      {
        "role": "user",
        "content": "那它在并发下会不会有线程安全问题？"
      },
      {
        "role": "assistant",
        "content": "在并发环境下，Spring Bean 的作用域对线程安全性有直接影响。具体来说：\n\n1. **singleton（单例）**：\n   - **线程安全性**：默认的 `singleton` 作用域在多线程环境下是线程安全的，因为 Spring 容器在整个应用的生命周期内只会创建一个 Bean 实例。\n   - **原理**：由于只有一个实例，所以不需要进行线程同步或其他额外的线程安全处理。\n   - **工程落地**：在大多数情况下，`singleton` 作用域是线程安全的，但如果你的 Bean 包含了共享状态或不可变对象，可以使用 `final` 关键字保证不可变性。\n\n2. **prototype（原型）**：\n   - **线程安全性**：每次请求该 Bean 时，Spring 容器都会创建一个新的实例，因此每个线程都会有一个独立的实例。因此，默认情况下，`prototype` 作用域的 Bean 是线程安全的。\n   - **原理**：每个线程都有自己的 Bean 实例，因此不存在共享状态的问题。\n   - **工程落地**：虽然默认情况下 `prototype` 作用域是线程安全的，但如果你的 Bean 包含了共享状态或不可变对象，也需要进行相应的线程安全处理。\n\n3. **request（请求）**：\n   - **线程安全性**：在 Web 应用中，每个 HTTP 请求都会创建一个新的 Bean 实例，因此每个请求都有独立的 Bean 实例。\n   - **原理**：每个请求都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n4. **session（会话）**：\n   - **线程安全性**：在 Web 应用中，每个 HTTP Session 都会创建一个新的 Bean 实例，因此每个会话都有独立的 Bean 实例。\n   - **原理**：每个会话都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n5. **global-session（全局会话）**：\n   - **线程安全性**：在基于 Portlet 的环境中，每个全局会话都会创建一个新的 Bean 实例，因此每个全局会话都有独立的 Bean 实例。\n   - **原理**：每个全局会话都有自己的 Bean 实例，因此线程安全。\n   - **工程落地**：无需特别处理线程安全问题。\n\n### 总结\n- **`singleton` 作用域**：默认的线程安全，但需要注意 Bean 中的共享状态。\n- **`prototype` 作用域**：默认线程安全，因为每次请求都会创建新的实例。\n- **`request`、`session` 和 `global-session` 作用域**：默认线程安全，因为每个请求、会话或全局会话都会创建新的实例。\n\n在实际工程中，如果需要确保 Bean 的线程安全性，可以考虑以下几点：\n- 使用 `final` 关键字保证 Bean 的不可变性。\n- 使用线程安全的数据结构和容器。\n- 避免在 Bean 中持有共享状态，或确保共享状态在多线程环境下的安全访问。"
      },
      {
        "role": "user",
        "content": "如果换成 prototype，还会走完整生命周期回调吗？"
      },
      {
        "role": "assistant",
        "content": "在 Spring 中，`prototype` 作用域的 Bean 每次请求时都会创建一个新的实例。因此，`prototype` 作用域的 Bean 不会走 Spring 容器中默认的生命周期回调方法（如 `init-method` 和 `destroy-method`），除非你在每次创建实例时显式地调用相关方法。\n\n### 生命周期回调方法\nSpring 提供了 `init-method` 和 `destroy-method` 属性，用于指定在 Bean 初始化和销毁时调用的方法。这些方法通常用于执行初始化和清理工作。\n\n#### `init-method`\n`init-method` 指定在 Bean 创建并初始化后调用的方法。例如：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\" init-method=\"init\"/>\n```\n\n#### `destroy-method`\n`destroy-method` 指定在 Bean 被销毁前调用的方法。例如：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\" destroy-method=\"destroy\"/>\n```\n\n### 工程落地\n当你使用 `prototype` 作用域时，每次创建新的 Bean 实例时，Spring 会调用相应的 `init-method` 方法（如果定义了）。因此，如果你需要在每次创建实例时执行初始化操作，可以在配置文件中指定 `init-method`。\n\n例如，假设你有一个 `MyBean` 类，你需要在创建实例时执行初始化操作：\n\n```java\npublic class MyBean {\n    public void init() {\n        // 初始化操作\n        System.out.println(\"Initializing MyBean\");\n    }\n\n    // 其他代码\n}\n```\n\n在 XML 配置文件中，你可以这样配置：\n\n```xml\n<bean id=\"myPrototypeBean\" class=\"com.example.MyBean\" scope=\"prototype\" init-method=\"init\"/>\n```\n\n### 总结\n- **`prototype` 作用域**：每次请求都会创建一个新的实例，不会自动走生命周期回调方法，但可以通过 `init-method` 和 `destroy-method` 手动指定在每次创建和销毁实例时调用的方法。\n- **`init-method` 和 `destroy-method`**：在每次创建或销毁 `prototype` 作用域的 Bean 时，可以通过这些属性手动调用相应的初始化和销毁方法。\n\n这样，你可以在每次创建 `prototype` 作用域的 Bean 时执行必要的初始化工作，确保 Bean 在每次使用时处于正确的状态。"
      }
    ]
  }
}
```

### 效果对比：三种策略同时演示

在示例模块里又添加了一个专门的对比服务，可以直接用固定的脚本把三种策略同时执行一遍。  
这个脚本还是拿“连续追问 Spring Bean 作用域”做例子，因为这个场景特别适合观察记忆策略差异：

- 第 2 轮开始出现“它”这种指代
- 中间会继续追问线程安全、生命周期
- 最后一轮又回到第一轮最早的话题

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

### 三种策略同时演示对应接口调用示例

这个接口返回的 JSON 里会把每一轮的三种回答都列出来，另外还会带上：

- 滑动窗口最终保留下来的消息列表
- 摘要压缩最终留下的最近消息
- 当前摘要内容
- 摘要一共触发了几次压缩

:::warning
这个接口调用的耗时非常长，需要耐心等待！
:::

调用接口

```http
GET http://localhost:8091/memory/compare
```

结果：
```json
{
    "scriptName": "Spring Bean 作用域六轮追问",
    "turns": [
        {
            "round": 1,
            "question": "Spring Bean 的作用域有哪些？",
            "noMemoryAnswer": "Spring Bean 的作用域定义了在应用生命周期中一个 Bean 的实例会被创建和共享的范围。Spring 定义了五种作用域，分别是 singleton、prototype、request、session 和 global-session。下面分别介绍这些作用域的含义和应用场景：\n\n1. **singleton**（单例）：这是默认的作用域，Spring 会在应用中创建一个 Bean 的实例，该实例在整个应用的生命周期中都被共享。这适用于那些需要保持一致状态的 Bean，比如 Service 层的 Bean。\n\n2. **prototype**（原型）：每次请求该 Bean 的实例时，都会创建一个新的实例。适用于那些不需要共享状态，或者每次都需要不同状态的场景，比如创建临时对象。\n\n3. **request**：在一次 HTTP 请求中，每次都会创建一个新的 Bean 实例，适用于需要在每次请求中保持独立状态的场景。这种作用域通常用于 Web MVC 应用中的 Controller。\n\n4. **session**：在一次 HTTP 会话中，每次请求都会共享同一个 Bean 实例，适用于需要在同一次会话中保持状态的场景，比如用户会话信息。\n\n5. **global-session**：这是一种较新的作用域（在 Spring 5.0 中引入），仅在 FacesContext 存在时有效。它与 session 作用域类似，但在某些特定的 Java 框架中使用，如 JSF。\n\n在工程上，选择合适的作用域取决于实际业务逻辑需要。例如，如果你的应用中需要全局的配置信息，通常会选择 singleton 作用域；如果你的应用中有需要独立状态的对象，可以选择 prototype 作用域。正确选择 Bean 的作用域可以提高应用的性能和安全性。",
            "slidingWindowAnswer": "Spring 中 Bean 的作用域主要分为以下几个：\n\n1. **singleton（单例）**：这是默认的作用域，Spring 容器中只会存在一个共享的 Bean 实例。单例 Bean 在应用启动时就会被创建，适用于任何需要共享状态的场景。例如，数据库连接池、缓存管理器等都是单例的。\n\n2. **prototype（原型）**：每次请求该 Bean 的实例时，Spring 容器都会创建一个新的实例。适用于需要每次创建时都有不同状态的场景，比如每次请求时需要创建一个新的对象来处理请求。\n\n3. **request（请求）**：在基于 Web 的应用中，每个 HTTP 请求都会获得一个新的 Bean 实例，适合于根据请求动态生成对象的场景。一般用于处理 HTTP 请求范围内的属性。\n\n4. **session（会话）**：在基于 Web 的应用中，每个 HTTP 会话获得一个新的 Bean 实例，适用于需要在会话范围内存储状态的信息。例如，某些需要在用户会话期间保持状态的数据。\n\n5. **global-session（全局会话）**：这是 Spring MVC 特有的作用域，仅在全局会话存储机制可用时有效。这个作用域主要用于共享数据在集群环境中的多个会话之间。\n\n6. **application（应用级）**：这是 Spring Boot 2.x 引入的作用域，等同于 singleton，但更强调是全局范围，适用于需要在整个应用生命周期中共享的状态。\n\n在工程中，通过 `@Scope` 注解可以指定 Bean 的作用域。例如：\n\n```java\n@Bean\n@Scope(value = \"prototype\")\npublic MyService myService() {\n    return new MyService();\n}\n```\n\n通过配置文件也可以指定 Bean 的作用域：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\" scope=\"singleton\"/>\n```\n\n选择合适的作用域可以优化应用性能和资源使用，避免不必要的资源浪费或状态冲突。",
            "summaryAnswer": "Spring Bean 的作用域是指 Spring 容器如何管理和处理 Bean 的生命周期。Spring 提供了五种内置的作用域：\n\n1. **singleton**（默认）：这是最常用的作用域。Spring 容器只会创建一个共享的 Bean 实例，并在整个应用生命周期中保持这个实例。这意味着对 Bean 的每次请求都会返回同一个实例。\n2. **prototype**：Spring 容器为每个请求都会创建一个新的 Bean 实例，这些实例之间没有关联。\n3. **request**：作用于 Web 应用程序的 Bean。每次 HTTP 请求都会创建一个新的 Bean 实例，该实例仅在当前 HTTP 请求内可见。\n4. **session**：与 request 类似，但作用于 session 的生命周期。适用于 Web 应用程序中的会话范围的 Bean。\n5. **global-session**：仅适用于 WebFlow 的作用域。它与 session 类似，但实现更为复杂，特别是在集群环境中。\n\n在配置 Bean 的作用域时，可以在 XML 配置文件中使用以下标签属性来定义作用域：\n\n- `singleton`：\n  ```xml\n  <bean id=\"exampleBean\" class=\"com.example.ExampleBean\" scope=\"singleton\"/>\n  ```\n\n- `prototype`：\n  ```xml\n  <bean id=\"exampleBean\" class=\"com.example.ExampleBean\" scope=\"prototype\"/>\n  ```\n\n- `request`：\n  ```xml\n  <bean id=\"exampleBean\" class=\"com.example.ExampleBean\" scope=\"request\"/>\n  ```\n\n- `session`：\n  ```xml\n  <bean id=\"exampleBean\" class=\"com.example.ExampleBean\" scope=\"session\"/>\n  ```\n\n- `global-session`：\n  ```xml\n  <bean id=\"exampleBean\" class=\"com.example.ExampleBean\" scope=\"global-session\"/>\n  ```\n\n在 Java 配置中，可以通过 `@Scope` 注解来定义 Bean 的作用域：\n\n```java\n@Configuration\npublic class AppConfig {\n\n    @Bean\n    @Scope(\"singleton\")\n    public ExampleBean exampleBean() {\n        return new ExampleBean();\n    }\n}\n```\n\n选择合适的作用域取决于你的具体需求。例如，如果你需要确保某些数据在多个 HTTP 请求之间保持一致，可以选择 `session` 或 `global-session`。如果你需要为每个 HTTP 请求提供独立的实例，可以选择 `request`。",
            "summarySnapshot": "",
            "summaryCompressionCount": 0
        },
        {
            "round": 2,
            "question": "默认用的是哪一种？",
            "noMemoryAnswer": "在 Java 中，如果你提到“默认”用的是哪一种，需要具体指出是在哪个上下文中。例如，如果你是在问默认的集合框架类型，Java 默认使用的是 `ArrayList` 作为 `List` 接口的实现，而 `HashMap` 作为 `Map` 接口的实现。\n\n如果你是在问线程的默认命名策略或者类加载器的默认实现，那么就需要具体说明。例如，Java 线程的默认名字是“Thread-”加上线程的编号。类加载器的默认实现是双亲委派模型，即先由父类加载器尝试加载，如果父类加载器无法加载，则由当前类加载器尝试加载。\n\n请具体说明你指的是哪个方面，我可以给出更准确的答案。",
            "slidingWindowAnswer": "在 Spring 中，默认的作用域是 `singleton`。这意味着在 Spring 容器中，每个 Bean 类型只会存在一个实例，并且这个实例在整个应用生命周期中都是共享的。\n\n### 原理\n`singleton` 作用域是 Spring 容器默认的行为。当 Spring 容器启动时，它会创建一个共享的 Bean 实例，并且在后续的所有请求中都会返回同一个实例。这种行为有助于优化资源使用，避免为同一个 Bean 创建多个实例带来的开销。\n\n### 工程落地\n在工程中，你可以通过 `@Component`、`@Service`、`@Repository`、`@Controller` 等注解来声明一个 Bean，并且默认情况下它的作用域就是 `singleton`。例如：\n\n```java\n@Service\npublic class MyService {\n    // 实现逻辑\n}\n```\n\n如果需要其他作用域，可以通过 `@Scope` 注解来指定。例如：\n\n```java\n@Bean\n@Scope(value = \"prototype\")\npublic MyService myService() {\n    return new MyService();\n}\n```\n\n或者在配置文件中指定：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\" scope=\"prototype\"/>\n```\n\n### 示例\n假设你有一个服务类 `MyService`，默认情况下它的作用域是 `singleton`：\n\n```java\n@Service\npublic class MyService {\n    public void doSomething() {\n        System.out.println(\"Doing something in MyService\");\n    }\n}\n```\n\n如果你需要每次请求都创建一个新的实例，可以将其作用域改为 `prototype`：\n\n```java\n@Service\n@Scope(value = \"prototype\")\npublic class MyService {\n    public void doSomething() {\n        System.out.println(\"Doing something in MyService\");\n    }\n}\n```\n\n或者在配置文件中指定：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\" scope=\"prototype\"/>\n```\n\n总结来说，默认情况下，Spring 中的 Bean 是 `singleton` 作用域。如果你需要其他作用域，可以通过 `@Scope` 注解或配置文件指定。",
            "summaryAnswer": "默认的作用域是 `singleton`。也就是说，如果你在 Spring 配置中没有显式指定 Bean 的作用域，Spring 会默认将其设置为 `singleton`，即只会创建并保持一个共享的 Bean 实例。\n\n例如，如果你在 XML 配置文件中没有指定任何 `scope` 属性，Spring 会自动将 Bean 的作用域设置为 `singleton`：\n\n```xml\n<bean id=\"exampleBean\" class=\"com.example.ExampleBean\"/>\n```\n\n在 Java 配置中，如果没有使用 `@Scope` 注解指定作用域，Spring 也会默认将其设置为 `singleton`：\n\n```java\n@Configuration\npublic class AppConfig {\n\n    @Bean\n    public ExampleBean exampleBean() {\n        return new ExampleBean();\n    }\n}\n```\n\n在这种情况下，`exampleBean` 是 `singleton` 类型的 Bean，每次请求都会返回同一个实例。\n\n因此，如果在配置文件中没有特别指定，Bean 的默认作用域就是 `singleton`。",
            "summarySnapshot": "",
            "summaryCompressionCount": 0
        },
        {
            "round": 3,
            "question": "那它在并发下会不会有线程安全问题？",
            "noMemoryAnswer": "您提到的“它”没有具体指明是哪个对象或机制，所以我需要先确定具体指的是什么。不过，我可以根据一些常见的并发问题来解释。\n\n1. **变量或数据**：在并发环境下，如果多个线程同时访问和修改同一变量或数据，可能会导致线程安全问题，如数据不一致、脏读、幻读等。解决这类问题的方法包括使用 `synchronized` 关键字、`volatile` 关键字、使用 `java.util.concurrent` 包中的原子类（如 `AtomicInteger`）等。\n\n2. **对象方法**：如果一个对象的方法不是线程安全的，那么在多线程环境下可能也会导致问题。确保方法线程安全的方法包括使用 `synchronized` 方法或块、使用 `final` 关键字等。\n\n3. **数据结构**：某些数据结构如 `ArrayList` 在并发环境下使用时可能会出现线程安全问题，因为它们不是线程安全的。可以考虑使用 `CopyOnWriteArrayList` 或 `ConcurrentHashMap` 等线程安全的数据结构。\n\n4. **自定义同步机制**：如果使用自定义同步机制，需要确保同步逻辑是正确的，避免死锁、活锁等问题。\n\n如果能提供具体是哪个对象或机制，我将能给出更精确的解答。",
            "slidingWindowAnswer": "在并发环境下，`singleton` 作用域的 Bean 由于在整个应用生命周期中只有一个实例，所以在默认情况下是线程安全的。然而，线程安全不仅仅取决于作用域，还与 Bean 实现的具体逻辑有关。我们可以通过以下几个方面来理解这个问题：\n\n### 单例 Bean 的线程安全性\n1. **默认单例 Bean 的线程安全性**：\n   - 默认情况下，`singleton` 作用域的 Bean 是线程安全的，因为只有一个实例在内存中。但是，这不意味着 Bean 实现的逻辑是线程安全的。\n   - 例如，如果你的 `MyService` 中有一些共享状态（如成员变量），这些状态在多线程环境下可能会引起数据竞争和不一致问题。\n\n2. **线程安全的实现**：\n   - **使用线程安全的集合**：例如 `ConcurrentHashMap`、`CopyOnWriteArrayList` 等。\n   - **使用 volatile 关键字**：确保变量的可见性和有序性。\n   - **使用 synchronized 关键字**：确保代码块或方法在多线程环境下的原子性。\n   - **使用 final 关键字**：确保对象的不可变性。\n   - **使用原子类**：例如 `AtomicInteger`、`AtomicLong` 等。\n\n### 工程落地\n以下是一些具体工程上的实现方式：\n\n#### 示例代码\n假设你有一个 `MyService` 类，其中包含一个共享状态的成员变量：\n\n```java\n@Service\npublic class MyService {\n    private int count = 0;\n\n    public void increment() {\n        count++;\n    }\n\n    public int getCount() {\n        return count;\n    }\n}\n```\n\n在多线程环境下，`count` 变量可能会导致数据竞争。为了解决这个问题，你可以使用 `synchronized` 关键字：\n\n```java\n@Service\npublic class MyService {\n    private int count = 0;\n\n    public synchronized void increment() {\n        count++;\n    }\n\n    public synchronized int getCount() {\n        return count;\n    }\n}\n```\n\n或者使用 `AtomicInteger`：\n\n```java\n@Service\npublic class MyService {\n    private AtomicInteger count = new AtomicInteger(0);\n\n    public void increment() {\n        count.incrementAndGet();\n    }\n\n    public int getCount() {\n        return count.get();\n    }\n}\n```\n\n#### 配置文件示例\n在 XML 配置文件中，你可以这样配置：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\" scope=\"singleton\">\n    <property name=\"count\" value=\"0\"/>\n</bean>\n```\n\n### 其他作用域的线程安全性\n对于 `prototype` 作用域的 Bean，每次请求都会创建一个新的实例，因此不存在线程安全的问题，因为每个实例都是独立的，不会共享状态。\n\n### 总结\n默认情况下，`singleton` 作用域的 Bean 是线程安全的，但需要确保 Bean 实现的逻辑是线程安全的。通过使用线程安全的集合、`synchronized` 关键字、`Atomic` 类等可以有效避免线程安全问题。对于 `prototype` 作用域的 Bean，则天然线程安全。",
            "summaryAnswer": "在并发环境下，`singleton` 类型的 Bean 通常不会引发线程安全问题，因为它是共享的，并且在整个应用程序的生命周期中只有一个实例。但是，这取决于 Bean 实例的内容和实现方式。\n\n### 1. 单例模式的线程安全性\n由于 `singleton` 类型的 Bean 是共享的，所以在并发环境下，多个线程可能会同时访问同一个实例。如果实例内部的状态是可变的，并且没有进行适当的线程同步，那么可能会引发线程安全问题。\n\n### 2. 示例\n假设有一个 `singleton` 类型的 Bean，它的状态是可变的：\n\n```java\npublic class SharedCounter {\n    private int count = 0;\n\n    public void increment() {\n        count++;\n    }\n\n    public int getCount() {\n        return count;\n    }\n}\n```\n\n在这个例子中，如果多个线程同时访问 `increment` 方法，可能会导致线程安全问题。为了解决这个问题，需要对 `increment` 方法进行同步：\n\n```java\npublic class ThreadSafeSharedCounter {\n    private int count = 0;\n\n    public synchronized void increment() {\n        count++;\n    }\n\n    public int getCount() {\n        return count;\n    }\n}\n```\n\n### 3. 定制同步策略\n如果你需要在并发环境下确保线程安全，可以使用以下几种方法：\n\n- **同步方法**：使用 `synchronized` 关键字来同步方法。\n- **同步代码块**：使用 `synchronized` 代码块来同步特定的代码段。\n- **使用线程安全的数据结构**：使用 `ConcurrentHashMap`、`ConcurrentLinkedQueue` 等线程安全的数据结构。\n- **使用 volatile 关键字**：如果只需要保证可见性，可以使用 `volatile` 关键字来确保变量的可见性。\n\n### 总结\n`singleton` 类型的 Bean 在并发环境下是共享的，但并不意味着它是线程安全的。如果 Bean 实例的状态是可变的，需要进行适当的线程同步来确保线程安全。通过使用 `synchronized` 关键字、线程安全的数据结构或其他同步机制，可以有效地解决线程安全问题。",
            "summarySnapshot": "Spring Bean 的作用域包括 `singleton`、`prototype`、`request`、`session` 和 `global-session`。`singleton` 是默认作用域，Spring 容器只会创建一个共享实例。`prototype` 则每次请求都会创建新的实例。`request` 和 `session` 分别在 HTTP 请求和会话生命周期内为 Bean 提供作用域。`global-session` 仅适用于 WebFlow，提供更复杂的支持。作用域可以通过 XML 配置文件中的 `scope` 属性或 Java 配置中的 `@Scope` 注解来定义。选择合适的作用域取决于具体需求，如需要数据在多个请求间保持一致时可选用 `session` 或 `global-session`，需为每个请求提供独立实例时选用 `request`。",
            "summaryCompressionCount": 1
        },
        {
            "round": 4,
            "question": "如果换成 prototype，还会走完整生命周期回调吗？",
            "noMemoryAnswer": "在 Java 中，`prototype` 这个词通常不是特指某种设计模式或生命周期管理方式，因此很难直接给出答案。如果你是想问 Java 中某种基于原型模式（Prototype Pattern）的对象创建方式是否还会触发完整生命周期回调，那么可以这样理解：\n\n在 Java 中，原型模式主要用于对象克隆，它不涉及生命周期的管理。原型模式主要关注的是如何克隆一个对象，而不是对象的创建和销毁过程。因此，原型模式中并不会涉及到生命周期回调的处理。\n\n但是，如果你是在问某个框架或库（例如 Spring 框架）中使用原型作用域（prototype scope）时，Spring 会为每个请求创建一个新的实例。虽然 Spring 会处理实例的创建和销毁，但具体到生命周期回调，原型作用域下的对象并不一定会触发像 `init` 和 `destroy` 这样的回调方法，因为这些方法通常是单例作用域（singleton）下的 Bean 所有。\n\n总结一下：\n\n- 如果单纯讨论原型模式，它不会涉及生命周期回调。\n- 如果是在 Spring 框架中使用原型作用域，Spring 会创建新的实例，但不会触发 `init` 和 `destroy` 回调。\n\n如果你指的是其他特定框架或库，请提供更多的上下文。",
            "slidingWindowAnswer": "在 Spring 中，`prototype` 作用域的 Bean 不会走 Spring 容器的完整生命周期回调。具体来说，Spring 容器在初始化 `prototype` 作用域的 Bean 时只会调用相关的方法一次，之后每次请求该 Bean 的实例时都会重新创建一个新的实例。因此，`prototype` 作用域的 Bean 不会经历 `singleton` 作用域 Bean 所有的生命周期回调。\n\n### 生命周期回调\n`singleton` 作用域的 Bean 会在 Spring 容器启动时初始化，并且会经历以下生命周期回调方法：\n\n1. **`init-method`**: 在 Bean 初始化完成后调用。\n2. **`destroy-method`**: 在容器关闭前调用。\n\n例如：\n\n```java\n@Service\n@InitDestroyAnnotation\npublic class MyService {\n    public MyService() {\n        System.out.println(\"MyService constructor\");\n    }\n\n    @PostConstruct\n    public void init() {\n        System.out.println(\"MyService init method\");\n    }\n\n    @PreDestroy\n    public void destroy() {\n        System.out.println(\"MyService destroy method\");\n    }\n}\n```\n\n在 Spring 配置文件中：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\"\n      init-method=\"init\" destroy-method=\"destroy\"/>\n```\n\n### `prototype` 作用域的 Bean\n对于 `prototype` 作用域的 Bean，每次请求都会创建一个新的实例，Spring 容器不会调用 `init-method` 和 `destroy-method`。具体来说：\n\n1. **构造方法**：每次创建实例时都会调用构造方法。\n2. **`@PostConstruct` 方法**：只会在第一次创建实例时调用。\n3. **`@PreDestroy` 方法**：不会被调用，因为每次请求都会创建新的实例。\n\n例如：\n\n```java\n@Service\npublic class MyService {\n    public MyService() {\n        System.out.println(\"MyService constructor\");\n    }\n\n    @PostConstruct\n    public void init() {\n        System.out.println(\"MyService init method\");\n    }\n\n    @PreDestroy\n    public void destroy() {\n        System.out.println(\"MyService destroy method\");\n    }\n}\n```\n\n在 `singleton` 作用域下：\n\n```\nMyService constructor\nMyService init method\n```\n\n在 `prototype` 作用域下：\n\n```\nMyService constructor\nMyService init method\nMyService constructor\nMyService constructor\n```\n\n### 工程落地\n在配置文件中指定 `prototype` 作用域：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\" scope=\"prototype\"/>\n```\n\n或者使用 `@Scope` 注解：\n\n```java\n@Service\n@Scope(value = \"prototype\")\npublic class MyService {\n    public MyService() {\n        System.out.println(\"MyService constructor\");\n    }\n\n    @PostConstruct\n    public void init() {\n        System.out.println(\"MyService init method\");\n    }\n\n    @PreDestroy\n    public void destroy() {\n        System.out.println(\"MyService destroy method\");\n    }\n}\n```\n\n### 总结\n`singleton` 作用域的 Bean 会经历完整的生命周期回调，包括 `init-method` 和 `destroy-method`。而 `prototype` 作用域的 Bean 只在第一次创建时调用 `init-method`，不会调用 `destroy-method`，每次请求都会创建一个新的实例。",
            "summaryAnswer": "在 Spring 中，`prototype` 类型的 Bean 是每次请求都会创建新的实例，并且不会共享。因此，`prototype` 类型的 Bean 不会走 `singleton` 类型 Bean 的生命周期回调方法，如 `init-method` 和 `destroy-method`。\n\n### `singleton` 类型的 Bean 生命周期\n对于 `singleton` 类型的 Bean，Spring 会走以下生命周期回调方法：\n\n1. **`init-method`**：在 Bean 实例化之后初始化之前调用指定的方法。\n2. **`bean-definition` 初始化**：Spring 容器会在实例化 Bean 之后立即调用 `init-method`。\n3. **`bean-definition` 作用域关闭**：当 Spring 容器关闭时，会调用 `destroy-method`。\n\n### `prototype` 类型的 Bean 生命周期\n对于 `prototype` 类型的 Bean，Spring 容器不会对其进行生命周期管理，因此不会调用 `init-method` 和 `destroy-method`。每次请求创建新实例时，只会创建新的 Bean 实例，而不会进行额外的初始化或销毁操作。\n\n### 示例\n假设有一个 `prototype` 类型的 Bean：\n\n```java\n@Configuration\npublic class AppConfig {\n\n    @Bean\n    @Scope(\"prototype\")\n    public MyPrototypeBean myPrototypeBean() {\n        return new MyPrototypeBean();\n    }\n}\n\npublic class MyPrototypeBean {\n    public void init() {\n        System.out.println(\"Prototype Bean initialized\");\n    }\n\n    public void destroy() {\n        System.out.println(\"Prototype Bean destroyed\");\n    }\n}\n```\n\n### 测试代码\n```java\npublic class PrototypeBeanTest {\n\n    @Autowired\n    private ApplicationContext applicationContext;\n\n    @Test\n    public void testPrototypeBean() {\n        MyPrototypeBean bean1 = applicationContext.getBean(MyPrototypeBean.class);\n        MyPrototypeBean bean2 = applicationContext.getBean(MyPrototypeBean.class);\n        MyPrototypeBean bean3 = applicationContext.getBean(MyPrototypeBean.class);\n\n        // 输出结果为：Prototype Bean initialized (只会在第一次创建时输出)\n        //            Prototype Bean initialized (只会在第一次创建时输出)\n        //            Prototype Bean initialized (只会在第一次创建时输出)\n    }\n}\n```\n\n### 结论\n`prototype` 类型的 Bean 不会走 `singleton` 类型 Bean 的生命周期回调方法。每次请求都会创建新的实例，不会调用 `init-method` 和 `destroy-method`。因此，如果你需要在每次创建新实例时执行一些初始化或销毁操作，应该考虑使用 `singleton` 类型的 Bean 并明确指定生命周期回调方法。",
            "summarySnapshot": "Spring Bean 的默认作用域是 `singleton`，即Spring容器会默认创建并保持一个共享实例。可以选择 `prototype`、`request`、`session` 或 `global-session` 作用域，以满足具体需求。例如，`request` 适用于每个HTTP请求都需要独立实例的情况，而`session`和`global-session`适用于需要在会话或WebFlow中保持数据一致性的情况。默认情况下，未指定作用域的Bean会被设置为`singleton`。",
            "summaryCompressionCount": 2
        },
        {
            "round": 5,
            "question": "那在项目里，我该怎么判断一个组件更适合 singleton 还是 prototype？",
            "noMemoryAnswer": "在项目中选择单例模式（Singleton）还是原型模式（Prototype）取决于组件的使用特性以及应用场景。下面我会分别讨论这两种模式的特点以及如何判断何时使用哪种模式。\n\n### 单例模式（Singleton）\n\n**特点：**\n- 确保一个类仅有一个实例，并提供一个全局访问点。\n- 通常用于线程安全的组件，如日志记录器、数据库连接池、线程池等。\n\n**适用场景：**\n- 当一个类必须控制同一时刻实例的个数，且需要保证这个类提供唯一的访问点时，使用单例模式。\n- 用于管理资源，比如数据库连接池，确保资源的高效使用。\n\n### 原型模式（Prototype）\n\n**特点：**\n- 实例化时，创建对象是通过模板对象来克隆生成新对象。\n- 适用于创建大量相同类型的对象，或者对象创建代价比较大时。\n\n**适用场景：**\n- 当对象的创建成本较高，而对象的创建模式又经常变化时，使用原型模式可以节省创建时间。\n- 用于需要频繁创建相同配置的复杂对象，通过克隆现有实例来节省创建时间。\n\n### 如何判断\n\n1. **对象创建成本：**\n   - 如果对象的创建成本高（如数据库连接、复杂配置对象），可以考虑原型模式。\n   - 如果对象创建成本低且对象数量不多，可以使用单例模式。\n\n2. **对象的线程安全性：**\n   - 单例模式通常需要线程安全机制（如双重检查锁定），适合线程安全的场合。\n   - 原型模式的克隆操作也可能涉及同步以确保线程安全，但通常不如单例模式严格。\n\n3. **对象的静态资源管理：**\n   - 对于静态资源的管理，单例模式更为合适，因为它确保了资源的唯一性。\n   - 对于动态配置或频繁变化的资源管理，可以考虑使用原型模式。\n\n4. **对象的独立性：**\n   - 如果对象的实例需要经常变化且独立于其他对象，原型模式更为适合。\n   - 如果对象的实例需要全局共享且不随其他对象变化，单例模式更适合。\n\n### 工程落地\n\n- **单例模式：**\n  - 使用 `enum`、`ThreadLocal` 或同步方法来实现单例。\n  - 示例：\n    ```java\n    public class Singleton {\n        private static final Singleton INSTANCE = new Singleton();\n\n        private Singleton() {}\n\n        public static Singleton getInstance() {\n            return INSTANCE;\n        }\n    }\n    ```\n\n- **原型模式：**\n  - 实现 `Cloneable` 接口，覆盖 `clone` 方法。\n  - 示例：\n    ```java\n    public class Prototype implements Cloneable {\n        private String name;\n\n        public Prototype clone() {\n            try {\n                return (Prototype) super.clone();\n            } catch (CloneNotSupportedException e) {\n                throw new AssertionError();\n            }\n        }\n\n        // 其他方法...\n    }\n    ```\n\n选择合适的模式需要综合考虑上述因素，根据具体的业务需求和场景来决定。",
            "slidingWindowAnswer": "在项目中，选择 `singleton` 还是 `prototype` 作用域取决于组件的具体需求。`singleton` 作用域适用于那些不需要每次请求都创建新实例、并且可以共享状态的组件。而 `prototype` 作用域适用于那些每次请求都需要独立实例、并且需要保持独立状态的组件。以下是一些具体指导原则和工程实践方法，帮助你判断选择合适的 Bean 作用域：\n\n### 选择 `singleton` 作用域\n1. **组件不需要每次请求都创建新实例**：\n   - 如果组件的状态是共享的，且不依赖于线程特定的上下文，那么 `singleton` 作用域是合适的。\n2. **组件需要在应用的生命周期中保持一致性**：\n   - 如果组件的状态需要在整个应用生命周期中保持一致，那么 `singleton` 作用域确保了这一点。\n3. **性能和资源优化**：\n   - 由于 `singleton` 作用域只会创建一个实例，因此可以优化资源使用，减少对象创建的开销。\n\n### 选择 `prototype` 作用域\n1. **组件每次请求都需要独立实例**：\n   - 如果组件的状态是独立的，每次请求都需要一个新的实例，那么 `prototype` 作用域是合适的。\n2. **组件需要线程安全性**：\n   - 如果组件的逻辑需要保证线程安全，每次请求创建独立实例可以避免数据竞争和不一致问题。\n3. **组件状态依赖于请求上下文**：\n   - 如果组件的状态与请求上下文紧密相关，那么每次请求创建独立实例可以保证每个请求有独立的状态。\n\n### 工程实践\n在工程中，你可以通过以下方式来指定 Bean 的作用域：\n\n#### 使用 `@Scope` 注解\n```java\nimport org.springframework.context.annotation.Scope;\nimport org.springframework.stereotype.Service;\n\n@Service\n@Scope(value = \"singleton\")\npublic class MyService {\n    // 实现逻辑\n}\n```\n\n#### 使用配置文件\n在 XML 配置文件中指定 Bean 的作用域：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\" scope=\"singleton\"/>\n```\n\n#### 使用 `@Scope` 注解的 `@Configuration` 类\n```java\nimport org.springframework.context.annotation.Bean;\nimport org.springframework.context.annotation.Configuration;\nimport org.springframework.context.annotation.Scope;\n\n@Configuration\npublic class AppConfig {\n\n    @Bean\n    @Scope(value = \"singleton\")\n    public MyService myService() {\n        return new MyService();\n    }\n}\n```\n\n### 示例\n假设你有一个服务类 `MyService`，它需要在每次请求中都创建独立的实例，以保持线程安全：\n\n```java\nimport org.springframework.stereotype.Service;\nimport org.springframework.context.annotation.Scope;\n\n@Service\n@Scope(value = \"prototype\")\npublic class MyService {\n    public void doSomething() {\n        System.out.println(\"Doing something in MyService\");\n    }\n}\n```\n\n或者在配置文件中指定：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\" scope=\"prototype\"/>\n```\n\n### 总结\n选择 `singleton` 还是 `prototype` 作用域需要根据组件的具体需求来决定。`singleton` 作用域适用于共享状态和优化资源使用，而 `prototype` 作用域适用于每次请求都需要独立实例和保证线程安全。通过上述指导原则和工程实践方法，你可以更好地判断和选择合适的 Bean 作用域。",
            "summaryAnswer": "在项目中判断一个组件更适合使用 `singleton` 还是 `prototype` 作用域，需要考虑以下几个因素：\n\n### 1. 单例模式的适用场景\n**`singleton` 作用域**：\n- **单实例**：确保在整个应用程序生命周期中只有一个实例。\n- **资源共享**：需要在多个请求之间共享状态。\n- **性能优化**：避免频繁的实例化和销毁操作。\n- **线程安全**：如果实例中的状态是可变的，需要确保线程安全。\n\n### 2. 原型模式的适用场景\n**`prototype` 作用域**：\n- **每次请求独立实例**：每个请求都需要独立的实例，确保请求的独立性和互不影响。\n- **状态不可共享**：实例的状态是不可共享的，每次使用时都需要单独初始化。\n- **动态创建**：在运行时动态创建和销毁实例，比如工厂模式。\n\n### 3. 具体工程中的考虑因素\n- **状态管理**：如果组件的状态是可变的且需要在多个请求之间共享，使用 `singleton`；如果状态是不可变或每次请求都需要独立状态，使用 `prototype`。\n- **性能影响**：如果创建和销毁实例的成本高，使用 `singleton` 可以减少资源消耗。\n- **线程安全**：如果组件的状态是共享的，需要确保线程安全，通常使用 `singleton`；如果组件的状态是独立的，线程安全问题较小，使用 `prototype`。\n\n### 4. 典型场景示例\n- **`singleton` 示例**：\n  - **缓存**：缓存服务通常使用 `singleton`，因为缓存需要在整个应用中共享。\n  - **配置对象**：配置对象通常也需要在整个应用中共享，使用 `singleton`。\n\n- **`prototype` 示例**：\n  - **临时对象**：在处理一些临时性需求时，每次请求都需要新的实例，使用 `prototype`。\n  - **工厂模式**：工厂模式中，每次请求需要独立的实例来处理不同的任务，使用 `prototype`。\n\n### 5. 工程落地建议\n- **配置文件管理**：在 Spring 配置文件中明确指定 Bean 的作用域。\n- **代码注释**：在代码中添加注释，说明选择 `singleton` 或 `prototype` 的原因。\n- **测试验证**：通过单元测试验证 Bean 的作用域是否符合预期。\n\n### 示例代码\n```java\n@Configuration\npublic class AppConfig {\n\n    // 使用 singleton\n    @Bean\n    public SharedCache sharedCache() {\n        return new SharedCache();\n    }\n\n    // 使用 prototype\n    @Bean\n    @Scope(\"prototype\")\n    public TempObject tempObject() {\n        return new TempObject();\n    }\n}\n\npublic class SharedCache {\n    public void initialize() {\n        System.out.println(\"SharedCache initialized\");\n    }\n\n    public void cleanup() {\n        System.out.println(\"SharedCache cleaned up\");\n    }\n}\n\npublic class TempObject {\n    public void initialize() {\n        System.out.println(\"TempObject initialized\");\n    }\n\n    public void cleanup() {\n        System.out.println(\"TempObject cleaned up\");\n    }\n}\n\npublic class AppConfigTest {\n\n    @Autowired\n    private ApplicationContext applicationContext;\n\n    @Test\n    public void testSingletonAndPrototype() {\n        // singleton\n        SharedCache cache1 = applicationContext.getBean(SharedCache.class);\n        SharedCache cache2 = applicationContext.getBean(SharedCache.class);\n        assert cache1 == cache2; // 应该是同一个实例\n\n        // prototype\n        TempObject temp1 = applicationContext.getBean(TempObject.class);\n        TempObject temp2 = applicationContext.getBean(TempObject.class);\n        assert temp1 != temp2; // 不是同一个实例\n    }\n}\n```\n\n通过以上分析和示例代码，可以更好地判断一个组件在项目中更适合使用 `singleton` 还是 `prototype`。",
            "summarySnapshot": "Spring Bean 的默认作用域是 `singleton`，适用于应用程序生命周期内共享一个实例的情况。在并发环境下，`singleton` 类型的 Bean 通常不会引发线程安全问题，但如果 Bean 实例包含可变状态且未进行适当同步，则可能产生线程安全问题。例如，一个简单的 `SharedCounter` 类在并发访问时需要使用 `synchronized` 关键字或线程安全的数据结构来确保线程安全。可以采用同步方法、同步代码块、线程安全的数据结构或 `volatile` 关键字等策略来解决并发下的线程安全问题。",
            "summaryCompressionCount": 3
        },
        {
            "round": 6,
            "question": "回到最开始那个问题，除了常见那几种作用域，还能自己扩展吗？",
            "noMemoryAnswer": "在Java中，变量的作用域主要由`public`, `private`, `protected`, 和默认（包）访问级别来定义，这些访问级别决定了变量在程序中的可见性。Java并不直接支持用户自定义作用域，但可以通过一些设计模式或者框架来实现类似的功能。以下是几种常见的方法：\n\n1. **使用自定义注解配合同步容器**：例如，可以使用Spring框架中`@Scope`注解来自定义作用域，如`@Scope(\"prototype\")`, `@Scope(\"request\")`, `@Scope(\"session\")`等。你可以自定义作用域，比如`@Scope(\"myCustomScope\")`，然后在配置文件中定义这个作用域的生命周期行为。\n\n2. **使用AOP（面向切面编程）**：通过Spring AOP可以实现特定逻辑的动态代理，进而达到模拟自定义作用域的效果。\n\n3. **设计模式的应用**：比如使用单例模式、工厂模式等，来控制变量的生命周期和可见性。\n\n4. **类和方法的封装**：通过设计良好的类和方法封装，可以模拟某种自定义的作用域逻辑。例如，通过工厂方法模式创建对象，然后根据工厂方法的调用上下文来决定对象的生命周期。\n\n在工程落地时，通常会根据具体需求选择合适的方式。例如，如果需要在一个HTTP请求内保持某些变量的生命周期，可以使用Spring的`@RequestScope`注解。如果需要更复杂的逻辑，可能会考虑使用自定义的AOP切面或者实现自己的作用域管理器。\n\n如果你的“它”指的是某种特定的情境，比如使用Spring框架扩展作用域，那么可以给出具体的例子和配置步骤。如果你还有具体情境或者疑问，可以继续提问。",
            "slidingWindowAnswer": "在 Spring 中，默认提供了几种常见的 Bean 作用域，如 `singleton` 和 `prototype`，但你也可以根据需要扩展自定义 Bean 作用域。Spring 允许通过实现 `org.springframework.beans.factory.config.ConfigurableListableBeanFactory` 接口中的 `getBeanDefinition` 方法来扩展作用域。以下是如何扩展自定义作用域的步骤和工程实践方法：\n\n### 原理\n1. **实现自定义作用域逻辑**：\n   - 你需要实现 `org.springframework.beans.factory.config.ConfigurableListableBeanFactory` 接口中的方法来管理自定义作用域的生命周期。\n2. **扩展 `BeanPostProcessor`**：\n   - 你可以通过实现 `BeanPostProcessor` 接口来在 Bean 初始化前后进行处理，从而支持自定义作用域的生命周期回调。\n\n### 工程实践\n1. **创建自定义作用域实现类**\n   - 实现 `ConfigurableListableBeanFactory` 接口中的方法，管理自定义作用域的生命周期。\n\n```java\nimport org.springframework.beans.BeansException;\nimport org.springframework.beans.factory.config.ConfigurableListableBeanFactory;\nimport org.springframework.beans.factory.support.BeanDefinitionRegistry;\nimport org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;\n\npublic class CustomScope extends BeanDefinitionRegistryPostProcessor {\n\n    @Override\n    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {\n        // 自定义作用域的注册逻辑\n        registry.registerScope(\"customScope\", new CustomScopeConfigurer());\n    }\n\n    @Override\n    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {\n        // 可以在这里添加其他配置\n    }\n}\n\nclass CustomScopeConfigurer implements Scope {\n\n    @Override\n    public Object get(String name, ObjectFactory<?> objectFactory) {\n        // 创建并返回一个新的实例\n        return objectFactory.getObject();\n    }\n\n    @Override\n    public Object remove(String name) {\n        // 移除实例（实现具体逻辑）\n        return null;\n    }\n\n    @Override\n    public void registerDestructionCallback(String name, Runnable callback) {\n        // 注册销毁回调（实现具体逻辑）\n    }\n\n    @Override\n    public Object resolveContextualObject(String key, Object context) {\n        // 解析上下文对象（实现具体逻辑）\n        return null;\n    }\n\n    @Override\n    public String getScopeName() {\n        // 返回作用域名称\n        return \"customScope\";\n    }\n}\n```\n\n2. **配置自定义作用域**\n   - 在 Spring 配置文件中启用自定义作用域。\n\n```xml\n<bean class=\"com.example_CustomScope\" factory-method=\"postProcessBeanDefinitionRegistry\"/>\n\n<bean id=\"myCustomBean\" class=\"com.example.MyCustomBean\" scope=\"customScope\"/>\n```\n\n3. **使用自定义作用域**\n   - 在代码中使用自定义作用域。\n\n```java\nimport org.springframework.context.ApplicationContext;\nimport org.springframework.context.annotation.AnnotationConfigApplicationContext;\n\npublic class Main {\n    public static void main(String[] args) {\n        ApplicationContext context = new AnnotationConfigApplicationContext();\n        // 启用自定义作用域配置\n        context.register(YourCustomConfig.class);\n        context.refresh();\n\n        MyCustomBean myCustomBean1 = context.getBean(MyCustomBean.class, \"customScope\");\n        MyCustomBean myCustomBean2 = context.getBean(MyCustomBean.class, \"customScope\");\n        System.out.println(myCustomBean1 == myCustomBean2); // 输出 true 或 false\n    }\n}\n```\n\n### 工程实践示例\n假设你有一个 `MyCustomBean` 类，你想使用自定义作用域 `customScope` 来管理它：\n\n```java\nimport org.springframework.stereotype.Service;\n\n@Service\npublic class MyCustomBean {\n    public void doSomething() {\n        System.out.println(\"Doing something in MyCustomBean\");\n    }\n}\n```\n\n在配置类中启用自定义作用域：\n\n```java\nimport org.springframework.context.annotation.Bean;\nimport org.springframework.context.annotation.Configuration;\nimport org.springframework.beans.factory.config.ConfigurableListableBeanFactory;\nimport org.springframework.beans.factory.support.BeanDefinitionRegistry;\nimport org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;\n\n@Configuration\npublic class YourCustomConfig {\n\n    @Bean\n    public CustomScope customScope() {\n        return new CustomScope();\n    }\n\n    @Bean\n    public CustomScopeConfigurer customScopeConfigurer() {\n        return new CustomScopeConfigurer();\n    }\n}\n\nclass CustomScopeConfigurer implements BeanDefinitionRegistryPostProcessor {\n\n    @Override\n    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {\n        registry.registerScope(\"customScope\", new CustomScopeConfigurer());\n    }\n\n    @Override\n    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {\n        // 可以在这里添加其他配置\n    }\n}\n\nclass CustomScope implements Scope {\n\n    @Override\n    public Object get(String name, ObjectFactory<?> objectFactory) {\n        // 创建并返回一个新的实例\n        return objectFactory.getObject();\n    }\n\n    @Override\n    public Object remove(String name) {\n        // 移除实例（实现具体逻辑）\n        return null;\n    }\n\n    @Override\n    public void registerDestructionCallback(String name, Runnable callback) {\n        // 注册销毁回调（实现具体逻辑）\n    }\n\n    @Override\n    public Object resolveContextualObject(String key, Object context) {\n        // 解析上下文对象（实现具体逻辑）\n        return null;\n    }\n\n    @Override\n    public String getScopeName() {\n        // 返回作用域名称\n        return \"customScope\";\n    }\n}\n```\n\n### 总结\n通过实现 `ConfigurableListableBeanFactory` 接口和 `BeanDefinitionRegistryPostProcessor`，你可以扩展自定义作用域。这种方式允许你在 Spring 应用中使用任意复杂的行为来管理 Bean 的生命周期。工程上，你需要正确配置和使用自定义作用域，以确保其行为符合预期。",
            "summaryAnswer": "在 Spring 中，除了常见的 `singleton` 和 `prototype` 作用域，开发者可以通过实现 `BeanFactoryPostProcessor` 或 `BeanPostProcessor` 接口来扩展自定义的作用域。虽然 Spring 框架本身并没有提供直接支持自定义作用域的机制，但可以通过一些间接的方法来实现类似的效果。\n\n### 自定义作用域的实现方法\n\n#### 1. 使用 `BeanFactoryPostProcessor`\n`BeanFactoryPostProcessor` 接口可以在 Bean 实例化之前进行一些初始化工作。通过实现这个接口，可以在实例化过程中动态地创建自定义作用域的 Bean。\n\n```java\nimport org.springframework.beans.BeansException;\nimport org.springframework.beans.factory.config.BeanFactoryPostProcessor;\nimport org.springframework.beans.factory.config.ConfigurableListableBeanFactory;\n\npublic class CustomScopePostProcessor implements BeanFactoryPostProcessor {\n\n    @Override\n    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {\n        // 在这里可以动态创建自定义作用域的 Bean\n        String beanName = \"customScopeBean\";\n        beanFactory.registerSingleton(beanName, new CustomScopeBean());\n    }\n}\n```\n\n#### 2. 使用 `BeanPostProcessor`\n`BeanPostProcessor` 接口可以在 Bean 初始化前后进行一些处理。通过实现这个接口，可以在 Bean 初始化过程中动态地改变 Bean 的作用域。\n\n```java\nimport org.springframework.beans.BeansException;\nimport org.springframework.beans.factory.config.BeanPostProcessor;\nimport org.springframework.stereotype.Component;\n\n@Component\npublic class CustomScopeBeanPostProcessor implements BeanPostProcessor {\n\n    @Override\n    public Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException {\n        // 在这里可以动态改变 Bean 的作用域\n        if (beanName.equals(\"customScopeBean\")) {\n            return new CustomScopeBean();\n        }\n        return bean;\n    }\n\n    @Override\n    public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {\n        // 可以在初始化后进行一些处理\n        return bean;\n    }\n}\n```\n\n### 自定义作用域的使用\n\n#### 示例代码\n\n```java\n@Configuration\npublic class AppConfig {\n\n    @Bean\n    public CustomScopeBean customScopeBean() {\n        return new CustomScopeBean();\n    }\n}\n\npublic class CustomScopeBean {\n    public void someMethod() {\n        System.out.println(\"Custom scope bean method called\");\n    }\n}\n\npublic class CustomScopeBeanTest {\n\n    @Autowired\n    private ApplicationContext applicationContext;\n\n    @Test\n    public void testCustomScopeBean() {\n        CustomScopeBean bean1 = applicationContext.getBean(CustomScopeBean.class);\n        CustomScopeBean bean2 = applicationContext.getBean(CustomScopeBean.class);\n        assert bean1 != bean2; // 应该是两个独立的实例\n    }\n}\n```\n\n### 结论\n\n虽然 Spring 框架本身没有直接支持自定义作用域的机制，但通过实现 `BeanFactoryPostProcessor` 或 `BeanPostProcessor` 接口，可以在实例化和初始化过程中动态地创建和改变 Bean 的作用域。这种方法提供了灵活的方式来扩展 Spring 的作用域管理功能。\n\n通过这种方法，可以实现类似于自定义作用域的效果，但需要注意的是，这种扩展需要更多的开发工作和维护，同时也可能带来一些复杂性和潜在的性能影响。",
            "summarySnapshot": "Spring Bean 的默认作用域是 `singleton`，适用于应用程序生命周期内共享一个实例的情况。`singleton` 类型的 Bean 会走 `init-method` 和 `destroy-method` 生命周期回调方法。`prototype` 类型的 Bean 每次请求都会创建新的实例，不会共享，也不会走这些回调方法。在并发环境下，`singleton` 类型的 Bean 需要同步机制确保线程安全，而 `prototype` 类型的 Bean 则不会进行额外的初始化或销毁操作。例如，`prototype` 类型的 `MyPrototypeBean` 在每次请求时都会创建新的实例，不会输出 `init-method` 和 `destroy-method` 的信息。",
            "summaryCompressionCount": 4
        }
    ],
    "slidingWindowFinalState": {
        "strategy": "sliding-window",
        "sessionId": "compare-sliding-window",
        "question": "",
        "answer": "",
        "estimatedPromptTokens": 0,
        "summary": "",
        "compressionCount": 0,
        "memoryMessages": [
            {
                "role": "user",
                "content": "如果换成 prototype，还会走完整生命周期回调吗？"
            },
            {
                "role": "assistant",
                "content": "在 Spring 中，`prototype` 作用域的 Bean 不会走 Spring 容器的完整生命周期回调。具体来说，Spring 容器在初始化 `prototype` 作用域的 Bean 时只会调用相关的方法一次，之后每次请求该 Bean 的实例时都会重新创建一个新的实例。因此，`prototype` 作用域的 Bean 不会经历 `singleton` 作用域 Bean 所有的生命周期回调。\n\n### 生命周期回调\n`singleton` 作用域的 Bean 会在 Spring 容器启动时初始化，并且会经历以下生命周期回调方法：\n\n1. **`init-method`**: 在 Bean 初始化完成后调用。\n2. **`destroy-method`**: 在容器关闭前调用。\n\n例如：\n\n```java\n@Service\n@InitDestroyAnnotation\npublic class MyService {\n    public MyService() {\n        System.out.println(\"MyService constructor\");\n    }\n\n    @PostConstruct\n    public void init() {\n        System.out.println(\"MyService init method\");\n    }\n\n    @PreDestroy\n    public void destroy() {\n        System.out.println(\"MyService destroy method\");\n    }\n}\n```\n\n在 Spring 配置文件中：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\"\n      init-method=\"init\" destroy-method=\"destroy\"/>\n```\n\n### `prototype` 作用域的 Bean\n对于 `prototype` 作用域的 Bean，每次请求都会创建一个新的实例，Spring 容器不会调用 `init-method` 和 `destroy-method`。具体来说：\n\n1. **构造方法**：每次创建实例时都会调用构造方法。\n2. **`@PostConstruct` 方法**：只会在第一次创建实例时调用。\n3. **`@PreDestroy` 方法**：不会被调用，因为每次请求都会创建新的实例。\n\n例如：\n\n```java\n@Service\npublic class MyService {\n    public MyService() {\n        System.out.println(\"MyService constructor\");\n    }\n\n    @PostConstruct\n    public void init() {\n        System.out.println(\"MyService init method\");\n    }\n\n    @PreDestroy\n    public void destroy() {\n        System.out.println(\"MyService destroy method\");\n    }\n}\n```\n\n在 `singleton` 作用域下：\n\n```\nMyService constructor\nMyService init method\n```\n\n在 `prototype` 作用域下：\n\n```\nMyService constructor\nMyService init method\nMyService constructor\nMyService constructor\n```\n\n### 工程落地\n在配置文件中指定 `prototype` 作用域：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\" scope=\"prototype\"/>\n```\n\n或者使用 `@Scope` 注解：\n\n```java\n@Service\n@Scope(value = \"prototype\")\npublic class MyService {\n    public MyService() {\n        System.out.println(\"MyService constructor\");\n    }\n\n    @PostConstruct\n    public void init() {\n        System.out.println(\"MyService init method\");\n    }\n\n    @PreDestroy\n    public void destroy() {\n        System.out.println(\"MyService destroy method\");\n    }\n}\n```\n\n### 总结\n`singleton` 作用域的 Bean 会经历完整的生命周期回调，包括 `init-method` 和 `destroy-method`。而 `prototype` 作用域的 Bean 只在第一次创建时调用 `init-method`，不会调用 `destroy-method`，每次请求都会创建一个新的实例。"
            },
            {
                "role": "user",
                "content": "那在项目里，我该怎么判断一个组件更适合 singleton 还是 prototype？"
            },
            {
                "role": "assistant",
                "content": "在项目中，选择 `singleton` 还是 `prototype` 作用域取决于组件的具体需求。`singleton` 作用域适用于那些不需要每次请求都创建新实例、并且可以共享状态的组件。而 `prototype` 作用域适用于那些每次请求都需要独立实例、并且需要保持独立状态的组件。以下是一些具体指导原则和工程实践方法，帮助你判断选择合适的 Bean 作用域：\n\n### 选择 `singleton` 作用域\n1. **组件不需要每次请求都创建新实例**：\n   - 如果组件的状态是共享的，且不依赖于线程特定的上下文，那么 `singleton` 作用域是合适的。\n2. **组件需要在应用的生命周期中保持一致性**：\n   - 如果组件的状态需要在整个应用生命周期中保持一致，那么 `singleton` 作用域确保了这一点。\n3. **性能和资源优化**：\n   - 由于 `singleton` 作用域只会创建一个实例，因此可以优化资源使用，减少对象创建的开销。\n\n### 选择 `prototype` 作用域\n1. **组件每次请求都需要独立实例**：\n   - 如果组件的状态是独立的，每次请求都需要一个新的实例，那么 `prototype` 作用域是合适的。\n2. **组件需要线程安全性**：\n   - 如果组件的逻辑需要保证线程安全，每次请求创建独立实例可以避免数据竞争和不一致问题。\n3. **组件状态依赖于请求上下文**：\n   - 如果组件的状态与请求上下文紧密相关，那么每次请求创建独立实例可以保证每个请求有独立的状态。\n\n### 工程实践\n在工程中，你可以通过以下方式来指定 Bean 的作用域：\n\n#### 使用 `@Scope` 注解\n```java\nimport org.springframework.context.annotation.Scope;\nimport org.springframework.stereotype.Service;\n\n@Service\n@Scope(value = \"singleton\")\npublic class MyService {\n    // 实现逻辑\n}\n```\n\n#### 使用配置文件\n在 XML 配置文件中指定 Bean 的作用域：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\" scope=\"singleton\"/>\n```\n\n#### 使用 `@Scope` 注解的 `@Configuration` 类\n```java\nimport org.springframework.context.annotation.Bean;\nimport org.springframework.context.annotation.Configuration;\nimport org.springframework.context.annotation.Scope;\n\n@Configuration\npublic class AppConfig {\n\n    @Bean\n    @Scope(value = \"singleton\")\n    public MyService myService() {\n        return new MyService();\n    }\n}\n```\n\n### 示例\n假设你有一个服务类 `MyService`，它需要在每次请求中都创建独立的实例，以保持线程安全：\n\n```java\nimport org.springframework.stereotype.Service;\nimport org.springframework.context.annotation.Scope;\n\n@Service\n@Scope(value = \"prototype\")\npublic class MyService {\n    public void doSomething() {\n        System.out.println(\"Doing something in MyService\");\n    }\n}\n```\n\n或者在配置文件中指定：\n\n```xml\n<bean id=\"myService\" class=\"com.example.MyService\" scope=\"prototype\"/>\n```\n\n### 总结\n选择 `singleton` 还是 `prototype` 作用域需要根据组件的具体需求来决定。`singleton` 作用域适用于共享状态和优化资源使用，而 `prototype` 作用域适用于每次请求都需要独立实例和保证线程安全。通过上述指导原则和工程实践方法，你可以更好地判断和选择合适的 Bean 作用域。"
            },
            {
                "role": "user",
                "content": "回到最开始那个问题，除了常见那几种作用域，还能自己扩展吗？"
            },
            {
                "role": "assistant",
                "content": "在 Spring 中，默认提供了几种常见的 Bean 作用域，如 `singleton` 和 `prototype`，但你也可以根据需要扩展自定义 Bean 作用域。Spring 允许通过实现 `org.springframework.beans.factory.config.ConfigurableListableBeanFactory` 接口中的 `getBeanDefinition` 方法来扩展作用域。以下是如何扩展自定义作用域的步骤和工程实践方法：\n\n### 原理\n1. **实现自定义作用域逻辑**：\n   - 你需要实现 `org.springframework.beans.factory.config.ConfigurableListableBeanFactory` 接口中的方法来管理自定义作用域的生命周期。\n2. **扩展 `BeanPostProcessor`**：\n   - 你可以通过实现 `BeanPostProcessor` 接口来在 Bean 初始化前后进行处理，从而支持自定义作用域的生命周期回调。\n\n### 工程实践\n1. **创建自定义作用域实现类**\n   - 实现 `ConfigurableListableBeanFactory` 接口中的方法，管理自定义作用域的生命周期。\n\n```java\nimport org.springframework.beans.BeansException;\nimport org.springframework.beans.factory.config.ConfigurableListableBeanFactory;\nimport org.springframework.beans.factory.support.BeanDefinitionRegistry;\nimport org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;\n\npublic class CustomScope extends BeanDefinitionRegistryPostProcessor {\n\n    @Override\n    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {\n        // 自定义作用域的注册逻辑\n        registry.registerScope(\"customScope\", new CustomScopeConfigurer());\n    }\n\n    @Override\n    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {\n        // 可以在这里添加其他配置\n    }\n}\n\nclass CustomScopeConfigurer implements Scope {\n\n    @Override\n    public Object get(String name, ObjectFactory<?> objectFactory) {\n        // 创建并返回一个新的实例\n        return objectFactory.getObject();\n    }\n\n    @Override\n    public Object remove(String name) {\n        // 移除实例（实现具体逻辑）\n        return null;\n    }\n\n    @Override\n    public void registerDestructionCallback(String name, Runnable callback) {\n        // 注册销毁回调（实现具体逻辑）\n    }\n\n    @Override\n    public Object resolveContextualObject(String key, Object context) {\n        // 解析上下文对象（实现具体逻辑）\n        return null;\n    }\n\n    @Override\n    public String getScopeName() {\n        // 返回作用域名称\n        return \"customScope\";\n    }\n}\n```\n\n2. **配置自定义作用域**\n   - 在 Spring 配置文件中启用自定义作用域。\n\n```xml\n<bean class=\"com.example_CustomScope\" factory-method=\"postProcessBeanDefinitionRegistry\"/>\n\n<bean id=\"myCustomBean\" class=\"com.example.MyCustomBean\" scope=\"customScope\"/>\n```\n\n3. **使用自定义作用域**\n   - 在代码中使用自定义作用域。\n\n```java\nimport org.springframework.context.ApplicationContext;\nimport org.springframework.context.annotation.AnnotationConfigApplicationContext;\n\npublic class Main {\n    public static void main(String[] args) {\n        ApplicationContext context = new AnnotationConfigApplicationContext();\n        // 启用自定义作用域配置\n        context.register(YourCustomConfig.class);\n        context.refresh();\n\n        MyCustomBean myCustomBean1 = context.getBean(MyCustomBean.class, \"customScope\");\n        MyCustomBean myCustomBean2 = context.getBean(MyCustomBean.class, \"customScope\");\n        System.out.println(myCustomBean1 == myCustomBean2); // 输出 true 或 false\n    }\n}\n```\n\n### 工程实践示例\n假设你有一个 `MyCustomBean` 类，你想使用自定义作用域 `customScope` 来管理它：\n\n```java\nimport org.springframework.stereotype.Service;\n\n@Service\npublic class MyCustomBean {\n    public void doSomething() {\n        System.out.println(\"Doing something in MyCustomBean\");\n    }\n}\n```\n\n在配置类中启用自定义作用域：\n\n```java\nimport org.springframework.context.annotation.Bean;\nimport org.springframework.context.annotation.Configuration;\nimport org.springframework.beans.factory.config.ConfigurableListableBeanFactory;\nimport org.springframework.beans.factory.support.BeanDefinitionRegistry;\nimport org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;\n\n@Configuration\npublic class YourCustomConfig {\n\n    @Bean\n    public CustomScope customScope() {\n        return new CustomScope();\n    }\n\n    @Bean\n    public CustomScopeConfigurer customScopeConfigurer() {\n        return new CustomScopeConfigurer();\n    }\n}\n\nclass CustomScopeConfigurer implements BeanDefinitionRegistryPostProcessor {\n\n    @Override\n    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {\n        registry.registerScope(\"customScope\", new CustomScopeConfigurer());\n    }\n\n    @Override\n    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {\n        // 可以在这里添加其他配置\n    }\n}\n\nclass CustomScope implements Scope {\n\n    @Override\n    public Object get(String name, ObjectFactory<?> objectFactory) {\n        // 创建并返回一个新的实例\n        return objectFactory.getObject();\n    }\n\n    @Override\n    public Object remove(String name) {\n        // 移除实例（实现具体逻辑）\n        return null;\n    }\n\n    @Override\n    public void registerDestructionCallback(String name, Runnable callback) {\n        // 注册销毁回调（实现具体逻辑）\n    }\n\n    @Override\n    public Object resolveContextualObject(String key, Object context) {\n        // 解析上下文对象（实现具体逻辑）\n        return null;\n    }\n\n    @Override\n    public String getScopeName() {\n        // 返回作用域名称\n        return \"customScope\";\n    }\n}\n```\n\n### 总结\n通过实现 `ConfigurableListableBeanFactory` 接口和 `BeanDefinitionRegistryPostProcessor`，你可以扩展自定义作用域。这种方式允许你在 Spring 应用中使用任意复杂的行为来管理 Bean 的生命周期。工程上，你需要正确配置和使用自定义作用域，以确保其行为符合预期。"
            }
        ]
    },
    "summaryFinalState": {
        "strategy": "summary-compression",
        "sessionId": "compare-summary-memory",
        "question": "",
        "answer": "",
        "estimatedPromptTokens": 0,
        "summary": "Spring Bean 的默认作用域是 `singleton`，适用于应用程序生命周期内共享一个实例的情况。`singleton` 类型的 Bean 会走 `init-method` 和 `destroy-method` 生命周期回调方法。`prototype` 类型的 Bean 每次请求都会创建新的实例，不会共享，也不会走这些回调方法。在并发环境下，`singleton` 类型的 Bean 需要同步机制确保线程安全，而 `prototype` 类型的 Bean 则不会进行额外的初始化或销毁操作。例如，`prototype` 类型的 `MyPrototypeBean` 在每次请求时都会创建新的实例，不会输出 `init-method` 和 `destroy-method` 的信息。",
        "compressionCount": 4,
        "memoryMessages": [
            {
                "role": "user",
                "content": "那在项目里，我该怎么判断一个组件更适合 singleton 还是 prototype？"
            },
            {
                "role": "assistant",
                "content": "在项目中判断一个组件更适合使用 `singleton` 还是 `prototype` 作用域，需要考虑以下几个因素：\n\n### 1. 单例模式的适用场景\n**`singleton` 作用域**：\n- **单实例**：确保在整个应用程序生命周期中只有一个实例。\n- **资源共享**：需要在多个请求之间共享状态。\n- **性能优化**：避免频繁的实例化和销毁操作。\n- **线程安全**：如果实例中的状态是可变的，需要确保线程安全。\n\n### 2. 原型模式的适用场景\n**`prototype` 作用域**：\n- **每次请求独立实例**：每个请求都需要独立的实例，确保请求的独立性和互不影响。\n- **状态不可共享**：实例的状态是不可共享的，每次使用时都需要单独初始化。\n- **动态创建**：在运行时动态创建和销毁实例，比如工厂模式。\n\n### 3. 具体工程中的考虑因素\n- **状态管理**：如果组件的状态是可变的且需要在多个请求之间共享，使用 `singleton`；如果状态是不可变或每次请求都需要独立状态，使用 `prototype`。\n- **性能影响**：如果创建和销毁实例的成本高，使用 `singleton` 可以减少资源消耗。\n- **线程安全**：如果组件的状态是共享的，需要确保线程安全，通常使用 `singleton`；如果组件的状态是独立的，线程安全问题较小，使用 `prototype`。\n\n### 4. 典型场景示例\n- **`singleton` 示例**：\n  - **缓存**：缓存服务通常使用 `singleton`，因为缓存需要在整个应用中共享。\n  - **配置对象**：配置对象通常也需要在整个应用中共享，使用 `singleton`。\n\n- **`prototype` 示例**：\n  - **临时对象**：在处理一些临时性需求时，每次请求都需要新的实例，使用 `prototype`。\n  - **工厂模式**：工厂模式中，每次请求需要独立的实例来处理不同的任务，使用 `prototype`。\n\n### 5. 工程落地建议\n- **配置文件管理**：在 Spring 配置文件中明确指定 Bean 的作用域。\n- **代码注释**：在代码中添加注释，说明选择 `singleton` 或 `prototype` 的原因。\n- **测试验证**：通过单元测试验证 Bean 的作用域是否符合预期。\n\n### 示例代码\n```java\n@Configuration\npublic class AppConfig {\n\n    // 使用 singleton\n    @Bean\n    public SharedCache sharedCache() {\n        return new SharedCache();\n    }\n\n    // 使用 prototype\n    @Bean\n    @Scope(\"prototype\")\n    public TempObject tempObject() {\n        return new TempObject();\n    }\n}\n\npublic class SharedCache {\n    public void initialize() {\n        System.out.println(\"SharedCache initialized\");\n    }\n\n    public void cleanup() {\n        System.out.println(\"SharedCache cleaned up\");\n    }\n}\n\npublic class TempObject {\n    public void initialize() {\n        System.out.println(\"TempObject initialized\");\n    }\n\n    public void cleanup() {\n        System.out.println(\"TempObject cleaned up\");\n    }\n}\n\npublic class AppConfigTest {\n\n    @Autowired\n    private ApplicationContext applicationContext;\n\n    @Test\n    public void testSingletonAndPrototype() {\n        // singleton\n        SharedCache cache1 = applicationContext.getBean(SharedCache.class);\n        SharedCache cache2 = applicationContext.getBean(SharedCache.class);\n        assert cache1 == cache2; // 应该是同一个实例\n\n        // prototype\n        TempObject temp1 = applicationContext.getBean(TempObject.class);\n        TempObject temp2 = applicationContext.getBean(TempObject.class);\n        assert temp1 != temp2; // 不是同一个实例\n    }\n}\n```\n\n通过以上分析和示例代码，可以更好地判断一个组件在项目中更适合使用 `singleton` 还是 `prototype`。"
            },
            {
                "role": "user",
                "content": "回到最开始那个问题，除了常见那几种作用域，还能自己扩展吗？"
            },
            {
                "role": "assistant",
                "content": "在 Spring 中，除了常见的 `singleton` 和 `prototype` 作用域，开发者可以通过实现 `BeanFactoryPostProcessor` 或 `BeanPostProcessor` 接口来扩展自定义的作用域。虽然 Spring 框架本身并没有提供直接支持自定义作用域的机制，但可以通过一些间接的方法来实现类似的效果。\n\n### 自定义作用域的实现方法\n\n#### 1. 使用 `BeanFactoryPostProcessor`\n`BeanFactoryPostProcessor` 接口可以在 Bean 实例化之前进行一些初始化工作。通过实现这个接口，可以在实例化过程中动态地创建自定义作用域的 Bean。\n\n```java\nimport org.springframework.beans.BeansException;\nimport org.springframework.beans.factory.config.BeanFactoryPostProcessor;\nimport org.springframework.beans.factory.config.ConfigurableListableBeanFactory;\n\npublic class CustomScopePostProcessor implements BeanFactoryPostProcessor {\n\n    @Override\n    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {\n        // 在这里可以动态创建自定义作用域的 Bean\n        String beanName = \"customScopeBean\";\n        beanFactory.registerSingleton(beanName, new CustomScopeBean());\n    }\n}\n```\n\n#### 2. 使用 `BeanPostProcessor`\n`BeanPostProcessor` 接口可以在 Bean 初始化前后进行一些处理。通过实现这个接口，可以在 Bean 初始化过程中动态地改变 Bean 的作用域。\n\n```java\nimport org.springframework.beans.BeansException;\nimport org.springframework.beans.factory.config.BeanPostProcessor;\nimport org.springframework.stereotype.Component;\n\n@Component\npublic class CustomScopeBeanPostProcessor implements BeanPostProcessor {\n\n    @Override\n    public Object postProcessBeforeInitialization(Object bean, String beanName) throws BeansException {\n        // 在这里可以动态改变 Bean 的作用域\n        if (beanName.equals(\"customScopeBean\")) {\n            return new CustomScopeBean();\n        }\n        return bean;\n    }\n\n    @Override\n    public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {\n        // 可以在初始化后进行一些处理\n        return bean;\n    }\n}\n```\n\n### 自定义作用域的使用\n\n#### 示例代码\n\n```java\n@Configuration\npublic class AppConfig {\n\n    @Bean\n    public CustomScopeBean customScopeBean() {\n        return new CustomScopeBean();\n    }\n}\n\npublic class CustomScopeBean {\n    public void someMethod() {\n        System.out.println(\"Custom scope bean method called\");\n    }\n}\n\npublic class CustomScopeBeanTest {\n\n    @Autowired\n    private ApplicationContext applicationContext;\n\n    @Test\n    public void testCustomScopeBean() {\n        CustomScopeBean bean1 = applicationContext.getBean(CustomScopeBean.class);\n        CustomScopeBean bean2 = applicationContext.getBean(CustomScopeBean.class);\n        assert bean1 != bean2; // 应该是两个独立的实例\n    }\n}\n```\n\n### 结论\n\n虽然 Spring 框架本身没有直接支持自定义作用域的机制，但通过实现 `BeanFactoryPostProcessor` 或 `BeanPostProcessor` 接口，可以在实例化和初始化过程中动态地创建和改变 Bean 的作用域。这种方法提供了灵活的方式来扩展 Spring 的作用域管理功能。\n\n通过这种方法，可以实现类似于自定义作用域的效果，但需要注意的是，这种扩展需要更多的开发工作和维护，同时也可能带来一些复杂性和潜在的性能影响。"
            }
        ]
    }
}
```

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
