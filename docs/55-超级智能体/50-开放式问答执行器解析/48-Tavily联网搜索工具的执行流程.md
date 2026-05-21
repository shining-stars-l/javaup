---
slug: /super-agent/react-agent-executor/tavily-search-tool
description: 讲解 ReactAgent 唯一的工具 TavilySearchTool 的完整执行流程，包括参数校验、查询增强、API 调用、结果处理、引用收集以及 thinking 事件推送。
keywords: [TavilySearchTool, 联网搜索, tavily_search, 工具执行, SearchReference, ToolContext, 工具追踪, thinking事件]
---

import VipInline from '@site/src/components/VipInline';

# Tavily联网搜索工具的执行流程

## 工具在 Agent 中的角色

在前面的文档中我们看到，ReactAgent 配置了一个工具：`tavily_search`。当 Agent 在推理过程中判断需要联网搜索信息时，就会生成一个工具调用请求，框架会自动把请求路由到 `TavilySearchTool#search` 方法执行。

这篇我们来看这个工具的完整执行流程。

## 工具入参定义

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TavilySearchRequest {

    private String query;
    private String topic;
    private Integer maxResults;
}
```

模型生成的工具调用参数会被反序列化成这个对象：
- **query**：搜索关键词（必填）
- **topic**：搜索主题，只允许 `general`、`news`、`finance` 三个值（可选）
- **maxResults**：最大返回结果数（可选）

<VipInline />