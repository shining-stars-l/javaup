---
slug: /super-agent/rag/modular-rag
description: "前面讲的改写、检索、重排序都是单独的模块，Spring AI的Modular RAG把这些模块用一条流水线串起来。本文拆解每个组件的用法，并给出完整的组装实战"
keywords: ["Modular RAG", "Spring AI", "RetrievalAugmentationAdvisor", "QueryTransformer", "QueryExpander", "DocumentJoiner", "LangChain4j", "RAG流水线"]
---

# 把RAG的零件组装成流水线

前面几篇文章，我们逐个拆解了RAG的各个环节：问题改写、意图识别、混合检索、重排序、元数据过滤。每个环节都是独立的模块，各自解决一个具体问题。

但在实际项目中，这些模块需要串起来形成一条完整的流水线。手动串联当然可以（前面的代码示例就是这么做的），但如果框架能提供一个标准化的编排机制，开发效率会高很多。

Spring AI的`RetrievalAugmentationAdvisor`就是干这个事的——它定义了一套Modular RAG的标准流水线，把查询预处理、文档检索、后处理、Prompt增强这些步骤用插件化的方式组织起来。

:::info 先说实话
Spring AI的Modular RAG支持目前还比较基础，组件不多，灵活性也有限。但作为一个开箱即用的起点，它能帮你快速搭建一个标准的RAG流程，后续再根据需要替换或扩展其中的组件。
:::

## 流水线长什么样

`RetrievalAugmentationAdvisor`内部的处理流程是这样的：

```plantuml title="Spring AI Modular RAG 流水线" width="50%" align="left"
@startuml
skinparam backgroundColor #FEFEFE
skinparam roundcorner 12
skinparam shadowing false
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 13

skinparam activity {
    BackgroundColor #E8F4FD
    BorderColor #4A90D9
    FontColor #2C3E50
    ArrowColor #4A90D9
}

start
:用户提问;

partition "1. QueryTransformer\n（查询预处理）" {
    :改写/压缩/翻译查询;
}

partition "2. QueryExpander\n（查询扩展）" {
    :一个查询扩展为多个;
}

partition "3. DocumentRetriever\n（文档检索）" {
    :从向量库检索文档;
    note right: 每个扩展查询\n分别检索
}

partition "4. DocumentJoiner\n（文档合并）" {
    :去重 + 按分数排序;
}

partition "5. QueryAugmenter\n（Prompt增强）" {
    :把检索到的文档\n注入到Prompt中;
}

:发送给大模型生成回答;
stop
@enduml
```

五个组件，每个都是可插拔的。你可以只用其中几个，也可以全部用上。

## 最简用法：三行代码搞定RAG

先看最简单的用法，感受一下：

```java
@GetMapping("/simple-rag")
public String simpleRag(@RequestParam String question) {
    // 构建Advisor：只需要一个向量库就够了
    RetrievalAugmentationAdvisor advisor = RetrievalAugmentationAdvisor.builder()
            .documentRetriever(VectorStoreDocumentRetriever.builder()
                    .vectorStore(vectorStore)
                    .topK(5)
                    .similarityThreshold(0.5)
                    .build())
            .build();

    // 注册Advisor并调用
    return chatClient.prompt()
            .advisors(advisor)
            .user(question)
            .call()
            .content();
}
```

这三步就完成了一个基本的RAG：检索相关文档 → 注入Prompt → 大模型生成。Advisor会自动把检索到的文档拼接到Prompt中，格式类似：

```
Context information is below.
---------------------
[检索到的文档内容]
---------------------
Given the context information and no prior knowledge, answer the query.
Query: [用户的问题]
```

## 逐个拆解五大组件

### 组件一：QueryTransformer——查询预处理

在检索之前对用户的查询做预处理。Spring AI提供了三个内置实现：

**CompressionQueryTransformer：多轮对话压缩**

这个组件解决的就是前面讲的"指代消解"和"上下文补全"问题。它把对话历史和当前问题压缩成一个独立的查询。

```java
CompressionQueryTransformer compression = CompressionQueryTransformer.builder()
        .chatClientBuilder(chatClientBuilder)
        .build();

// 模拟多轮对话
Query query = new Query("那它支持集群部署吗？",
    List.of(
        new UserMessage("Redis的持久化方式有哪些？"),
        new AssistantMessage("Redis支持RDB和AOF两种持久化方式……")
    ));

Query result = compression.transform(query);
// 输出类似：Redis是否支持集群部署？
```

它内部会调一次LLM，把对话历史中的上下文信息融入到当前查询中。相当于自动做了指代消解和信息补全。

**RewriteQueryTransformer：查询优化**

去掉冗余表达，让查询更适合检索。但注意：它不能处理指代消解，因为它看不到对话历史。

```java
RewriteQueryTransformer rewriter = RewriteQueryTransformer.builder()
        .chatClientBuilder(chatClientBuilder)
        .build();

Query query = new Query("我想知道那个Spring框架里面的IOC到底是个啥东西能不能给我讲讲");
Query result = rewriter.transform(query);
// 输出类似：Spring框架IOC容器的原理和作用
```

**TranslationQueryTransformer：查询翻译**

把查询翻译成目标语言。适合知识库和用户语言不一致的场景，比如用户用英文提问，但知识库是中文的。

```java
TranslationQueryTransformer translator = TranslationQueryTransformer.builder()
        .chatClientBuilder(chatClientBuilder)
        .targetLanguage("Chinese")
        .build();

Query query = new Query("What is the difference between HashMap and ConcurrentHashMap?");
Query result = translator.transform(query);
// 输出类似：HashMap和ConcurrentHashMap有什么区别？
```


### 组件二：QueryExpander——查询扩展

把一个查询扩展成多个语义相关但表达不同的查询，分别检索后合并结果。这就是前面讲的"多样化"策略的框架级实现。

```java
MultiQueryExpander expander = MultiQueryExpander.builder()
        .chatClientBuilder(chatClientBuilder)
        .numberOfQueries(3)      // 扩展出3个查询
        .includeOriginal(true)   // 保留原始查询
        .build();

Query query = new Query("Spring Boot如何实现定时任务");
List<Query> expanded = expander.expand(query);
// 可能输出4个查询（原始 + 3个扩展）：
// 1. Spring Boot如何实现定时任务
// 2. Spring Boot定时任务的配置方式和注解
// 3. Spring Boot中@Scheduled注解的使用方法
// 4. Spring Boot定时任务框架对比（@Scheduled vs Quartz）
```

每个扩展查询都会独立去向量库检索，最后由DocumentJoiner合并去重。这样做的好处是：即使某个表达方式检索不到结果，其他表达方式可能能检索到，提高了整体召回率。

### 组件三：DocumentRetriever——文档检索

这是唯一一个必须配置的组件。目前Spring AI只提供了`VectorStoreDocumentRetriever`一个实现。

```java
VectorStoreDocumentRetriever retriever = VectorStoreDocumentRetriever.builder()
        .vectorStore(vectorStore)
        .topK(10)
        .similarityThreshold(0.5)
        .filterExpression("category == 'tech-doc'")  // 元数据过滤
        .build();
```

如果你需要混合检索（向量+关键词），目前Spring AI没有内置支持，需要自己实现`DocumentRetriever`接口。

### 组件四：DocumentJoiner——文档合并

当QueryExpander把一个查询扩展成多个后，每个查询都会检索出一批文档。DocumentJoiner负责把这些文档合并成一个列表。

`ConcatenationDocumentJoiner`是默认实现，它做两件事：
1. 按文档ID去重（同一个文档被多个查询命中，只保留一份）
2. 按相似度分数降序排列

```java
ConcatenationDocumentJoiner joiner = new ConcatenationDocumentJoiner();
```

一般不需要自定义，默认的就够用了。

### 组件五：QueryAugmenter——Prompt增强

检索完成后，把文档内容注入到发给大模型的Prompt中。

`ContextualQueryAugmenter`是默认实现，它会生成这样的Prompt：

```
Context information is below.
---------------------
[文档1的内容]
[文档2的内容]
...
---------------------
Given the context information and no prior knowledge, answer the query.
Query: [用户的问题]
```

如果检索结果为空，它会告诉大模型没有找到相关信息，让大模型据实回答而不是编造。

## 全组件组装实战

把五个组件全部用上，组装一条完整的RAG流水线：

```java
@RestController
@RequestMapping("/api/modular-rag")
public class ModularRagController {

    private final ChatClient chatClient;
    private final VectorStore vectorStore;
    private final ChatClient.Builder chatClientBuilder;

    @GetMapping("/chat")
    public Flux<String> chat(@RequestParam String question) {
        // 组装完整的Modular RAG流水线
        RetrievalAugmentationAdvisor advisor = RetrievalAugmentationAdvisor.builder()
                // 1. 查询预处理：优化表达
                .queryTransformers(
                    RewriteQueryTransformer.builder()
                            .chatClientBuilder(chatClientBuilder)
                            .build())
                // 2. 查询扩展：一个变多个
                .queryExpander(
                    MultiQueryExpander.builder()
                            .chatClientBuilder(chatClientBuilder)
                            .numberOfQueries(3)
                            .includeOriginal(true)
                            .build())
                // 3. 文档检索
                .documentRetriever(
                    VectorStoreDocumentRetriever.builder()
                            .vectorStore(vectorStore)
                            .topK(10)
                            .similarityThreshold(0.4)
                            .build())
                // 4. 文档合并（默认实现，可以不显式配置）
                .documentJoiner(new ConcatenationDocumentJoiner())
                // 5. Prompt增强（默认实现，可以不显式配置）
                .queryAugmenter(ContextualQueryAugmenter.builder().build())
                .build();

        return chatClient.prompt()
                .advisors(advisor)
                .user(question)
                .stream()
                .content();
    }
}
```

### 带元数据过滤的版本

如果需要根据用户传入的条件做元数据过滤：

```java
@GetMapping("/chat-filtered")
public Flux<String> chatFiltered(@RequestParam String question,
                                  @RequestParam(required = false) String version) {
    RetrievalAugmentationAdvisor advisor = RetrievalAugmentationAdvisor.builder()
            .documentRetriever(
                VectorStoreDocumentRetriever.builder()
                        .vectorStore(vectorStore)
                        .topK(5)
                        .similarityThreshold(0.5)
                        .build())
            .build();

    var prompt = chatClient.prompt()
            .advisors(advisor)
            .user(question);

    // 动态传入过滤表达式
    if (version != null) {
        prompt.advisors(spec -> spec.param(
                VectorStoreDocumentRetriever.FILTER_EXPRESSION,
                "version == '" + version + "'"));
    }

    return prompt.stream().content();
}
```

### 带多轮对话支持的版本

如果需要处理多轮对话中的指代问题，用CompressionQueryTransformer替换RewriteQueryTransformer：

```java
@GetMapping("/chat-with-history")
public Flux<String> chatWithHistory(@RequestParam String question,
                                     @RequestParam String sessionId) {
    // 获取对话历史
    List<Message> history = sessionStore.getHistory(sessionId);

    RetrievalAugmentationAdvisor advisor = RetrievalAugmentationAdvisor.builder()
            .queryTransformers(
                CompressionQueryTransformer.builder()
                        .chatClientBuilder(chatClientBuilder)
                        .build())
            .documentRetriever(
                VectorStoreDocumentRetriever.builder()
                        .vectorStore(vectorStore)
                        .topK(5)
                        .build())
            .build();

    return chatClient.prompt()
            .advisors(advisor)
            .messages(history)  // 传入对话历史
            .user(question)
            .stream()
            .content();
}
```


## Spring AI vs LangChain4j：文档处理能力对比

Java生态做RAG，主要就是Spring AI（含Spring AI Alibaba）和LangChain4j两个框架。它们在文档处理方面各有侧重：

| 能力维度 | Spring AI（+ Alibaba） | LangChain4j |
|---------|----------------------|-------------|
| 文档读取 | 本地文件、云存储（COS/OSS）、数据库（MySQL/MongoDB/ES）、在线平台（GitHub/Yuque/Notion）、邮件、压缩包 | Amazon S3、Azure Blob、Google Cloud Storage、本地文件、GitHub、URL |
| 文档解析 | PDF、Markdown、YAML、HTML、Tika（Office全家桶）、图片OCR、语音转文字 | TextDocumentParser、ApacheTikaDocumentParser、ApachePoiDocumentParser、MarkdownDocumentParser |
| 文本切分 | TokenTextSplitter（定长）、SentenceSplitter（语义）、RecursiveCharacterTextSplitter（递归） | DocumentByParagraphSplitter、DocumentByLineSplitter、DocumentBySentenceSplitter、DocumentByWordSplitter、DocumentByRegexSplitter、DocumentSplitters.recursive |
| 文档清洗 | 暂无内置支持 | HtmlToTextDocumentTransformer |
| 元数据增强 | ContentFormatTransformer、KeywordMetadataEnricher、SummaryMetadataEnricher | 暂无内置支持 |

简单总结：
- Spring AI的数据源接入更广（特别是加上Alibaba扩展后，国内的云存储和在线平台支持很好）
- LangChain4j的文本切分选项更多更细（按段落、按行、按句子、按词、按正则都有）
- Spring AI有元数据增强能力（自动提取关键词、生成摘要），LangChain4j没有
- LangChain4j有HTML清洗，Spring AI没有

实际项目中，两者可以混用。比如用LangChain4j的细粒度切分器处理文档，用Spring AI的VectorStore和Advisor做检索和RAG编排。

## Modular RAG的局限和应对

Spring AI的Modular RAG目前有几个明显的不足：

**没有内置重排序**

流水线里没有Reranker组件。如果需要重排序，要么自己实现一个`DocumentPostProcessor`，要么在Advisor外面手动加一层。

```java
// 变通方案：在Advisor之外手动加重排序
List<Document> docs = retriever.retrieve(query);
List<Document> reranked = rerankerService.rerank(query, docs);
// 然后手动构建Prompt...
```

**没有内置混合检索**

DocumentRetriever只有向量检索一个实现。如果需要混合检索，需要自己实现`DocumentRetriever`接口：

```java
public class HybridDocumentRetriever implements DocumentRetriever {

    private final VectorStore vectorStore;
    private final ElasticsearchService esService;

    @Override
    public List<Document> retrieve(Query query) {
        // 向量检索
        List<Document> vectorDocs = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(query.text()).topK(20).build());

        // 关键词检索 + 转换为Document
        List<Document> esDocs = esService.searchByKeyword(query.text(), 20)
                .stream()
                .map(es -> new Document(es.getContent(),
                        Map.of("source", "elasticsearch")))
                .toList();

        // RRF融合
        return rrfFusion(vectorDocs, esDocs, 10);
    }
}
```

**QueryTransformer每次都调LLM**

三个内置的QueryTransformer（Compression、Rewrite、Translation）每次都会调一次LLM。如果同时用了QueryTransformer和QueryExpander，一次用户提问就要调2次LLM（改写1次+扩展1次），再加上最终生成，总共3次LLM调用。延迟和成本都不低。

应对方案：
1. 不要同时用QueryTransformer和QueryExpander，选一个就行
2. 加缓存，相同的查询不重复改写
3. 用小模型做改写和扩展，大模型只用于最终生成

## 什么时候用Modular RAG，什么时候自己编排

| 场景 | 推荐方案 |
|------|---------|
| 快速原型、Demo演示 | Modular RAG，开箱即用 |
| 标准RAG，不需要混合检索和重排序 | Modular RAG，够用 |
| 需要混合检索、重排序、自定义逻辑 | 自己编排，更灵活 |
| 需要意图识别和多通道路由 | 自己编排，Modular RAG不支持路由 |
| 生产环境，对性能和可观测性要求高 | 自己编排，方便加日志、监控、降级 |

:::info 务实的建议
如果你的项目刚起步，用Modular RAG快速跑通一个基本版本。等业务需求复杂了（需要混合检索、重排序、意图路由），再逐步替换成自己编排的方案。前面几篇文章讲的所有模块（改写、路由、混合检索、重排序、元数据过滤、Graph RAG）都可以自由组合，不受框架限制。
:::

:::tip 小结
Spring AI的Modular RAG通过RetrievalAugmentationAdvisor提供了一条标准化的RAG流水线，包含查询预处理、查询扩展、文档检索、文档合并、Prompt增强五个可插拔组件。开箱即用，适合快速搭建标准RAG。但目前缺少重排序和混合检索的内置支持，复杂场景下建议自己编排。Spring AI和LangChain4j在文档处理方面各有所长，可以混用取长补短。
:::
