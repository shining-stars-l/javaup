---
slug: /damai/tech-highlights/mybatis-plus-id-duplicate
title: "为什么Mybatis-plus生成的id在k8s环境会发生重复：ID重复、雪花算法详解"
sidebar_label: "为什么Mybatis-plus生成的id在k8s环境会发生重复"
pagination_label: "为什么Mybatis-plus生成的id在k8s环境会发生重复"
description: "围绕《为什么Mybatis-plus生成的id在k8s环境会发生重复》，重点讲解Mybatis-plus主键生成、k8s环境ID重复、雪花算法、workerId分配与分布式ID冲突规避等技术实现与源码细节。内容进一步围绕dataCenterId等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。"
keywords: ["Mybatis-plus", "k8s", "ID重复", "雪花算法", "workerId", "dataCenterId", "分布式ID", "ID冲突规避"]
---

# 为什么Mybatis-plus生成的id在k8s环境会发生重复

import VipInline from '@site/src/components/VipInline';

## 现象


数据库的业务id添加了唯一索引，当并发量上来时生产环境偶尔会出现此列的值重复问题，这是因为生成id时发成了重复现象，采取的是 mybatis-plus 的雪花算法策略，雪花算法这里就不细说了，大致由4部分组成时间戳、datacenterId、wokerId、自增序列。



在 mybatis-plus 中 datacenterId和wokerId需要我们自己去设置，如果没有设置那么mybatis-plus会自己去进行设值，下面来分析下 mybatis-plus 中完整的id生成过程



## 分析


服务启动时，会加载默认的 **DefaultIdentifierGenerator**，调用无参构造方法



```java
public class DefaultIdentifierGenerator implements IdentifierGenerator {
    private final Sequence sequence;

    public DefaultIdentifierGenerator() {
        this.sequence = new Sequence(null);
    }

    public DefaultIdentifierGenerator(InetAddress inetAddress) {
        this.sequence = new Sequence(inetAddress);
    }

    public DefaultIdentifierGenerator(long workerId, long dataCenterId) {
        this.sequence = new Sequence(workerId, dataCenterId);
    }

    public DefaultIdentifierGenerator(Sequence sequence) {
        this.sequence = sequence;
    }

    @Override
    public Long nextId(Object entity) {
        return sequence.nextId();
    }
}
```



接着会调用无参构造方法时构造了 **Sequence**，传入的**InetAddress**参数为null



```java
/**
 * 机器标识位数
 */
private final long workerIdBits = 5L;
private final long datacenterIdBits = 5L;
private final long maxWorkerId = -1L ^ (-1L << workerIdBits);
private final long maxDatacenterId = -1L ^ (-1L << datacenterIdBits);

public Sequence(InetAddress inetAddress) {
    this.inetAddress = inetAddress;
    this.datacenterId = getDatacenterId(maxDatacenterId);
    this.workerId = getMaxWorkerId(datacenterId, maxWorkerId);
}
```



**maxDatacenterId** 和 **maxWorkerId** 固定为31，接着继续分析 **getDatacenterId(maxDatacenterId)**



```java
protected long getDatacenterId(long maxDatacenterId) {
    long id = 0L;
    try {
        if (null == this.inetAddress) {
            this.inetAddress = InetAddress.getLocalHost();
        }
        NetworkInterface network = NetworkInterface.getByInetAddress(this.inetAddress);
        if (null == network) {
            id = 1L;
        } else {
            byte[] mac = network.getHardwareAddress();
            if (null != mac) {
                id = ((0x000000FF & (long) mac[mac.length - 2]) | (0x0000FF00 & (((long) mac[mac.length - 1]) << 8))) >> 6;
                id = id % (maxDatacenterId + 1);
            }
        }
    } catch (Exception e) {
        logger.warn(" getDatacenterId: " + e.getMessage());
    }
    return id;
}
```



可以看出 **getDatacenterId(maxDatacenterId)** 返回的 **datacenterId** 就是mac地址，接着再继续分析 **getMaxWorkerId(datacenterId, maxWorkerId)**

<VipInline />