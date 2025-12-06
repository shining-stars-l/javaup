---
slug: /framework/kafka/transaction
sidebar_class_name: has-paid-badge
---

import PaidCTA from '@site/src/components/PaidCTA';

# Kafka事务与一致性保障

## Kafka事务消息深度解析

Kafka从0.11版本开始支持事务消息,但与RocketMQ等消息队列的事务消息有本质区别,需要正确理解其应用场景。

### Kafka事务与RocketMQ事务的本质差异

**Kafka事务消息**

保证一组消息的发送具有原子性,要么全部成功,要么全部失败:

```java
// Kafka事务保证:多条消息的原子性发送
producer.beginTransaction();
try {
    producer.send(new ProducerRecord<>("topic1", "msg1"));
    producer.send(new ProducerRecord<>("topic2", "msg2"));
    producer.send(new ProducerRecord<>("topic3", "msg3"));
    producer.commitTransaction();  // 三条消息要么全成功,要么全失败
} catch (Exception e) {
    producer.abortTransaction();
}
```

**RocketMQ事务消息**

保证本地事务和发送消息的原子性,解决分布式事务问题:

```java
// RocketMQ事务保证:本地DB事务 + 发送消息的原子性
TransactionMQProducer producer = new TransactionMQProducer();
producer.sendMessageInTransaction(msg, (msg, arg) -> {
    // 执行本地数据库事务
    orderService.createOrder(order);  // 本地事务
    return LocalTransactionState.COMMIT_MESSAGE;  // 提交消息
});
// 保证订单入库和消息发送要么都成功,要么都失败
```

:::warning 核心区别
- **Kafka事务**: 保证Kafka自身的多条消息原子性发送
- **RocketMQ事务**: 保证本地业务事务与MQ消息的原子性
:::

### Kafka事务机制核心组件

Kafka通过引入三个关键组件实现事务能力:

<PaidCTA />