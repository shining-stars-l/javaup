---
slug: /super-agent/graph-executor/graph-then-evidence-executor
title: "GraphThenEvidenceExecutor 执行器的流程：图定位取证、execute详解"
sidebar_label: "GraphThenEvidenceExecutor 执行器的流程"
pagination_label: "GraphThenEvidenceExecutor 执行器的流程"
description: "详细讲解 GraphThenEvidenceExecutor#execute 方法的完整执行流程，包括前置校验、结构图定位、证据校验、关键词提取和答案渲染的全过程。内容进一步围绕GRAPH_THEN_EVIDENCE、图定位取证、编号项查询、条目搜索、buildGraphResult等关键主题展开。"
keywords: [GraphThenEvidenceExecutor, GRAPH_THEN_EVIDENCE, 图定位取证, execute, 编号项查询, 条目搜索, 证据校验, buildGraphResult]
---

import VipInline from '@site/src/components/VipInline';

# GraphThenEvidenceExecutor 执行器的流程

前面几篇讲完了 `GraphOnlyExecutor` 的完整链路。这篇来看它的"兄弟"执行器——`GraphThenEvidenceExecutor`。在第二篇文档中我们已经用场景举例说明了两者的区别：`GraphOnlyExecutor` 只看目录就能回答，而 `GraphThenEvidenceExecutor` 需要先用结构图定位，再把正文内容取出来作为证据。

## 执行器注册

和 `GraphOnlyExecutor` 一样，`GraphThenEvidenceExecutor` 也实现了 `ConversationExecutor` 接口：

```java
@Component
@Slf4j
public class GraphThenEvidenceExecutor implements ConversationExecutor {

    private final StructureGraphQueryEngine structureGraphQueryEngine;
    private final GraphAnswerRenderer graphAnswerRenderer;
    private final StreamEventWriter streamEventWriter;

    public GraphThenEvidenceExecutor(StructureGraphQueryEngine structureGraphQueryEngine,
                                     GraphAnswerRenderer graphAnswerRenderer,
                                     StreamEventWriter streamEventWriter) {
        this.structureGraphQueryEngine = structureGraphQueryEngine;
        this.graphAnswerRenderer = graphAnswerRenderer;
        this.streamEventWriter = streamEventWriter;
    }

    @Override
    public ExecutionMode mode() {
        return ExecutionMode.GRAPH_THEN_EVIDENCE;
    }
}
```

依赖和 `GraphOnlyExecutor` 完全一样：结构图查询引擎、答案渲染器、事件流写入器。区别在于 `mode()` 返回的是 `GRAPH_THEN_EVIDENCE`。

## execute 方法整体流程图

```plantuml title="流程图" width="55%" align="left"
@startuml
skinparam backgroundColor #FEFEFE
skinparam shadowing false
skinparam roundcorner 12
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 13
skinparam activityBackgroundColor #E3F2FD
skinparam activityBorderColor #1565C0
skinparam activityDiamondBackgroundColor #FFF3E0
skinparam activityDiamondBorderColor #E65100
skinparam arrowColor #37474F

start
:从 TaskInfo 中取出执行计划和导航决策;

if (plan / decision / structureAnchor\n/ structureNodeId 任一缺失?) then (是)
  :返回无证据兜底回复;<<#FFCDD2>>
  stop
else (否)
endif

:发布"正在思考"事件到前端;
:开启 Trace 阶段;
:调用 buildGraphResult() 构造结构图查询结果;

if (证据校验 hasGraphEvidence() 失败?) then (是)
  :记录 Trace 失败信息;
  :返回无证据兜底回复;<<#FFCDD2>>
  stop
else (否)
endif

:调用 graphAnswerRenderer.renderGraphAnswer()\n生成自然语言答案;
:记录 Trace 完成信息;

if (答案为空?) then (是)
  :返回无证据兜底回复;<<#FFCDD2>>
  stop
else (否)
  :返回渲染后的答案;<<#C8E6C9>>
  stop
endif

@enduml
```

对比 `GraphOnlyExecutor`，这个执行器多了两个关键步骤：**`buildGraphResult` 构造综合查询结果** 和 **`hasGraphEvidence` 证据校验**。

<VipInline />