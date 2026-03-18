---
slug: /super-agent/rag/langchain4j-parent-child
description: "LangChain4J语义分段实战，以及父子分块的原理与基于Markdown标题的完整实现"
keywords: ["LangChain4J", "语义分段", "父子分块", "MarkdownHeaderTextSplitter", "RAG"]
---

# LangChain4J与父子分块

**//TODO (待定是否保留)**

上一篇讲了Spring系列的分片实战，这篇讲LangChain4J的语义分段，以及更高级的父子分块技术。

## LangChain4J的语义分段

### 框架原生能力

LangChain4J提供了DocumentBySentenceSplitter，基于句子边界进行分割。它底层用的是OpenNLP的句子检测模型。

### 代码示例

```java
// LangChain4J的语义分段
DocumentBySentenceSplitter splitter = new DocumentBySentenceSplitter(100, 10);
for (String textSegment : splitter.split(text)) {
    System.out.println(textSegment);
}
```

:::warning LangChain4J语义分段不支持中文
经过测试，LangChain4J的DocumentBySentenceSplitter**不支持中文**。它底层用的是OpenNLP的句子检测模型，只针对英文做了训练。中文文本会原样返回，不做任何分段。
:::

### 中文测试

**待分片的文本**：
```
《斗破苍穹》是中国网络作家天蚕土豆创作的玄幻小说，2009年4月14日起在起点中文网连载，2011年7月20日完结。
小说以斗气大陆为背景，讲述天才少年萧炎从斗气尽失逐步成长为斗帝的历程。
该小说全网点击量近100亿次，实体书累计销量超300万册。
```

**执行代码**：
```java
DocumentBySentenceSplitter splitter = new DocumentBySentenceSplitter(100, 10);
for (String textSegment : splitter.split(chineseText)) {
    System.out.println(textSegment);
}
```

**执行结果**：
```
《斗破苍穹》是中国网络作家天蚕土豆创作的玄幻小说，2009年4月14日起在起点中文网连载，2011年7月20日完结。
小说以斗气大陆为背景，讲述天才少年萧炎从斗气尽失逐步成长为斗帝的历程。
该小说全网点击量近100亿次，实体书累计销量超300万册。
```

看上去好像效果还行？但其实它**没有做分段**，是完全按照输入的格式原样输出了一遍。因为不支持中文。

### 英文测试

用一段哈利波特的维基百科介绍测试：

**待分片的文本**：
```
Harry Potter is a series of seven fantasy novels written by British author J. K. Rowling. 
The novels chronicle the lives of a young wizard, Harry Potter, and his friends, Ron Weasley 
and Hermione Granger, all of whom are students at Hogwarts School of Witchcraft and Wizardry. 
The main story arc concerns Harry's conflict with Lord Voldemort, a dark wizard who intends 
to become immortal, overthrow the wizard governing body known as the Ministry of Magic, 
and subjugate all wizards and Muggles (non-magical people).
The series was originally published in English by Bloomsbury in the United Kingdom and 
Scholastic Press in the United States.
```

**执行代码**：
```java
DocumentBySentenceSplitter splitter = new DocumentBySentenceSplitter(100, 10);
for (String textSegment : splitter.split(englishText)) {
    System.out.println("---分段---");
    System.out.println(textSegment);
}
```

**执行结果**：
```
---分段---
Harry Potter is a series of seven fantasy novels written by British author J. K.
---分段---
Rowling.
---分段---
The novels chronicle the lives of a young wizard, Harry Potter, and his friends, Ron Weasley and Hermione Granger, all of whom are students at Hogwarts School of Witchcraft and Wizardry.
---分段---
The main story arc concerns Harry's conflict with Lord Voldemort, a dark wizard who intends to become immortal, overthrow the wizard governing body known as the Ministry of Magic, and subjugate all wizards and Muggles (non-magical people).
---分段---
The series was originally published in English by Bloomsbury in the United Kingdom and Scholastic Press in the United States.
```

【截图位置：控制台输出的英文分段结果】

可以看到，它把"J. K. Rowling"切开了——因为"J."后面的句号被误判为句子结束。效果也不完美，但整体比固定大小分块好一些。

### 语义分段 vs 递归分块对比

用同一段英文文本测试：

**RecursiveCharacterTextSplitter结果**：

```java
RecursiveCharacterTextSplitter splitter = new RecursiveCharacterTextSplitter(100);
List<String> chunks = splitter.splitText(englishText);
chunks.forEach(System.out::println);
```

【截图位置：递归分块的输出结果，和语义分段对比】

对比可以发现，语义分段在句子边界切割上确实更智能一些，但也会有误判。综合来看，**递归分块仍然是最稳妥的通用方案**。

## 父子分块原理

### 什么是父子分块

父子分块（Parent-Child Chunking）是Dify等平台支持的高级分块方式，核心思想是：

- **子块（Child Chunk）**：小粒度，用于精确检索
- **父块（Parent Chunk）**：大粒度，用于提供上下文

**检索时用子块**（小的更精准），**返回给大模型的是父块**（大的有上下文）。

### 为什么需要父子分块

传统的分块方式存在一个矛盾：

| 分块粒度 | 检索效果 | 上下文完整性 |
|:---------|:---------|:-------------|
| 小块 | 好（精准匹配） | 差（信息不全） |
| 大块 | 差（噪音多） | 好（上下文完整） |

父子分块就是为了解决这个矛盾：**用小块做检索，用大块做生成**。

### 举个例子

**原文**：
```
打印机常见故障及解决方法：

一、卡纸问题
如果打印机出现卡纸，请按以下步骤处理：
1. 关闭电源
2. 打开后盖
3. 轻轻取出卡住的纸张
4. 关闭后盖，重新开机

二、打印模糊
如果打印效果模糊，可能的原因有：
1. 墨盒墨量不足
2. 打印头需要清洁
```

**普通分块**：整段内容是一块（约300字）

**父子分块**：
- 父块：整段内容（300字）
- 子块1："卡纸问题...重新开机"（100字）
- 子块2："打印模糊...打印头需要清洁"（100字）

用户问"打印机卡纸怎么办"时：
1. 检索时匹配到**子块1**（精准）
2. 返回给大模型的是整个**父块**（有完整上下文）

### 父子分块的好处

1. **检索更精准**：小块更容易精确匹配用户问题
2. **上下文更完整**：大块保证大模型能看到足够的信息
3. **两全其美**：兼顾精准度和完整性

:::tip 什么时候用父子分块
如果你发现系统经常出现"检索到了但上下文不完整"的问题，可以考虑引入父子分块。Dify等平台已经内置了这个功能。
:::

## 基于Markdown标题的父子分片器

主流框架都不支持基于Markdown标题的父子分片，但这在实际项目中很常用（技术文档、产品手册等）。下面是完整的自定义实现。

### 设计思路

1. 按Markdown标题（#、##、###）把文档切成层级结构
2. 为每个分块生成唯一的chunkId
3. 记录每个分块的标题层级（headerLevel）和父块ID（parentChunkId）
4. 检索时用子块匹配，返回时根据parentChunkId找到对应的父块

### 完整代码实现

```java
/**
 * Markdown文档分割器，基于标题层级进行文档分段
 * 支持保留元数据、父子分段关系等高级特性
 * 
 * 参考：https://github.com/langchain4j/langchain4j/issues/574
 * 扩展：增加对父子分段的支持
 */
public class MarkdownHeaderTextSplitter extends TextSplitter {
    
    /** 需要分割的标题列表，按标题标记长度倒序排列 */
    private List<Map.Entry<String, String>> headersToSplitOn;
    
    /** 是否按行返回结果 */
    private boolean returnEachLine;
    
    /** 是否剥离标题行本身 */
    private boolean stripHeaders;
    
    /** 是否启用父子分段模式 */
    private boolean parentChildModel;
    
    /**
     * 构造函数
     * 
     * @param headersToSplitOn 标题分割映射表，key为标题标记（如"#"、"##"），value为元数据中的键名
     * @param returnEachLine   是否按行返回结果，false时会聚合相同元数据的行
     * @param stripHeaders     是否在结果中移除标题行
     * @param parentChildModel 是否启用父子分段模式，启用后会在元数据中添加parentChunkId
     */
    public MarkdownHeaderTextSplitter(Map<String, String> headersToSplitOn, 
                                      boolean returnEachLine, 
                                      boolean stripHeaders, 
                                      boolean parentChildModel) {
        // 按标题标记长度倒序排列，确保优先匹配更长的标记（如"###"优先于"##"）
        this.headersToSplitOn = headersToSplitOn.entrySet().stream()
                .sorted(Comparator.comparingInt(e -> -e.getKey().length()))
                .collect(Collectors.toList());
        this.returnEachLine = returnEachLine;
        this.stripHeaders = stripHeaders;
        this.parentChildModel = parentChildModel;
    }
    
    @Override
    public List<Document> apply(List<Document> documents) {
        if (documents == null || documents.isEmpty()) {
            return Collections.emptyList();
        }
        
        List<Document> result = new ArrayList<>();
        for (Document doc : documents) {
            List<DocumentWithMetadata> segments = splitWithMetadata(doc.getText(), doc.getMetadata());
            for (DocumentWithMetadata segment : segments) {
                result.add(new Document(segment.getContent(), segment.getMetadata()));
            }
        }
        return result;
    }
    
    @Override
    protected List<String> splitText(String text) {
        return splitWithMetadata(text, new HashMap<>()).stream()
                .map(DocumentWithMetadata::getContent)
                .collect(Collectors.toList());
    }
    
    /**
     * 核心分割逻辑，保留元数据
     */
    private List<DocumentWithMetadata> splitWithMetadata(String text, Map<String, Object> baseMetadata) {
        List<String> lines = Arrays.asList(text.split("\n"));
        List<Line> linesWithMetadata = new ArrayList<>();
        List<String> currentContent = new ArrayList<>();
        Map<String, Object> currentMetadata = new HashMap<>(baseMetadata);
        List<Header> headerStack = new ArrayList<>();  // 标题栈，追踪当前标题层级
        Map<String, Object> initialMetadata = new HashMap<>(baseMetadata);
        
        boolean inCodeBlock = false;
        String openingFence = "";
        
        for (String line : lines) {
            String strippedLine = line.trim();
            
            // 处理代码块标记，代码块内的内容不作为标题处理
            if (!inCodeBlock) {
                if (strippedLine.startsWith("```")) {
                    inCodeBlock = true;
                    openingFence = "```";
                } else if (strippedLine.startsWith("~~~")) {
                    inCodeBlock = true;
                    openingFence = "~~~";
                }
            } else {
                if (strippedLine.startsWith(openingFence)) {
                    inCodeBlock = false;
                    openingFence = "";
                }
            }
            
            // 代码块内的内容直接添加，不做标题检测
            if (inCodeBlock) {
                currentContent.add(strippedLine);
                continue;
            }
            
            // 检测并处理标题行
            boolean isHeader = false;
            for (Map.Entry<String, String> header : headersToSplitOn) {
                String sep = header.getKey();
                String name = header.getValue();
                
                if (strippedLine.startsWith(sep) && 
                    (strippedLine.length() == sep.length() || strippedLine.charAt(sep.length()) == ' ')) {
                    
                    if (name != null) {
                        int currentHeaderLevel = (int) sep.chars().filter(ch -> ch == '#').count();
                        
                        // 维护标题栈：移除所有级别大于等于当前级别的标题
                        while (!headerStack.isEmpty() && 
                               headerStack.get(headerStack.size() - 1).getLevel() >= currentHeaderLevel) {
                            Header poppedHeader = headerStack.remove(headerStack.size() - 1);
                            initialMetadata.remove(poppedHeader.getName());
                        }
                        
                        // 将当前标题加入栈，并更新元数据
                        Header headerType = new Header(currentHeaderLevel, name, 
                                                       strippedLine.substring(sep.length()).trim());
                        headerStack.add(headerType);
                        initialMetadata.put(name, headerType.getData());
                        initialMetadata.put("headerLevel", currentHeaderLevel);
                        initialMetadata.put("chunkId", UUID.randomUUID().toString());
                    }
                    
                    // 遇到新标题时，保存之前累积的内容
                    if (!currentContent.isEmpty()) {
                        linesWithMetadata.add(new Line(String.join("\n", currentContent), currentMetadata));
                        currentContent.clear();
                    }
                    
                    if (!stripHeaders) {
                        currentContent.add(strippedLine);
                    }
                    
                    isHeader = true;
                    break;
                }
            }
            
            if (!isHeader) {
                if (!strippedLine.isEmpty()) {
                    currentContent.add(strippedLine);
                } else if (!currentContent.isEmpty()) {
                    linesWithMetadata.add(new Line(String.join("\n", currentContent), currentMetadata));
                    currentContent.clear();
                }
            }
            
            currentMetadata = new HashMap<>(initialMetadata);
        }
        
        if (!currentContent.isEmpty()) {
            linesWithMetadata.add(new Line(String.join("\n", currentContent), currentMetadata));
        }
        
        // 聚合并处理父子关系
        return aggregateLinesToChunks(linesWithMetadata);
    }
    
    /**
     * 聚合行为分块，并处理父子关系
     */
    private List<DocumentWithMetadata> aggregateLinesToChunks(List<Line> lines) {
        List<Line> aggregatedChunks = new ArrayList<>();
        
        for (Line line : lines) {
            if (!aggregatedChunks.isEmpty() && 
                aggregatedChunks.get(aggregatedChunks.size() - 1).getMetadata().equals(line.getMetadata())) {
                Line last = aggregatedChunks.get(aggregatedChunks.size() - 1);
                last.setContent(last.getContent() + "  \n" + line.getContent());
            } else {
                aggregatedChunks.add(line);
            }
        }
        
        // 处理父子分段关系
        if (parentChildModel) {
            for (int i = 0; i < aggregatedChunks.size(); i++) {
                Map<String, Object> currentMetaData = aggregatedChunks.get(i).getMetadata();
                Integer headerLevel = (Integer) currentMetaData.get("headerLevel");
                
                if (headerLevel == null || headerLevel == 1) {
                    continue;
                }
                
                // 向前查找第一个级别更低的标题作为父节点
                for (int j = i - 1; j >= 0; j--) {
                    Map<String, Object> lastMetaData = aggregatedChunks.get(j).getMetadata();
                    Integer lastHeaderLevel = (Integer) lastMetaData.get("headerLevel");
                    if (lastHeaderLevel != null && lastHeaderLevel < headerLevel) {
                        currentMetaData.put("parentChunkId", lastMetaData.get("chunkId"));
                        break;
                    }
                }
            }
        }
        
        return aggregatedChunks.stream()
                .map(chunk -> new DocumentWithMetadata(chunk.getContent(), chunk.getMetadata()))
                .collect(Collectors.toList());
    }
    
    // 内部类：Line、Header、DocumentWithMetadata 定义省略...
}
```

### 调用示例与执行结果

**待分片的Markdown文档**：

```markdown
# 利刃出鞘（Knives Out）
富豪小说家哈兰·斯隆比在自己85岁生日第二天，被发现在自家庄园离奇自杀，遗留了亿万遗产。
久负盛名的大侦探布兰科突然被匿名人士雇佣调查此案真相。
电影链接：[电影链接](https://movie.douban.com/subject/30318116/)
海报图片：![海报](https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2574172427.jpg)

## 类型
剧情 / 喜剧 / 悬疑

## 演职人员
### 导演
莱恩·约翰逊

### 编剧
莱恩·约翰逊

### 演员
丹尼尔·克雷格  安娜·德·阿玛斯  克里斯·埃文斯

## 豆瓣评分
8.2

## 国家
美国
```

**执行代码**：

```java
// 配置要分割的标题级别
Map<String, String> headersToSplitOn = new LinkedHashMap<>();
headersToSplitOn.put("#", "header1");
headersToSplitOn.put("##", "header2");
headersToSplitOn.put("###", "header3");

MarkdownHeaderTextSplitter splitter = new MarkdownHeaderTextSplitter(
    headersToSplitOn,
    false,  // 不按行返回，聚合相同元数据的内容
    false,  // 不剥离标题
    true    // 启用父子分段模式
);

List<Document> chunks = splitter.apply(documents);

// 打印每个分块的内容和元数据
for (Document chunk : chunks) {
    System.out.println("=== 分块内容 ===");
    System.out.println(chunk.getText());
    System.out.println("=== 元数据 ===");
    System.out.println("headerLevel: " + chunk.getMetadata().get("headerLevel"));
    System.out.println("chunkId: " + chunk.getMetadata().get("chunkId"));
    System.out.println("parentChunkId: " + chunk.getMetadata().get("parentChunkId"));
    System.out.println();
}
```

**执行结果**：

```
=== 分块内容 ===
# 利刃出鞘（Knives Out）
富豪小说家哈兰·斯隆比在自己85岁生日第二天...
=== 元数据 ===
headerLevel: 1
chunkId: a1b2c3d4-...
parentChunkId: null

=== 分块内容 ===
## 类型
剧情 / 喜剧 / 悬疑
=== 元数据 ===
headerLevel: 2
chunkId: e5f6g7h8-...
parentChunkId: a1b2c3d4-...

=== 分块内容 ===
### 演员
丹尼尔·克雷格  安娜·德·阿玛斯  克里斯·埃文斯
=== 元数据 ===
headerLevel: 3
chunkId: i9j0k1l2-...
parentChunkId: m3n4o5p6-...   (指向"## 演职人员"的chunkId)
```

【截图位置：控制台输出的分块结果，展示父子分片的层级关系】

### 父子分片的检索流程

```java
// 1. 用子块的向量做检索
List<Document> matchedChildren = vectorStore.similaritySearch(query);

// 2. 找到最相关的子块后，根据parentChunkId找父块
for (Document child : matchedChildren) {
    String parentId = (String) child.getMetadata().get("parentChunkId");
    if (parentId != null) {
        // 从存储中查找父块
        Document parent = findByChunkId(parentId);
        // 把父块的内容作为上下文返回给大模型
        context.append(parent.getText());
    } else {
        // 没有父块，直接用子块内容
        context.append(child.getText());
    }
}
```

**查询示例**：

用户问"克里斯·埃文斯演过的电影"，检索会匹配到这个分块：

```
### 演员
丹尼尔·克雷格  安娜·德·阿玛斯  克里斯·埃文斯
```

但这个分块里**没有电影名称**！如果只返回这个分块，大模型无法回答。

通过parentChunkId，我们可以找到它的父块（## 演职人员），再找到更上层的父块（# 利刃出鞘），把完整的电影信息都返回给大模型。

## 父子分块的元数据结构

每个分块的metadata中会包含：

| 字段 | 说明 | 示例 |
|:-----|:-----|:-----|
| header1/header2/header3 | 对应层级的标题文本 | "利刃出鞘"、"演职人员" |
| headerLevel | 当前标题层级（1/2/3） | 3 |
| chunkId | 当前块的唯一ID | "a1b2c3d4-..." |
| parentChunkId | 父块的ID（如果有） | "e5f6g7h8-..." |

## 小结

这篇讲了两个进阶内容：

1. **LangChain4J语义分段**：只支持英文，效果也有限，不如递归分块稳定
2. **父子分块原理**：用小块检索、大块生成，解决精度与完整性的矛盾
3. **MarkdownHeaderTextSplitter**：基于标题层级的父子分片完整实现

**选型建议**：
- 通用场景：用Spring AI Alibaba的RecursiveCharacterTextSplitter
- 结构化文档（Markdown/技术手册）：用MarkdownHeaderTextSplitter
- 检索精度与上下文完整性都很重要：用父子分块

下一篇讲元数据管理——如何给文本块“上户口”，让系统知道这段话从哪来、该给谁看。