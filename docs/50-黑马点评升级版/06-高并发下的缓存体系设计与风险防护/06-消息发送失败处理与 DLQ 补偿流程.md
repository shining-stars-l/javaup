---
slug: /hmdp-plus/cache-architecture/message-dlq-compensation
---

import PaidCTA from '@site/src/components/PaidCTA';

# 消息发送失败处理与 DLQ 补偿流程

:::info plus 版本专属
此章节是黑马点评 Plus 版本中专有的内容，而在整套文档中将普通版本和 Plus 版本都融合在了一起，让大家更方便的学习。
:::

**本章节是详细讲述当 MQ 消息队列发送失败后的处理流程，虽然是在广播发送清除优惠券缓存的业务上发送消息失败时处理的，但是此方案是比较通用的，也设计了死信队列的功能，所以也适用于其他业务，建议小伙伴好好理解，方便在以后工作或者面试上更好的应用。** 

## 一、发送清除优惠券缓存消息失败的处理
在上一章节讲解了使用消息发送到 Kafka 来通知消费者清除缓存，包括自己的本地缓存和 Redis 缓存，但是如果发送 Kafka 失败了呢？

这里根据 MQ的发送组件，在发送失败的扩展里进行了详细的处理

<img src="/img/hmdp-plus/高并发下的缓存体系设计与风险/死信队列流程.png" alt="表关系" width="70%" />

### 1.1 代码实现

<PaidCTA />