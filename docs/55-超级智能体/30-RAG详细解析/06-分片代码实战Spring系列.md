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

<img src="/img/super-ai/rag/OverlapParagraphTextSplit执行结果.png" alt="讲解" width="100%" />

我们可以看到调用结果中，相邻文本块之间都有一段overlap重叠，这样就可以一定程度上保证了文本块的延续性。

## Spring AI Alibaba的递归分片

### 框架原生能力

Spring AI Alibaba扩展了Spring AI，提供了RecursiveCharacterTextSplitter，这是目前**最推荐的通用分片方式**。

递归分片的核心思想：按照一组分隔符的优先级来切割文本。先用高优先级的分隔符（如`\n\n`），如果切出来的块还是太大，再用下一级分隔符继续切。

### 代码示例

```java
// Spring AI Alibaba的递归分片
RecursiveCharacterTextSplitter splitter = new RecursiveCharacterTextSplitter(100);
List<String> chunks = splitter.splitText("""
    《斗破苍穹》是中国网络作家天蚕土豆创作的玄幻小说，2009年4月14日起在起点中文网连载，
    2011年7月20日完结，首版由湖北少年儿童出版社出版。2010年7月，该作品部分章节被编为
    《废材当自强》由湖北少年儿童出版社出版。
    
    小说以斗气大陆为背景，讲述天才少年萧炎从斗气尽失逐步成长为斗帝的历程，
    期间通过收集异火、修炼丹药突破困境，最终解开斗帝失踪之谜并前往大千世界。
    
    作品构建了炼药师体系、异火榜及天鼎榜等设定，其中炼药师需具备火木双属性斗气与灵魂感知力。
    
    该小说全网点击量近100亿次，实体书累计销量超300万册，2017年7月荣登
    "2017猫片胡润原创文学IP价值榜"榜首。
    """);

chunks.forEach(System.out::println);
```

### 执行结果

```
《斗破苍穹》是中国网络作家天蚕土豆创作的玄幻小说，2009年4月14日起在起点中文网连载，2011年7月20日完结，首版由湖北少年儿童出版社出版
2010年7月，该作品部分章节被编为《废材当自强》由湖北少年儿童出版社出版
小说以斗气大陆为背景，讲述天才少年萧炎从斗气尽失逐步成长为斗帝的历程，期间通过收集异火、修炼丹药突破困境，最终解开斗帝失踪之谜并前往大千世界
作品构建了炼药师体系、异火榜及天鼎榜等设定，其中炼药师需具备火木双属性斗气与灵魂感知力
该小说全网点击量近100亿次，实体书累计销量超300万册，2017年7月荣登"2017猫片胡润原创文学IP价值榜"榜首
```

【截图位置：控制台输出的分段结果，或者和Coze/Dify的分段效果对比截图】

可以看到，递归分片**优先在段落边界（双换行符`\n\n`）处切割**，每一段都是语义完整的内容。

### 和Coze、Dify对比

这个效果和我们直接在Coze、Dify等平台做分段的效果是一样的：

【截图位置：Dify或Coze的分段设置界面和分段结果，与上面的代码输出对比】

:::caution 使用递归分片的注意事项
**文档不能先把空格、换行等符号清洗掉！**

因为递归分片正是依赖这些特殊符号（`\n\n`、`\n`、`。`等）来找切分点的。如果你在文档预处理阶段把换行符清理了，递归分片就没法正确工作了。
:::

## 各框架分片能力对比

| 功能 | Spring AI | Spring AI Alibaba | LangChain4J |
|:-----|:----------|:------------------|:------------|
| 固定大小分片 | ✅ TokenTextSplitter | ✅ | ✅ |
| 递归分片 | ❌ | ✅ RecursiveCharacterTextSplitter | ✅ |
| 语义分片 | ❌ | ❌ | ⚠️ 仅英文 |
| Overlap支持 | ❌ | ❌ | ✅ |
| Markdown标题分片 | ❌ | ❌ | ❌（需自己实现） |
| 父子分片 | ❌ | ❌ | ❌（需自己实现） |

**结论**：
- **入门场景**：Spring AI的TokenTextSplitter够用
- **通用场景**：推荐Spring AI Alibaba的RecursiveCharacterTextSplitter
- **需要overlap**：用自定义的OverlapParagraphTextSplitter
- **需要语义分片或父子分片**：看下一篇

## 小结

这篇讲了Spring系列的分片代码实战：

1. **Spring AI的TokenTextSplitter**：官方原生，但不支持overlap
2. **自定义OverlapParagraphTextSplitter**：基于Spring AI扩展，支持overlap
3. **Spring AI Alibaba的RecursiveCharacterTextSplitter**：推荐的通用方案

下一篇讲LangChain4J的语义分段，以及父子分块的完整实现。
