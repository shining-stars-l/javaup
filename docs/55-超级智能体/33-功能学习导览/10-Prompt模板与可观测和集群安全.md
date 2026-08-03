---
slug: /super-agent/feature-guide/prompt-and-observability
title: "Prompt 模板、可观测与集群安全：Prompt模板、StringTemplate4详解"
sidebar_label: "Prompt 模板、可观测与集群安全"
pagination_label: "Prompt 模板、可观测与集群安全"
description: "Prompt模板管理与全链路可观测的功能详解，包括StringTemplate4模板引擎、链路追踪、检索观测、集群安全机制。内容进一步围绕全链路追踪、ConversationTraceRecorder、Redis租约等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目…"
keywords: [Prompt模板, StringTemplate4, 全链路追踪, ConversationTraceRecorder, 可观测, Redis租约, 集群安全]
---

import VipInline from '@site/src/components/VipInline';

# Prompt 模板、可观测与集群安全

最后一篇把三个相对轻量但很重要的功能放在一起：Prompt 模板管理、全链路可观测、集群安全与并发控制。

## Prompt 模板管理

所有发给大模型的提示词都通过模板引擎统一管理，不会散落在业务代码里。这样做的好处是：调整提示词不用改 Java 代码，直接改模板文件就行。

### PromptTemplateService

**包路径：** `org.javaup.ai.prompt`

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `render(templateName, variables)` | `String` | 加载模板并渲染，变量用 Map 传入 |

**实现细节：**
- 模板引擎：Spring AI 的 `StTemplateRenderer`（基于 StringTemplate4）
- 分隔符：`<` / `>`（不是默认的 `$`）
- 模板位置：`classpath:prompt/*.st`
- 缓存：`ConcurrentHashMap`，首次加载后缓存

### 关键私有方法

| 方法 | 说明 |
|------|------|
| `normalizeVariables(variables)` | 标准化变量 Map |
| `normalizeTemplatePath(templateName)` | 拼接模板路径 |
| `loadTemplate(templatePath)` | 从 classpath 加载模板内容 |

<VipInline />