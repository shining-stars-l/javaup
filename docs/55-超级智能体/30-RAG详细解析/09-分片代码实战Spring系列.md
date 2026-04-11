---
slug: /super-agent/rag/spring-splitter
description: "Spring AI和Spring AI Alibaba的文档分片代码实战，包含TokenTextSplitter、自定义Overlap分片器、RecursiveCharacterTextSplitter的完整示例和执行结果"
keywords: ["Spring AI", "Spring AI Alibaba", "TokenTextSplitter", "RecursiveCharacterTextSplitter", "文档分片"]
---

# 分片代码实战：Spring系列

前面讲了分块策略的理论和ChunkViz可视化实验，这篇开始写具体的实现代码。

Java生态中主要有三个框架支持文档分片：

| 框架 | 特点 | 推荐度 |
|:-----|:-----|:------|
| Spring AI | 官方只提供TokenTextSplitter，功能较弱 | 入门可用 |
| Spring AI Alibaba | 扩展了Spring AI，支持递归分片 | **推荐** |
| LangChain4J | 功能最丰富，支持语义分片 | 进阶使用 |

## Spring AI的TokenTextSplitter

### 框架原生能力

在Spring AI的ETL Pipeline模块中，TextSplitter是所有文本拆分器的抽象基类。但目前官方**只提供了一个具体实现**：TokenTextSplitter——按token数量拆分文本。

:::warning Spring AI的分片功能较弱
Spring AI的TokenTextSplitter有两个明显的缺陷：
1. **不支持overlap**（相邻块重叠），相邻文本块之间没有共享内容
2. **不支持按段落或自然语言结构分割**，只能按token数硬切

如果需要更高级的分片功能，要么用Spring AI Alibaba，要么用LangChain4J，要么自己实现。
:::

### 核心参数

| 参数 | 说明 | 默认值 |
|:-----|:-----|:------|
| chunkSize | 每个文本块的目标大小（以token为单位） | 800 |
| minChunkSizeChars | 每个文本块的最小字符数，太短的块会被丢弃或合并 | 350 |
| minChunkLengthToEmbed | 只有长度超过此值的块才会发送给向量模型 | 5 |
| maxNumChunks | 单个文档允许拆分出的最大块数 | 10000 |
| keepSeparator | 是否在块中保留分隔符（如换行符） | true |

## 示例中项目地址

- 项目地址：[https://gitee.com/shining-stars-l/super-ai-hub](https://gitee.com/shining-stars-l/super-ai-hub)
- 项目模块：`ai-example-spring-ai-rag`
- 测试文档位置：`项目根目录/document/Java语言特性与核心概念.md`

### 代码示例

```java
/**
 * Spring AI原生的TokenTextSplitter使用示例
 */
public class TokenTextSplitterSplit {
    
    public static List<Document> split(List<Document> documents) {
        if (CollectionUtils.isEmpty(documents)) {
            return Collections.emptyList();
        }
        
        //使用TokenTextSplitter进行文档分片
        TokenTextSplitter splitter = new TokenTextSplitter(
                // 每块最多600 tokens
                600,
                // 每块至少300字符再考虑断点
                300,
                // 太短的不做嵌入
                5,
                // 最多拆分8000块
                8000,
                // 保留句号、换行符
                true
        );
        
        return splitter.apply(documents);
    }
}
```

### 调用示例与执行结果

**执行代码**：
```java
System.out.println("分片前Document数量: " + docs.size());
List<Document> result = TokenTextSplitterSplit.split(docs);
System.out.println("分片后Document数量: " + result.size());
```

**执行结果**：

```
分片前Document数量: 52
分片后Document数量: 61
```

可以看到，经过分片操作，document从52个变成了61个，说明按照我们的要求已经分片成功了。

## 自定义支持Overlap的分片器

### 为什么要自己实现

由于Spring AI的TokenTextSplitter不支持overlap，而overlap对于保持语义连续性很重要，所以我们需要自己实现一个。

### 完整代码实现

```java
public class OverlapParagraphTextSplit extends TextSplitter {
    
    // 每块最大字符数
    protected final int chunkSize;
    // 相邻块之间重叠字符数
    protected final int overlap;
    

    public OverlapParagraphTextSplit(int chunkSize, int overlap) {
        if (chunkSize <= 0) {
            throw new RuntimeException("chunkSize 必须大于 0");
        }
        if (overlap < 0) {
            throw new RuntimeException("overlap 不能为负数");
        }
        if (overlap >= chunkSize) {
            throw new RuntimeException("overlap 不能大于等于 chunkSize");
        }
        this.chunkSize = chunkSize;
        this.overlap = overlap;
    }
    
    @Override
    public List<String> splitText(String text) {
        if (StrUtil.isEmpty(text)) {
            return Collections.emptyList();
        }
        String[] paragraphs = text.split("\\n+");
        List<String> allChunks = new ArrayList<>();
        StringBuilder currentChunk = new StringBuilder();
        
        for (String paragraph : paragraphs) {
            if (StrUtil.isEmpty(paragraph)) {
                continue;
            }
            int start = 0;
            while (start < paragraph.length()) {
                int remainingSpace = chunkSize - currentChunk.length();
                int end = Math.min(start + remainingSpace, paragraph.length());
                
                if (!currentChunk.isEmpty()) {
                    currentChunk.append("\n");
                }
                currentChunk.append(paragraph, start, end);
                
                // 如果当前块已满，保存并生成新块
                if (currentChunk.length() >= chunkSize) {
                    allChunks.add(currentChunk.toString());
                    
                    // 计算重叠部分
                    String overlapText = "";
                    if (overlap > 0) {
                        int overlapStart = Math.max(0, currentChunk.length() - overlap);
                        overlapText = currentChunk.substring(overlapStart);
                    }
                    
                    currentChunk = new StringBuilder();
                    if (!overlapText.isEmpty()) {
                        currentChunk.append(overlapText);
                    }
                }
                start = end;
            }
        }
        
        if (!currentChunk.isEmpty()) {
            allChunks.add(currentChunk.toString());
        }
        
        return allChunks;
    }
    
    @Override
    public List<Document> apply(List<Document> documents) {
        if (CollectionUtils.isEmpty(documents)) {
            return Collections.emptyList();
        }
        
        List<Document> result = new ArrayList<>();
        for (Document doc : documents) {
            List<String> chunks = splitText(doc.getText());
            for (String chunk : chunks) {
                result.add(new Document(chunk));
            }
        }
        return result;
    }
}
```

### 调用示例与执行结果

**执行代码**：
```java
System.out.println("分片前Document数量: " + docs.size());
OverlapParagraphTextSplit split = new OverlapParagraphTextSplit(
        // 每块最大300字符
        300,
        // 块之间重叠80字符
        80    
);
List<Document> result = split.apply(docs);
System.out.println("分片后Document数量: " + result.size());
```

**执行结果**：

```
分片前Document数量: 52
分片后Document数量: 76
```

<img src="/img/super-agent/rag/OverlapParagraphTextSplit执行结果.png" alt="讲解" width="100%" />

我们可以看到调用结果中，相邻文本块之间都有一段overlap重叠，这样就可以一定程度上保证了文本块的延续性。

## Spring AI Alibaba的递归分片

### 框架原生能力

Spring AI Alibaba扩展了Spring AI，提供了RecursiveCharacterTextSplitter，这是目前**最推荐的通用分片方式**。

递归分片的核心思想：按照一组分隔符的优先级来切割文本。先用高优先级的分隔符（如`\n\n`），如果切出来的块还是太大，再用下一级分隔符继续切。

:::warning 注意
文档在清洗时，是不能先把空格、换行等符号给清洗掉的，因为要基于这些特殊符号进行分段，去掉了那肯定不行
:::

### 代码示例

**要改变清洗方式：** `org.javaup.ai.util.DocumentClearHandler#clearDocumentsForRecursiveSplit`

```java
/**
 * Spring AI Alibaba 递归分片的清洗方式。
 *
 * 递归分片依赖换行、段落和句号这些“结构化分隔符”来寻找自然边界，
 * 所以这里不能像固定大小分片那样把所有空白都压成一行。
 */
public static List<Document> clearDocumentsForRecursiveSplit(List<Document> documents) {
    if (CollectionUtils.isEmpty(documents)) {
        return documents;
    }

    return documents.stream()
            .map(doc -> {
                if (doc == null || doc.getText() == null) {
                    return doc;
                }

                String text = isCodeLikeDocument(doc)
                        ? cleanCodeLikeDocument(doc.getText())
                        : cleanTextForRecursiveSplit(doc.getText());

                return new Document(text, doc.getMetadata());
            })
            .collect(Collectors.toList());
}
```
**Spring AI Alibaba 的递归分片实现**

```java
/**
 * Spring AI Alibaba 的递归分片实现。
 *
 * 这里特意没有直接使用 splitter.apply(documents)：
 * 1. 我们希望过滤掉递归切分过程中产生的空 chunk；
 * 2. 我们希望自己补齐 parent_document_id / chunk_index / total_chunks 元数据，方便教学演示；
 * 3. 我们希望对代码块和 Mermaid 这类结构化内容做特殊处理，避免被切得过碎。
 */
public class SpringAiAlibabaRecursiveTextSplit {

    /**
     * 真正拿 Markdown 技术文档做 RAG 时， 500 更接近实战配置。
     */
    private static final int CHUNK_SIZE = 500;

    /**
     * 为了保留“语义完整的句子 / 段落”，这里有意不再按空格和逗号切。
     * 否则英文术语、缩写和代码标识符很容易被拆成 "Java"、"JVM"、"API" 这样的碎片。
     */
    private static final String[] SEPARATORS = {"\n\n", "\n", "。", "！", "？", "；"};

    private SpringAiAlibabaRecursiveTextSplit() {
    }

    public static List<Document> split(List<Document> documents) {
        if (CollectionUtils.isEmpty(documents)) {
            return Collections.emptyList();
        }

        RecursiveCharacterTextSplitter splitter = new RecursiveCharacterTextSplitter(CHUNK_SIZE, SEPARATORS);
        List<Document> result = new ArrayList<>();

        for (Document document : documents) {
            List<String> chunks = splitSingleDocument(document, splitter);
            if (CollectionUtils.isEmpty(chunks)) {
                continue;
            }

            for (int i = 0; i < chunks.size(); i++) {
                Map<String, Object> metadata = new LinkedHashMap<>(document.getMetadata());
                metadata.put("parent_document_id", document.getId());
                metadata.put("chunk_index", i);
                metadata.put("total_chunks", chunks.size());

                Document child = new Document(chunks.get(i), metadata);
                child.setContentFormatter(document.getContentFormatter());
                result.add(child);
            }
        }

        return result;
    }

    private static List<String> splitSingleDocument(Document document, RecursiveCharacterTextSplitter splitter) {
        String text = document.getText();
        if (!StringUtils.hasText(text)) {
            return Collections.emptyList();
        }

        // 代码块 / Mermaid 块本身已经是结构化内容，演示时保留原块更容易理解。
        if (isCodeLikeDocument(document) || text.length() <= CHUNK_SIZE) {
            return List.of(text.trim());
        }

        return splitter.splitText(text).stream()
                .map(String::trim)
                .filter(StringUtils::hasText)
                .toList();
    }

    private static boolean isCodeLikeDocument(Document document) {
        Object category = document.getMetadata().get("category");
        return "code_block".equals(category) || document.getMetadata().containsKey("lang");
    }
}
```
**调用：org.javaup.ai.service.DocumentPreprocessService#process**
```java
public List<Document> process(File file) {
    try {
        // 1. 读取文档
        log.info("开始读取文档: {}", file.getName());
        List<Document> docs = readerHandlerContext.read(file);
        log.info("读取完成，共 {} 个Document", docs.size());

        // 2. 清洗文档
        log.info("开始清洗文档");
        // 注意：不同分片器要配不同的清洗策略。
        // 1) TokenTextSplitter / OverlapParagraphTextSplit 偏固定大小切块，可以把空白压成一行；
        //docs = DocumentClearHandler.clearDocumentsForFlatSplit(docs);
        
        
        // 2) Spring AI Alibaba 的递归分片依赖 \n\n、\n、句号等边界，不能把这些结构信息清掉。
        docs = DocumentClearHandler.clearDocumentsForRecursiveSplit(docs);
        log.info("清洗完成");

        // 3. 添加元数据
        log.info("添加元数据");
        for (Document doc : docs) {
            doc.getMetadata().put("filename", file.getName());
            doc.getMetadata().put("processTime", System.currentTimeMillis());
        }
        System.out.println("分片前Document数量: " + docs.size());

        // ==================== 方式一：Spring AI 原生 TokenTextSplitter ====================
        // 特点：简单直接，适合演示“固定大小切块”。
        // 使用时建议把上面的清洗切换为 DocumentClearHandler.clearDocumentsForFlatSplit(docs)
        //List<Document> result = TokenTextSplitterSplit.split(docs);

        // ==================== 方式二：自定义 Overlap 分片 ====================
        // 特点：可以控制 chunk overlap，适合讲解“上下文重叠”。
        // 使用时同样建议使用 DocumentClearHandler.clearDocumentsForFlatSplit(docs)
        //OverlapParagraphTextSplit split = new OverlapParagraphTextSplit(300, 80);
        //List<Document> result = split.apply(docs);

        // ==================== 方式三：Spring AI Alibaba 递归分片 ====================
        // 特点：优先尊重段落、换行、句号等自然边界，是更贴近真实 RAG 的通用方案。
        // 这里使用的是“实战版配置”，和文档里为了展示效果而写的 100 字符示例不同：
        // - chunkSize 调大，避免技术文档被切得过碎
        // - 不再按空格继续拆，避免 Java / JVM / API 这类术语单独成块
        // - 过滤空 chunk，并保留 parent_document_id / chunk_index / total_chunks 元数据
        List<Document> result = SpringAiAlibabaRecursiveTextSplit.split(docs);
        System.out.println("分片后Document数量: " + result.size());
        return result;
    } catch (Exception e) {
        log.error("处理文档失败: {}", file.getName(), e);
        throw new RuntimeException("文档处理失败: " + e.getMessage(), e);
    }
}
```

### 执行结果

<img src="/img/super-agent/rag/SpringAiAlibabaRecursiveTextSplit执行结果.png" alt="讲解" width="100%" />

:::caution 使用递归分片的注意事项
**文档不能先把空格、换行等符号清洗掉！**

因为递归分片正是依赖这些特殊符号（`\n\n`、`\n`、`。`等）来找切分点的。如果你在文档预处理阶段把换行符清理了，递归分片就没法正确工作了。
:::

## 结论

- **入门场景**：Spring AI的TokenTextSplitter够用
- **通用场景**：推荐Spring AI Alibaba的RecursiveCharacterTextSplitter
- **需要overlap**：用自定义的OverlapParagraphTextSplitter
- **需要语义分片或父子分片**：看下一篇

## 小结

这篇讲了Spring系列的分片代码实战：

1. **Spring AI的TokenTextSplitter**：官方原生，但不支持overlap
2. **自定义OverlapParagraphTextSplitter**：基于Spring AI扩展，支持overlap
3. **Spring AI Alibaba的RecursiveCharacterTextSplitter**：推荐的通用方案

下一篇讲LangChain4J的语义分段和父子分块技术。