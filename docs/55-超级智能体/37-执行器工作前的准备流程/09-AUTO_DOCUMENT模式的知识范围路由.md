---
slug: /super-agent/chat-executors-prepare/auto-document-routing-overview
description: 详细讲解 AUTO_DOCUMENT 模式下的知识范围路由流程，包括路由决策的调用、候选文档的选择、澄清判断逻辑，以及路由追踪记录。
keywords: [AUTO_DOCUMENT, 知识范围路由, KnowledgeRouteService, 自动路由, 候选文档, 澄清机制]
---

import VipInline from '@site/src/components/VipInline';

# AUTO_DOCUMENT 模式的知识范围路由

上一篇讲了改写结果的处理和兜底机制，接下来我们进入这段代码中最复杂的部分：**AUTO_DOCUMENT 模式下的知识范围路由**。

## 什么是 AUTO_DOCUMENT 模式？

在讲具体实现之前，先理解一下 super-agent 系统中的三种聊天模式：

| 聊天模式 | 说明 | 文档选择方式 |
|----------|------|-------------|
| `OPEN_CHAT` | 开放式问答 | 不需要文档 |
| `DOCUMENT` | 当前文档问答 | 用户手动选择文档 |
| `AUTO_DOCUMENT` | 自动文档问答 | **系统自动路由到最相关的文档** |

`AUTO_DOCUMENT` 模式是最智能的一种，用户不需要提前选择文档，系统会根据问题内容自动判断应该去哪个文档里检索答案。这就是**知识范围路由**要解决的问题。

## AUTO_DOCUMENT 模式的入口判断

```java
if (chatMode == ChatQueryMode.AUTO_DOCUMENT) {
    // 自动文档模式下，先根据原问题和改写问题做知识范围路由。
    KnowledgeRouteDecision routeDecision = knowledgeRouteService.route(question, rewriteQuestion);
    knowledgeRouteService.recordAutoRoute(conversationId, taskInfo.exchangeId(), question, rewriteQuestion, routeDecision);
    // ... 后续处理
}
```

只有当 `chatMode == ChatQueryMode.AUTO_DOCUMENT` 时，才会进入这个分支。这个分支的代码量很大，逻辑也很复杂，我们一步步来看。

## 第一步：调用知识范围路由服务

```java
KnowledgeRouteDecision routeDecision = knowledgeRouteService.route(question, rewriteQuestion);
```

这行代码调用了 `KnowledgeRouteService.route` 方法，传入两个参数：
- `question` - 用户的原始问题
- `rewriteQuestion` - 改写后的问题

返回一个 `KnowledgeRouteDecision` 对象，包含了路由决策的所有信息。

### KnowledgeRouteDecision 的结构

让我们先看看这个对象包含哪些信息：

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class KnowledgeRouteDecision {

    private List<ScopeRouteCandidate> scopes = new ArrayList<>();

    private List<TopicRouteCandidate> topics = new ArrayList<>();

    private List<DocumentRouteCandidate> documents = new ArrayList<>();

    private BigDecimal confidence = BigDecimal.ZERO;

    private String routeStatus = "SUCCESS";

    private String reason = "";

    public DocumentRouteCandidate topDocument() {
        return documents == null || documents.isEmpty() ? null : documents.get(0);
    }
}
```

这个对象包含了三层路由结果：

| 字段 | 类型 | 说明 |
|------|------|------|
| `scopes` | 知识域候选列表 | 第一层：粗粒度的知识域分类 |
| `topics` | 主题候选列表 | 第二层：中等粒度的主题分类 |
| `documents` | 文档候选列表 | 第三层：具体的文档 |
| `confidence` | 置信度 | 0-1 之间的数值，表示路由结果的可信程度 |
| `routeStatus` | 路由状态 | SUCCESS / LOW_CONFIDENCE / FAILED |
| `reason` | 原因说明 | 解释为什么选择这些候选 |

:::info 三层路由的设计思路
知识范围路由采用"知识域 → 主题 → 文档"的逐层缩小策略：

1. **知识域（Scope）** - 最粗粒度，比如"Java 开发"、"前端技术"、"数据库"
2. **主题（Topic）** - 中等粒度，比如"Spring Boot 配置"、"React Hooks"、"MySQL 索引优化"
3. **文档（Document）** - 最细粒度，具体的文档，比如"Spring Boot 官方文档"、"React 最佳实践"

这种设计的好处是：先粗筛再细排，避免一次性对所有文档打分，提高效率。
:::

<VipInline />