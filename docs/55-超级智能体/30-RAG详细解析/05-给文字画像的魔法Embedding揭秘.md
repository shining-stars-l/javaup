---
slug: /super-agent/rag/embedding
description: "Embedding是RAG的核心魔法，它让机器能够理解文字的'意思'。本文从相亲匹配的角度解读向量化原理，并讲解如何选择和使用向量模型"
keywords: ["Embedding", "向量化", "向量模型", "语义相似度", "余弦相似度", "Spring AI"]
---

# 给文字画像的魔法：Embedding揭秘

## 从相亲说起

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

## Embedding：把文字变成向量

### Embedding是个翻译官

Embedding的工作就是把文字"翻译"成向量。

```
输入：一段文字
输出：一串数字（向量）
```

这个翻译过程由**Embedding模型**（也叫向量模型）完成。

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

【截图提示：画一个二维坐标系，展示两个向量夹角的示意图】

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
4. **实战应用**：电商商品推荐场景演示

Embedding是RAG的核心魔法，理解了它，后面的检索、重排就都好理解了。

下一篇讲向量数据库——向量生成出来后要存哪里、怎么查询。
