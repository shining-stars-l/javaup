---
slug: /damai-ai/interview/SpringAIAndLangChain4j
---

import VipInline from '@site/src/components/VipInline';

# Spring AI 和 LangChain4j 两者的区别

> > 大麦AI项目使用的是Spring AI，这里聊聊它跟LangChain4j到底有啥不一样
>

## 先说结论
如果你是Spring开发者，用Spring AI准没错，上手快、配置少、生态好。如果你不想被Spring绑定，或者项目比较特殊，LangChain4j也是个好选择。

---

## 一、这俩玩意儿是干啥的？
简单说，Spring AI和LangChain4j都是帮Java开发者接入大模型的框架。就像你用MyBatis操作数据库一样，这俩框架帮你操作AI模型。

但它们的"气质"完全不一样：

+ **Spring AI**：Spring官方出品，走的是"约定大于配置"的老路子，搞Spring那套的同学闭着眼睛都能上手
+ **LangChain4j**：从Python的LangChain移植过来的，更灵活但也更"原始"一点，啥都要自己配

### 背景故事
**Spring AI** 是Spring官方在2023年底开始搞的项目，2024年5月发布1.0正式版。说白了就是Spring看到Python那边LangChain火得一塌糊涂，Java这边也得有个像样的AI框架，不然Java开发者都跑去写Python了。

**LangChain4j** 则是社区项目，由Dmytro Liubarskyi在2023年发起，目标是把Python LangChain的理念搬到Java。它不绑定任何框架，Quarkus、Micronaut、纯Java都能用。

---

## 二、从设计理念看差异
### Spring AI的风格
Spring AI的核心思路就是：让你用最熟悉的方式玩AI。

```java
// 看这段代码，是不是很眼熟？
@Bean
public ChatClient chatClient(ChatModel chatModel) {
    return ChatClient.builder(chatModel)
        .defaultSystem("你是一个有帮助的助手")
        .defaultAdvisors(new MessageChatMemoryAdvisor(chatMemory))
        .build();
}
```

你写`@Bean`、配`application.yml`、用`@Autowired`注入，跟写普通Spring应用没啥两样。Spring老鸟基本上不用学新东西就能干活。

配置文件也是老配方：

```yaml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        model: gpt-4o
        options:
          temperature: 0.7
          max-tokens: 2000
```

### LangChain4j的风格
LangChain4j就不一样了，它更像是给你一堆零件，让你自己组装：

```java
// LangChain4j的写法，需要手动组装每个组件
ChatLanguageModel model = OpenAiChatModel.builder()
    .apiKey("your-api-key")
    .modelName("gpt-4")
    .temperature(0.7)
    .maxTokens(2000)
    .timeout(Duration.ofSeconds(60))
    .logRequests(true)
    .logResponses(true)
    .build();

// 记忆也要手动搞
ChatMemory chatMemory = MessageWindowChatMemory.withMaxMessages(10);

// 组装成Assistant
Assistant assistant = AiServices.builder(Assistant.class)
    .chatLanguageModel(model)
    .chatMemory(chatMemory)
    .build();
```

好处是灵活，你能看到每一步在干啥；坏处是代码量多，配置也繁琐。

---

## 三、功能详细对比
### 核心功能对比表
| 特性 | Spring AI | LangChain4j | 备注 |
| --- | --- | --- | --- |
| **上手难度** | 对Spring用户很友好 | 学习曲线稍陡 | Spring开发者选Spring AI省事 |
| **配置方式** | yml配置+自动装配 | 代码手动配置为主 | Spring AI配置更简洁 |
| **模型支持** | OpenAI/Anthropic/Ollama/通义千问/百度/DeepSeek等 | 20+个提供商 | 两者都覆盖主流 |
| **向量数据库** | Milvus/Redis/PGVector/Elasticsearch等 | 30+个存储 | LangChain4j选择更多 |
| **ETL管道** | 内置DocumentReader/Transformer | 需要更多手动编码 | Spring AI开箱即用 |
| **MCP协议** | 原生支持，官方维护SDK | 需要自己实现 | Spring AI优势明显 |
| **Spring生态** | 无缝融合 | 独立框架 | 看你项目用啥 |
| **可观测性** | Micrometer集成 | 需要自己接入 | 生产环境Spring AI更省心 |
| **社区活跃度** | Spring官方背书 | 社区驱动，更新快 | 各有所长 |


### 对话记忆（Chat Memory）
**Spring AI的做法：**

```java
// 通过Advisor机制，一行代码搞定记忆
@Bean
ChatClient chatClient(ChatModel model, ChatMemory memory) {
    return ChatClient.builder(model)
        .defaultAdvisors(new MessageChatMemoryAdvisor(memory))
        .build();
}

// 使用时不用管记忆的事，框架自动处理
String response = chatClient.prompt()
    .user("我叫张三")
    .call()
    .content();

String response2 = chatClient.prompt()
    .user("我叫什么？")  // AI会记得你叫张三
    .call()
    .content();
```

**LangChain4j的做法：**

```java
// 需要手动创建和管理ChatMemory
ChatMemory memory = MessageWindowChatMemory.builder()
    .maxMessages(20)
    .build();

// 定义接口
interface Assistant {
    String chat(@MemoryId String oderId, @UserMessage String message);
}

// 构建服务
Assistant assistant = AiServices.builder(Assistant.class)
    .chatLanguageModel(model)
    .chatMemoryProvider(memoryId -> MessageWindowChatMemory.withMaxMessages(20))
    .build();
```

### Function Calling（函数调用）
这俩框架都支持让AI调用你的Java方法，但写法不一样。

**Spring AI的写法：**

```java
// 定义函数，用@Description告诉AI这函数是干嘛的
@Bean
@Description("根据城市名查询天气信息")
public Function<WeatherRequest, WeatherResponse> weatherFunction() {
    return request -> weatherService.getWeather(request.city());
}

record WeatherRequest(String city) {}
record WeatherResponse(String city, int temperature, String condition) {}

// 使用时指定可用的函数
String response = chatClient.prompt()
    .user("北京今天天气怎么样？")
    .functions("weatherFunction")
    .call()
    .content();
```

**LangChain4j的写法：**

```java
// 定义工具类
class WeatherTools {
    @Tool("根据城市名查询天气信息")
    public String getWeather(@P("城市名") String city) {
        return weatherService.getWeather(city).toString();
    }
}

// 构建带工具的Assistant
interface WeatherAssistant {
    String chat(String message);
}

WeatherAssistant assistant = AiServices.builder(WeatherAssistant.class)
    .chatLanguageModel(model)
    .tools(new WeatherTools())
    .build();

String response = assistant.chat("北京今天天气怎么样？");
```

### RAG（检索增强生成）
RAG是现在最火的AI应用模式，就是先从知识库里检索相关内容，再让AI基于这些内容回答。

**Spring AI的RAG：**

```java
@Service
public class RagService {
    
    @Autowired
    private ChatClient chatClient;
    
    @Autowired
    private VectorStore vectorStore;
    
    // 导入文档
    public void ingestDocuments(List<Resource> resources) {
        // Spring AI内置了文档处理管道
        TikaDocumentReader reader = new TikaDocumentReader(resources);
        List<Document> documents = reader.read();
        
        // 切分
        TokenTextSplitter splitter = new TokenTextSplitter();
        List<Document> chunks = splitter.apply(documents);
        
        // 存储
        vectorStore.add(chunks);
    }
    
    // 问答
    public String ask(String question) {
        // 一行代码搞定RAG
        return chatClient.prompt()
            .user(question)
            .advisors(new QuestionAnswerAdvisor(vectorStore, SearchRequest.defaults()))
            .call()
            .content();
    }
}
```

**LangChain4j的RAG：**

```java
public class RagService {
    
    private final EmbeddingModel embeddingModel;
    private final EmbeddingStore<TextSegment> embeddingStore;
    private final ChatLanguageModel chatModel;
    
    public RagService() {
        this.embeddingModel = OpenAiEmbeddingModel.builder()
            .apiKey(apiKey)
            .build();
        this.embeddingStore = new InMemoryEmbeddingStore<>();
        this.chatModel = OpenAiChatModel.builder()
            .apiKey(apiKey)
            .modelName("gpt-4o")
            .build();
    }
    
    // 导入文档
    public void ingestDocuments(Path filePath) {
        Document document = FileSystemDocumentLoader.loadDocument(filePath);
        DocumentSplitter splitter = DocumentSplitters.recursive(300, 30);
        List<TextSegment> segments = splitter.split(document);
        
        List<Embedding> embeddings = embeddingModel.embedAll(segments).content();
        embeddingStore.addAll(embeddings, segments);
    }
    
    // 问答 - 需要手动实现检索和拼接
    public String ask(String question) {
        // 检索
        Embedding queryEmbedding = embeddingModel.embed(question).content();
        List<EmbeddingMatch<TextSegment>> matches = 
            embeddingStore.findRelevant(queryEmbedding, 5);
        
        // 拼接上下文
        String context = matches.stream()
            .map(match -> match.embedded().text())
            .collect(Collectors.joining("\n\n"));
        
        // 构建提示词
        String prompt = String.format("""
            基于以下信息回答问题。如果信息不足，请说明。
            
            相关信息：
            %s
            
            问题：%s
            """, context, question);
        
        return chatModel.generate(prompt);
    }
}
```

看得出来，Spring AI在RAG这块封装得更好，用`QuestionAnswerAdvisor`一行代码就完事了。LangChain4j要自己写检索、拼接上下文的逻辑。

---

## 四、Spring AI版本详解
### 1.0.x - 奠基版本（2024年5月）
Spring AI在2024年5月发布了1.0正式版，这是个里程碑。主要能力：

**ChatClient API** - 统一的对话接口

这是跟大模型聊天的入口，设计得很优雅：

```java
// 同步调用
String response = chatClient.prompt()
    .system("你是一个专业的助手")
    .user("帮我写一首诗")
    .call()
    .content();

// 流式调用
Flux<String> stream = chatClient.prompt()
    .user("讲个故事")
    .stream()
    .content();
```

**模型支持** - 主流模型全覆盖

+ OpenAI (GPT-4o, GPT-4, GPT-3.5)
+ Anthropic (Claude 3.5 Sonnet, Claude 3 Opus)
+ Google (Gemini Pro)
+ AWS Bedrock (Claude, Llama, Titan)
+ Azure OpenAI
+ Ollama (本地模型)
+ 国产模型：通义千问、百度文心、智谱清言、DeepSeek

### 1.1.x - 功能增强版（2024年9月-2025年）
1.1版本加了很多实用功能，当前最新稳定版是**1.1.2**。

**Advisor机制升级**

Advisor是Spring AI的核心设计，可以在对话前后做各种处理。1.1版本引入了递归Advisor执行，支持复杂的多步骤工作流：

```java
// Advisor链式处理
ChatClient client = ChatClient.builder(chatModel)
    .defaultAdvisors(
        new LoggingAdvisor(),           // 日志记录
        new MessageChatMemoryAdvisor(memory),  // 对话记忆
        new QuestionAnswerAdvisor(vectorStore), // RAG检索
        new GuardrailsAdvisor(rules)     // 安全护栏
    )
    .build();
```

大麦AI里的`ChatTypeHistoryAdvisor`和`ChatTypeTitleAdvisor`就是用这个机制实现的，一个负责记录历史，一个负责生成标题。

**MCP协议支持** - Model Context Protocol

MCP是2024年底Anthropic提出的协议，用来标准化AI应用和外部工具的交互。Spring官方直接参与了MCP Java SDK的开发，所以集成得特别好：

```java
// MCP配置
@Configuration
public class McpConfig {
    @Bean
    public McpClient mcpClient() {
        return McpClient.sync("http://localhost:8080")
            .requestTimeout(Duration.ofSeconds(30))
            .build();
    }
}
```

大麦AI项目里的`mcp-servers.json`就是MCP的配置文件。

**1.1.x其他新特性：**

+ Anthropic Citations API支持（追溯生成内容来源）
+ OpenAI File API集成
+ AWS Bedrock Prompt缓存（省钱神器）
+ Oracle JDBC Chat Memory（企业级存储）
+ 132个bug修复，稳定性大幅提升

### 2.0.x - 下一代版本（2024年12月 M1预览版）
2024年12月11日，Spring AI发布了2.0.0-M1里程碑版本（注意：这是预览版，不是正式版）。

**平台大升级**

这是个大动作：

| 对比项 | 1.x | 2.x |
| --- | --- | --- |
| Java版本 | Java 17+ | Java 21+ |
| Spring Boot | 3.x | 4.0 |
| Spring Framework | 6.x | 7.0 |
| Jakarta EE | 10 | 11 |


说白了就是Spring AI 2.x跟着Spring大部队一起往前走了，用的都是最新的底层。这意味着如果你要用2.x，整个技术栈都得跟着升。

**2.0 M1新特性详解**

1. **Redis Chat Memory Repository**终于有了生产级的对话记忆存储：

```yaml
spring:
  ai:
    chat:
      memory:
        redis:
          enabled: true
          host: localhost
          port: 6379
```

支持文本搜索和范围查询，比之前的InMemory方案实用多了。

2. **Redis Vector Store增强**
    - HNSW索引参数调优
    - 向量搜索性能优化
    - 更好的元数据过滤
3. **OpenAI官方Java SDK集成**之前Spring AI是自己封装HTTP调用OpenAI，现在直接用OpenAI官方的Java SDK了，兼容性更好。
4. **新模型支持**
    - Claude 4.5系列（Opus、Haiku）
    - Google Gemini 3 Pro
    - GPT-5-mini（OpenAI新默认模型）
5. **ToolCallAdvisor扩展性增强**新增了钩子方法，可以在工具调用完成后执行自定义逻辑：

```java
public class MyToolCallAdvisor extends ToolCallAdvisor {
    @Override
    protected void onToolCallComplete(ToolCallResult result) {
        // 自定义处理，比如日志、统计等
    }
}
```

6. **Tool Argument Augmenter**这个比较高级，可以让AI在调用工具时附带额外信息（比如推理过程、置信度），方便调试和审计。

**2.0破坏性变更（升级必看）**

+ **默认温度配置移除**：以前不配temperature会用默认值，现在必须显式配置

```yaml
spring:
  ai:
    openai:
      chat:
        options:
          temperature: 0.7  # 必须配置
```

+ **默认模型变了**：OpenAI默认从gpt-4o-mini改成了gpt-5-mini，依赖旧默认值的代码行为可能不一样
+ **Java 21强制要求**：想用2.x就得升级JDK

### 该用哪个版本？
**目前（2025年初）的建议：**

| 场景 | 推荐版本 | 原因 |
| --- | --- | --- |
| 新项目，技术栈现代 | 可以尝试2.0.0-M1 | 提前适应新特性 |
| 新项目，求稳 | 1.1.2 | 稳定、文档齐全 |
| 现有项目 | 1.1.x | 等2.0 GA再升级 |
| 大麦AI | 1.0.0 | 先跑通，后续再升级 |


2.0正式版预计2025年发布，到时候再升级也不迟。

---

## 五、LangChain4j详解
光说Spring AI也不公平，LangChain4j也有很多亮点。

### 核心架构
LangChain4j分两层：

**低级API** - 直接操作模型

```java
// 直接调用模型，完全控制
ChatLanguageModel model = OpenAiChatModel.builder()
    .apiKey(apiKey)
    .modelName("gpt-4o")
    .build();

String response = model.generate("你好");
```

**高级API（AI Services）** - 声明式开发

这是LangChain4j的精华，通过接口定义AI行为：

```java
// 定义接口，描述AI能做什么
interface CustomerServiceAgent {
    
    @SystemMessage("你是一个专业的客服，回答要简洁准确")
    String chat(@UserMessage String question);
    
    @SystemMessage("分析用户情绪")
    Sentiment analyzeSentiment(String text);
    
    @SystemMessage("提取订单信息")
    OrderInfo extractOrderInfo(String text);
}

enum Sentiment { POSITIVE, NEGATIVE, NEUTRAL }
record OrderInfo(String orderId, String product, int quantity) {}

// 创建实例
CustomerServiceAgent agent = AiServices.builder(CustomerServiceAgent.class)
    .chatLanguageModel(model)
    .build();

// 使用
String answer = agent.chat("我的订单什么时候发货？");
Sentiment mood = agent.analyzeSentiment("太慢了，非常不满意！");
OrderInfo order = agent.extractOrderInfo("我买了3件T恤，订单号是ABC123");
```

这种声明式写法挺优雅的，返回值会自动解析成Java对象。

### LangChain4j的特色功能
**1. 超多模型支持**

20+个LLM提供商：

+ OpenAI、Anthropic、Google、Azure
+ Hugging Face、Ollama、LocalAI
+ AWS Bedrock、Cohere
+ 还有各种国产模型

30+个向量存储：

+ Milvus、Pinecone、Weaviate、Qdrant
+ Elasticsearch、Redis、PGVector
+ Neo4j、Chroma、更多...

**2. 结构化输出**

让AI直接返回Java对象：

```java
interface PersonExtractor {
    @UserMessage("从文本中提取人员信息：{{text}}")
    Person extractPerson(@V("text") String text);
}

record Person(String name, int age, String occupation) {}

Person person = extractor.extractPerson(
    "张三今年28岁，是一名软件工程师"
);
// person = Person(name="张三", age=28, occupation="软件工程师")
```

**3. 工具/函数调用**

```java
class SearchTools {
    @Tool("搜索商品")
    public List<Product> searchProducts(
        @P("关键词") String keyword,
        @P("最大数量") int maxResults
    ) {
        return productService.search(keyword, maxResults);
    }
    
    @Tool("查询库存")
    public int checkInventory(@P("商品ID") String productId) {
        return inventoryService.getStock(productId);
    }
}
```

**4. 对话记忆**

支持多种记忆策略：

```java
// 滑动窗口（保留最近N条）
ChatMemory memory = MessageWindowChatMemory.withMaxMessages(20);

// 按Token数量限制
ChatMemory memory = TokenWindowChatMemory.withMaxTokens(3000, tokenizer);

// 自定义存储
ChatMemoryStore store = new PersistentChatMemoryStore(database);
```

**5. 检索增强（RAG）**

```java
// 内容检索器
ContentRetriever retriever = EmbeddingStoreContentRetriever.builder()
    .embeddingStore(embeddingStore)
    .embeddingModel(embeddingModel)
    .maxResults(5)
    .minScore(0.7)
    .build();

// 注入到AI Service
interface KnowledgeAssistant {
    String answer(@UserMessage String question);
}

KnowledgeAssistant assistant = AiServices.builder(KnowledgeAssistant.class)
    .chatLanguageModel(model)
    .contentRetriever(retriever)
    .build();
```

### LangChain4j + Quarkus/Micronaut
如果你不用Spring，LangChain4j有专门的扩展：

**Quarkus集成：**

```xml
<dependency>
    <groupId>io.quarkiverse.langchain4j</groupId>
    <artifactId>quarkus-langchain4j-openai</artifactId>
</dependency>

```

```java
@RegisterAiService
interface MyAssistant {
    String chat(String message);
}

@Inject
MyAssistant assistant;
```

Quarkus那边的集成做得也不错，有专门的扩展包。

---

## 六、两个框架的优劣势
### Spring AI的优势
1. **上手成本低**Spring开发者不用学新概念，写法跟平时一样
2. **配置简洁**yml配置+自动装配，不用写一堆Builder代码
3. **生态整合好**跟Spring Boot、Spring Data、Spring Security无缝配合，Actuator监控开箱即用
4. **MCP协议支持**Spring官方参与了MCP Java SDK开发，集成度最好
5. **官方维护**VMware/Broadcom背书，长期维护有保障
6. **可观测性**天然集成Micrometer，指标、链路追踪都有

### Spring AI的劣势
1. **绑定Spring**不用Spring的项目没法用
2. **灵活性差点**封装太好，有时候想定制比较麻烦
3. **版本还在演进**1.x到2.x有破坏性变更，API还在调整

### LangChain4j的优势
1. **框架无关**Spring、Quarkus、Micronaut、纯Java都能用
2. **支持广泛**20+模型提供商，30+向量存储，选择最多
3. **底层可控**低级API让你掌控一切细节
4. **AI Services设计精巧**声明式接口+注解，写法很优雅
5. **跟Python LangChain概念对齐**团队有Python背景的话，概念迁移成本低

### LangChain4j的劣势
1. **配置繁琐**没有Spring的自动装配，啥都要手动搞
2. **社区驱动**没有大厂背书，长期维护不确定
3. **文档相对少**跟Spring AI比，教程和示例少一些
4. **可观测性弱**监控得自己接入

---

## 七、实战代码对比
### 场景：实现一个带记忆的客服机器人
**Spring AI实现：**

```java
@Configuration
public class ChatConfig {
    
    @Bean
    public ChatMemory chatMemory() {
        return new InMemoryChatMemory();
    }
    
    @Bean
    public ChatClient chatClient(ChatModel chatModel, ChatMemory chatMemory) {
        return ChatClient.builder(chatModel)
            .defaultSystem("""
                你是大麦AI客服，负责解答用户关于演出、票务的问题。
                回答要简洁、专业、有礼貌。
                """)
            .defaultAdvisors(
                new MessageChatMemoryAdvisor(chatMemory),
                new SimpleLoggerAdvisor()
            )
            .build();
    }
}

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    
    @Autowired
    private ChatClient chatClient;
    
    @PostMapping
    public String chat(@RequestBody ChatRequest request) {
        return chatClient.prompt()
            .user(request.message())
            .advisors(a -> a.param("conversationId", request.sessionId()))
            .call()
            .content();
    }
}

record ChatRequest(String sessionId, String message) {}
```

**LangChain4j实现：**

```java
// 定义接口
interface CustomerServiceBot {
    @SystemMessage("""
        你是大麦AI客服，负责解答用户关于演出、票务的问题。
        回答要简洁、专业、有礼貌。
        """)
    String chat(@MemoryId String sessionId, @UserMessage String message);
}

@Configuration
public class LangChain4jConfig {
    
    @Bean
    public ChatLanguageModel chatModel() {
        return OpenAiChatModel.builder()
            .apiKey(System.getenv("OPENAI_API_KEY"))
            .modelName("gpt-4o")
            .temperature(0.7)
            .build();
    }
    
    @Bean
    public CustomerServiceBot customerServiceBot(ChatLanguageModel model) {
        return AiServices.builder(CustomerServiceBot.class)
            .chatLanguageModel(model)
            .chatMemoryProvider(sessionId -> 
                MessageWindowChatMemory.withMaxMessages(20))
            .build();
    }
}

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    
    @Autowired
    private CustomerServiceBot bot;
    
    @PostMapping
    public String chat(@RequestBody ChatRequest request) {
        return bot.chat(request.sessionId(), request.message());
    }
}

record ChatRequest(String sessionId, String message) {}
```

两种写法都能实现功能，Spring AI更简洁，LangChain4j的接口定义更显式。

---

## 八、迁移指南
### 从LangChain4j迁移到Spring AI
如果你之前用LangChain4j，现在想换Spring AI：

| LangChain4j | Spring AI | 说明 |
| --- | --- | --- |
| `ChatLanguageModel` | `ChatModel` | 模型接口 |
| `AiServices` | `ChatClient` | 核心入口 |
| `@Tool` | `@Description` + Function | 函数调用 |
| `ChatMemory` | `ChatMemory` + `Advisor` | 对话记忆 |
| `EmbeddingStore` | `VectorStore` | 向量存储 |
| `ContentRetriever` | `QuestionAnswerAdvisor` | RAG检索 |


### 从Spring AI迁移到LangChain4j
反过来迁移的话：

| Spring AI | LangChain4j | 说明 |
| --- | --- | --- |
| `ChatClient` | `AiServices.builder()` | 核心入口 |
| `Advisor` | 自己实现或用AiServices装饰 | 拦截器 |
| `VectorStore` | `EmbeddingStore` | 向量存储 |
| yml配置 | Builder代码 | 配置方式 |


---

## 九、总结
Spring AI和LangChain4j都是好东西，没有绝对的好坏，只有适不适合。

**选Spring AI如果：**

+ 你是Spring开发者
+ 项目已经用了Spring Boot
+ 希望尽快出活，不想折腾配置
+ 需要MCP协议支持
+ 看重官方长期维护
+ 需要完善的可观测性

**选LangChain4j如果：**

+ 不想被Spring绑定
+ 项目不用Spring框架
+ 需要支持一些小众的AI提供商或向量库
+ 团队有Python LangChain的使用经验
+ 喜欢更底层的控制
+ 想要声明式的AI Services API

**对于大麦AI这种基于Spring Boot的项目**，Spring AI是最自然的选择。目前用的是1.0.0版本，功能够用了。等Spring AI 2.0正式版出来，可以考虑升级，享受更多新特性。

最后说一句：这俩框架不是互斥的，在同一个项目里混用也完全可以。比如用Spring AI做主体，某些特殊场景用LangChain4j补充，也是个思路。

关键是先把需求搞清楚，再选合适的工具。别为了用框架而用框架。

<VipInline />
