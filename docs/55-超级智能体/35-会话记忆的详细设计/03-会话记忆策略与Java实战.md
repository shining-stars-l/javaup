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

```java
import com.google.gson.JsonObject;
import java.util.*;

/**
 * 滑动窗口会话记忆管理器
 * 只保留最近N轮对话，超出部分直接丢弃
 */
public class SlidingWindowMemory {

    /** 最大保留轮数（1轮 = 1条user + 1条assistant） */
    private final int maxRounds;

    /** 会话存储：sessionId → 消息列表 */
    private final Map<String, List<JsonObject>> store = new HashMap<>();

    public SlidingWindowMemory(int maxRounds) {
        this.maxRounds = maxRounds;
    }

    /**
     * 添加一条消息到指定会话
     */
    public void addMessage(String sessionId, String role, String content) {
        store.computeIfAbsent(sessionId, k -> new ArrayList<>())
                .add(message(role, content));
    }

    /**
     * 获取最近N轮消息（滑动窗口）
     */
    public List<JsonObject> getRecentMessages(String sessionId) {
        List<JsonObject> allMessages = store.getOrDefault(sessionId, List.of());
        if (allMessages.isEmpty()) {
            return List.of();
        }

        // 每轮2条消息（user + assistant），保留maxRounds轮
        int keepCount = maxRounds * 2;
        if (allMessages.size() <= keepCount) {
            return new ArrayList<>(allMessages);
        }

        // 只取最后keepCount条
        return new ArrayList<>(
                allMessages.subList(allMessages.size() - keepCount, allMessages.size())
        );
    }

    /**
     * 组装完整的messages数组，准备发给LLM API
     */
    public List<JsonObject> buildMessages(String sessionId,
                                          String systemPrompt,
                                          String currentQuestion) {
        List<JsonObject> messages = new ArrayList<>();
        messages.add(message("system", systemPrompt));
        messages.addAll(getRecentMessages(sessionId));
        messages.add(message("user", currentQuestion));
        return messages;
    }

    private JsonObject message(String role, String content) {
        JsonObject msg = new JsonObject();
        msg.addProperty("role", role);
        msg.addProperty("content", content);
        return msg;
    }
}
```

### 实现二：摘要压缩记忆管理器

```java
import com.google.gson.*;
import java.io.IOException;
import java.util.*;

/**
 * 支持摘要压缩的会话记忆管理器
 * 当对话历史超过Token阈值时，自动将早期对话压缩为摘要
 */
public class SummaryMemory {

    /** 触发压缩的Token阈值 */
    private final int tokenThreshold;
    /** 压缩时保留最近的完整轮数 */
    private final int keepRecentRounds;

    /** 会话的消息存储 */
    private final Map<String, List<JsonObject>> store = new HashMap<>();
    /** 会话的摘要存储 */
    private final Map<String, String> summaryStore = new HashMap<>();

    public SummaryMemory(int tokenThreshold, int keepRecentRounds) {
        this.tokenThreshold = tokenThreshold;
        this.keepRecentRounds = keepRecentRounds;
    }

    /**
     * 添加消息，超过阈值时自动触发压缩
     */
    public void addMessage(String sessionId, String role, String content) {
        store.computeIfAbsent(sessionId, k -> new ArrayList<>())
                .add(message(role, content));

        // 检查是否需要压缩
        if (estimateTotalTokens(sessionId) > tokenThreshold) {
            try {
                compress(sessionId);
            } catch (IOException e) {
                System.err.println("摘要压缩失败：" + e.getMessage());
            }
        }
    }

    /**
     * 将早期对话压缩为摘要
     */
    private void compress(String sessionId) throws IOException {
        List<JsonObject> allMessages = store.get(sessionId);
        if (allMessages == null || allMessages.size() <= keepRecentRounds * 2) {
            return;
        }

        // 分离：早期消息（要压缩）+ 最近消息（要保留）
        int keepCount = keepRecentRounds * 2;
        List<JsonObject> earlyMessages = allMessages.subList(0, allMessages.size() - keepCount);
        List<JsonObject> recentMessages = new ArrayList<>(
                allMessages.subList(allMessages.size() - keepCount, allMessages.size()));

        // 拼接早期对话文本
        StringBuilder conversationText = new StringBuilder();
        for (JsonObject msg : earlyMessages) {
            String msgRole = msg.get("role").getAsString();
            String msgContent = msg.get("content").getAsString();
            conversationText.append(msgRole).append("：").append(msgContent).append("\n");
        }

        // 拼上已有的摘要（如果有的话）
        String existingSummary = summaryStore.getOrDefault(sessionId, "");

        String summaryPrompt = "请把以下对话记录压缩成一段简洁的背景摘要，要求：\n"
                + "1. 保留用户的核心问题和学习方向\n"
                + "2. 保留关键技术细节（框架、版本、报错信息等）\n"
                + "3. 保留已确认的结论\n"
                + "4. 保留尚未解决的问题\n"
                + "5. 去掉寒暄和重复内容\n"
                + "6. 第三人称，200字以内\n";

        if (!existingSummary.isEmpty()) {
            summaryPrompt += "\n已有的历史摘要：\n" + existingSummary + "\n";
        }
        summaryPrompt += "\n需要压缩的新对话：\n" + conversationText;

        // 调用LLM生成摘要（可以用小模型降低成本）
        String summary = chat(List.of(
                message("system", "你是一个对话摘要助手，将对话历史压缩成简洁的背景摘要。"),
                message("user", summaryPrompt)
        ));

        // 更新存储
        summaryStore.put(sessionId, summary);
        store.put(sessionId, recentMessages);

        System.out.println("[压缩触发] 将" + earlyMessages.size() + "条早期消息压缩为摘要");
        System.out.println("[摘要内容] " + summary);
    }

    /**
     * 组装发给LLM API的messages
     */
    public List<JsonObject> buildMessages(String sessionId,
                                          String systemPrompt,
                                          String currentQuestion) {
        List<JsonObject> messages = new ArrayList<>();
        messages.add(message("system", systemPrompt));

        // 如果有摘要，作为背景信息注入
        String summary = summaryStore.get(sessionId);
        if (summary != null && !summary.isEmpty()) {
            messages.add(message("system", "【对话背景摘要】" + summary));
        }

        // 加上最近的完整对话
        messages.addAll(store.getOrDefault(sessionId, List.of()));

        // 加上当前问题
        messages.add(message("user", currentQuestion));
        return messages;
    }

    private int estimateTotalTokens(String sessionId) {
        return store.getOrDefault(sessionId, List.of()).stream()
                .mapToInt(msg -> estimateTokens(msg.get("content").getAsString()))
                .sum();
    }

    /**
     * Token数粗估方法
     */
    static int estimateTokens(String text) {
        if (text == null || text.isEmpty()) return 0;
        int chineseChars = 0, otherChars = 0;
        for (char c : text.toCharArray()) {
            if (Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN) {
                chineseChars++;
            } else if (!Character.isWhitespace(c)) {
                otherChars++;
            }
        }
        return (int) (chineseChars * 1.5 + otherChars / 4.0);
    }
    
    // chat() 和 message() 方法省略...
}
```

### 效果对比：三种策略同时跑

用一个6轮深入讨论Spring Bean生命周期的场景：

```
===== 无记忆模式 =====
第1轮 - 学生：Spring Bean的作用域有哪些？
导师：Spring Bean有singleton、prototype、request、session等作用域...

第2轮 - 学生：那默认是哪种？
导师：请问您想了解哪个框架或组件的默认配置呢？
❌ 不知道在问Spring Bean

===== 滑动窗口（N=3） =====
第1轮~第5轮：正常回答...

第6轮 - 学生：回到第一个问题，除了你说的那几种作用域，还有自定义的吗？
导师：抱歉，我不确定之前提到过哪些作用域...
❌ 第1轮已被丢弃，作用域信息丢失

===== 摘要压缩（阈值2000 Token，保留最近2轮） =====
[压缩触发] 将4条早期消息压缩为摘要
[摘要内容] 学员在学习Spring Bean相关知识。已了解五种作用域
（singleton/prototype/request/session/application），默认
singleton。已理解singleton下的线程安全问题及解决方案。

第6轮 - 学生：回到第一个问题，除了你说的那几种作用域，还有自定义的吗？
导师：除了之前提到的singleton、prototype、request、session、application
五种内置作用域外，Spring确实支持自定义作用域...
✅ 通过摘要保留了早期信息
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
