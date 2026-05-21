---
slug: /super-agent/graph-executor/graph-only-executor-main-flow
description: 详细讲解 GraphOnlyExecutor#execute 方法的完整执行流程，包括前置校验、事件发布、分支查询逻辑和最终答案输出。
keywords: [GraphOnlyExecutor, execute, 结构图直答, GRAPH_ONLY, 执行器, TaskInfo, ConversationExecutionPlan, DocumentNavigationDecision]
---

import VipInline from '@site/src/components/VipInline';

# GraphOnlyExecutor 执行器主流程

上一篇通过具体例子介绍了 `GraphOnlyExecutor` 和 `GraphThenEvidenceExecutor` 的定位与适用场景，这篇就来看 `GraphOnlyExecutor` 的代码细节，看看它到底干了什么。

## 执行器的注册

先快速回顾一下执行器是怎么被找到的。`GraphOnlyExecutor` 实现了 `ConversationExecutor` 接口，并通过 `mode()` 方法声明自己负责 `GRAPH_ONLY` 模式：

```java
@Component
@Slf4j
public class GraphOnlyExecutor implements ConversationExecutor {

    private final StructureGraphQueryEngine structureGraphQueryEngine;
    private final GraphAnswerRenderer graphAnswerRenderer;
    private final StreamEventWriter streamEventWriter;

    public GraphOnlyExecutor(StructureGraphQueryEngine structureGraphQueryEngine,
                             GraphAnswerRenderer graphAnswerRenderer,
                             StreamEventWriter streamEventWriter) {
        this.structureGraphQueryEngine = structureGraphQueryEngine;
        this.graphAnswerRenderer = graphAnswerRenderer;
        this.streamEventWriter = streamEventWriter;
    }

    @Override
    public ExecutionMode mode() {
        return ExecutionMode.GRAPH_ONLY;
    }
}
```

Spring 容器启动时，`ConversationExecutorRegistry` 会收集所有 `ConversationExecutor` 实现，按 `mode()` 建立映射。当路由决策返回 `GRAPH_ONLY` 时，注册表就能直接找到这个执行器。

## execute 方法整体流程图

```plantuml title="方法整体流程图" width="100%" align="left"
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
:开启 Trace 阶段（如果 traceRecorder 存在）;
:取出 documentId 和 sectionNodeId;

if (导航动作 == SECTION_ADJACENCY_LOOKUP?) then (是)
  :调用 findSectionWithSiblings()\n查询父章节、前一节、后一节;
else (否)
  :调用 findSectionWithChildren()\n查询直接子章节列表;
endif

:将查询结果封装为 GraphQueryResult;
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

## execute 方法源码详解

下面按执行顺序逐段拆解 `execute` 方法。

<VipInline />



