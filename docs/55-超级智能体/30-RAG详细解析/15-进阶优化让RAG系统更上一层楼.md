---
slug: /super-agent/rag/advanced-optimization
description: "深入讲解RAG系统的进阶优化技术，包括Graph RAG、多模态RAG、性能优化等高级话题"
keywords: ["Graph RAG", "多模态RAG", "知识图谱", "RAG优化", "性能调优", "召回优化"]
---

# 进阶优化：让RAG系统更上一层楼

## 基础打完了，该升级装备了

前面十篇咱们把 RAG 的核心链路走了一遍：文档预处理、分片、向量化、检索、重排序、生成。跑下来一套标准的 RAG 系统已经能用了。

但"能用"和"好用"之间还有很大的距离。

就像打游戏，你刚出新手村的时候，一把木剑一件布甲就能打小怪了。但想挑战 Boss，就得升级装备——更好的武器、更强的技能、更优的配装方案。

RAG 也是一样。基础版够用，但遇到复杂场景就会露怯：

- 文档之间有复杂的关联关系，纯向量检索理解不了
- 用户问的是图片里的内容，纯文本 RAG 无能为力
- 知识库越来越大，检索延迟越来越高
- 用户问题五花八门，单一检索策略覆盖不全

这一篇咱们就来聊聊 RAG 的进阶优化技术——怎么让系统从"能用"变成"好用"。

```plantuml title="RAG 进阶优化全景图：标准链路跑通后，常见的四个升级方向" width="100%" maxWidth="1080px" align="left"
@startuml
skinparam backgroundColor #F8FBFD
skinparam roundcorner 18
skinparam shadowing false
skinparam defaultFontName Microsoft YaHei
skinparam defaultFontSize 14
skinparam defaultTextAlignment center
skinparam linetype ortho
skinparam dpi 160
skinparam ArrowColor #0F766E
skinparam ArrowThickness 1.4
skinparam ArrowFontColor #164E63
skinparam packageStyle rectangle
skinparam componentStyle rectangle

skinparam rectangle {
  BackgroundColor #FFFFFF
  BorderColor #38BDF8
  FontColor #0F172A
}

skinparam note {
  BackgroundColor #ECFEFF
  BorderColor #67E8F9
  FontColor #155E75
}

left to right direction
rectangle "标准 RAG 主链路\n预处理 -> 检索 -> 生成" as Base
rectangle "Graph RAG\n补足实体关系与多跳推理" as Graph
rectangle "多模态 RAG\n把图片 / 图表 / 文本一起纳入检索" as Multi
rectangle "性能优化\n索引调优 / 缓存 / 预热 / 分层检索" as Perf
rectangle "策略路由\n按问题类型选择最优检索链路" as Route

Base --> Graph
Base --> Multi
Base --> Perf
Base --> Route

note bottom of Base
先把标准 RAG 跑稳，
再针对真实瓶颈定向升级，
不要一次把所有“高级特性”全堆上去
end note
@enduml
```

## Graph RAG：让知识有关系

### 纯向量检索的局限

假设你在给研发团队搭一个知识库系统，里面有各种设计文档、代码规范、架构决策记录等。

用户问：`订单服务依赖了哪些下游服务？`

向量检索返回：
- 订单服务设计文档
- 订单 API 接口说明
- 订单状态机设计
- 订单数据库表结构

这些内容确实都和"订单服务"相关，但没有一个直接回答"依赖了哪些下游服务"。因为**依赖关系**这种信息，通常散落在多个文档中，需要把它们串起来才能回答。

比如：
- 订单服务设计文档提到了"调用库存服务扣减库存"
- 支付回调处理文档提到了"订单服务接收支付服务的回调"
- 物流发货文档提到了"订单服务触发物流服务发货"

这些信息分散在不同文档里，纯向量检索很难把它们关联起来。

### 用知识图谱建立关系

Graph RAG 的核心思想是：**除了存储文档内容，还要存储文档之间的关系**。

用知识图谱的方式来表示：

```
[订单服务] --调用--> [库存服务]
[订单服务] --调用--> [支付服务]
[订单服务] --调用--> [物流服务]
[订单服务] --依赖--> [用户服务]
[订单服务] --写入--> [订单数据库]
```

当用户问"订单服务依赖了哪些下游服务"时，系统可以：

1. 识别出用户问的是"订单服务"的"依赖关系"
2. 在知识图谱中查找所有从"订单服务"出发的边
3. 返回相关的服务列表和关系描述

### Graph RAG 的实现思路

Graph RAG 的实现通常分为两个阶段：

```plantuml title="Graph RAG 的双阶段流程：先抽关系，再让图检索参与召回" width="100%" maxWidth="1080px" align="left"
@startuml
skinparam backgroundColor #F8FBFD
skinparam roundcorner 18
skinparam shadowing false
skinparam defaultFontName Microsoft YaHei
skinparam defaultFontSize 14
skinparam defaultTextAlignment center
skinparam linetype ortho
skinparam dpi 160
skinparam ArrowColor #0F766E
skinparam ArrowThickness 1.4
skinparam ArrowFontColor #164E63
skinparam packageStyle rectangle
skinparam componentStyle rectangle

skinparam actor {
  BackgroundColor #ECFDF5
  BorderColor #0F766E
  FontColor #134E4A
}

skinparam package {
  BackgroundColor #FFFFFF
  BorderColor #7DD3FC
  FontColor #164E63
}

skinparam rectangle {
  BackgroundColor #FFFFFF
  BorderColor #38BDF8
  FontColor #0F172A
}

skinparam database {
  BackgroundColor #F0FDFF
  BorderColor #0891B2
  FontColor #164E63
}

skinparam note {
  BackgroundColor #ECFEFF
  BorderColor #67E8F9
  FontColor #155E75
}

left to right direction

package "索引阶段" {
  rectangle "原始文档" as Docs
  rectangle "实体关系抽取\n服务 / 数据库 / 接口 / 依赖边" as Extract
  database "图数据库\n节点 + 边 + 属性" as GraphDB
  Docs --> Extract
  Extract --> GraphDB
}

package "查询阶段" {
  actor "用户问题" as User
  rectangle "实体识别\n识别订单服务 / 依赖关系" as Entity
  rectangle "向量检索\n找到语义相关文档" as Vector
  rectangle "图检索\n沿关系边做 1~2 跳扩展" as GraphSearch
  rectangle "结果融合\n文档证据 + 关系链路" as Merge
  rectangle "答案生成\n返回关系结论与来源" as Answer

  User --> Entity
  User --> Vector
  Entity --> GraphSearch
  GraphDB --> GraphSearch
  Vector --> Merge
  GraphSearch --> Merge
  Merge --> Answer
}

note bottom of Merge
Graph RAG 的关键价值不在“替代向量检索”，
而在把散落在不同文档里的关系重新串起来
end note
@enduml
```

**索引阶段：从文档中抽取实体和关系**

```
文档: "订单服务在创建订单时，会调用库存服务的扣减接口检查库存是否充足。"
     ↓
抽取实体: [订单服务, 库存服务]
抽取关系: [订单服务] --调用--> [库存服务]
抽取属性: 调用时机=创建订单, 接口=扣减接口
```

这一步可以用大模型来做。给模型一段文档，让它抽取实体和关系：

```java
/**
 * 使用大模型抽取实体和关系
 */
public class EntityRelationExtractor {

    private final ChatClient chatClient;

    private static final String EXTRACTION_PROMPT = """
        请从以下文本中抽取实体和关系。

        实体类型包括：服务、数据库、接口、消息队列、配置项
        关系类型包括：调用、依赖、写入、读取、发送、订阅

        请以JSON格式输出，格式如下：
        {
            "entities": [{"name": "实体名", "type": "实体类型"}],
            "relations": [{"source": "源实体", "relation": "关系类型", "target": "目标实体", "context": "关系上下文"}]
        }

        文本内容：
        %s
        """;

    public ExtractionResult extract(String text) {
        String prompt = String.format(EXTRACTION_PROMPT, text);
        String response = chatClient.prompt()
                .user(prompt)
                .call()
                .content();

        return parseResponse(response);
    }
}
```

**检索阶段：结合向量检索和图检索**

```java
/**
 * Graph RAG 检索
 */
public class GraphRagRetriever {

    private final VectorStore vectorStore;
    private final GraphDatabase graphDb;

    public List<Document> retrieve(String query) {
        // 1. 向量检索：找到语义相关的文档
        List<Document> vectorResults = vectorStore.similaritySearch(
                SearchRequest.builder().query(query).topK(10).build()
        );

        // 2. 实体识别：从查询中识别实体
        List<String> entities = extractEntities(query);

        // 3. 图检索：找到实体相关的关系
        List<Relation> relations = new ArrayList<>();
        for (String entity : entities) {
            relations.addAll(graphDb.findRelations(entity, 2)); // 2跳关系
        }

        // 4. 关系扩展：根据关系找到更多相关文档
        List<Document> graphResults = findDocumentsByRelations(relations);

        // 5. 结果融合
        return mergeResults(vectorResults, graphResults);
    }
}
```

### Graph RAG 的适用场景

| 场景 | 是否适合 Graph RAG | 原因 |
|:-----|:-------------------|:-----|
| 服务依赖关系查询 | 适合 | 依赖关系是典型的图结构 |
| 人物关系查询 | 适合 | 人物关系网络天然是图 |
| 事件因果链查询 | 适合 | 因果关系需要多跳推理 |
| 简单事实问答 | 不太需要 | 纯向量检索就够用 |
| 文档内容总结 | 不太需要 | 不涉及实体关系 |

**经验总结**：如果你的知识库里有大量的**实体关系**信息（谁调用谁、谁依赖谁、谁负责什么），Graph RAG 会有明显收益。如果主要是独立的文档内容，标准 RAG 就够了。

:::info Graph RAG的适用边界
Graph RAG并不是万能药。它在以下场景有明显收益：服务依赖关系查询、人物关系网络、事件因果链分析。但对于简单事实问答和文档总结类场景，引入图数据库的额外复杂性得不偿失。在决定引入Graph RAG之前，先评估你的知识库是否真的有大量需要多跳推理的关系型查询。
:::

## 多模态 RAG：文字和图片一起玩

### 纯文本 RAG 的局限

假设你在给电商平台搭一个智能客服，用户发来一张商品图片问：`这款衣服有 L 码吗？`

纯文本 RAG 完全傻眼了——它只能处理文字，图片里的信息它看不见。

再比如，用户问：`产品说明书第 3 页那个接线图怎么看？`

说明书 PDF 里有大量的图表、流程图、接线图，这些信息用纯文本很难表达清楚。如果只存文字，用户问到图片内容时就答不上来。

### 多模态 RAG 的核心思路

多模态 RAG 要解决的问题是：**让系统能够理解和检索图片、图表、视频等非文本内容**。

实现思路有几种：

```plantuml title="多模态 RAG：图片描述、图像向量与文本检索如何协同" width="100%" maxWidth="1080px" align="left"
@startuml
skinparam backgroundColor #F8FBFD
skinparam roundcorner 18
skinparam shadowing false
skinparam defaultFontName Microsoft YaHei
skinparam defaultFontSize 14
skinparam defaultTextAlignment center
skinparam linetype ortho
skinparam dpi 160
skinparam ArrowColor #0F766E
skinparam ArrowThickness 1.4
skinparam ArrowFontColor #164E63
skinparam packageStyle rectangle
skinparam componentStyle rectangle

skinparam actor {
  BackgroundColor #ECFDF5
  BorderColor #0F766E
  FontColor #134E4A
}

skinparam package {
  BackgroundColor #FFFFFF
  BorderColor #7DD3FC
  FontColor #164E63
}

skinparam rectangle {
  BackgroundColor #FFFFFF
  BorderColor #38BDF8
  FontColor #0F172A
}

skinparam database {
  BackgroundColor #F0FDFF
  BorderColor #0891B2
  FontColor #164E63
}

skinparam note {
  BackgroundColor #ECFEFF
  BorderColor #67E8F9
  FontColor #155E75
}

left to right direction

package "离线建库" {
  rectangle "文本内容" as TextDoc
  rectangle "图片 / 图表 / 说明书页面" as ImageDoc
  rectangle "视觉描述生成" as Caption
  rectangle "文本 Embedding" as TextEmbed
  rectangle "图像 Embedding" as ImageEmbed
  database "多模态向量库\ntext_vector + image_vector + metadata" as MultiDB

  TextDoc --> TextEmbed
  TextEmbed --> MultiDB
  ImageDoc --> Caption
  Caption --> TextEmbed : 生成描述文本
  ImageDoc --> ImageEmbed
  ImageEmbed --> MultiDB
}

package "在线检索" {
  actor "文本问题 / 图片输入" as MultiUser
  rectangle "文本检索" as TextSearch
  rectangle "图像检索" as ImageSearch
  rectangle "结果融合与排序" as MultiMerge

  MultiUser --> TextSearch
  MultiUser --> ImageSearch
  MultiDB --> TextSearch
  MultiDB --> ImageSearch
  TextSearch --> MultiMerge
  ImageSearch --> MultiMerge
}

note bottom of MultiMerge
起步可以先做“图片转描述再入库”，
需要以图搜图时再补图像向量通道
end note
@enduml
```

**方案1：图片转文字描述**

最简单的方案——用视觉大模型把图片转成文字描述，然后存到向量库里。

```java
/**
 * 图片描述生成
 */
public class ImageDescriptionGenerator {

    private final VisionModel visionModel;

    public String generateDescription(byte[] imageBytes, String context) {
        String prompt = """
            请详细描述这张图片的内容，包括：
            1. 图片中的主要对象
            2. 对象的颜色、尺寸、材质等属性
            3. 图片中的文字信息
            4. 如果是产品图，描述产品的特点

            图片上下文：%s
            """.formatted(context);

        return visionModel.describe(imageBytes, prompt);
    }
}
```

用户搜索的时候，也是用文字去检索这些描述。

**优点**：实现简单，不需要改现有架构
**缺点**：描述可能丢失图片细节，某些视觉信息很难用文字表达

**方案2：图片向量化**

用多模态 Embedding 模型（如 CLIP、Chinese-CLIP）把图片直接转成向量，和文字向量存在同一个向量空间里。

:::tip 多模态RAG的实用起点
如果你刚开始做多模态RAG，推荐从**方案1（图片转文字描述）**入手：用视觉大模型为图片生成详细描述，存入现有的文本向量库。这种方式不需要改变现有架构，成本低，但已经能解决大部分"问图片内容"的需求。只有当用户需要以图搜图时，才需要升级到多模态向量化方案。
:::

```java
/**
 * 多模态向量化
 */
public class MultimodalEmbedding {

    private final ClipModel clipModel;

    /**
     * 图片向量化
     */
    public float[] embedImage(byte[] imageBytes) {
        return clipModel.encodeImage(imageBytes);
    }

    /**
     * 文本向量化
     */
    public float[] embedText(String text) {
        return clipModel.encodeText(text);
    }
}
```

用户可以用文字搜图片，也可以用图片搜图片。

**优点**：保留更多视觉信息，支持以图搜图
**缺点**：需要多模态模型，成本更高

**方案3：混合方案**

图片既生成文字描述（用于精确检索），也生成图片向量（用于视觉相似检索），两种方式结合使用。

### 实战：商品图文检索

【截图提示：多模态检索系统界面，支持文字和图片两种输入方式】

```java
/**
 * 商品多模态检索服务
 */
@Service
public class ProductMultimodalSearch {

    private final MilvusClient milvusClient;
    private final ClipEmbedding clipEmbedding;
    private final TextEmbedding textEmbedding;
    private final VisionModel visionModel;

    /**
     * 文本检索商品
     */
    public List<Product> searchByText(String query) {
        // 1. 文本向量检索
        float[] textVector = textEmbedding.embed(query);
        List<Product> textResults = searchByVector(textVector, "text_vector");

        // 2. 多模态向量检索（文本->图片）
        float[] clipTextVector = clipEmbedding.embedText(query);
        List<Product> clipResults = searchByVector(clipTextVector, "image_vector");

        // 3. 结果融合
        return mergeResults(textResults, clipResults);
    }

    /**
     * 图片检索商品（以图搜图）
     */
    public List<Product> searchByImage(byte[] imageBytes) {
        // 1. 图片向量检索
        float[] imageVector = clipEmbedding.embedImage(imageBytes);
        List<Product> results = searchByVector(imageVector, "image_vector");

        return results;
    }

    /**
     * 图片+文本混合检索
     */
    public List<Product> searchByImageAndText(byte[] imageBytes, String text) {
        // 1. 用视觉模型理解图片内容
        String imageDescription = visionModel.describe(imageBytes,
                "请描述这张商品图片的主要特征");

        // 2. 组合查询
        String combinedQuery = text + "，图片显示：" + imageDescription;

        // 3. 执行检索
        return searchByText(combinedQuery);
    }

    private List<Product> searchByVector(float[] vector, String fieldName) {
        SearchResp response = milvusClient.search(SearchReq.builder()
                .collectionName("products")
                .annsField(fieldName)
                .data(Collections.singletonList(new FloatVec(vector)))
                .topK(10)
                .build());

        return convertToProducts(response);
    }
}
```

### 多模态 RAG 的挑战

| 挑战 | 说明 | 应对方案 |
|:-----|:-----|:---------|
| 向量空间对齐 | 文本和图片的向量要在同一空间才能比较 | 使用 CLIP 等对齐好的模型 |
| 图片理解准确性 | 视觉模型可能误解图片内容 | 结合人工标注，重要商品人工审核 |
| 存储成本 | 图片向量维度通常比文本向量高 | 使用量化压缩，选择合适的向量维度 |
| 检索延迟 | 多模态检索链路更长 | 做好缓存，图片预处理 |

## 性能优化：让系统跑得更快

当知识库从几千条涨到几百万条，检索延迟会明显上升。这一节聊聊怎么优化性能。

### 向量索引优化

向量数据库的检索性能主要取决于索引类型和参数配置：

| 索引类型 | 特点 | 适用场景 |
|:---------|:-----|:---------|
| FLAT | 暴力搜索，100%准确，最慢 | 数据量小（小于10万），对准确率要求极高 |
| IVF_FLAT | 聚类索引，快但可能漏召回 | 数据量中等（10万到100万） |
| HNSW | 图索引，快且准确率高 | 大多数场景的首选 |
| DiskANN | 磁盘索引，支持超大规模 | 数据量超大（大于1000万） |

**HNSW 参数调优**：

```java
// 创建HNSW索引
IndexParam indexParam = IndexParam.builder()
        .fieldName("embedding")
        .indexType(IndexParam.IndexType.HNSW)
        .metricType(IndexParam.MetricType.COSINE)
        .extraParams(Map.of(
                "M", 16,            // 每个节点的最大连接数，越大越准但越慢
                "efConstruction", 200  // 建索引时的搜索宽度，越大索引质量越好
        ))
        .build();
```

检索时的参数：

```java
Map<String, Object> searchParams = Map.of(
        "ef", 64  // 搜索时的搜索宽度，越大越准但越慢
);
```

**调优建议**：

| 参数 | 追求速度 | 追求准确 | 平衡方案 |
|:-----|:---------|:---------|:---------|
| M | 8 | 32 | 16 |
| efConstruction | 100 | 400 | 200 |
| ef（搜索） | 32 | 128 | 64 |

### 分层检索

当数据量很大时，可以采用分层检索策略：先用低精度方式快速筛选，再用高精度方式精排。

```java
/**
 * 分层检索
 */
public class HierarchicalRetriever {

    private final VectorStore roughStore;  // 低维度、快速检索
    private final VectorStore fineStore;   // 高维度、精确检索

    public List<Document> retrieve(String query, int topK) {
        // 第一层：粗检索，快速筛选候选
        List<Document> roughResults = roughStore.similaritySearch(
                SearchRequest.builder()
                        .query(query)
                        .topK(topK * 5)  // 多召回一些
                        .build()
        );

        // 第二层：精检索，对候选重新打分
        List<String> candidateIds = roughResults.stream()
                .map(Document::getId)
                .toList();

        return fineStore.similaritySearchWithFilter(
                SearchRequest.builder()
                        .query(query)
                        .topK(topK)
                        .filterExpression("id IN " + candidateIds)
                        .build()
        );
    }
}
```

### 缓存策略

热门问题的检索结果可以缓存：

```java
/**
 * 带缓存的检索服务
 */
@Service
public class CachedRetrieverService {

    private final VectorStore vectorStore;
    private final Cache<String, List<Document>> cache;

    public CachedRetrieverService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
        this.cache = Caffeine.newBuilder()
                .maximumSize(10000)
                .expireAfterWrite(Duration.ofHours(1))
                .build();
    }

    public List<Document> retrieve(String query, int topK) {
        String cacheKey = generateCacheKey(query, topK);

        return cache.get(cacheKey, key -> {
            return vectorStore.similaritySearch(
                    SearchRequest.builder()
                            .query(query)
                            .topK(topK)
                            .build()
            );
        });
    }

    private String generateCacheKey(String query, int topK) {
        // 对查询做归一化处理后生成key
        String normalizedQuery = normalizeQuery(query);
        return DigestUtils.md5Hex(normalizedQuery + "_" + topK);
    }
}
```

**缓存注意事项**：
- 知识库更新时要清理相关缓存
- 缓存 key 要做归一化，避免语义相同但表述不同的问题重复缓存
- 设置合理的过期时间

:::caution 缓存的两个陷阱
陷阱1：**知识库更新了缓存没失效**——用户拿到的是旧答案。要建立知识库更新和缓存清除的联动机制。陷阱2：**缓存key没归一化**——"年假几天"和"年假有几天"是同一个问题但生成了不同的key，缓存命中率低。建议对query做语义归一化（去停用词、统一标点、转小写）后再生成key。
:::

### 异步预热

如果能预判用户可能问什么（比如根据用户浏览记录），可以提前做检索：

```java
/**
 * 检索预热服务
 */
@Service
public class RetrieverWarmupService {

    private final VectorStore vectorStore;
    private final Cache<String, CompletableFuture<List<Document>>> prefetchCache;

    /**
     * 预热可能的查询
     */
    public void warmup(String partialQuery) {
        // 根据部分输入预测可能的完整查询
        List<String> possibleQueries = predictQueries(partialQuery);

        for (String query : possibleQueries) {
            String key = generateKey(query);
            if (!prefetchCache.asMap().containsKey(key)) {
                CompletableFuture<List<Document>> future = CompletableFuture.supplyAsync(
                        () -> vectorStore.similaritySearch(
                                SearchRequest.builder().query(query).topK(10).build()
                        )
                );
                prefetchCache.put(key, future);
            }
        }
    }

    /**
     * 获取检索结果（优先用预热结果）
     */
    public List<Document> retrieve(String query) {
        String key = generateKey(query);
        CompletableFuture<List<Document>> future = prefetchCache.getIfPresent(key);

        if (future != null) {
            try {
                return future.get(100, TimeUnit.MILLISECONDS);
            } catch (TimeoutException e) {
                // 预热还没完成，走正常检索
            }
        }

        return vectorStore.similaritySearch(
                SearchRequest.builder().query(query).topK(10).build()
        );
    }
}
```

## 检索策略路由：让系统更聪明

不同类型的问题适合不同的检索策略。与其用一套策略打天下，不如根据问题类型动态选择。

### 问题分类

```java
/**
 * 问题类型分类器
 */
public class QueryClassifier {

    private final ChatClient chatClient;

    public enum QueryType {
        FACTUAL,        // 事实型：某个参数是多少
        PROCEDURAL,     // 流程型：怎么操作
        COMPARATIVE,    // 比较型：A和B有什么区别
        RELATIONAL,     // 关系型：A依赖什么
        EXPLORATORY     // 探索型：有哪些方案
    }

    public QueryType classify(String query) {
        String prompt = """
            请判断以下问题的类型：
            - FACTUAL：询问具体事实，如参数值、配置项
            - PROCEDURAL：询问操作步骤、流程
            - COMPARATIVE：比较多个对象的异同
            - RELATIONAL：询问实体之间的关系
            - EXPLORATORY：开放性探索，了解有哪些选项

            问题：%s

            请只返回类型名称，不要其他内容。
            """.formatted(query);

        String result = chatClient.prompt().user(prompt).call().content();
        return QueryType.valueOf(result.trim().toUpperCase());
    }
}
```

### 策略路由

```java
/**
 * 检索策略路由器
 */
@Service
public class RetrievalRouter {

    private final QueryClassifier classifier;
    private final VectorRetriever vectorRetriever;
    private final GraphRetriever graphRetriever;
    private final HybridRetriever hybridRetriever;
    private final RerankerService reranker;

    public List<Document> route(String query) {
        QueryType type = classifier.classify(query);

        List<Document> results = switch (type) {
            case FACTUAL -> {
                // 事实型：纯向量检索，强调精确
                yield vectorRetriever.retrieve(query, 5);
            }
            case PROCEDURAL -> {
                // 流程型：混合检索，需要上下文完整
                yield hybridRetriever.retrieve(query, 8);
            }
            case COMPARATIVE -> {
                // 比较型：需要召回多个对象的信息
                yield hybridRetriever.retrieve(query, 10);
            }
            case RELATIONAL -> {
                // 关系型：优先用图检索
                yield graphRetriever.retrieve(query, 10);
            }
            case EXPLORATORY -> {
                // 探索型：广撒网，多召回
                yield hybridRetriever.retrieve(query, 15);
            }
        };

        // 统一重排序
        return reranker.rerank(query, results, 5);
    }
}
```

## RAG 系统优化 Checklist

最后给一份 RAG 系统优化的 Checklist，方便你对照检查：

:::tip 使用这份Checklist的方式
建议在RAG系统上线前和每次迭代后各过一遍这份Checklist。不必追求一次做完所有项，可以按优先级逐步完善：先保证数据质量和基础检索，再优化生成质量，最后做性能和可观测性。
:::

### 数据质量

- [ ] 文档预处理是否充分（去噪、格式化、编码统一）
- [ ] 分片策略是否合适（大小、重叠、语义完整性）
- [ ] 元数据是否完整（来源、时间、分类、权限）
- [ ] 是否定期更新知识库，清理过期内容

### 检索质量

- [ ] Embedding 模型是否适合当前场景（通用 vs 行业）
- [ ] 是否使用混合检索（向量 + 关键词）
- [ ] 是否使用重排序（Reranker）
- [ ] 检索参数是否调优过（TopK、相似度阈值）

### 生成质量

- [ ] Prompt 是否有明确的角色定义和行为约束
- [ ] 是否有幻觉抑制指令（限定知识来源、兜底出口）
- [ ] 是否要求引用来源
- [ ] Temperature 等参数是否合适

### 性能

- [ ] 向量索引类型和参数是否优化
- [ ] 是否使用缓存
- [ ] 是否有预热机制
- [ ] 是否监控端到端延迟

### 可观测性

- [ ] 是否记录检索日志（query、召回结果、耗时）
- [ ] 是否记录生成日志（Prompt、回答、引用）
- [ ] 是否有质量评估指标（召回率、准确率、用户满意度）
- [ ] 是否有告警机制（延迟异常、错误率上升）

## 小结

这篇讲了 RAG 系统的进阶优化技术：

1. **Graph RAG**：用知识图谱存储实体关系，解决多跳推理问题

2. **多模态 RAG**：让系统能理解和检索图片等非文本内容

3. **性能优化**：索引调优、分层检索、缓存、预热

4. **策略路由**：根据问题类型动态选择检索策略

5. **优化 Checklist**：数据质量、检索质量、生成质量、性能、可观测性

RAG 不是一锤子买卖，而是一个需要持续迭代优化的系统。希望这个系列能帮你建立起对 RAG 的完整认知，在实际项目中少踩坑、多出活。

如果你在实践中遇到什么问题，欢迎交流讨论。

---

[上一篇：从检索到生成让大模型说人话](./14-从检索到生成让大模型说人话.md)
