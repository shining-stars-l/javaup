---
slug: /super-agent/rag/embedding
description: "Embedding是RAG的核心魔法，它让机器能够理解文字的'意思'。本文从相亲匹配的角度解读向量化原理，并讲解如何选择和使用向量模型"
keywords: ["Embedding", "向量化", "向量模型", "语义相似度", "余弦相似度", "Spring AI"]
---

# 给文字画像的技巧：Embedding

假设你是个媒人，手里有1000个单身男女的资料，要给他们配对。

每个人的资料是一段文字描述：

```
小王：28岁程序员，喜欢打游戏看动漫，宅男一枚，偶尔爬山
小李：26岁设计师，热爱旅行摄影，周末喜欢逛展览
小张：27岁产品经理，喜欢打篮球健身，性格外向
```

现在有个新人小美："25岁，喜欢户外运动和摄影，希望找一个有共同爱好的人"

你怎么快速找出最适合小美的人选？

**方法一：关键词匹配**

搜索"户外运动"和"摄影"，找到包含这些词的人。

问题是：小王的资料里写的是"爬山"，不是"户外运动"；小李的资料里写的是"旅行摄影"，不是单独的"摄影"。关键词匹配可能漏掉他们。

**方法二：理解语义**

"爬山"和"户外运动"意思相近，"旅行摄影"也包含"摄影"的意思。如果能理解这层语义关系，就能找到真正匹配的人。

这就是Embedding要解决的问题——**让机器理解文字的"意思"，而不只是匹配字面。**

:::info Embedding的本质
Embedding（向量化）是将文字转换为高维数值向量的过程。其核心价值在于：**语义相近的文字，在向量空间中的距离也近**。这使得机器能够通过数学运算来理解和比较文字的"意思"，而不仅仅是匹配字面字符。
:::

## 什么是向量

在讲Embedding之前，先回顾一下高数里学过的向量。

### 向量就是一串数字

向量可以理解为一个带方向的箭头，用一组数字来表示：

- **一维向量**：`[3]`，数轴上的一个点
- **二维向量**：`[3, 4]`，平面上的一个点
- **三维向量**：`[3, 4, 5]`，空间中的一个点

三维以上就不好画图了，但数学上没问题——可以是384维、768维、1536维，这些就叫**高维向量**。

### 向量能表示什么

在RAG场景里，向量用来表示文字的**语义特征**。

每个维度代表一个"语义方向"，比如（这是打比方，实际不是这么简单）：

- 第1维：是否涉及"人物"
- 第2维：是否涉及"动作"
- 第3维：是否涉及"时间"
- 第4维：是否涉及"技术"
- ...

一段文字被转成向量后，每个维度上的数值就表示这段文字在这个"语义方向"上的权重。

### 向量之间的距离

这是关键点——**语义相近的文字，向量在空间中的距离也近。**

```
"打印机怎么用" → [0.23, -0.45, 0.67, ...]
"产品使用方法" → [0.25, -0.42, 0.65, ...] ← 很接近
"今天天气不错" → [-0.89, 0.12, 0.03, ...] ← 差很远
```

这就是为什么向量检索能做语义匹配——不是比字面，是比"意思"。

### 向量空间的可视化

在这种表示下，语义相近的内容会在向量空间中聚集（距离更近）。例如，"猫""狗"等词的向量在空间中会聚在一起，因为它们都是"动物"相关词；而与车辆相关的词则聚成另一簇。

![向量空间聚类示意图](/img/damai-ai/什么是RAG和向量数据库/1.png)

下图展示了更多词汇在向量空间中的分布，可以看到同类概念自然聚集：

![词汇向量分布](/img/damai-ai/什么是RAG和向量数据库/3.jpg)

通过向量表示，模型可以量化语义相似度——两个内容的向量越接近，它们的含义就越相近。下图展示了"Animals"（动物类：Wolf、Dog、Cat）和"Fruits"（水果类：Banana、Apple）两个语义簇，当查询"Kitten"时，它会自动落在动物类聚簇附近：

![语义聚类与查询匹配](/img/damai-ai/什么是RAG和向量数据库/4.jpg)

## Embedding：把文字变成向量

### Embedding是个翻译官

Embedding的工作就是把文字"翻译"成向量。

```
输入：一段文字
输出：一串数字（向量）
```

这个翻译过程由**Embedding模型**（也叫向量模型）完成。

```plantuml title="Embedding 在 RAG 中的角色：把文本映射到可计算的语义空间" width="100%" align="left"
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
  rectangle "知识库文本块" as Chunk
  rectangle "Embedding 模型" as OfflineModel
  database "向量库\n文本块 + 向量 + 元数据" as VDB
  Chunk --> OfflineModel : 编码
  OfflineModel --> VDB : 存储文档向量
}

package "在线查询" {
  rectangle "用户问题" as Query
  rectangle "Embedding 模型" as OnlineModel
  rectangle "余弦相似度计算" as Similarity
  rectangle "Top-K 相关片段" as TopK
  Query --> OnlineModel : 编码
  OnlineModel --> Similarity : 查询向量
  VDB --> Similarity : 候选文档向量
  Similarity --> TopK : 按语义距离排序
}

note bottom of Similarity
语义越接近，向量方向越接近，
余弦相似度就越高
end note
@enduml
```

### Embedding模型是怎么训练出来的

简单说，是让模型学习大量的文本，学会"什么样的文字意思相近"。

训练过程大致是：

1. 准备大量的文本对，标注哪些是相似的，哪些是不相似的
2. 让模型把这些文本转成向量
3. 调整模型参数，让相似文本的向量距离近，不相似的距离远
4. 反复训练，直到模型学会

训练好的模型就能把任意文字转成合适的向量了。

### 常见的Embedding模型

| 模型 | 维度 | 特点 |
| :--- | :--- | :--- |
| text-embedding-ada-002 (OpenAI) | 1536 | 效果好，但要调API |
| text-embedding-v2 (阿里) | 1536 | 国产，对中文友好 |
| bge-large-zh (BAAI) | 1024 | 开源，中文效果好 |
| m3e-base | 768 | 开源，轻量级 |
| nomic-embed-text | 768 | 开源，支持离线 |

选择建议：
- 要效果好：text-embedding-v2 或 OpenAI的模型
- 要私有部署：bge系列或m3e
- 要轻量级：m3e-base

## 向量相似度计算

把文字变成向量后，怎么判断两个向量有多"像"？

### 余弦相似度（最常用）

想象两个向量是两根箭头，从原点出发指向不同方向。

余弦相似度看的是这两根箭头的**夹角**：
- 夹角越小（指向差不多），越相似
- 夹角90度（垂直），完全不相关
- 夹角180度（方向相反），语义相反

下图直观展示了四种常见的向量距离度量方式，其中余弦相似度关注的是向量夹角：

![距离度量对比](/img/damai-ai/什么是RAG和向量数据库/5.jpg)

计算公式：

```
余弦相似度 = (A · B) / (|A| × |B|)
```

结果范围是[-1, 1]：
- 1：完全相同
- 0：不相关
- -1：完全相反

**优点**：只关心方向，不关心长度。即使两段文字长短差很多，只要意思相近，相似度就高。

这也是为什么RAG系统普遍用余弦相似度。

### 欧几里得距离

就是空间中两点的直线距离。距离越小，越相似。

适合有"量"的概念的场景，比如图像相似度。

### 点积

```
A · B = a1×b1 + a2×b2 + ... + an×bn
```

计算简单，速度快。Transformer的注意力机制用的就是点积。

### 实际应用中怎么选

绝大部分RAG场景，**用余弦相似度就对了**。

所有主流向量数据库（Milvus、PGVector、Qdrant）都默认支持余弦相似度。

:::tip 相似度计算的选择
余弦相似度是RAG场景的标准选择，原因是它只关注向量的方向（语义倾向），不受向量长度（文本长短）的影响。这对于长短不一的文档块特别重要——一段100字的摘要和一段1000字的详述，只要讲的是同一件事，余弦相似度就能正确识别它们的相关性。
:::

## Spring AI中的向量化

### EmbeddingModel接口

Spring AI通过`EmbeddingModel`接口统一封装了不同的向量模型：

```java
public interface EmbeddingModel {
    // 单条文本向量化
    float[] embed(String text);
    
    // 批量向量化
    List<float[]> embed(List<String> texts);
    
    // 获取向量维度
    int dimensions();
}
```

不管你用的是OpenAI、阿里云还是本地模型，代码都是一样的。

### 使用阿里云的向量模型

先加依赖：

```xml
<dependency>
    <groupId>com.alibaba.cloud.ai</groupId>
    <artifactId>spring-ai-alibaba-starter</artifactId>
    <version>1.0.0</version>
</dependency>
```

配置API Key：

```yaml
spring:
  ai:
    dashscope:
      api-key: sk-xxxxx
      embedding:
        model: text-embedding-v2
```

然后就可以注入使用了：

```java
@Service
public class EmbeddingService {
    
    @Autowired
    private EmbeddingModel embeddingModel;
    
    public float[] getEmbedding(String text) {
        return embeddingModel.embed(text);
    }
    
    public List<float[]> getEmbeddings(List<String> texts) {
        return embeddingModel.embed(texts);
    }
}
```

### 计算两段文字的相似度

```java
public double calculateSimilarity(String text1, String text2) {
    float[] vec1 = embeddingModel.embed(text1);
    float[] vec2 = embeddingModel.embed(text2);
    
    return cosineSimilarity(vec1, vec2);
}

private double cosineSimilarity(float[] a, float[] b) {
    double dotProduct = 0;
    double normA = 0;
    double normB = 0;
    
    for (int i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

试一试：

```java
double sim1 = calculateSimilarity("打印机怎么用", "产品使用方法");
// 结果约 0.85，相似度高

double sim2 = calculateSimilarity("打印机怎么用", "今天天气真好");
// 结果约 0.12，相似度低
```

## 实战：电商商品推荐

来个具体的业务场景——电商平台的商品推荐。

### 场景描述

用户在搜索框输入"适合夏天穿的裙子"，我们要从商品库里找出最相关的商品。

商品库里的商品描述是这样的：

```
商品1：夏季新款碎花连衣裙，轻薄透气，适合度假穿着
商品2：冬季加厚羽绒服，保暖防寒，适合北方冬天
商品3：春季百搭针织衫，柔软舒适，可搭配各种下装
商品4：夏日清凉吊带裙，纯棉面料，凉爽舒适
```

### 传统关键词匹配

搜索"夏天"+"裙子"，只能匹配到商品4（包含"裙"）。

商品1虽然是"夏季"+"连衣裙"，但关键词不完全匹配，可能被漏掉。

### 向量语义匹配

把所有商品描述转成向量，存起来。

用户搜索时，把搜索词也转成向量，找最相似的。

```java
@Service
public class ProductSearchService {
    
    @Autowired
    private EmbeddingModel embeddingModel;
    
    @Autowired
    private VectorStore vectorStore;
    
    // 商品入库时，生成向量并存储
    public void indexProduct(Product product) {
        String description = product.getDescription();
        
        Document doc = new Document(description);
        doc.getMetadata().put("productId", product.getId());
        doc.getMetadata().put("productName", product.getName());
        doc.getMetadata().put("price", product.getPrice());
        
        vectorStore.add(List.of(doc));
    }
    
    // 用户搜索时，做语义匹配
    public List<Product> search(String query, int topK) {
        List<Document> results = vectorStore.similaritySearch(
            SearchRequest.builder()
                .query(query)
                .topK(topK)
                .similarityThreshold(0.5)
                .build()
        );
        
        return results.stream()
            .map(doc -> {
                Long productId = (Long) doc.getMetadata().get("productId");
                return productRepository.findById(productId).orElse(null);
            })
            .filter(Objects::nonNull)
            .collect(Collectors.toList());
    }
}
```

搜索"适合夏天穿的裙子"，结果：

```
1. 商品1：夏季新款碎花连衣裙（相似度0.89）
2. 商品4：夏日清凉吊带裙（相似度0.87）
3. 商品3：春季百搭针织衫（相似度0.45）
4. 商品2：冬季加厚羽绒服（相似度0.21）
```

语义匹配能理解"夏天≈夏季≈夏日"、"裙子≈连衣裙≈吊带裙"，比关键词匹配智能多了。

## 完整Demo：给学习诉求匹配课程路线

上面的商品推荐更偏业务理解，下面补一个真正可以独立跑起来的完整示例。

这次我们不再用“商品搜索”或“退货规则”做例子，而是换成一个更贴近本站内容的场景：

- 候选数据不是商品，而是几条不同的学习路线
- 查询语句不是搜索词，而是一段学员的学习诉求
- 先把每条路线的介绍文字转成向量，再把学习诉求转成向量
- 最后用余弦相似度排序，找出最匹配的路线

### 示例中项目地址

- 项目地址：[https://gitee.com/shining-stars-l/super-ai-hub](https://gitee.com/shining-stars-l/super-ai-hub)
- 项目模块：`ai-example-demo-rag`

运行前，直接改 `main` 方法开头这三个参数即可：

```java
String apiKey = "请替换成你的 SiliconFlow API Key";
String apiUrl = "https://api.siliconflow.cn/v1/embeddings";
String modelName = "Qwen/Qwen3-Embedding-8B";
```

完整代码如下：

```java
package org.javaup.ai.test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.HashMap;
import java.util.Map;

/**
 * 演示如何使用 Embedding 给“学习诉求”和“课程路线”做语义匹配。
 * 这里直接调用 SiliconFlow 的 Embedding API，不依赖项目里的 Spring AI 配置。
 */
public class EmbeddingLearningPathDemo {

    public static void main(String[] args) throws Exception {
        String apiKey = "请替换成你的 SiliconFlow API Key";
        String apiUrl = "https://api.siliconflow.cn/v1/embeddings";
        String modelName = "Qwen/Qwen3-Embedding-8B";

        HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .build();
        ObjectMapper objectMapper = new ObjectMapper();

        List<LearningPath> learningPaths = List.of(
            new LearningPath(
                "P001",
                "Java 高并发与分布式实战",
                "已经掌握 Spring Boot，希望补齐缓存、消息队列、限流熔断和分布式事务的同学",
                "Spring Boot、Redis、Kafka、分布式锁、幂等设计、秒杀系统",
                "能独立设计高并发下单链路，并定位常见性能瓶颈"
            ),
            new LearningPath(
                "P002",
                "MySQL 与 Redis 性能优化路线",
                "经常写 SQL，但对索引设计、慢查询治理和缓存一致性还不够熟的同学",
                "索引优化、执行计划、锁机制、缓存击穿、缓存雪崩、热点 Key",
                "能系统分析数据库慢查询问题，并设计稳定的缓存策略"
            ),
            new LearningPath(
                "P003",
                "Spring AI 与 RAG 项目实战",
                "想用 Java 做 AI 应用，希望掌握文档切块、向量化、检索增强和答案生成流程的同学",
                "Spring AI、Embedding、向量数据库、Chunk、Prompt、RAG、知识库问答",
                "能搭建一个完整的智能问答系统，并理解从文本到召回的核心链路"
            ),
            new LearningPath(
                "P004",
                "前端工程化与交互设计",
                "需要独立完成管理后台或业务门户，希望系统掌握组件化和工程化实践的同学",
                "Vue、React、TypeScript、状态管理、构建优化、组件设计",
                "能设计清晰可维护的前端工程结构，并完成复杂页面开发"
            ),
            new LearningPath(
                "P005",
                "云原生部署与 DevOps 路线",
                "负责服务上线和日常运维，希望掌握容器化、CI/CD 和服务可观测性的同学",
                "Docker、Kubernetes、GitHub Actions、灰度发布、监控告警、日志采集",
                "能把 Java 服务稳定部署到容器平台，并建立基础运维体系"
            ),
            new LearningPath(
                "P006",
                "数据分析与可视化入门",
                "想做报表分析、经营复盘和指标看板，希望提升数据建模与图表表达能力的同学",
                "数据清洗、指标体系、BI 报表、可视化图表、业务分析、经营复盘",
                "能围绕业务问题搭建基础分析模型，并输出清晰的数据结论"
            )
        );

        String learnerNeed = """
            我已经会一点 Spring Boot，最近想做一个能读取文档、切分文本块、
            计算相似度并回答问题的 Java AI 项目，最好还能顺手学会向量检索和 RAG 的完整链路。
            """;

        runSemanticMatch(httpClient, objectMapper, apiKey, apiUrl, modelName, learningPaths, learnerNeed, 3);
    }

    private static void runSemanticMatch(HttpClient httpClient,
                                         ObjectMapper objectMapper,
                                         String apiKey,
                                         String apiUrl,
                                         String modelName,
                                         List<LearningPath> learningPaths,
                                         String learnerNeed,
                                         int topK) throws Exception {
        List<String> pathPortraits = learningPaths.stream()
            .map(EmbeddingLearningPathDemo::buildPortrait)
            .toList();

        System.out.println("=== Embedding 学习路线匹配 Demo ===");
        System.out.println("Embedding 模型: " + modelName);
        System.out.println("候选路线数量: " + learningPaths.size());
        System.out.println();
        System.out.println("学习诉求:");
        System.out.println(learnerNeed);

        List<float[]> pathVectors = embedTexts(httpClient, objectMapper, apiKey, apiUrl, modelName, pathPortraits);
        float[] needVector = embedText(httpClient, objectMapper, apiKey, apiUrl, modelName, learnerNeed);

        System.out.println("向量生成完成，向量维度: " + pathVectors.get(0).length);
        System.out.println();
        System.out.println("--- Top 匹配结果 ---");

        List<MatchResult> results = new ArrayList<>();
        for (int i = 0; i < learningPaths.size(); i++) {
            LearningPath learningPath = learningPaths.get(i);
            double similarity = cosineSimilarity(needVector, pathVectors.get(i));
            results.add(new MatchResult(learningPath, similarity));
        }

        results.stream()
            .sorted(Comparator.comparingDouble(MatchResult::similarity).reversed())
            .limit(topK)
            .forEachOrdered(result -> printResult(result, buildPortrait(result.learningPath())));
    }

    private static float[] embedText(HttpClient httpClient,
                                     ObjectMapper objectMapper,
                                     String apiKey,
                                     String apiUrl,
                                     String modelName,
                                     String text) throws Exception {
        return embedTexts(httpClient, objectMapper, apiKey, apiUrl, modelName, List.of(text)).get(0);
    }

    private static List<float[]> embedTexts(HttpClient httpClient,
                                            ObjectMapper objectMapper,
                                            String apiKey,
                                            String apiUrl,
                                            String modelName,
                                            List<String> texts) throws Exception {
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", modelName);
        requestBody.put("input", texts);
        requestBody.put("encoding_format", "float");

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(apiUrl))
            .timeout(Duration.ofSeconds(60))
            .header("Authorization", "Bearer " + apiKey)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody)))
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("Embedding API 调用失败，HTTP " + response.statusCode() + "，响应体: " + response.body());
        }

        return parseEmbeddings(objectMapper, response.body());
    }

    private static List<float[]> parseEmbeddings(ObjectMapper objectMapper, String responseBody) throws IOException {
        JsonNode root = objectMapper.readTree(responseBody);
        JsonNode data = root.get("data");
        if (data == null || !data.isArray() || data.isEmpty()) {
            throw new IllegalStateException("Embedding API 响应缺少 data 字段，响应体: " + responseBody);
        }

        List<float[]> vectors = new ArrayList<>();
        for (JsonNode item : data) {
            JsonNode embeddingNode = item.get("embedding");
            if (embeddingNode == null || !embeddingNode.isArray()) {
                throw new IllegalStateException("Embedding API 响应缺少 embedding 字段，响应体: " + responseBody);
            }

            float[] vector = new float[embeddingNode.size()];
            for (int i = 0; i < embeddingNode.size(); i++) {
                vector[i] = embeddingNode.get(i).floatValue();
            }
            vectors.add(vector);
        }

        return vectors;
    }

    private static String buildPortrait(LearningPath learningPath) {
        return """
            路线编号：%s
            路线名称：%s
            适合人群：%s
            核心关键词：%s
            学完之后：%s
            """.formatted(
            learningPath.code(),
            learningPath.title(),
            learningPath.audience(),
            learningPath.keywords(),
            learningPath.outcome()
        );
    }

    private static void printResult(MatchResult result, String portrait) {
        LearningPath path = result.learningPath();
        System.out.printf("[%s] %s -> 相似度 %.4f%n", path.code(), path.title(), result.similarity());
        System.out.println("画像内容:");
        System.out.println(portrait);
        System.out.println();
    }

    private static double cosineSimilarity(float[] left, float[] right) {
        if (left.length != right.length) {
            throw new IllegalArgumentException("向量维度不一致，无法计算相似度");
        }

        double dotProduct = 0.0;
        double leftNorm = 0.0;
        double rightNorm = 0.0;

        for (int i = 0; i < left.length; i++) {
            dotProduct += left[i] * right[i];
            leftNorm += left[i] * left[i];
            rightNorm += right[i] * right[i];
        }

        if (leftNorm == 0.0 || rightNorm == 0.0) {
            return 0.0;
        }

        return dotProduct / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
    }

    private record LearningPath(String code, String title, String audience, String keywords, String outcome) {
    }

    private record MatchResult(LearningPath learningPath, double similarity) {
    }

}
```

运行后，你会得到类似下面这样的排序结果：

```text
=== Embedding 学习路线匹配 Demo ===
Embedding 模型: Qwen/Qwen3-Embedding-8B
候选路线数量: 6

学习诉求:
我已经会一点 Spring Boot，最近想做一个能读取文档、切分文本块、
计算相似度并回答问题的 Java AI 项目，最好还能顺手学会向量检索和 RAG 的完整链路。

向量生成完成，向量维度: 4096

--- Top 匹配结果 ---
[P003] Spring AI 与 RAG 项目实战 -> 相似度 0.8073
画像内容:
路线编号：P003
路线名称：Spring AI 与 RAG 项目实战
适合人群：想用 Java 做 AI 应用，希望掌握文档切块、向量化、检索增强和答案生成流程的同学
核心关键词：Spring AI、Embedding、向量数据库、Chunk、Prompt、RAG、知识库问答
学完之后：能搭建一个完整的智能问答系统，并理解从文本到召回的核心链路


[P001] Java 高并发与分布式实战 -> 相似度 0.4896
画像内容:
路线编号：P001
路线名称：Java 高并发与分布式实战
适合人群：已经掌握 Spring Boot，希望补齐缓存、消息队列、限流熔断和分布式事务的同学
核心关键词：Spring Boot、Redis、Kafka、分布式锁、幂等设计、秒杀系统
学完之后：能独立设计高并发下单链路，并定位常见性能瓶颈


[P005] 云原生部署与 DevOps 路线 -> 相似度 0.3843
画像内容:
路线编号：P005
路线名称：云原生部署与 DevOps 路线
适合人群：负责服务上线和日常运维，希望掌握容器化、CI/CD 和服务可观测性的同学
核心关键词：Docker、Kubernetes、GitHub Actions、灰度发布、监控告警、日志采集
学完之后：能把 Java 服务稳定部署到容器平台，并建立基础运维体系
```

这个完整示例背后对应的就是 Embedding 检索的标准步骤：

1. 先把每条路线描述拼成一段“画像文本”
2. 调用 Embedding 模型，批量生成候选路线向量
3. 再把用户的学习诉求也转成查询向量
4. 对查询向量和候选向量逐个计算余弦相似度
5. 最后按得分排序，拿到 Top-K 结果

这就是一个最小可用版的语义匹配流程。真实项目里，把“学习路线”换成“知识库 chunk”“FAQ 文档”“商品描述”“岗位画像”，整体链路都是一样的。

## 离线向量模型

在线API调用有成本，而且涉及数据安全问题。有些场景需要用离线模型。

### 为什么要用离线模型

1. **数据安全**：敏感数据不能传到外部API
2. **成本控制**：大量调用API费用不低
3. **延迟要求**：本地推理延迟更低
4. **离线场景**：有些环境没有外网

:::tip 离线模型推荐
涉及敏感数据或有离线要求时，优先考虑BGE系列（智源研究院出品，中文效果优秀）。`bge-large-zh`效果最好但资源消耗大，`bge-small-zh`轻量但效果稍弱，`bge-base-zh`是平衡选择。可以用Ollama一键部署，和在线API的使用方式完全兼容。
:::

### 常用的离线模型

**BGE系列**（智源研究院）

```
bge-small-zh: 512维，轻量级
bge-base-zh:  768维，平衡型
bge-large-zh: 1024维，效果最好
```

**M3E系列**

```
m3e-small: 512维
m3e-base:  768维
```

### 使用Ollama运行本地模型

Ollama可以方便地运行各种本地模型，包括Embedding模型。

安装Ollama后，拉取向量模型：

```bash
ollama pull nomic-embed-text
```

Spring AI配置：

```yaml
spring:
  ai:
    ollama:
      base-url: http://localhost:11434
      embedding:
        model: nomic-embed-text
```

代码使用方式和在线API完全一样：

```java
@Autowired
private EmbeddingModel embeddingModel;

public float[] embed(String text) {
    return embeddingModel.embed(text);
}
```

### 使用ONNX运行模型

如果不想装Ollama，也可以直接用ONNX Runtime加载模型：

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-transformers</artifactId>
    <version>1.1.0</version>
</dependency>
```

```java
@Bean
public EmbeddingModel embeddingModel() {
    return new TransformersEmbeddingModel()
        .setModelPath("path/to/bge-small-zh");
}
```

## 向量模型选型建议

### 考虑因素

| 因素 | 说明 |
| :--- | :--- |
| 效果 | 对目标语言（中文/英文）的语义理解能力 |
| 维度 | 维度越高表达能力越强，但存储和计算成本也越高 |
| 速度 | 推理速度，影响实时性 |
| 部署方式 | API调用还是本地部署 |
| 成本 | API调用费用或服务器成本 |

### 我的建议

**场景一：快速验证**

直接用阿里云的text-embedding-v2，效果好，接入简单。

**场景二：生产环境（无特殊安全要求）**

继续用云服务的API，稳定可靠，省心。

**场景三：生产环境（有数据安全要求）**

部署bge-large-zh或m3e-base，效果和云服务差不多，数据不出内网。

**场景四：资源有限**

用bge-small-zh或m3e-small，牺牲一点效果换取更低的资源消耗。

### 不同模型效果对比

以中文语义相似度为例（数据来自网上的评测）：

| 模型 | MTEB中文平均分 | 维度 |
| :--- | :--- | :--- |
| text-embedding-v2 (阿里) | 65.2 | 1536 |
| bge-large-zh | 64.8 | 1024 |
| bge-base-zh | 62.4 | 768 |
| m3e-base | 61.5 | 768 |
| bge-small-zh | 58.3 | 512 |

可以看到，云服务和开源大模型效果差距不大，可以根据实际情况选择。

## 常见问题

### Q1：向量维度越高越好吗？

不一定。

维度高，表达能力强，但：
- 存储成本高
- 计算成本高
- 可能过拟合

一般768-1536维就够用了。

### Q2：不同模型的向量能混用吗？

不能！

不同模型的向量空间是不兼容的。用模型A生成的向量，只能和模型A生成的向量比较。

如果中途换了向量模型，之前的向量都要重新生成。

:::danger 切勿混用不同模型的向量
这是一个高频踩坑点：**不同Embedding模型生成的向量绝对不能混用**。如果在项目中途更换了向量模型（如从text-embedding-ada-002换到bge-large-zh），必须对知识库中所有已有向量进行重新计算，否则检索结果会完全错乱。在项目初期就要选定模型，后期更换代价很高。
:::

### Q3：中文和英文混合的内容怎么办？

选择对多语言支持好的模型，比如：
- bge-m3（支持100+语言）
- text-embedding-v2（中英文都不错）

### Q4：向量模型需要微调吗？

大部分场景不需要。

除非你的领域非常垂直，通用模型效果不好，才考虑微调。

微调成本很高，需要准备大量的训练数据。

## 小结

这篇文章讲了Embedding的核心知识：

1. **Embedding是什么**：把文字翻译成向量，让机器理解语义
2. **向量相似度**：余弦相似度是主流选择
3. **向量模型选型**：云服务方便，离线部署安全
4. **实战应用**：商品推荐与学习诉求匹配两个例子

Embedding是RAG的核心魔法，理解了它，后面的检索、重排就都好理解了。

下一篇讲向量检索的核心算法——为什么能做到毫秒级检索。
