---
slug: /damai/architecture-components/redis-stream
description: "围绕《打造高性能的RedisStream队列》，重点讲解RedisStream、消费组、分组消费、广播消费、消息监听与序列化处理等技术实现与工程落地细节。"
keywords: ["RedisStream队列", "消费组", "分组消费", "广播消费", "消息监听", "消息发送", "序列化处理", "消息处理器"]
---

# 打造高性能的RedisStream队列

import VipInline from '@site/src/components/VipInline';

## RedisStream特点
Redis Stream 5.x 版本引入的一种数据结构，用于处理时间序列数据、消息队列和日志流。它提供了高吞吐量、持久性、有序、可扩展的消息传递解决方案,并提供了以下主要特性：

+ **多生产者和多消费者：** 多个生产者可以同时向 Stream 中写入消息，而多个消费者可以独立订阅并消费消息。每个消费者可以有不同的消费速率。
+ **消费组：** Redis Stream引入了消费者组的概念，多个消费者可以加入同一个消费者组并共同消费消息，这确保了消息在消费时不会被多次处理。
+ **消费者阻塞：** 消费者可以使用 XREADGROUP 命令以阻塞方式获取消息，只有当有新消息到达时才会被推送给消费者。
+ **消费者自动确认：** Redis Stream 支持自动确认消息，消费者可以告诉 Redis 何时确认已经成功处理了一条消息。
+ **多 Stream 支持：** 你可以创建多个 Stream 来存储不同种类的数据，并分别处理它们。
+ **有序性：** 消息在 Stream 中按照消息的时间戳有序存储，因此你可以按照消息的顺序读取数据。
+ **持久性存储：** Redis Stream 使用内存数据结构，但也支持将数据异步保存到磁盘，以确保数据不会丢失。


然而在 SpringBoot 中操作 RedisStream 还是比较复杂的，需要配置消息的发送、序列化、消息的监听配置、拉取时间、消息类型等等，还有各种繁琐的api操作

所以针对上述问题，本人设计了 RedisStream 的组件，使用此组件操作 RedisStream 会变得非常的简单，默认情况下无需考虑上述配置的细节问题，下面就来介绍此组件的设计原理

## 使用
### 依赖
```xml
<dependency>
    <groupId>com.example</groupId>
    <artifactId>damai-redis-stream-framework</artifactId>
    <version>${revision}</version>
</dependency>
```

### 配置信息
```yaml
spring:
  data:
    # redis配置
    redis:
      database: 0
      host: 127.0.0.1
      port: 6379
      timeout: 3000
      # redisStream配置
      stream:
        # stream名字
        streamName: test_stream
        # 消费组名字
        consumerGroup: test_group
        # 消费者名
        consumerName: test_consumer_1
        # 消费方式 group:消费组(默认)/broadcast:广播
        consumerType: group
```

<VipInline />