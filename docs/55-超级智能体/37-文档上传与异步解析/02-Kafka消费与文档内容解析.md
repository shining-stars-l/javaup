---
slug: /super-agent/document-upload-parsing/kafka-consume-and-tika-text-extraction
title: "Kafka 消费与文本内容解析：Kafka消费、consumeParseRoute详解"
sidebar_label: "Kafka 消费与文本内容解析"
pagination_label: "Kafka 消费与文本内容解析"
description: "从 Kafka 消费者接收解析路由消息开始，逐层拆解异步解析主流程的前半段：消息反序列化、任务状态推进、MinIO 文件下载、Tika 文本提取与清洗，每一步都贴出关键源码并配合讲解。内容进一步围绕Kafka消费、consumeParseRoute、handleParseRoute、DocumentAsyncProc…"
keywords: [Kafka消费, consumeParseRoute, handleParseRoute, DocumentAsyncProcessService, Tika, 文档解析, 文本提取, extractRawText, cleanupText, 异步处理]
---

import VipInline from '@site/src/components/VipInline';

# Kafka 消费与文本内容解析

上一篇讲完了文档上传的同步链路——文件校验、MinIO 上传、数据库入库，最后把消息丢进了 Kafka。那 Kafka 消费方拿到消息之后到底做了什么？这篇就来拆这条异步链路的前半段：从消费消息开始，到文本提取与清洗完成为止。

先上总览流程图。

## 异步解析链路总览

```plantuml title="异步解析链路总览" width="100%" align="left"
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

queue "Kafka" as MQ #FCE4EC
participant "DocumentKafka\nConsumer" as Consumer #EBF3FF
participant "DocumentAsync\nProcessServiceImpl" as Async #FFF8E1
participant "MinioDocument\nStorageService" as Storage #E8F5E9
participant "TikaDocument\nParserService" as Parser #F3E5F5
database "MySQL" as DB #F5F5F5
database "MinIO" as Minio #F5F5F5

MQ -> Consumer : 消费 parse-topic 消息
Consumer -> Consumer : JSON 反序列化为\nDocumentParseRouteMessage
Consumer -> Async : handleParseRoute(documentId, taskId)

== 加载上下文 ==
Async -> DB : 查询 document + task 记录

== 推进任务状态 ==
Async -> DB : task → RUNNING / CONTENT_PARSE\ndocument → PARSING

== 下载原始文件 ==
Async -> Storage : downloadObject(objectName)
Storage -> Minio : getObject()
Storage --> Async : byte[]

== 调用 parse() ==
Async -> Parser : parse(bytes, fileName, mimeType, fileType)
Parser -> Parser : extractRawText()\n→ cleanupText()
note right : 后续步骤见下一篇

@enduml
```

## Kafka 消费者：消息入口

消费端的入口在 `DocumentKafkaConsumer`，它的职责很单一——把 JSON 消息反序列化，然后转交给异步处理服务。

```java
/**
 * 消费"解析路由"消息。
 * <p>
 * 这一步是上传完成后的异步链入口：收到消息后，会把 documentId 和 taskId 交给异步处理服务，
 * 继续执行文档下载、正文解析、结构节点生成、策略推荐等步骤。
 * </p>
 */
@KafkaListener(
    topics = SPRING_INJECT_PREFIX_DISTINCTION_NAME + "-" + "${app.manage.kafka.parse-topic}",
    groupId = "${app.manage.kafka.group-id}-parse")
public void consumeParseRoute(String payload) {
    try {
        // 先把 JSON 还原成强类型消息对象，避免后续处理层直接面对原始字符串。
        DocumentParseRouteMessage message = objectMapper.readValue(payload,
            DocumentParseRouteMessage.class);
        // 真正的业务推进放到异步处理服务中，这里只承担"消费并转发"的职责。
        asyncProcessService.handleParseRoute(message.getDocumentId(), message.getTaskId());
    }
    catch (Exception exception) {
        // 消费失败只记录日志，不让异常继续向外冒泡破坏监听线程。
        log.error("消费解析路由消息失败，payload={}", payload, exception);
    }
}
```

几个要点：

- topic 名称是 `环境前缀-配置的parseTopic`，和上传端发送时用的是同一个 topic
- `groupId` 带了 `-parse` 后缀，和索引构建的消费组区分开
- 整个方法用 try-catch 包住，消费失败只打日志不抛异常——这是为了防止一条坏消息把整个消费线程搞挂
- Consumer 本身不做任何业务逻辑，纯粹是"反序列化 + 转发"

<VipInline />

