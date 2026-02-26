---
slug: /damai-ai/rules-assistant/markdown-parsing
---

# MarkDown的解析

import VipInline from '@site/src/components/VipInline';

RAG 和 向量数据库有了后，还要创建 markdown 的解析器，读取里面的内容然后放入到向量数据库中

```java
@Bean
public MarkdownLoader markdownLoader(ResourcePatternResolver resourcePatternResolver){
    return new MarkdownLoader(resourcePatternResolver);
}
```

## MarkdownLoader
```java
@AllArgsConstructor
@Slf4j
public class MarkdownLoader {

    private final ResourcePatternResolver resourcePatternResolver;
    
    /**
     * 加载 Markdown 文档
     */
    public List<Document> loadMarkdowns() {
        List<Document> allDocuments = new ArrayList<>();
        try {
            Resource[] resources = resourcePatternResolver.getResources("classpath:datum/*.md");
            log.info("找到 {} 个Markdown文件", resources.length);
            for (Resource resource : resources) {
                String fileName = resource.getFilename();
                log.info("正在处理文件: {}", fileName);
                
                String label = fileName;
                if (StringUtil.isNotEmpty(fileName)) {
                    final String[] parts = fileName.split("-");
                    if (parts.length > 1) {
                        label = parts[0];
                    }
                }
                log.info("提取的文档标签: {}", label);
   
                Builder builder = MarkdownDocumentReaderConfig.builder()
                        .withHorizontalRuleCreateDocument(true)
                        .withIncludeCodeBlock(false)
                        .withIncludeBlockquote(false);
                if (StringUtil.isNotEmpty(fileName)) {
                    builder.withAdditionalMetadata("name", fileName);
                }
                if (StringUtil.isNotEmpty(label)) {
                    builder.withAdditionalMetadata("label", label);
                }
                MarkdownDocumentReaderConfig config = builder.build();
                        MarkdownDocumentReader markdownDocumentReader = new MarkdownDocumentReader(resource, config);
                List<Document> documents = markdownDocumentReader.get();
                log.info("文件 {} 加载了 {} 个文档片段", fileName, documents.size());
                allDocuments.addAll(documents);
            }
            log.info("总共加载了 {} 个文档片段", allDocuments.size());
        } catch (IOException e) {
           log.error("Markdown 文档加载失败", e);
        }
        return allDocuments;
    }
}
```

## 关键组件说明
### 1. `ResourcePatternResolver`
Spring 提供的资源加载工具，可以根据路径模式批量获取资源文件（支持通配符，如 `*.md`）。

### 2. `Document`
文档对象，通常包含文档内容和元数据，用于向量化或其他文档处理场景。

### 3. `MarkdownDocumentReader`
Markdown 文档解析工具，把 Markdown 文件切片成小文档（片段），支持配置是否包含代码块、引用块、是否根据分隔线划分。

## 核心流程详解
### 1. 加载文件资源
```java
Resource[] resources = resourcePatternResolver.getResources("classpath:datum/*.md");
```

+ 扫描 `classpath:datum/` 目录下所有 `.md` 结尾的文件。
+ 获取到的每个文件作为一个 `Resource` 资源对象。

### 2. 遍历每个 Markdown 文件
```java
for (Resource resource : resources) { ... }
```

逐个处理文件，核心步骤：

#### a. 获取文件名
```java

String fileName = resource.getFilename();
```

主要用来后续提取标签。

#### b. 提取标签
```java
String label = fileName;
if (StringUtil.isNotEmpty(fileName)) {
    final String[] parts = fileName.split("-");
    if (parts.length > 1) {
        label = parts[0];
    }
}
```

+ 文件名格式示例：`label-xxx.md`
+ 取 `-` 前面的字符串作为文档标签，常用于分类或后续检索。

#### c. 配置 Markdown 解析器
```java
Builder builder = MarkdownDocumentReaderConfig.builder()
    .withHorizontalRuleCreateDocument(true)
    .withIncludeCodeBlock(false)
    .withIncludeBlockquote(false);
```

+ 配置解析规则：
    - `withHorizontalRuleCreateDocument(true)`：按 `---` 水平分隔线划分成多个文档片段。
    - `withIncludeCodeBlock(false)`：忽略代码块。
    - `withIncludeBlockquote(false)`：忽略引用块。

#### d. 添加元数据
```java
if (StringUtil.isNotEmpty(fileName)) {
    builder.withAdditionalMetadata("name", fileName);
}
if (StringUtil.isNotEmpty(label)) {
    builder.withAdditionalMetadata("label", label);
}
```

+ 元数据会附加到每个文档片段上，方便后续查询、分类。

#### e. 解析 Markdown
```java
MarkdownDocumentReader markdownDocumentReader = new MarkdownDocumentReader(resource, config);
List<Document> documents = markdownDocumentReader.get();
```

+ 把 Markdown 文件解析成文档片段列表。

#### f. 汇总所有文档片段
```java

allDocuments.addAll(documents);
```

+ 把当前文件的所有文档片段汇总到总列表。

# 总结流程图
```plain
启动加载
    │
扫描 classpath:datum/*.md
    │
找到 N 个文件
    │
遍历每个文件 ───────────▶ 读取文件名 ──▶ 提取标签 ──▶ 配置解析器 ──▶ 解析文档片段 ──▶ 加入总列表
    │                                                                          │
    └──────────────────────────────────────────────────────────────────────────┘
    │
记录总共加载的文档片段数
    │
返回文档片段列表
```

<!-- 这是一张图片，ocr 内容为： -->
![](https://cdn.nlark.com/yuque/0/2025/png/22643320/1750168611792-122fae08-d07b-4522-82ef-41fa7ff3aa64.png)

# 五、设计要点总结
| 设计点 | 说明 |
| --- | --- |
| 批量加载 | 使用 `ResourcePatternResolver`<br/> 支持文件通配 |
| 元数据管理 | 文件名、标签提取，方便后续检索 |
| 灵活解析 | 支持配置解析规则，如按水平线切片，忽略代码块 |
| 日志清晰 | 每一步都有详细日志，便于排查问题 |
| 容错设计 | 捕获文件读取异常，防止应用崩溃 |


<VipInline />