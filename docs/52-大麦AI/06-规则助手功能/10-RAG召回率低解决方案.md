---
slug: /damai-ai/rules-assistant/rag-low-solve
---

# RAG召回率低解决方案

import VipInline from '@site/src/components/VipInline';

> 本文档针对面试中常见的"RAG召回率低如何解决"问题，结合本项目实际代码进行详细分析和解答。
>

## 一、什么是RAG召回率
**召回率（Recall）** 是衡量RAG系统检索效果的核心指标，定义为：

```plain
召回率 = 检索到的相关文档数 / 所有相关文档总数
```

召回率低意味着很多用户需要的相关信息没有被检索出来，导致大模型无法基于正确的上下文生成准确的回答。

## 二、RAG召回率低的常见原因
### 2.1 文档处理层面
| 原因 | 描述 |
| --- | --- |
| **分块策略不合理** | 文档切分过大或过小，导致语义不完整或过于碎片化 |
| **元数据缺失** | 缺少文档标题、来源、分类等元信息，影响检索精度 |
| **文档质量差** | 原始文档存在噪声、格式混乱、信息冗余 |
| **文档预处理不足** | 未进行清洗、去重、标准化处理 |


### 2.2 向量化层面
| 原因 | 描述 |
| --- | --- |
| **Embedding模型选择不当** | 模型与业务领域不匹配，语义理解能力不足 |
| **向量维度问题** | 维度过低损失语义信息，过高计算成本增加 |
| **模型未微调** | 通用模型在特定领域表现不佳 |


### 2.3 检索层面
| 原因 | 描述 |
| --- | --- |
| **相似度阈值设置不当** | 阈值过高会漏掉相关文档 |
| **TopK值过小** | 返回结果数量不足 |
| **检索策略单一** | 仅使用向量检索，缺少混合检索能力 |


### 2.4 查询层面
| 原因 | 描述 |
| --- | --- |
| **用户Query过于简短** | 语义信息不足 |
| **Query与文档表述差异大** | 词汇不匹配（如"退款"vs"退票"） |
| **缺少Query改写/扩展** | 未对用户问题进行优化 |


---

## 三、解决方案详解
### 3.1 优化文档分块策略（Chunking）
#### 修改位置：org.javaup.ai.ai.rag.MarkdownLoader#loadMarkdowns
#### 3.1.1 当前项目的分块方式
```java
Builder builder = MarkdownDocumentReaderConfig.builder()
        // 按水平分割线分块
        .withHorizontalRuleCreateDocument(true)  
        .withIncludeCodeBlock(false)
        .withIncludeBlockquote(false);
if (StringUtil.isNotEmpty(fileName)) {
    builder.withAdditionalMetadata("name", fileName);
}
if (StringUtil.isNotEmpty(label)) {
    builder.withAdditionalMetadata("label", label);
}
```

#### 3.1.2 分块策略对比
| 策略 | 适用场景 | 优缺点 |
| --- | --- | --- |
| **固定大小分块** | 结构化程度低的文档 | 简单但可能切断语义 |
| **语义分块** | 需要保持语义完整性 | 效果好但实现复杂 |
| **递归分块** | 长文档 | 多层级切分，保持上下文 |
| **按标题分块** | Markdown/结构化文档 | 天然语义边界 |
| **滑动窗口分块** | 需要上下文重叠 | 增加冗余但保留上下文 |


#### 3.1.3 ✅ 优化方案：增加分块重叠
**修改位置**：`org.javaup.ai.ai.rag.MarkdownLoader#loadMarkdowns`

**具体修改**：在方法末尾、`return allDocuments;` 之前添加二次切分逻辑

```java
@AllArgsConstructor
@Slf4j
public class MarkdownLoader {

    private final ResourcePatternResolver resourcePatternResolver;
    
    public List<Document> loadMarkdowns() {
        List<Document> allDocuments = new ArrayList<>();
        try {
            Resource[] resources = resourcePatternResolver.getResources("classpath:datum/*.md");
            // ... 省略中间代码 ...
            log.info("总共加载了 {} 个文档片段", allDocuments.size());
            // ========== 👇 新增代码开始 👇 ==========
            // 对过长的文档进行二次切分，增加重叠以提高召回率
            List<Document> splitDocuments = new ArrayList<>();
            // 参数说明：chunkSize=400token, overlap=50token重叠
            TokenTextSplitter splitter = new TokenTextSplitter(400, 50, 5, 10000, true);
            
            for (Document doc : allDocuments) {
                // 超过1000字符的文档进行二次切分
                // 注意：Spring AI 1.0.0 使用 getText() 而不是 getContent()
                if (doc.getText() != null && doc.getText().length() > 1000) {
                    List<Document> splits = splitter.split(List.of(doc));
                    log.info("文档[{}]过长，切分为{}个片段", 
                            doc.getMetadata().get("name"), splits.size());
                    splitDocuments.addAll(splits);
                } else {
                    splitDocuments.add(doc);
                }
            }
            log.info("二次切分后总共 {} 个文档片段", splitDocuments.size());
            return splitDocuments;
            // ========== 👆 新增代码结束 👆 ==========
            
        } catch (IOException e) {
           log.error("Markdown 文档加载失败", e);
        }
        return allDocuments;  // 这行在try-catch外，保留作为异常时的返回
    }
}
```

### 3.2 丰富文档元数据
#### 修改位置：org.javaup.ai.ai.rag.MarkdownLoader#loadMarkdowns
#### 3.2.1 当前项目元数据设置
```java
// 当前只添加了两个元数据
if (StringUtil.isNotEmpty(fileName)) {
      // 文件名
    builder.withAdditionalMetadata("name", fileName);  
}
if (StringUtil.isNotEmpty(label)) {
      // 文档标签
    builder.withAdditionalMetadata("label", label);    
}
```

#### 3.2.2 ✅ 优化方案：扩展元数据
在现有元数据后添加

```java
// 在现有的 builder.withAdditionalMetadata 后面继续添加：
if (StringUtil.isNotEmpty(fileName)) {
    builder.withAdditionalMetadata("name", fileName);
}
if (StringUtil.isNotEmpty(label)) {
    builder.withAdditionalMetadata("label", label);
}

// ========== 👇 新增元数据 👇 ==========
// 根据文件名自动提取分类关键词，需要新增此方法
String keywords = extractKeywords(fileName);  
builder.withAdditionalMetadata("keywords", keywords);
// 来源标识
builder.withAdditionalMetadata("source", "official_faq");  
builder.withAdditionalMetadata("loadTime", LocalDateTime.now().toString());
// ========== 👆 新增元数据结束 👆 ==========
```

**新增辅助方法**（添加在 `org.javaup.ai.ai.rag.MarkdownLoader` 类的末尾）：

```java
/**
 * 从文件名提取关键词
 */
private String extractKeywords(String fileName) {
    if (StringUtil.isEmpty(fileName)) {
        return "";
    }
    // 示例："节目取消和退票-相关问题与回答.md" -> "节目取消,退票,退款"
    Map<String, String> keywordMap = Map.of(
        "退票", "退票,退款,取消订单,退钱",
        "订票", "订票,购票,买票,下单",
        "取消", "取消,作废,退款"
    );
    
    StringBuilder keywords = new StringBuilder();
    for (Map.Entry<String, String> entry : keywordMap.entrySet()) {
        if (fileName.contains(entry.getKey())) {
            if (keywords.length() > 0) {
                keywords.append(",");
            }
            keywords.append(entry.getValue());
        }
    }
    return keywords.toString();
}
```

### 3.3 调整检索参数
#### 修改方法：org.javaup.ai.config.DaMaiRagAiAutoConfiguration#markdownChatClient
#### 3.3.1 修改前的
```java
@Bean
@ConditionalOnProperty(name = RAG_VERSION, havingValue = "1",matchIfMissing = true)
public ChatClient markdownChatClient(OpenAiChatModel model, ChatMemory chatMemory, VectorStore vectorStore,
                                     MarkdownLoader markdownLoader, ChatTypeHistoryService chatTypeHistoryService,
                                     @Qualifier("titleChatClient")ChatClient titleChatClient) {
    List<Document> documentList = markdownLoader.loadMarkdowns();
    vectorStore.add(documentList);

    return ChatClient
            .builder(model)
            .defaultSystem(MARK_DOWN_SYSTEM_PROMPT)
            .defaultAdvisors(
                    new SimpleLoggerAdvisor(),
                    ChatTypeHistoryAdvisor.builder(chatTypeHistoryService).type(ChatType.MARKDOWN.getCode())
                            .order(CHAT_TYPE_HISTORY_ADVISOR_ORDER).build(),
                    ChatTypeTitleAdvisor.builder(chatTypeHistoryService).type(ChatType.MARKDOWN.getCode())
                            .chatClient(titleChatClient).chatMemory(chatMemory).order(CHAT_TITLE_ADVISOR_ORDER).build(),
                    MessageChatMemoryAdvisor.builder(chatMemory).order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER).build(),
                    QuestionAnswerAdvisor.builder(vectorStore)
                            .searchRequest(SearchRequest.builder()
                                    .similarityThreshold(0.3)
                                    .topK(8)
                                    .build())
                            .build()
            )
            .build();
}
```

#### 3.3.2 参数调优建议
| 参数 | 当前值 | 建议范围 | 说明 |
| --- | --- | --- | --- |
| `similarityThreshold` | 0.3 | 0.2-0.5 | **降低阈值可提高召回率**，但可能引入噪声 |
| `topK` | 8 | 5-20 | **增加TopK可提高召回率**，但可能超出上下文窗口 |


#### 3.3.3 ✅ 修改后的：调整检索参数
```java
@Bean
@ConditionalOnProperty(name = RAG_VERSION, havingValue = "2")
public ChatClient markdownChatClient(OpenAiChatModel model, ChatMemory chatMemory, VectorStore vectorStore,
                                     MarkdownLoader markdownLoader, ChatTypeHistoryService chatTypeHistoryService, 
                                     @Qualifier("titleChatClient")ChatClient titleChatClient,
                                     HybridSearchService hybridSearchService) {  // 👈 新增参数
    List<Document> documentList = markdownLoader.loadMarkdowns();
    vectorStore.add(documentList);

    // ========== 👇 新增：缓存文档到混合检索服务 👇 ==========
    hybridSearchService.cacheDocuments(documentList);
    // ========== 👆 新增结束 👆 ==========

    return ChatClient
            .builder(model)
            .defaultSystem(MARK_DOWN_SYSTEM_PROMPT)
            .defaultAdvisors(
                    new SimpleLoggerAdvisor(),
                    // ========== 👇 新增QueryRewriteAdvisor 👇 ==========
                    QueryRewriteAdvisor.builder()
                            // 在RAG之前执行
                            .order(Ordered.HIGHEST_PRECEDENCE + 50)
                            // 先用规则扩展，降低延迟
                            .enableLLMRewrite(false)  
                            .build(),
                    // ========== 👆 新增结束 👆 ==========
                    ChatTypeHistoryAdvisor.builder(chatTypeHistoryService).type(ChatType.MARKDOWN.getCode())
                            .order(CHAT_TYPE_HISTORY_ADVISOR_ORDER).build(),
                    ChatTypeTitleAdvisor.builder(chatTypeHistoryService).type(ChatType.MARKDOWN.getCode())
                            .chatClient(titleChatClient).chatMemory(chatMemory).order(CHAT_TITLE_ADVISOR_ORDER).build(),
                    MessageChatMemoryAdvisor.builder(chatMemory).order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER).build(),
                    // RAG检索配置：降低阈值、增加TopK可提高召回率
                    QuestionAnswerAdvisor.builder(vectorStore)
                            .searchRequest(SearchRequest.builder()
                                    // 降低阈值：0.3 -> 0.25，提高召回率
                                    .similarityThreshold(0.25)
                                    // 增加数量：8 -> 12，召回更多候选
                                    .topK(12)                   
                                    .build())
                            .build()
            )
            .build();
}
```

#### 3.3.4 如何切换修改前和修改后的 markdownChatClient
可以在 application.yaml 中进行配置

```yaml
rag:
    # 1 是修改前，2 是修改后
    version: 1
```

### 3.4 实现混合检索（Hybrid Search）
#### 📍 新建的类：org.javaup.ai.service.HybridSearchService
#### 3.4.1 为什么需要混合检索
+ **向量检索**：基于语义相似度，适合语义匹配
+ **关键词检索**：基于词汇匹配（BM25），适合精确匹配
+ **混合检索**：结合两者优势，提高召回率

#### 3.4.2 ✅ 完整实现代码
```java
package org.javaup.ai.service;

import cn.hutool.core.collection.CollectionUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * @program: 大麦-ai智能服务项目。 添加 阿星不是程序员 微信，添加时备注 ai 来获取项目的完整资料
 * @description: 混合检索服务 - 结合向量检索和关键词检索提高召回率
 * @author: 阿星不是程序员
 **/
@Slf4j
@Service
public class HybridSearchService {
    
    @Autowired
    private VectorStore vectorStore;
    
    @Autowired
    private RerankService rerankService;
    
    /**
     * 文档缓存（简化版，生产环境建议用ES或其他存储）
     * */
    private final Map<String, Document> documentCache = new HashMap<>();
    
    /**
     * 缓存文档（在加载文档时调用）
     */
    public void cacheDocuments(List<Document> documents) {
        for (Document doc : documents) {
            documentCache.put(doc.getId(), doc);
        }
        log.info("已缓存 {} 个文档用于关键词检索", documents.size());
    }
    
    /**
     * 混合检索入口
     * @param query 用户查询
     * @param topK 返回结果数量
     * @return 融合后的文档列表
     */
    public List<Document> hybridSearch(String query, int topK) {
        return hybridSearch(query, topK, true);
    }
    
    /**
     * 混合检索入口（可控制是否启用Rerank）
     * @param query 用户查询
     * @param topK 返回结果数量
     * @param enableRerank 是否启用Rerank精排
     * @return 融合后的文档列表
     */
    public List<Document> hybridSearch(String query, int topK, boolean enableRerank) {
        // 1. 向量检索
        List<Document> vectorResults = vectorStore.similaritySearch(
            SearchRequest.builder()
                .query(query)
                .topK(topK)
                .similarityThreshold(0.2)
                .build()
        );
        if (vectorResults != null) {
            log.info("向量检索返回 {} 个结果", vectorResults.size());
        }
        
        // 2. 关键词检索（BM25简化版）
        List<Document> keywordResults = keywordSearch(query, topK);
        log.info("关键词检索返回 {} 个结果", keywordResults.size());
        
        // 3. RRF融合（召回更多候选，如2倍topK）
        List<Document> merged = new ArrayList<>();
        if (CollectionUtil.isNotEmpty(vectorResults)) {
            merged = mergeWithRRF(vectorResults, keywordResults, topK * 2);
        }
        if (merged != null) {
            log.info("RRF融合后返回 {} 个结果", merged.size());
        }
        
        // 4. Rerank精排（对融合结果进行二次排序，筛选出最终topK个）
        if (enableRerank && CollectionUtil.isNotEmpty(merged)) {
            List<Document> reranked = rerankService.rerank(query, merged, topK);
            log.info("Rerank精排后返回 {} 个结果", reranked.size());
            return reranked;
        }
        
        return merged.size() > topK ? merged.subList(0, topK) : merged;
    }
    
    /**
     * 简化版关键词检索（基于字符串匹配）
     */
    private List<Document> keywordSearch(String query, int topK) {
        // 提取查询关键词
        String[] keywords = query.split("[\\s,，。？?！!]+");
        
        return documentCache.values().stream()
            .map(doc -> {
                // 计算关键词匹配分数
                String docText = doc.getText();
                if (docText == null) {
                    return new AbstractMap.SimpleEntry<>(doc, 0L);
                }
                long matchCount = Arrays.stream(keywords)
                    .filter(kw -> kw.length() > 1 && docText.contains(kw))
                    .count();
                return new AbstractMap.SimpleEntry<>(doc, matchCount);
            })
            .filter(e -> e.getValue() > 0)
            .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
            .limit(topK)
            .map(Map.Entry::getKey)
            .collect(Collectors.toList());
    }
    
    /**
     * RRF融合算法（Reciprocal Rank Fusion）
     * 公式：score = Σ 1/(k + rank_i)
     */
    private List<Document> mergeWithRRF(
            List<Document> vectorResults, 
            List<Document> keywordResults, 
            int topK) {
        
        Map<String, Double> scoreMap = new HashMap<>(vectorResults.size());
        Map<String, Document> docMap = new HashMap<>(vectorResults.size());
        // RRF常数
        int k = 60; 
        
        // 计算向量检索结果的分数
        for (int i = 0; i < vectorResults.size(); i++) {
            Document doc = vectorResults.get(i);
            String id = doc.getId();
            scoreMap.merge(id, 1.0 / (k + i + 1), Double::sum);
            docMap.put(id, doc);
        }
        
        // 计算关键词检索结果的分数
        for (int i = 0; i < keywordResults.size(); i++) {
            Document doc = keywordResults.get(i);
            String id = doc.getId();
            scoreMap.merge(id, 1.0 / (k + i + 1), Double::sum);
            docMap.put(id, doc);
        }
        
        // 按融合分数排序返回topK
        return scoreMap.entrySet().stream()
            .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
            .limit(topK)
            .map(e -> docMap.get(e.getKey()))
            .filter(Objects::nonNull)
            .collect(Collectors.toList());
    }
}
```

#### 3.4.3 如何使用混合检索服务
##### 步骤1：在配置中缓存文档
**修改位置**：`org.javaup.ai.config.DaMaiRagAiAutoConfiguration#markdownChatClient`，在文档加载后缓存文档

```java
@Bean
@ConditionalOnProperty(name = RAG_VERSION, havingValue = "2")
public ChatClient markdownChatClient(OpenAiChatModel model, ChatMemory chatMemory, VectorStore vectorStore,
                                     MarkdownLoader markdownLoader, ChatTypeHistoryService chatTypeHistoryService, 
                                     @Qualifier("titleChatClient")ChatClient titleChatClient,
                                     HybridSearchService hybridSearchService) {  // 👈 新增参数
    List<Document> documentList = markdownLoader.loadMarkdowns();
    vectorStore.add(documentList);

    // ========== 👇 新增：缓存文档到混合检索服务 👇 ==========
    hybridSearchService.cacheDocuments(documentList);
    // ========== 👆 新增结束 👆 ==========

    return ChatClient
            .builder(model)
            .defaultSystem(MARK_DOWN_SYSTEM_PROMPT)
            .defaultAdvisors(
                    new SimpleLoggerAdvisor(),
                    // ========== 👇 新增QueryRewriteAdvisor 👇 ==========
                    QueryRewriteAdvisor.builder()
                            // 在RAG之前执行
                            .order(Ordered.HIGHEST_PRECEDENCE + 50)
                            // 先用规则扩展，降低延迟
                            .enableLLMRewrite(false)  
                            .build(),
                    // ========== 👆 新增结束 👆 ==========
                    ChatTypeHistoryAdvisor.builder(chatTypeHistoryService).type(ChatType.MARKDOWN.getCode())
                            .order(CHAT_TYPE_HISTORY_ADVISOR_ORDER).build(),
                    ChatTypeTitleAdvisor.builder(chatTypeHistoryService).type(ChatType.MARKDOWN.getCode())
                            .chatClient(titleChatClient).chatMemory(chatMemory).order(CHAT_TITLE_ADVISOR_ORDER).build(),
                    MessageChatMemoryAdvisor.builder(chatMemory).order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER).build(),
                    // RAG检索配置：降低阈值、增加TopK可提高召回率
                    QuestionAnswerAdvisor.builder(vectorStore)
                            .searchRequest(SearchRequest.builder()
                                    // 降低阈值：0.3 -> 0.25，提高召回率
                                    .similarityThreshold(0.25)
                                    // 增加数量：8 -> 12，召回更多候选
                                    .topK(12)                   
                                    .build())
                            .build()
            )
            .build();
}
```

##### 步骤2：在Controller中适配普通和混合检索接口
**修改位置**：`org.javaup.ai.cotroller.ProgramController`

```java
@RestController
@RequestMapping("/program")
public class ProgramController {
    
    @Resource
    private ChatClient markdownChatClient;
    
    // 👇 新增：注入HybridSearchService
    @Autowired
    private HybridSearchService hybridSearchService;
  
      // 👇 新增：普通和优化的版本配置
      @Value("${"+RAG_VERSION+":1}")
    private Integer ragVersion;
    
    // 适配包括原有的纯向量检索和检索RAG接口（向量检索 + 关键词检索 + Rerank精排）接口
    @RequestMapping(value = "/rag", produces = "text/html;charset=utf-8")
    public Flux<String> rag(@RequestParam("prompt") String prompt,
                             @RequestParam("chatId") String chatId) {
        final Integer ragTwoVersionValue = 2;
        //如果 application.yaml 中，rag.version 配置为 2，则使用混合检索 + Rerank
        if (ragVersion.equals(ragTwoVersionValue)) {
            // 1. 执行混合检索 + Rerank
            List<Document> documents = hybridSearchService.hybridSearch(prompt, 10, true);
            log.info("混合检索返回 {} 个文档", documents.size());

            // 2. 将检索结果组装为上下文
            String context = documents.stream()
                    .map(Document::getText)
                    .collect(Collectors.joining("\n\n"));

            // 3. 构建增强后的提示词
            String enhancedPrompt = """
                以下是检索到的相关上下文信息：
                ---------------------
                %s
                ---------------------
                请基于上述上下文信息回答用户问题。如果上下文中没有相关信息，请告知用户。

                用户问题：%s
                """.formatted(context, prompt);

            // 4. 请求模型（使用markdownChatClient保持会话记录等功能）
            return markdownChatClient.prompt()
                    .user(enhancedPrompt)
                    .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, chatId))
                    .stream()
                    .content();
        }
        //如果 application.yaml 中，rag.version 配置为 1，则使用普通检索
        // 请求模型
        return markdownChatClient.prompt()
                .user(prompt)
                .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, chatId))
                .stream()
                .content();
    }
}
```

### 3.5 Query改写与扩展
#### 新建的类：org.javaup.ai.advisor.QueryRewriteAdvisor
#### 3.5.1 ✅ 完整实现代码
```java
package org.javaup.ai.advisor;

import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.api.AdvisorChain;
import org.springframework.ai.chat.client.advisor.api.BaseAdvisor;
import org.springframework.core.Ordered;

import java.util.HashMap;
import java.util.Map;

/**
 * Query改写Advisor - 在检索前对用户问题进行优化
 * 
 * 参考现有Advisor实现：ChatTypeHistoryAdvisor.java
 */
@Slf4j
public class QueryRewriteAdvisor implements BaseAdvisor {
    
    private final int order;
    private final boolean enableLLMRewrite;  // 是否启用LLM改写
    private final ChatClient rewriteClient;  // 用于改写的ChatClient
    
    // 同义词映射表（简化版，用于快速扩展）
    private static final Map<String, String> SYNONYM_MAP = new HashMap<>() {{
        put("退票", "退票 退款 取消订单");
        put("退款", "退款 退票 退钱");
        put("买票", "买票 购票 订票 下单");
        put("取消", "取消 作废 退订");
        put("演出", "演出 节目 表演 演唱会");
        put("门票", "门票 票 入场券");
    }};
    
    private QueryRewriteAdvisor(int order, boolean enableLLMRewrite, ChatClient rewriteClient) {
        this.order = order;
        this.enableLLMRewrite = enableLLMRewrite;
        this.rewriteClient = rewriteClient;
    }
    
    @Override
    public ChatClientRequest before(ChatClientRequest request, AdvisorChain chain) {
        String originalQuery = request.prompt().getUserMessage().getText();
        log.info("原始Query: {}", originalQuery);
        
        String enhancedQuery;
        if (enableLLMRewrite && rewriteClient != null) {
            // 使用LLM进行智能改写
            enhancedQuery = llmRewrite(originalQuery);
        } else {
            // 使用规则进行简单扩展
            enhancedQuery = ruleBasedExpand(originalQuery);
        }
        
        log.info("改写后Query: {}", enhancedQuery);
        
        // 构建新的请求（注意：实际修改方式需要根据Spring AI版本调整）
        // 这里展示的是概念实现
        return request;
    }
    
    @Override
    public ChatClientResponse after(ChatClientResponse response, AdvisorChain chain) {
        return response;
    }
    
    @Override
    public int getOrder() {
        return order;
    }
    
    /**
     * 基于规则的Query扩展
     */
    private String ruleBasedExpand(String query) {
        StringBuilder expanded = new StringBuilder(query);
        
        for (Map.Entry<String, String> entry : SYNONYM_MAP.entrySet()) {
            if (query.contains(entry.getKey())) {
                expanded.append(" ").append(entry.getValue());
            }
        }
        
        return expanded.toString();
    }
    
    /**
     * 使用LLM进行智能Query改写
     */
    private String llmRewrite(String originalQuery) {
        try {
            String prompt = """
                请将以下用户问题改写为更适合文档检索的形式，要求：
                1. 保持原意
                2. 扩展同义词（如：退票->退票、退款、取消订单）
                3. 补充可能的相关概念
                4. 只返回改写结果，不要其他内容
                
                原始问题：%s
                """.formatted(originalQuery);
            
            return rewriteClient.prompt()
                .user(prompt)
                .call()
                .content();
        } catch (Exception e) {
            log.warn("LLM改写失败，使用原始Query", e);
            return originalQuery;
        }
    }
    
    // ========== Builder模式（参考ChatTypeHistoryAdvisor） ==========
    
    public static Builder builder() {
        return new Builder();
    }
    
    public static final class Builder {
        private int order = Ordered.HIGHEST_PRECEDENCE + 50;  // 在RAG检索之前执行
        private boolean enableLLMRewrite = false;
        private ChatClient rewriteClient;
        
        public Builder order(int order) {
            this.order = order;
            return this;
        }
        
        public Builder enableLLMRewrite(boolean enable) {
            this.enableLLMRewrite = enable;
            return this;
        }
        
        public Builder rewriteClient(ChatClient client) {
            this.rewriteClient = client;
            return this;
        }
        
        public QueryRewriteAdvisor build() {
            return new QueryRewriteAdvisor(order, enableLLMRewrite, rewriteClient);
        }
    }
}
```

#### 3.5.2 如何将Advisor添加到配置中
**还是增强的markdownChatClient方法**：`DaMaiRagAiAutoConfiguration.java` 的 `markdownChatClient` 方法

```java
@Bean
@ConditionalOnProperty(name = RAG_VERSION, havingValue = "2")
public ChatClient markdownChatClient(OpenAiChatModel model, ChatMemory chatMemory, VectorStore vectorStore,
                                 MarkdownLoader markdownLoader, ChatTypeHistoryService chatTypeHistoryService, 
                                 @Qualifier("titleChatClient")ChatClient titleChatClient,
                                 HybridSearchService hybridSearchService) {  // 👈 新增参数
List<Document> documentList = markdownLoader.loadMarkdowns();
vectorStore.add(documentList);

// ========== 👇 新增：缓存文档到混合检索服务 👇 ==========
hybridSearchService.cacheDocuments(documentList);
// ========== 👆 新增结束 👆 ==========

return ChatClient
        .builder(model)
        .defaultSystem(MARK_DOWN_SYSTEM_PROMPT)
        .defaultAdvisors(
                new SimpleLoggerAdvisor(),
                // ========== 👇 新增QueryRewriteAdvisor 👇 ==========
                QueryRewriteAdvisor.builder()
                        // 在RAG之前执行
                        .order(Ordered.HIGHEST_PRECEDENCE + 50)
                        // 先用规则扩展，降低延迟
                        .enableLLMRewrite(false)  
                        .build(),
                // ========== 👆 新增结束 👆 ==========
                ChatTypeHistoryAdvisor.builder(chatTypeHistoryService).type(ChatType.MARKDOWN.getCode())
                        .order(CHAT_TYPE_HISTORY_ADVISOR_ORDER).build(),
                ChatTypeTitleAdvisor.builder(chatTypeHistoryService).type(ChatType.MARKDOWN.getCode())
                        .chatClient(titleChatClient).chatMemory(chatMemory).order(CHAT_TITLE_ADVISOR_ORDER).build(),
                MessageChatMemoryAdvisor.builder(chatMemory).order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER).build(),
                // RAG检索配置：降低阈值、增加TopK可提高召回率
                QuestionAnswerAdvisor.builder(vectorStore)
                        .searchRequest(SearchRequest.builder()
                                // 降低阈值：0.3 -> 0.25，提高召回率
                                .similarityThreshold(0.25)
                                // 增加数量：8 -> 12，召回更多候选
                                .topK(12)                   
                                .build())
                        .build()
        )
        .build();
}
```

### 3.6 使用Rerank重排序
#### 新建的类：`org.javaup.ai.service.RerankService`
```java
@Slf4j
@Service
public class RerankService {
    
    /**
     * 基于关键词重叠度的简单重排序
     * @param query 用户查询
     * @param documents 待排序文档列表
     * @param topK 返回数量
     * @return 重排序后的文档列表
     */
    public List<Document> rerank(String query, List<Document> documents, int topK) {
        if (documents == null || documents.isEmpty()) {
            return documents;
        }
        
        // 提取query关键词
        Set<String> queryKeywords = extractKeywords(query);
        
        // 计算每个文档的相关性分数
        List<ScoredDocument> scoredDocs = documents.stream()
            .map(doc -> {
                String docText = doc.getText();
                double score = (docText != null) ? computeRelevanceScore(queryKeywords, docText) : 0.0;
                return new ScoredDocument(doc, score);
            })
            .sorted((a, b) -> Double.compare(b.getScore(), a.getScore()))
            .limit(topK)
            .collect(Collectors.toList());
        
        log.info("Rerank完成，原{}个文档，返回{}个", documents.size(), scoredDocs.size());
        
        return scoredDocs.stream()
            .map(ScoredDocument::getDocument)
            .collect(Collectors.toList());
    }
    
    /**
     * 使用LLM进行重排序（更精确但更慢）
     * @param query 用户查询
     * @param documents 待排序文档列表
     * @param chatClient 用于调用LLM的ChatClient
     * @param topK 返回数量
     * @return 重排序后的文档列表
     */
    public List<Document> rerankWithLLM(String query, List<Document> documents, 
                                         ChatClient chatClient, int topK) {
        if (documents == null || documents.size() <= 1) {
            return documents;
        }
        
        try {
            // 构建文档列表
            StringBuilder docList = new StringBuilder();
            for (int i = 0; i < documents.size(); i++) {
                String docText = documents.get(i).getText();
                if (docText != null) {
                    docList.append(String.format("[%d] %s\n", 
                        i + 1, 
                        docText.substring(0, Math.min(200, docText.length()))));
                }
            }
            
            String prompt = """
                请对以下文档按照与问题的相关性从高到低排序。
                
                问题：%s
                
                文档列表：
                %s
                
                请只返回排序后的文档编号（从1开始），用逗号分隔，如：3,1,2,5,4
                """.formatted(query, docList.toString());
            
            String result = chatClient.prompt()
                .user(prompt)
                .call()
                .content();
            
            // 解析返回的排序结果
            List<Document> reranked = new ArrayList<>();
            String[] indices = result.replaceAll("[^0-9,]", "").split(",");
            for (String idx : indices) {
                try {
                    int index = Integer.parseInt(idx.trim()) - 1;
                    if (index >= 0 && index < documents.size()) {
                        reranked.add(documents.get(index));
                    }
                } catch (NumberFormatException ignored) {}
            }
            
            return reranked.isEmpty() ? documents.subList(0, Math.min(topK, documents.size())) 
                                       : reranked.subList(0, Math.min(topK, reranked.size()));
        } catch (Exception e) {
            log.warn("LLM Rerank失败，返回原始结果", e);
            return documents.subList(0, Math.min(topK, documents.size()));
        }
    }
    
    /**
     * 从文本中提取关键词
     */
    private Set<String> extractKeywords(String text) {
        return Arrays.stream(text.split("[\\s,，。？?！!]+"))
            .filter(s -> s.length() > 1)
            .collect(Collectors.toSet());
    }
    
    /**
     * 计算关键词与文档内容的相关性分数
     */
    private double computeRelevanceScore(Set<String> queryKeywords, String content) {
        if (queryKeywords.isEmpty()) {
            return 0.0;
        }
        
        long matchCount = queryKeywords.stream()
            .filter(content::contains)
            .count();
        
        // 归一化分数
        return (double) matchCount / queryKeywords.size();
    }
    
    /**
     * 带分数的文档包装类
     */
    @Data
    @AllArgsConstructor
    private static class ScoredDocument {
        private Document document;
        private double score;
    }
}
```

#### 3.6.2 RerankService已集成到HybridSearchService
RerankService已经在`HybridSearchService`中被自动调用，无需额外配置：

```plain
混合检索流程：
向量检索 + 关键词检索 → RRF融合(2倍topK) → RerankService.rerank() → 返回最终topK
```

如果需要使用LLM进行更精确的Rerank，可以在`HybridSearchService`中将`rerank()`替换为`rerankWithLLM()`方法。

### 3.7 优化Embedding模型
#### 📍 修改文件：`application.yaml`
#### 3.7.1 选择合适的Embedding模型
具体的模型，需要在对应AI厂商的官网进行查看

#### 3.7.2 ✅ 配置示例
```yaml
spring:
  ai:
    openai:
      embedding:
        options:
          model: text-embedding-3-large  # 使用更大的模型提高精度
          dimensions: 1536               # 向量维度
```

### 3.8 构建知识图谱增强RAG（GraphRAG）
#### 3.8.1 核心思想
将文档中的实体和关系抽取出来构建知识图谱，检索时结合图谱信息增强上下文。

```plain
[传统RAG]: Query → Vector Search → Documents → LLM

[GraphRAG]: Query → Vector Search + Graph Traversal → Documents + Related Entities → LLM
```

#### 3.8.2 实现要点
1. **实体抽取**：从文档中抽取关键实体
2. **关系构建**：建立实体之间的关系
3. **图谱检索**：基于实体进行图遍历
4. **上下文增强**：将图谱信息加入Prompt

> 注：GraphRAG实现较复杂，需要引入图数据库（如Neo4j），本文档不展开实现细节。
>

---

## 四、本项目优化建议汇总
### 当前架构分析
```plain
[用户Query] 
    ↓
[MessageChatMemoryAdvisor] - 对话记忆
    ↓
[QuestionAnswerAdvisor] - RAG检索（similarityThreshold=0.3, topK=8）
    ↓
[VectorStore] - 向量存储
    ↓
[LLM响应生成]
```

## 五、面试回答模板
### 问题：RAG召回率低应该如何解决？
**参考回答：**

> RAG召回率低是一个系统性问题，需要从多个维度进行优化：
>
> **1. 文档处理层面：**
>
> + 优化分块策略，选择合适的chunk size，增加块之间的重叠（overlap）
> + 丰富文档元数据，添加分类、关键词、来源等信息
> + 对文档进行预处理，去噪、标准化
>
> **2. 检索层面：**
>
> + 适当降低相似度阈值（如从0.5降到0.3）
> + 增加TopK返回数量
> + 实现混合检索，结合向量检索和关键词检索（BM25）
> + 使用Rerank模型对召回结果重排序
>
> **3. 查询层面：**
>
> + 实现Query改写，使用LLM优化用户问题
> + 使用Multi-Query策略，生成多个查询变体
> + HyDE（Hypothetical Document Embeddings）：先生成假设答案再检索
>
> **4. 模型层面：**
>
> + 选择更适合业务领域的Embedding模型
> + 对Embedding模型进行领域微调
> + 使用更高维度的向量表示
>
> **5. 高级方案：**
>
> + 构建知识图谱增强RAG（GraphRAG）
> + 实现多路召回+融合策略
> + 引入用户反馈进行持续优化
>
> 在我参与的项目中，我们通过将相似度阈值从0.5降到0.3，TopK从5增加到12，并实现了混合检索，召回率提升了约30%。
>

---

## 六、总结
提升RAG召回率是一个系统工程，需要在以下环节持续优化：

```plain
文档预处理 → 智能分块 → 向量化 → 混合检索 → Query优化 → Rerank → 结果融合
```

关键原则：

1. **宁可多召回，不要漏召回** - 召回阶段追求高召回率，精排阶段追求高准确率
2. **结合业务特点** - 不同场景需要不同的优化策略
3. **数据驱动优化** - 建立评估体系，持续迭代改进

---

## 参考资料
+ [Spring AI 官方文档](https://docs.spring.io/spring-ai/reference/)
+ [RAG技术综述](https://arxiv.org/abs/2312.10997)
+ [Advanced RAG Techniques](https://www.pinecone.io/learn/advanced-rag-techniques/)


<VipInline />