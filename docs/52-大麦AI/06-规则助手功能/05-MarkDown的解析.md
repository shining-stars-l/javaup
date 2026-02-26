---
slug: /damai-ai/rules-assistant/markdown-parsing
description: "Markdown知识文档解析机制讲解，覆盖资源扫描、内容切分、Document构建与元数据提取，并为向量入库提供标准化文本预处理。"
keywords: ["Markdown解析", "MarkdownLoader", "文档切分", "ResourcePatternResolver", "Document对象", "元数据提取", "向量入库预处理", "批量加载"]
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

<VipInline />
