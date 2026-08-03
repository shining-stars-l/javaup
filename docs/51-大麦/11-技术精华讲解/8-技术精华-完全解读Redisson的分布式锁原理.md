---
slug: /damai/tech-highlights/redisson-lock
title: "完全解读Redisson的分布式锁原理：Redisson分布式锁、for update详解"
sidebar_label: "完全解读Redisson的分布式锁原理"
pagination_label: "完全解读Redisson的分布式锁原理"
description: "围绕《完全解读Redisson的分布式锁原理》，重点讲解Redisson分布式锁、for update对比、tryLock加锁、看门狗机制与锁释放流程等技术实现与源码细节。内容进一步围绕锁续期、Redis锁、可重入锁等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目…"
keywords: ["Redisson分布式锁", "for update", "看门狗机制", "tryLock", "锁续期", "锁释放", "Redis锁", "可重入锁"]
---

# 完全解读Redisson的分布式锁原理

import VipInline from '@site/src/components/VipInline';

## for update


```sql
select column from table where column = ... for update
```

在select的sql上加上for update会对此记录加上行级锁，在超时，提交，回滚会进行释放。


### 缺点

1. 当请求等待锁释放时，不能灵活的控制加锁时间、等待锁的时间
2. 如果在一个事务中，开始的时候就使用for update的话，则需要这个事务执行完提交或回滚才能够解锁，不能很好的控制锁的粒度，并发性会降低。
3. 在Repeatable Read的隔离级别下有可能会产生死锁。[https://www.cnblogs.com/micrari/p/8029710.html](https://www.cnblogs.com/micrari/p/8029710.html)



## 项目中的 Redis 锁


```java
public ResultMap<TestVo> test(testDto dto){
        //部分省略。。。
        //通过redis防重提交
        Boolean ifAbsent = stringRedisTemplate.opsForValue().setIfAbsent(userId, "1");
        if (ifAbsent) {
                stringRedisTemplate.expire(userId, 15, TimeUnit.SECONDS);
        }else {
                throw new BusinessException(ResultCode.NOT_FREQUENTLY_OPERATE);
        }
}
```



如果执行到if (ifAbsent)服务挂掉，那么这个userId就会一直存在redis中，别的请求一直获取不到，相当于死锁。



## Redisson


### 地址


[https://github.com/redisson/redisson](https://github.com/redisson/redisson)



### 特点


**Redisson 是架设在 Redis 基础上的一个 Java 驻内存数据网格框架, 充分利用 Redis 键值数据库提供的一系列优势, 基于 Java 实用工具包中常用接口, 为使用者提供了 一系列具有分布式特性的常用工具类**



1. 指定一个 key 作为锁标记，存入 Redis 中，指定一个 唯一的用户标识 作为 value。
2. 当 key 不存在时才能设置值，确保同一时间只有一个客户端进程获得锁，满足 互斥性 特性。
3. 设置一个过期时间，防止因系统异常导致没能删除这个 key，满足 防死锁 特性。
4. 当处理完业务之后需要清除这个 key 来释放锁，清除 key 时需要校验 value 值，需要满足 只有加锁的人才能释放锁。
5. WatchDog 机制 能够很好的解决锁续期的问题，预防死锁。
6. 能够灵活的设置加锁时间，等待锁时间，释放锁失败后锁的存在时间。

<VipInline />