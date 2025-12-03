---
slug: /hmdp-plus/ops-consistency/redis-db-compare-compensation
---

import PaidCTA from '@site/src/components/PaidCTA';

# Redis 和数据库的数据对比和补偿执行
:::info plus 版本专属
此章节是黑马点评 Plus 版本中专有的内容，而在整套文档中将普通版本和 Plus 版本都融合在了一起，让大家更方便的学习。
:::

本章节将讲解当 Redis 的库存和数据库的库存不一致的话，如何补偿写入 Redis，并据此更新 Redis 和数据库的订单与日志，形成一致性闭环。

### 背景与目标
+ 当数据库中的日志缺失时，进行补偿写入，并适当清理库存使后续走按需加载。
+ 根据比对结果将订单与日志标记为“一致”或“异常”，确保最终一致性。

## 详细流程

<PaidCTA />

