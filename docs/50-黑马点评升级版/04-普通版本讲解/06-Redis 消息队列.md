---
slug: /hmdp-plus/basic/redis-message-queue
---
# Redis 消息队列

:::caution 普通版本
本章节是黑马点评普通版中的内容，直接把文档转移了进来。
而在整套文档中将普通版本和 Plus 版本都融合在了一起，让大家更方便的学习。
:::

:::info
## 注意：
Redis 的消息队列很容易丢失数据，性能也不如真正的消息队列。

黑马点评 plus 版本已经采用 Kafka 取代 Redis 的消息队列，并解决了消息队列宕机、服务宕机、数据不一致、消息延迟、消息记录、消息幂等 等关键问题。

所以本章节只作为想了解 Redis 的消息队列作用

:::

## 一、Redis 消息队列-认识消息队列
什么是消息队列：字面意思就是存放消息的队列。最简单的消息队列模型包括3个角色：

+ **消息队列：** 存储和管理消息，也被称为消息代理（Message Broker）
+ **生产者：** 发送消息到消息队列
+ **消费者：** 从消息队列获取消息并处理消息

<img src="/img/hmdp/Redis消息队列/1.png" alt="表关系" width="100%" />

使用队列的好处在于 **解耦：** 所谓解耦，举一个生活中的例子就是：快递员(生产者)把快递放到快递柜里边(Message Queue)去，我们(消费者)从快递柜里边去拿东西，这就是一个异步，如果耦合，那么这个快递员相当于直接把快递交给你，这事固然好，但是万一你不在家，那么快递员就会一直等你，这就浪费了快递员的时间，所以这种思想在我们日常开发中，是非常有必要的。

这种场景在我们秒杀中就变成了：我们下单之后，利用redis去进行校验下单条件，再通过队列把消息发送出去，然后再启动一个线程去消费这个消息，完成解耦，同时也加快我们的响应速度。

这里我们可以使用一些现成的mq，比如kafka，rabbitmq 等等，但是呢，如果没有安装mq，我们也可以直接使用redis提供的mq方案，降低我们的部署和学习成本。

## 二、Redis 消息队列-基于 List 实现消息队列
### 2.1 基于List结构模拟消息队列
消息队列（Message Queue），字面意思就是存放消息的队列。而Redis的list数据结构是一个双向链表，很容易模拟出队列效果。

队列是入口和出口不在一边，因此我们可以利用：LPUSH 结合 RPOP、或者 RPUSH 结合 LPOP来实现。  
不过要注意的是，当队列中没有消息时RPOP或LPOP操作会返回null，并不像JVM的阻塞队列那样会阻塞并等待消息。因此这里应该使用BRPOP或者BLPOP来实现阻塞效果。

<img src="/img/hmdp/Redis消息队列/2.png" alt="表关系" width="100%" />

### 2.2 基于List的消息队列有哪些优缺点？
#### 优点：
+ 利用Redis存储，不受限于JVM内存上限
+ 基于Redis的持久化机制，数据安全性有保证
+ 可以满足消息有序性

#### 缺点：
+ 无法避免消息丢失
+ 只支持单消费者

## 三、Redis 消息队列-基于 PubSub 的消息队列
PubSub（发布订阅）是Redis2.0版本引入的消息传递模型。顾名思义，消费者可以订阅一个或多个channel，生产者向对应channel发送消息后，所有订阅者都能收到相关消息。

+ SUBSCRIBE channel [channel] ：订阅一个或多个频道
+ PUBLISH channel msg ：向一个频道发送消息
+ PSUBSCRIBE pattern[pattern] ：订阅与pattern格式匹配的所有频道

### 3.1 基于PubSub的消息队列有哪些优缺点？
#### 优点：
+ 采用发布订阅模型，支持多生产、多消费

#### 缺点：
+ 不支持数据持久化
+ 无法避免消息丢失
+ 消息堆积有上限，超出时数据丢失

## 四、Redis 消息队列-基于 Stream 的消息队列
Stream 是 Redis 5.0 引入的一种新数据类型，可以实现一个功能非常完善的消息队列。

发送消息的命令

<img src="/img/hmdp/Redis消息队列/3.png" alt="表关系" width="100%" />

例如：

<img src="/img/hmdp/Redis消息队列/4.png" alt="表关系" width="100%" />

读取消息的方式之一：XREAD

<img src="/img/hmdp/Redis消息队列/5.png" alt="表关系" width="100%" />

例如，使用XREAD读取第一个消息：

<img src="/img/hmdp/Redis消息队列/6.png" alt="表关系" width="100%" />

XREAD阻塞方式，读取最新的消息：

<img src="/img/hmdp/Redis消息队列/7.png" alt="表关系" width="100%" />

在业务开发中，我们可以循环的调用XREAD阻塞方式来查询最新消息，从而实现持续监听队列的效果，伪代码如下

```java
while(true) {
	// 尝试读取队列中的消息，最多阻塞2秒
	Object msg = redis.execute("XREAD COUNT 1 BLOCK 2000 STREAMS users $");
	if(msg == null) {
		continue;
	}
	// 处理消息
	handleMessage(msg);
}
```

注意：当我们指定起始ID为$时，代表读取最新的消息，如果我们处理一条消息的过程中，又有超过1条以上的消息到达队列，则下次获取时也只能获取到最新的一条，会出现漏读消息的问题

### STREAM 类型消息队列的XREAD命令特点：
+ 消息可回溯
+ 一个消息可以被多个消费者读取
+ 可以阻塞读取
+ 有消息漏读的风险

## 五、Redis 消息队列-基于 Stream 的消息队列-消费者组
### 5.1 消息特点
消费者组（Consumer Group）：将多个消费者划分到一个组中，监听同一个队列。具备下列特点：

#### 5.1.1 消息分流
队列中的消息会分流给组内的不同消费者，而不是重复消费，从而加快消息处理的速度

#### 5.1.2 消息标识
消费者组会维护一个标识，记录最后一个被处理的消息，哪怕消费者宕机重启，还会从标识之后读取消息。确保每一个消息都会被消费。

#### 5.1.3 消息确认
消费者获取消息后，消息处于 pending 状态，并存入一个 pending-list。当处理完成后需要通过 XACK 来确认消息，标记消息为已处理，才会从 pending-list 移除。

### 5.2 创建消费组
```java
XGROUP CREATE key groupName ID [MKSTREAM]
```

+ key：队列名称
+ groupName：消费者组名称
+ ID：起始ID标示，$代表队列中最后一个消息，0则代表队列中第一个消息
+ MKSTREAM：队列不存在时自动创建队列  
其它常见命令：

### 5.3 删除指定的消费者组
```java
XGROUP DESTORY key groupName
```

### 5.4 给指定的消费者组添加消费者
```java
XGROUP CREATECONSUMER key groupname consumername
```

### 5.5 删除消费者组中的指定消费者
```java
XGROUP DELCONSUMER key groupname consumername
```

### 5.6 从消费者组读取消息：
```java
XREADGROUP GROUP group consumer [COUNT count] [BLOCK milliseconds] [NOACK] STREAMS key [key ...] ID [ID ...]
```

+ group：消费组名称
+ consumer：消费者名称，如果消费者不存在，会自动创建一个消费者
+ count：本次查询的最大数量
+ BLOCK milliseconds：当没有消息时最长等待时间
+ NOACK：无需手动ACK，获取到消息后自动确认
+ STREAMS key：指定队列名称
+ ID：获取消息的起始ID：

> 从下一个未消费的消息开始  
其它：根据指定id从pending-list中获取已消费但未确认的消息，例如0，是从pending-list中的第一个消息开始

### 5.7 消费者监听消息的基本思路：
```java
while(true) {
	// 尝试读取队列中的消息，最多阻塞2秒
	Object msg = redis.call("XREADGROUP GROUP g1 c1 COUNT 1 BLOCK 2000 STREAMS s1 >");
	if(msg == null) {
		continue;
	}
	try{
		// 处理消息
		handleMessage(msg);
	}catch(Exception e){
		while(true) {
			Object msg = redis.call("XREADGROUP GROUP g1 c1 COUNT 1 STREAMS s1 0");
			// null说明没有异常消息，所有消息都已确认，结束循环
			if(msg == null) {
				break;
			}
			try{
				// 说明有异常消息，再次处理
				handleMessage(msg);
			}catch(Exception e){
				// 再次出现异常，记录日志，继续循环
				continue;
			}
		}

	}
}
```

#### STREAM类型消息队列的XREADGROUP命令特点：
+ 消息可回溯
+ 可以多消费者争抢消息，加快消费速度
+ 可以阻塞读取
+ 没有消息漏读的风险
+ 有消息确认机制，保证消息至少被消费一次

#### 最后我们来个小对比：
<img src="/img/hmdp/Redis消息队列/8.png" alt="表关系" width="100%" />

## 六、基于 Redis 的 Stream 结构作为消息队列，实现异步秒杀下单
### 需求：
+ 创建一个Stream类型的消息队列，名为stream.orders
+ 修改之前的秒杀下单Lua脚本，在认定有抢购资格后，直接向stream.orders中添加消息，内容包含voucherId、userId、orderId
+ 项目启动时，开启一个线程任务，尝试获取stream.orders中的消息，完成下单\

### 修改lua表达式,新增3.6 
```lua
-- 3.5.下单（保存用户）sadd orderKey userId
redis.call('sadd', orderKey, userId)
-- 3.6.发送消息到队列中， XADD stream.orders * k1 v1 k2 v2 ...
redis.call('xadd', 'stream.orders', '*', 'userId', userId, 'voucherId', voucherId, 'id', orderId)
```

VoucherOrderServiceImpl

```java
private class VoucherOrderHandler implements Runnable {

    @Override
    public void run() {
        while (true) {
            try {
                // 1.获取消息队列中的订单信息 XREADGROUP GROUP g1 c1 COUNT 1 BLOCK 2000 STREAMS s1 >
                List<MapRecord<String, Object, Object>> list = stringRedisTemplate.opsForStream().read(
                    Consumer.from("g1", "c1"),
                    StreamReadOptions.empty().count(1).block(Duration.ofSeconds(2)),
                    StreamOffset.create("stream.orders", ReadOffset.lastConsumed())
                );
                // 2.判断订单信息是否为空
                if (list == null || list.isEmpty()) {
                    // 如果为null，说明没有消息，继续下一次循环
                    continue;
                }
                // 解析数据
                MapRecord<String, Object, Object> record = list.get(0);
                Map<Object, Object> value = record.getValue();
                VoucherOrder voucherOrder = BeanUtil.fillBeanWithMap(value, new VoucherOrder(), true);
                // 3.创建订单
                createVoucherOrder(voucherOrder);
                // 4.确认消息 XACK
                stringRedisTemplate.opsForStream().acknowledge("s1", "g1", record.getId());
            } catch (Exception e) {
                log.error("处理订单异常", e);
                //处理异常消息
                handlePendingList();
            }
        }
    }

    private void handlePendingList() {
        while (true) {
            try {
                // 1.获取pending-list中的订单信息 XREADGROUP GROUP g1 c1 COUNT 1 BLOCK 2000 STREAMS s1 0
                List<MapRecord<String, Object, Object>> list = stringRedisTemplate.opsForStream().read(
                    Consumer.from("g1", "c1"),
                    StreamReadOptions.empty().count(1),
                    StreamOffset.create("stream.orders", ReadOffset.from("0"))
                );
                // 2.判断订单信息是否为空
                if (list == null || list.isEmpty()) {
                    // 如果为null，说明没有异常消息，结束循环
                    break;
                }
                // 解析数据
                MapRecord<String, Object, Object> record = list.get(0);
                Map<Object, Object> value = record.getValue();
                VoucherOrder voucherOrder = BeanUtil.fillBeanWithMap(value, new VoucherOrder(), true);
                // 3.创建订单
                createVoucherOrder(voucherOrder);
                // 4.确认消息 XACK
                stringRedisTemplate.opsForStream().acknowledge("s1", "g1", record.getId());
            } catch (Exception e) {
                log.error("处理pendding订单异常", e);
                try{
                    Thread.sleep(20);
                }catch(Exception e){
                    e.printStackTrace();
                }
            }
        }
    }
}

```



