---
slug: /super-agent/document-index-build/sync-entry-and-kafka-dispatch
description: 从 Controller 接收索引构建请求开始，逐层拆解同步链路：参数校验、任务创建、状态流转、日志记录，直到 Kafka 消息投递，每一步都贴出关键源码并配合讲解。
keywords: [索引构建, buildIndex, DocumentManageController, DocumentManageServiceImpl, Kafka, 异步消息, 任务创建, DocumentIndexBuildDto, DocumentKafkaProducer]
---

import VipInline from '@site/src/components/VipInline';

# 索引构建入口与Kafka消息投递

这篇文档讲的是：用户在页面上点击"构建索引"之后，后端同步做了哪些事情？从 Controller 接到请求开始，一直到把消息丢进 Kafka 队列，整条同步链路我们一步步拆开来看。

<img src="/img/super-agent/截图/构建索引执行.png" width="100%" />

先上一张总览流程图，有个整体印象之后再逐段看源码。

## 同步链路总览

```plantuml title="索引构建同步链路" width="100%" align="left"
@startuml
skinparam backgroundColor #FAFBFC
skinparam defaultFontName "Microsoft YaHei"
skinparam defaultFontSize 12
skinparam shadowing false
skinparam roundCorner 8
skinparam ArrowColor #5B8DEF
skinparam ArrowThickness 1.5

skinparam participant {
  BackgroundColor #FFFFFF
  BorderColor #D0D7DE
  FontColor #1F2328
}

skinparam sequence {
  LifeLineBorderColor #D0D7DE
}

actor "前端" as FE
participant "DocumentManage\nController" as Ctrl #EBF3FF
participant "DocumentManage\nServiceImpl" as Svc #FFF8E1
participant "DocumentTask\nLogService" as LogSvc #F3E5F5
participant "DocumentKafka\nProducer" as Kafka #FCE4EC
database "MySQL" as DB #F5F5F5

FE -> Ctrl : POST /manage/document/index/build\n(DocumentIndexBuildDto)
Ctrl -> Svc : buildIndex(dto)

== 文档状态校验 ==
Svc -> DB : documentMapper.selectById()
Svc -> Svc : 校验解析成功 + 策略已确认
Svc -> Svc : 校验方案ID一致性

== 防重复提交 ==
Svc -> DB : taskMapper.selectCount()\n查询是否有运行中的索引任务

== 方案快照读取 ==
Svc -> DB : planMapper.selectById()

== 任务创建 ==
Svc -> DB : taskMapper.insert(task)

== 文档状态更新 ==
Svc -> DB : documentMapper.updateById()\n索引状态 → BUILDING

== 日志记录 ==
Svc -> LogSvc : saveLog(...)

== Kafka 消息投递 ==
Svc -> Kafka : sendIndexBuild(message)
Kafka -> Kafka : 序列化 JSON + send().get()

Svc --> Ctrl : DocumentIndexBuildVo
Ctrl --> FE : ApiResponse<DocumentIndexBuildVo>
@enduml
```

## Controller 层：接收构建请求

入口非常简单，就是一个标准的 POST 接口，接收前端传过来的 `DocumentIndexBuildDto`，然后直接委托给 Service 层处理。

```java
//DocumentManageController.java
@Operation(summary = "执行文档索引构建")
@PostMapping("/index/build")
public ApiResponse<DocumentIndexBuildVo> buildIndex(@Valid @RequestBody DocumentIndexBuildDto dto) {
    return ApiResponse.ok(documentManageService.buildIndex(dto));
}
```

请求参数也很简洁，就三个字段：

```java
//DocumentIndexBuildDto.java
@Data
public class DocumentIndexBuildDto {

    @NotNull(message = "文档id不能为空")
    private Long documentId;

    @NotNull(message = "方案id不能为空")
    private Long planId;

    private Long operatorId;
}
```

- `documentId`：要构建索引的文档 ID
- `planId`：当前生效的策略方案 ID
- `operatorId`：操作人 ID，可以为空（为空表示系统自动触发）

## Service 层：校验 + 建任务 + 投递消息

<VipInline />