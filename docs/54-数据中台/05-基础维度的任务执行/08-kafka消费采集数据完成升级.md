---
slug: /dock-data-center/basic-dimension/kafka
---

import PaidCTA from '@site/src/components/PaidCTA';

# kafka消费采集数据完成升级
在上一章中讲解了项目中责任链的四个节点的执行过程：

1. 数据的采集
2. 数据的计算
3. 数据的保存
4. 数据的升级

在数据的升级中，将消息发送到了 kafka 中，本章节会详细讲解从 kafka 中消费到消息后，后续的执行过程

# Kafka消费消息

org.javaup.kafka.UpDimensionConsumer#consumerUpDimensionMessage

```java
@KafkaListener(topics = {SPRING_INJECT_PREFIX_DISTINCTION_NAME+"-"+"${spring.kafka.topic:up_dimension}"}, 
             containerFactory = "kafkaListenerContainerFactory")
public void consumerUpDimensionMessage(ConsumerRecord<String,String> consumerRecord, Acknowledgment acknowledgment){
  String messageKey = consumerRecord.key();
  String messageValue = consumerRecord.value();
  log.info("开始处理Kafka消息，topic: {}, partition: {}, offset: {}, key: {}",
          consumerRecord.topic(), consumerRecord.partition(), consumerRecord.offset(), messageKey);
  // 检查消息是否为空
  if (StringUtil.isEmpty(messageValue)) {
      log.warn("收到空消息，跳过处理，key: {}", messageKey);
      acknowledgment.acknowledge();
      return;
  }
  // 解析消息
  UpgradeDimensionMessage upgradeDimensionMessage = JSON.parseObject(messageValue, UpgradeDimensionMessage.class);

  if (Objects.isNull(upgradeDimensionMessage)) {
      log.error("消息解析失败，无法转换为UpgradeDimensionMessage对象，key: {}", messageKey);
      // 解析失败的消息可以选择跳过，避免无限重试
      acknowledgment.acknowledge();
      return;
  }
  upDimensionConsumerExecutor.doConsumer(upgradeDimensionMessage,acknowledgment);
}
```

## 执行流程拆解

### 1. 提取消息基础信息并记录可观测日志

- 从 `consumerRecord` 读取 `key` 与 `value`，并打点日志包含 `topic`、`partition`、`offset` 与 `key`，便于后续审计与问题排查。
- 这一步不改变消费位移，仅为后续处理做信息准备。

### 2. 空消息快速跳过与确认

```java
// 检查消息是否为空
if (StringUtil.isEmpty(messageValue)) {
    log.warn("收到空消息，跳过处理，key: {}", messageKey);
    acknowledgment.acknowledge();
    return;
}
```
- **判空**: 若 `value` 为空，直接打印警告并调用 `acknowledgment.acknowledge()` 手动提交 offset。
- **影响**: 该消息被视为已消费，避免对“空消息”进行无意义重试。

### 3. 反序列化消息体为领域对象

```java
// 解析消息
UpgradeDimensionMessage upgradeDimensionMessage = JSON.parseObject(messageValue, UpgradeDimensionMessage.class);
```
- 使用 FastJSON 将 `messageValue` 反序列化为 `UpgradeDimensionMessage`，承载后续业务处理所需的参数包（如 `messageId`、`createTime`、`totalParamTransfers` 等）。

### 4. 解析失败的快速跳过与确认

```java
if (Objects.isNull(upgradeDimensionMessage)) {
    log.error("消息解析失败，无法转换为UpgradeDimensionMessage对象，key: {}", messageKey);
    // 解析失败的消息可以选择跳过，避免无限重试
    acknowledgment.acknowledge();
    return;
}
```
- 若反序列化结果为 `null`，判定为“消息格式不合规或内容异常”，立即日志报错并手动确认 offset。
- 避免“格式错误”的消息在消费端形成无限重试，尽快跳过。

### 5. 委派给升级维度消息执行器

```java
upDimensionConsumerExecutor.doConsumer(upgradeDimensionMessage,acknowledgment);
```
- 将已通过前置校验与解析的 `UpgradeDimensionMessage` 交给 `upDimensionConsumerExecutor.doConsumer(...)`。
- **重要**: 本方法不再直接处理“业务逻辑、幂等控制、消费记录入库与最终 ack 决策”；这些职责在执行器里完成。也就是说，正常处理路径下的“是否 ack、何时 ack”由执行器按结果来决定。

## 执行路径与分支总结

- **正常路径**: 提取消息 → 打点日志 → 反序列化 → 委派给执行器 →（由执行器在成功时 ack 或在错误策略下决定是否 ack）
- **异常路径 A（空消息）**: 判空 → warn → 立即 ack → 返回
- **异常路径 B（解析失败）**: 解析为 `null` → error → 立即 ack → 返回

## 设计要点与策略解读

- **最小职责原则**: `UpDimensionConsumer` 只做“输入校验 + 反序列化 + 委派”，业务细节与消费幂等、入库追踪、最终 ack 策略都放在执行器，职责边界清晰。
- **手动 ack 策略**: 
  - 在“空消息/解析失败”两类非业务型异常，快速 ack，避免重复消费。
  - 成功与否的业务性判断留给执行器，确保“只有处理正确时才提交 offset”，从而获得“至少一次”到“有效一次”的控制能力。
- **可观测性**: 入口日志包含 `topic/partition/offset/key`，配合执行器内部日志，可完整追踪一次消息从进入到处理完毕的全链路。
- **健壮性**: 解析失败即跳过，避免无效重试占用资源；业务异常的处理策略位移提交由执行器决定，可根据异常类型灵活处理。

以上是Kafka消费到消息后，进行解析的过程，真正的执行业务过程是交给了升级维度消息执行器`upDimensionConsumerExecutor`

<PaidCTA />