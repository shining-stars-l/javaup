---
slug: /hmdp-plus/tech-essentials/mybatis-plus-id-duplicate-k8s
---
# 为什么Mybatis-plus生成的id在k8s环境会发生重复

:::info plus 版本专属
此章节是黑马点评 Plus 版本中专有的内容，而在整套文档中将普通版本和 Plus 版本都融合在了一起，让大家更方便的学习。
:::

### 问题现象
数据库的业务id添加了唯一索引，当并发量上来时生产环境偶尔会出现此列的值重复问题，这是因为生成id时发成了重复现象，采取的是 MybatisPlus 的雪花算法策略，雪花算法这里就不细说了，大致由4部分组成：时间戳、datacenterId、wokerId、自增序列。



在 MybatisPlus 中，datacenterId 和 wokerId 需要我们自己去设置，如果没有设置那么 MybatisPlus 会自己去进行设值，下面来分析下 MybatisPlus 中完整的 id 生成过程

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

```java
protected long getMaxWorkerId(long datacenterId, long maxWorkerId) {
    StringBuilder mpid = new StringBuilder();
    mpid.append(datacenterId);
    String name = ManagementFactory.getRuntimeMXBean().getName();
    if (StringUtils.isNotBlank(name)) {
        /*
         * GET jvmPid
         */
        mpid.append(name.split(StringPool.AT)[0]);
    }
    /*
     * MAC + PID 的 hashcode 获取16个低位
     */
    return (mpid.toString().hashCode() & 0xffff) % (maxWorkerId + 1);
}
```

可以看出 **getMaxWorkerId(long datacenterId, long maxWorkerId)** 返回的 **workerId** 是mac地址和进程id的结合



到这里初始化工作执行完毕，下面就是生成id的过程了



**sequence.nextId()**

```java
/**
 * 时间起始标记点，作为基准，一般取系统的最近时间（一旦确定不能变动）
 */
private final long twepoch = 1288834974657L;
/**
 * 机器标识位数
 */
private final long workerIdBits = 5L;
private final long datacenterIdBits = 5L;
private final long maxWorkerId = -1L ^ (-1L << workerIdBits);
private final long maxDatacenterId = -1L ^ (-1L << datacenterIdBits);
/**
 * 毫秒内自增位
 */
private final long sequenceBits = 12L;
private final long workerIdShift = sequenceBits;
private final long datacenterIdShift = sequenceBits + workerIdBits;
/**
 * 时间戳左移动位
 */
private final long timestampLeftShift = sequenceBits + workerIdBits + datacenterIdBits;
private final long sequenceMask = -1L ^ (-1L << sequenceBits);

private final long workerId;

/**
 * 数据标识 ID 部分
 */
private final long datacenterId;
/**
 * 并发控制
 */
private long sequence = 0L;
/**
 * 上次生产 ID 时间戳
 */
private long lastTimestamp = -1L;
/**
 * IP 地址
 */
private InetAddress inetAddress;

public synchronized long nextId() {
    //获取当前最新的时间
    long timestamp = timeGen();
    //闰秒
    if (timestamp < lastTimestamp) {
        long offset = lastTimestamp - timestamp;
        //如果误差时间范围在5内
        if (offset <= 5) {
            try {
                //等待误差时间的2倍
                wait(offset << 1);
                //重新在获取最新的时间
                timestamp = timeGen();
                //如果依旧还是小于记录的时间则抛出异常
                if (timestamp < lastTimestamp) {
                    throw new RuntimeException(String.format("Clock moved backwards.  Refusing to generate id for %d milliseconds", offset));
                }
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        } else {
            //大于误差范围则抛出异常
            throw new RuntimeException(String.format("Clock moved backwards.  Refusing to generate id for %d milliseconds", offset));
        }
    }

    if (lastTimestamp == timestamp) {
        // 相同毫秒内，序列号自增
        sequence = (sequence + 1) & sequenceMask;
        if (sequence == 0) {
            // 同一毫秒的序列数已经达到最大
            timestamp = tilNextMillis(lastTimestamp);
        }
    } else {
        // 不同毫秒内，序列号置为 1 - 3 随机数
        sequence = ThreadLocalRandom.current().nextLong(1, 3);
    }
    //将这次获得的最新时间记录下来，用于下次执行时对比
    lastTimestamp = timestamp;

    // 时间戳部分 | 数据中心部分 | 机器标识部分 | 序列号部分
    return ((timestamp - twepoch) << timestampLeftShift)
        | (datacenterId << datacenterIdShift)
        | (workerId << workerIdShift)
        | sequence;
}
```



可以看到生成的策略与时间戳、mac地址、进程id、自增序列有关。



看似美好但其实是有问题的，因为在 K8s 集群环境下，如果不是在同一个 K8s 环境中，**mac地址有可能会重复**`**，**`**java服务进程id都为1**，这就造成生成的id会可能重复



## 解决
所以需要借助第三方来解决，可以使用 Redis 或 Zookeeper，因为 Redis 比 Zookeeper 更常用，最终决定用Redis来生成`datacenterId`和`workerId`



关于具体如何解决，可以查看分布式id的组件设计章节：

[分布式ID生成器揭秘，保障数据唯一性](/hmdp-plus/components/distributed-id)

