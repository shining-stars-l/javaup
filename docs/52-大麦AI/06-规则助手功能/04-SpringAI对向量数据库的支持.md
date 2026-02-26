---
slug: /damai-ai/rules-assistant/springai-vector-support
---

# SpringAI对向量数据库的支持

import VipInline from '@site/src/components/VipInline';

大麦功能助手因为是使用RAG功能来向量数据中进行检索，所以要先创建出向量数据库出来，而 SpringAI 也提供了向量数据的支持。

VectorStore 是 Spring AI 中用于管理和查询向量数据库的核心接口，它抽象出了一套统一的文档（Document）写入与相似度检索的操作，使得应用可以无缝切换底层向量存储实现。

## VectorStore 接口概述
+ **包路径**  
  org.springframework.ai.vectorstore
+ **责任**
    - 向向量数据库添加、删除文档
    - 基于查询文本或元数据过滤执行相似度搜索
    - 可选地访问底层“原生”客户端

### 核心方法
| 方法签名 | 说明 |
| --- | --- |
| `void add(List<Document> documents)` | 批量添加文档到向量存储 |
| `void delete(List<String> idList)` | 根据文档 ID 列表删除文档 |
| `void delete(Filter.Expression filterExpression)` | 根据过滤表达式删除文档 |
| `List<Document> similaritySearch(String query)` | 直接以文本生成 Embedding 并搜索最相似文档 |
| `List<Document> similaritySearch(SearchRequest request)` | 支持指定 Top‑K、相似度阈值、元数据过滤等参数的高级检索 |
| `<T> Optional<T> getNativeClient()` | 获取底层向量数据库客户端（如 RedisClient、PineconeClient 等），进行更细粒度操作 |
| `static <T extends VectorStore.Builder<T>> VectorStore.Builder<T> builder(String name)` | 构建器，用于以流式 API 配置并实例化 VectorStore 实现 |


## 支持的向量数据库实现
Spring AI 通过一系列 `*VectorStore` 实现类，支持主流及云端、自建向量存储系统。

+ **云服务 / 托管**
    - `PineconeVectorStore`
    - `QdrantVectorStore`
    - `RedisVectorStore`
    - `WeaviateVectorStore`
    - `AzureVectorStore`
    - `CassandraVectorStore`
    - `MongoDBAtlasVectorStore`
    - `CosmosDBVectorStore`
    - `CouchbaseSearchVectorStore`
    - `GemFireVectorStore`
    - `OracleVectorStore`
    - `OpenSearchVectorStore`
    - `ElasticsearchVectorStore`
+ **开源 / 自建**
    - `ChromaVectorStore`
    - `MilvusVectorStore`
    - `Neo4jVectorStore`
    - `PgVectorStore` (PostgreSQL + pgvector)
    - `MariaDBVectorStore`
    - `HanaCloudVectorStore`
    - `TypesenseVectorStore`
+ **开发／测试友好**
    - `SimpleVectorStore` (基于本地文件或内存的简易实现)

---

**小结**：

+ 使用时，只需在 Spring Boot 配置文件中引入相应的 `spring-ai-*-store-spring-boot-starter` 依赖，并设置对应的连接参数（API Key／Host／Port／Index/Collection 名称等）。
+ 在代码中注入 `VectorStore`（或指定具体实现类型）即可进行文档写入与相似检索。
+ 利用 `getNativeClient()` 可获得底层 SDK 客户端，执行特定数据库特性操作。

## 项目集成 RAG 和 VectorStore
为了方便大家使用不需要额外的搭建向量数据库，所以项目中使用 `SimpleVectorStore` 这种，它是专门用来测试或者演示使用的，很合适来学习。

### 首先项目中引入向量数据库的依赖
```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-advisors-vector-store</artifactId>
</dependency>
```

### 阿里百炼
目前 SpirngAI 中的 DeepSeek 只支持对话模型，还并不支持向量模型，所以需要使用 OpenAI 的向量模型，但是OpenAI 需要用手段才可以使用，比较麻烦。

不过好在阿里的 ai 模型，阿里百炼遵守 OpenAI 的规范，所以可以使用 OpenAI 的依赖，实际的调用 ai 是阿里百炼平台

#### 引入 OpenAI 的依赖
```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-openai</artifactId>
</dependency>
```



#### 在配置文件中添加对应的配置
```yaml
spring:
  application:
    name: damai-ai
  ai:
    openai:
      base-url: https://dashscope.aliyuncs.com/compatible-mode
      api-key: ${对应的key}
      chat:
        options:
          model: qwen-max-latest
      embedding:
        options:
          model: text-embedding-v3
          dimensions: 1024
```

这里的 key 就是阿里百炼平台的了

#### 引入 RAG 的依赖
```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-rag</artifactId>
</dependency>
```



#### 然后创建出向量数据库
org.javaup.ai.config.DaMaiAiAutoConfiguration

```java
@Bean
public VectorStore vectorStore(OpenAiEmbeddingModel embeddingModel) {
    return SimpleVectorStore.builder(embeddingModel).build();
}
```


<VipInline />