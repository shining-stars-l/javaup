---
slug: /super-agent/rag/advanced-optimization-v1
description: "标准RAG跑通后，如何进一步提升系统能力？本文详解Graph RAG、查询路由、查询构造、元数据过滤、问题澄清、Spring AI Modular RAG等进阶技术"
keywords: ["Graph RAG", "查询路由", "查询构造", "元数据过滤", "问题澄清", "Spring AI", "Modular RAG", "知识图谱"]
---

# 进阶优化：让RAG系统更上一层楼

## 标准RAG的天花板

前面十几篇把RAG的核心链路走了一遍：文档预处理、分片、向量化、混合检索、重排序、生成。跑下来一套标准的RAG系统已经能用了。

但"能用"和"好用"之间还有不小的距离。标准RAG在这些场景会露怯：

- 文档之间有复杂的关联关系（比如"A依赖B，B依赖C"），纯向量检索理解不了
- 用户的问题需要查不同类型的数据源（向量库、关系型数据库、图数据库）
- 不同版本的文档内容有冲突，需要精确过滤
- 用户的问题太模糊，需要先澄清再检索

这一篇就来聊聊这些进阶优化技术。

```plantuml title="RAG进阶优化方向：标准链路跑通后的四个升级维度" width="100%" maxWidth="1000px" align="left"
@startuml
skinparam backgroundColor #F8FBFD
skinparam roundcorner 18
skinparam shadowing false
skinparam defaultFontName Microsoft YaHei
skinparam defaultFontSize 14
skinparam defaultTextAlignment center
skinparam dpi 160
skinparam ArrowColor #0F766E
skinparam ArrowThickness 1.4

skinparam rectangle {
  BackgroundColor #FFFFFF
  BorderColor #38BDF8
  FontColor #0F172A
}

left to right direction
rectangle "标准RAG主链路\n预处理→检索→生成" as Base
rectangle "Graph RAG\n实体关系与多跳推理" as Graph
rectangle "智能路由\n按问题类型选择数据源和策略" as Route
rectangle "元数据过滤\n精确缩小检索范围" as Meta
rectangle "问题澄清\n主动交互获取更多信息" as Clarify

Base --> Graph
Base --> Route
Base --> Meta
Base --> Clarify
@enduml
```

## Graph RAG：让知识有关系

### 传统RAG处理不了的问题

假设你在搭一个影视知识库，用户问：`《十面埋伏》的导演还执导过哪些电影？`

这是一个典型的多跳问题，需要两步推理：
1. 找到《十面埋伏》的导演是谁（张艺谋）
2. 找到张艺谋还导演了哪些电影

传统RAG用向量检索，可能返回一堆和《十面埋伏》相关的影评、剧情介绍，但不一定能把"导演→其他作品"这条关系链串起来。

Graph RAG的核心思想是：**把非结构化文本转化为结构化的图，在图上进行检索和推理**。

### 知识图谱基础

知识图谱用三元组表示实体之间的关系：**(实体, 关系, 实体)**

```
(张艺谋, 导演了, 十面埋伏)
(张艺谋, 导演了, 英雄)
(张艺谋, 导演了, 影)
(陈思诚, 导演了, 误杀)
```

有了这个图结构，"《十面埋伏》的导演还执导过哪些电影"就变成了一个简单的图遍历：从"十面埋伏"节点出发，沿着"导演了"关系找到"张艺谋"，再从"张艺谋"出发找到他导演的其他电影。

### Neo4j + Spring Data实战

用Neo4j作为图数据库，Spring Data Neo4j做集成。

**定义实体**

```java
@Node("Movie")
public class Movie {
    @Id
    private String title;
    private int year;
}

@Node("Director")
public class Director {
    @Id
    private String name;
}
```

**定义图查询**

```java
@Repository
public interface MovieGraphRepository
        extends Neo4jRepository<Movie, String> {

    @Query("""
        MATCH (m:Movie {title: $title})
            <-[:DIRECTED]- (d:Director)
            -[:DIRECTED]-> (other:Movie)
        WHERE other.title <> $title
        RETURN d.name AS director,
               collect(other.title + ' (' + other.year + ')')
               AS otherMovies
        """)
    List<Map<String, Object>> findOtherMoviesBySameDirector(
        String title);
}
```

这段Cypher查询的逻辑：找到电影→找到导演→找到导演的其他电影。

**结合大模型生成回答**

```java
@GetMapping("/ask")
public String ask(@RequestParam String movieName) {
    // 1. 从图数据库检索关系数据
    List<Map<String, Object>> results =
        repository.findOtherMoviesBySameDirector(movieName);

    // 2. 构建上下文
    StringBuilder context = new StringBuilder();
    for (Map<String, Object> row : results) {
        String director = (String) row.get("director");
        List<String> movies = (List<String>) row.get("otherMovies");
        context.append(String.format(
            "导演%s还执导了：%s\n",
            director, String.join("、", movies)));
    }

    // 3. 交给大模型生成自然语言回答
    String prompt = """
        你是一个影视知识助手，根据以下信息回答问题。
        如果信息不足，请说"我不知道"。

        信息：%s

        问题：%s的导演还执导过哪些电影？
        """.formatted(context, movieName);

    return chatModel.call(prompt);
}
```

:::info Graph RAG的适用场景
Graph RAG特别适合需要多跳推理的场景：组织架构查询（"张三的直属领导是谁的下属"）、依赖关系分析（"服务A依赖的服务中哪些有告警"）、知识关联（"这个药物和哪些药物有相互作用"）。如果你的问题只需要单次检索就能回答，标准RAG就够了，不需要引入图数据库。
:::

## 查询路由：把问题送到对的地方

### 为什么需要路由

企业内部的知识不全在文档里。组织架构信息在关系型数据库，文档知识在向量库，实体关系在图数据库。用户提问时，系统需要判断这个问题应该去哪里查。

```
"公司的请假制度是什么" → 向量数据库（文档检索）
"研发部有多少人" → 关系型数据库（SQL查询）
"张三的汇报线是什么" → 图数据库（关系查询）
```

### 数据源路由实现

用大模型做意图识别，判断问题应该路由到哪个数据源：

```java
@AiService
public interface QueryRoutingService {

    @SystemMessage("""
        判断用户的查询适合使用哪种数据库检索。
        语义搜索、文档检索类问题，回答'VECTOR'
        关系查询、知识图谱类问题，回答'GRAPH'
        结构化数据查询、统计分析类问题，回答'RELATIONAL'
        无法确定时回答'VECTOR'
        只回答VECTOR、GRAPH或RELATIONAL。
        """)
    String routeDataSource(String userQuery);
}
```

根据路由结果调用不同的数据源：

```java
@GetMapping("/query")
public String query(@RequestParam String question) {
    String dbType = routingService.routeDataSource(question);

    String searchResult = switch (dbType.trim()) {
        case "GRAPH" -> graphService.search(question);
        case "RELATIONAL" -> sqlService.search(question);
        default -> vectorService.search(question);
    };

    // 把检索结果交给大模型生成回答
    return generateAnswer(searchResult, question);
}
```

### Prompt路由：不同问题用不同的提示词

除了数据源路由，还可以做Prompt路由——根据问题类型选择不同的System Prompt。

比如搭一个医疗助手，病情咨询和用药建议需要不同的专业角色：

```java
@AiService
public interface MedicalService {

    @SystemMessage("你是一个专业的医生，从医疗角度给出建议。")
    Flux<String> doctorConsultation(String message);

    @SystemMessage("你是一个药学专家，在用药方面给出建议。")
    Flux<String> pharmacistConsultation(String message);

    @SystemMessage("""
        判断用户是咨询病情还是用药建议。
        病情相关回答'DOCTOR'，用药相关回答'PHARMACIST'。
        """)
    String determineType(String message);
}
```

## 查询构造：自然语言转SQL

### Text-to-SQL

如果路由到了关系型数据库，就需要把自然语言转成SQL。这就是Text-to-SQL技术。

核心思路：把表结构信息和用户问题一起交给大模型，让它生成SQL。

```java
@Service
public class SqlQueryService {

    @Autowired
    private ChatModel chatModel;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final String TEXT_2_SQL_PROMPT = """
        你是一个SQL专家。根据以下表结构将用户问题转换为SQL。
        注意：只能查询，不能修改或删除。

        表结构信息：
        {tables}

        用户问题：
        {user_query}

        要求：
        1. 只返回SQL语句，不要解释
        2. 确保SQL语法正确
        3. 无法查询时返回空字符串

        今天是：{today}
        """;

    public String text2sql(String query) {
        PromptTemplate template = new PromptTemplate(TEXT_2_SQL_PROMPT);
        Prompt prompt = template.create(Map.of(
            "user_query", query,
            "tables", TABLE_SCHEMA,
            "today", LocalDate.now().toString()
        ));

        return chatClient.prompt(prompt).call().content();
    }

    public Object executeQuery(String question, Class<?> resultType) {
        String sql = text2sql(question);
        if (StringUtils.isBlank(sql)) return null;
        return jdbcTemplate.queryForObject(sql, resultType);
    }
}
```

关键点：表结构信息（建表语句+字段注释）必须提供给大模型，它才知道SQL该怎么写。日期信息也很重要——"最近一周"、"上个月"这类查询需要知道当前时间。

## 元数据过滤：精确缩小检索范围

### 为什么需要元数据

向量检索的本质是相似度查询，但很多时候我们需要的是精确过滤+相似度查询的组合。

举个例子：你有三个版本的产品手册——2023版、2024版、2025版。用户问"根据2023版手册，产品怎么启动"。

如果不做元数据过滤，三个版本的"产品启动"内容相似度都很高，都会被检索到。但2024版说"旋钮启动"，2025版说"手机启动"，混在一起就会给出错误答案。

有了元数据过滤，先按版本号过滤，只在2023版的文档块中做相似度检索，结果就准确了。

### 元数据的三个典型用途

**精确过滤**：按文档名、版本号、部门等条件缩小检索范围

**提供参考源**：在回答中展示"来源：《产品手册2023版》第5页"，增加可信度

**访问权限控制**：不同用户只能检索到自己有权限的文档

### Spring AI中的元数据过滤

存储时给文档块打上元数据标签：

```java
@GetMapping("/embedding")
public String embedding(String filePath, String fileName) {
    List<Document> documents = documentReader.read(new File(filePath));

    // 给每个文档块添加元数据
    for (Document doc : documents) {
        doc.getMetadata().put("fileName", fileName);
        doc.getMetadata().put("version", "2023");
    }

    embeddingService.embedAndStore(documents);
    return "success";
}
```

检索时用`filterExpression`做精确过滤：

```java
List<Document> results = vectorStore.similaritySearch(
    SearchRequest.builder()
        .query(query)
        .topK(5)
        .similarityThreshold(0.5)
        .filterExpression("fileName == '产品手册2023版'")
        .build()
);
```

结合`RetrievalAugmentationAdvisor`使用：

```java
Advisor advisor = RetrievalAugmentationAdvisor.builder()
        .documentRetriever(
            VectorStoreDocumentRetriever.builder()
                .vectorStore(vectorStore)
                .similarityThreshold(0.5)
                .build()
        )
        .build();

String answer = chatClient.prompt()
        .advisors(advisor)
        .advisors(a -> a.param(
            VectorStoreDocumentRetriever.FILTER_EXPRESSION,
            "fileName == '" + fileName + "'"))
        .user(query)
        .call()
        .content();
```

:::tip 元数据过滤的实际应用
实际环境中，文件名的提取通常也需要大模型来做参数抽取。比如用户说"根据2023版手册..."，需要先用大模型识别出"2023版"这个过滤条件，再构造filterExpression。
:::

## 问题澄清：主动问用户要信息

### 什么时候需要澄清

有些问题太模糊，即使用了问题改写也不一定能回答好。这时候最直接的办法是——问用户。

比如搭一个旅行规划助手，用户说"帮我规划一下旅行"。你不知道去哪、什么时候、几个人、预算多少，怎么规划？

### 通过Prompt实现问题澄清

核心思路是在System Prompt中定义信息收集阶段和规划生成阶段：

```java
public interface TravelPlanningService {

    @SystemMessage("""
        你是一个旅行顾问，擅长制定个性化旅行方案。

        【信息收集阶段】
        - 通过自然对话了解：目的地、时间、预算、人员、偏好
        - 每次最多问1-2个问题，不要像审问
        - 用建议来引出问题："这个地方不错！大概预算多少？"

        【规划生成阶段】
        - 掌握了核心信息后，生成详细的日程规划
        - 包含住宿、交通、活动、注意事项
        """)
    String chat(@MemoryId String memoryId,
                @UserMessage String input);
}
```

注意这里用了`@MemoryId`——问题澄清是多轮对话，需要记住之前收集到的信息。

```java
@GetMapping("/chat")
public String chat(@RequestParam String sessionId,
                   @RequestParam String message) {
    return travelService.chat(sessionId, message);
}

// 当用户觉得信息够了，可以强制生成规划
@GetMapping("/force-plan")
public String forcePlan(@RequestParam String sessionId) {
    return travelService.chat(sessionId,
        "请基于我们的所有对话，生成完整的行程规划");
}
```

## Spring AI Modular RAG：框架级的流程编排

Spring AI提供了`RetrievalAugmentationAdvisor`，把RAG流程拆分为可插拔的模块：

```java
Advisor advisor = RetrievalAugmentationAdvisor.builder()
    // 查询预处理：改写/压缩（可选）
    .queryTransformers(queryTransformer)
    // 查询扩展：一个问题变多个（可选）
    .queryExpander(queryExpander)
    // 文档检索（必需）
    .documentRetriever(documentRetriever)
    // 文档合并：去重排序（可选）
    .documentJoiner(documentJoiner)
    // 上下文增强：构建最终Prompt（可选）
    .queryAugmenter(queryAugmenter)
    .build();
```

整个流程是：

1. **QueryTransformer**：检索前对问题做改写、压缩、翻译
2. **QueryExpander**：把一个问题扩展成多个变体
3. **DocumentRetriever**：执行向量检索
4. **DocumentJoiner**：多个检索结果合并去重
5. **QueryAugmenter**：把检索结果和用户问题融合成最终Prompt

每个环节都是可选的，根据实际需求灵活组合。比如简单场景只需要DocumentRetriever，复杂场景可以全部启用。

### ContextualQueryAugmenter：检索后的上下文增强

`QueryAugmenter`在检索完成后、模型生成前，把检索结果注入到Prompt中：

```java
QueryAugmenter augmenter = ContextualQueryAugmenter.builder()
        .allowEmptyContext(true)  // 允许空上下文
        .build();
```

它会自动生成类似这样的Prompt：

```
Context information is below.
---------------------
[检索到的文档内容]
---------------------

Given the context information and no prior knowledge,
answer the query.

Query: [用户问题]
```

:::info Modular RAG的定位
Spring AI的Modular RAG支持目前还比较基础，适合快速搭建标准RAG流程。如果你需要更复杂的定制（比如混合检索、重排序、自定义融合策略），建议在RetrievalAugmentationAdvisor的基础上自行扩展，或者完全自己编排流程。
:::

## 性能调优清单

最后给一个实用的性能调优清单：

| 优化方向 | 具体措施 | 预期效果 |
| :--- | :--- | :--- |
| 减少检索延迟 | 向量索引选择HNSW，调整ef参数 | 检索延迟降低30-50% |
| 减少大模型调用 | 缓存热门问题的改写结果 | 改写延迟降为0 |
| 提升召回率 | 混合检索 + 问题多样化 | 召回率提升20-40% |
| 提升排序精度 | 引入Reranker | Top-3精度提升15-30% |
| 减少幻觉 | 优化System Prompt + 低Temperature | 幻觉率降低50%+ |
| 精确过滤 | 元数据过滤 | 消除版本/权限混淆 |

调优的优先级建议：先保证召回覆盖率 → 再优化排序精度 → 再抑制幻觉 → 最后做性能优化。

## 小结

这篇覆盖了RAG的几个进阶优化方向：

- Graph RAG通过知识图谱解决多跳推理问题
- 查询路由把问题送到合适的数据源
- 查询构造（Text-to-SQL）让自然语言能查关系型数据库
- 元数据过滤实现精确的版本/权限控制
- 问题澄清通过多轮对话收集足够的信息
- Spring AI Modular RAG提供了框架级的流程编排能力

这些技术不需要一次全上，根据实际业务的痛点按需引入就好。先把标准RAG跑稳，再针对真实瓶颈定向升级。
