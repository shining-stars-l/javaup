---
slug: /database/redis/redisson-lock-principle
---
# Redisson分布式锁核心实现原理

## for update 介绍
```sql
select column from table where column = ... for update
```

在 select 的 sql 上加上 for update 会对此记录加上行级锁，在超时，提交，回滚会进行释放。

### 缺点
1. 当请求等待锁释放时，不能灵活的控制加锁时间、等待锁的时间
2. 如果在一个事务中，开始的时候就使用for update的话，则需要这个事务执行完提交或回滚才能够解锁，不能很好的控制锁的粒度，并发性会降低。
3. 在Repeatable Read的隔离级别下有可能会产生死锁。参考：[https://www.cnblogs.com/micrari/p/8029710.html](https://www.cnblogs.com/micrari/p/8029710.html)

## 项目中的 Redis 锁
```java
public ResultMap<IDCardOCRVo> IDCardOCR(IDCardOCRDto dto){
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

## Redisson 的锁
**官网地址：**[https://github.com/redisson/redisson](https://github.com/redisson/redisson)

### 特点
**Redisson 是架设在 Redis 基础上的一个 Java 驻内存数据网格框架, 充分利用 Redis 键值数据库提供的一系列优势, 基于 Java 实用工具包中常用接口, 为使用者提供了 一系列具有分布式特性的常用工具类**

1. 指定一个 key 作为锁标记，存入 Redis 中，指定一个 唯一的用户标识 作为 value。
2. 当 key 不存在时才能设置值，确保同一时间只有一个客户端进程获得锁，满足 互斥性 特性。
3. 设置一个过期时间，防止因系统异常导致没能删除这个 key，满足 防死锁 特性。
4. 当处理完业务之后需要清除这个 key 来释放锁，清除 key 时需要校验 value 值，需要满足 只有加锁的人才能释放锁。
5. WatchDog 机制 能够很好的解决锁续期的问题，预防死锁。
6. 能够灵活的设置加锁时间，等待锁时间，释放锁失败后锁的存在时间。

### 流程图
<img src="/img/hmdp-plus/技术精华/3.png" alt="表关系" width="100%" />

## Redisson 原理
### 构建过程
org.redisson.Redisson#getLock

```java
public RLock getLock(String name) {
    return new RedissonLock(connectionManager.getCommandExecutor(), name);
}
```

```java
public RedissonLock(CommandAsyncExecutor commandExecutor, String name) {
        super(commandExecutor, name);
        //异步处理的命令执行器
        this.commandExecutor = commandExecutor;
        //生成唯一id
        this.id = commandExecutor.getConnectionManager().getId();
        //锁存活时间，默认30s
        this.internalLockLeaseTime = commandExecutor.getConnectionManager().getCfg().getLockWatchdogTimeout();
        //将id和业务key拼接，作为实际的key
        this.entryName = id + ":" + name;
        this.pubSub = commandExecutor.getConnectionManager().getSubscribeService().getLockPubSub();
}
```

### 加锁过程
org.redisson.RedissonLock#lock()

```java
private void lock(long leaseTime, TimeUnit unit, boolean interruptibly) throws InterruptedException {
    long threadId = Thread.currentThread().getId();
    Long ttl = tryAcquire(-1, leaseTime, unit, threadId);
    // lock acquired
    if (ttl == null) {
        return;
    }

    RFuture<RedissonLockEntry> future = subscribe(threadId);
    if (interruptibly) {
        commandExecutor.syncSubscriptionInterrupted(future);
    } else {
        commandExecutor.syncSubscription(future);
    }

    try {
        while (true) {
            ttl = tryAcquire(-1, leaseTime, unit, threadId);
            // lock acquired
            if (ttl == null) {
                break;
            }

            // waiting for message
            if (ttl >= 0) {
                try {
                    future.getNow().getLatch().tryAcquire(ttl, TimeUnit.MILLISECONDS);
                } catch (InterruptedException e) {
                    if (interruptibly) {
                        throw e;
                    }
                    future.getNow().getLatch().tryAcquire(ttl, TimeUnit.MILLISECONDS);
                }
            } else {
                if (interruptibly) {
                    future.getNow().getLatch().acquire();
                } else {
                    future.getNow().getLatch().acquireUninterruptibly();
                }
            }
        }
    } finally {
        unsubscribe(future, threadId);
    }
//        get(lockAsync(leaseTime, unit));
}
```



```java
private Long tryAcquire(long waitTime, long leaseTime, TimeUnit unit, long threadId) {
        return get(tryAcquireAsync(waitTime, leaseTime, unit, threadId));
}
```



```java
private <T> RFuture<Long> tryAcquireAsync(long waitTime, long leaseTime, TimeUnit unit, long threadId) {
    if (leaseTime != -1) {
        return tryLockInnerAsync(waitTime, leaseTime, unit, threadId, RedisCommands.EVAL_LONG);
    }
    RFuture<Long> ttlRemainingFuture = tryLockInnerAsync(waitTime, internalLockLeaseTime,
                                                            TimeUnit.MILLISECONDS, threadId, RedisCommands.EVAL_LONG);
    ttlRemainingFuture.onComplete((ttlRemaining, e) -> {
        if (e != null) {
            return;
        }

        // lock acquired
        if (ttlRemaining == null) {
            scheduleExpirationRenewal(threadId);
        }
    });
    return ttlRemainingFuture;
}
```



我们直接调用的lock方法，这时leaseTime为-1，不执行if分支。

```java
<T> RFuture<T> tryLockInnerAsync(long waitTime, long leaseTime, TimeUnit unit, long threadId, RedisStrictCommand<T> command) {
        internalLockLeaseTime = unit.toMillis(leaseTime);

        return evalWriteAsync(getName(), LongCodec.INSTANCE, command,
                "if (redis.call('exists', KEYS[1]) == 0) then " +
                        "redis.call('hincrby', KEYS[1], ARGV[2], 1); " +
                        "redis.call('pexpire', KEYS[1], ARGV[1]); " +
                        "return nil; " +
                        "end; " +
                        "if (redis.call('hexists', KEYS[1], ARGV[2]) == 1) then " +
                        "redis.call('hincrby', KEYS[1], ARGV[2], 1); " +
                        "redis.call('pexpire', KEYS[1], ARGV[1]); " +
                        "return nil; " +
                        "end; " +
                        "return redis.call('pttl', KEYS[1]);",
                Collections.singletonList(getName()), internalLockLeaseTime, getLockName(threadId));
}
```

#### lua总结
**这时leaseTime为默认的30s，这段lua的执行是重点:**

1. 首先呢，他先用exists命令判断了待获取锁的key anyLock 存不存在，如果不存在，就使用hset命令将锁key testlock作为key的map结构中存入一对键值对，4afd01d9-48e8-4341-9358-19f0507a9dcc:397 1
2. 同时还使用了pexpire命令给anyLock设置了过期时间30000毫秒，然后返回为空；
3. 如果anyLock已经存在了，会走另一个分支，此时会判断anyLock Map中是否存在37f75873-494a-439c-a0ed-f102bc2f3204:1，如果存在的话，就调用hincrby命令自增这个key的值，并且将anyLock的过期时间设置为30000毫秒，并且返回空。
4. 如果上面俩种情况都不是，那么就返回这个anyLock的剩余存活时间。

脚本也可以保证执行命令的原子性。然后呢就直接返回了一个RFuture ttlRemainingFuture,并且给他加了一个监听器，如果当前的这个异步加锁的步骤完成的时候调用，如果执行成功，就直接同步获取一个Long类型的ttlRemaining。

通过加锁的lua脚本可知，如果加锁或者重入锁成功的话会发现TTLRemaining是为null的，那么就会执行下面的这一行代码，我们可以看到注释 锁已获得。

```java
// lock acquired

if (ttlRemaining == null) {
  scheduleExpirationRenewal(threadId);
}
```

<img src="/img/hmdp-plus/技术精华/4.png" alt="表关系" width="100%" />

以上我们分析了redisson加锁的过程，总结来说，流程不复杂，代码也很直观，主要是异步通过lua脚本执行了加锁的逻辑。

### 看门狗机制
其中，我们注意到了一些细节，比如 RedissonLock中的变量internalLockLeaseTime,默认值是30000毫秒，还有调用tryLockInnerAsync()传入的一个从连接管理器获取的getLockWatchdogTimeout(),他的默认值也是30000毫秒，这些都和redisson官方文档所说的watchdog机制有关，看门狗，还是很形象的描述这一机制，那么看门狗到底做了什么，为什么怎么做呢？下面我们就来分析和探讨一下。

#### 加锁成功后的问题
1. 假设在一个分布式环境下，多个服务实例请求获取锁，其中服务实例1成功获取到了锁，在执行业务逻辑的过程中，服务实例突然挂掉了或者hang住了，那么这个锁会不会释放，什么时候释放？
2. 回答这个问题，自然想起来之前我们分析的lua脚本，其中第一次加锁的时候使用pexpire给锁key设置了过期时间，默认30000毫秒，由此来看如果服务实例宕机了，锁最终也会释放，其他服务实例也是可以继续获取到锁执行业务。但是要是30000毫秒之后呢，要是服务实例1没有宕机但是业务执行还没有结束，所释放掉了就会导致线程问题，这个redisson是怎么解决的呢？这个就一定要实现自动延长锁有效期的机制。

之前，我们分析到异步执行完lua脚本执行完成之后，设置了一个监听器，来处理异步执行结束之后的一些工作

```java
private void scheduleExpirationRenewal(long threadId) {
        ExpirationEntry entry = new ExpirationEntry();
        ExpirationEntry oldEntry = EXPIRATION_RENEWAL_MAP.putIfAbsent(getEntryName(), entry);
        if (oldEntry != null) {
            oldEntry.addThreadId(threadId);
        } else {
            entry.addThreadId(threadId);
            renewExpiration();
        }
}
```



1. 首先，会先判断在expirationRenewalMap中是否存在了entryName，这是个map结构，主要还是判断在这个服务实例中的加锁客户端的锁key是否存在，如果已经存在了，就直接返回；第一次加锁，肯定是不存在的。
2. 接下来就是搞了一个TimeTask，延迟internalLockLeaseTime/3之后执行，这里就用到了文章一开始就提到奇妙的变量，算下来就是大约10秒钟执行一次，调用了一个异步执行的方法,renewExpirationAsync方法,也是调用异步执行了一段lua脚本



```java
private void renewExpiration() {
        ExpirationEntry ee = EXPIRATION_RENEWAL_MAP.get(getEntryName());
        if (ee == null) {
            return;
        }
        
        Timeout task = commandExecutor.getConnectionManager().newTimeout(new TimerTask() {
            @Override
            public void run(Timeout timeout) throws Exception {
                ExpirationEntry ent = EXPIRATION_RENEWAL_MAP.get(getEntryName());
                if (ent == null) {
                    return;
                }
                Long threadId = ent.getFirstThreadId();
                if (threadId == null) {
                    return;
                }
                
                RFuture<Boolean> future = renewExpirationAsync(threadId);
                future.onComplete((res, e) -> {
                    if (e != null) {
                        log.error("Can't update lock " + getName() + " expiration", e);
                        EXPIRATION_RENEWAL_MAP.remove(getEntryName());
                        return;
                    }
                    
                    if (res) {
                        // reschedule itself
                        renewExpiration();
                    }
                });
            }
        }, internalLockLeaseTime / 3, TimeUnit.MILLISECONDS);
        
        ee.setTimeout(task);
}
```



首先判断这个锁key的map结构中是否存在对应的4afd01d9-48e8-4341-9358-19f0507a9dcc:397，如果存在，就直接调用pexpire命令设置锁key的过期时间,默认30000毫秒。

```java
protected RFuture<Boolean> renewExpirationAsync(long threadId) {
        return evalWriteAsync(getName(), LongCodec.INSTANCE, RedisCommands.EVAL_BOOLEAN,
                "if (redis.call('hexists', KEYS[1], ARGV[2]) == 1) then " +
                        "redis.call('pexpire', KEYS[1], ARGV[1]); " +
                        "return 1; " +
                        "end; " +
                        "return 0;",
                Collections.singletonList(getName()),
                internalLockLeaseTime, getLockName(threadId));
}
```



1. 在上面任务调度的方法中，也是异步执行并且设置了一个监听器，在操作执行成功之后，会回调这个方法，如果调用失败会打一个错误日志并返回，更新锁过期时间失败；
2. 然后获取异步执行的结果，如果为true，就会调用本身，如此说来又会延迟10秒钟去执行这段逻辑，所以，这段逻辑在你成功获取到锁之后，会每隔十秒钟去执行一次，并且，在锁key还没有失效的情况下，会把锁的过期时间继续延长到30000毫秒，也就是说只要这台服务实例没有挂掉，并且没有主动释放锁，看门狗都会每隔十秒给你续约一下，保证锁一直在你手中。完美的操作。



#### 其他实例没有获得锁的过程
这时如果有别的服务实例来尝试加锁又会发生什么情况呢？或者当前客户端的别的线程来获取锁呢？很显然，肯定会阻塞住，我们来通过代码看看是怎么做到的。还是把眼光放到之前分析的那段加锁lua代码上。



当加锁的锁key存在的时候并且锁key对应的map结构中当前客户端的唯一key也存在时，会去调用hincrby命令，将唯一key的值自增一，并且会pexpire设置key的过期时间为30000毫秒，然后返回nil,可以想象这里也是加锁成功的，也会继续去执行定时调度任务，完成锁key过期时间的续约，这里呢，就实现了锁的可重入性。

```java
<T> RFuture<T> tryLockInnerAsync(long waitTime, long leaseTime, TimeUnit unit, long threadId, RedisStrictCommand<T> command) {
        internalLockLeaseTime = unit.toMillis(leaseTime);

        return evalWriteAsync(getName(), LongCodec.INSTANCE, command,
                "if (redis.call('exists', KEYS[1]) == 0) then " +
                        "redis.call('hincrby', KEYS[1], ARGV[2], 1); " +
                        "redis.call('pexpire', KEYS[1], ARGV[1]); " +
                        "return nil; " +
                        "end; " +
                        "if (redis.call('hexists', KEYS[1], ARGV[2]) == 1) then " +
                        "redis.call('hincrby', KEYS[1], ARGV[2], 1); " +
                        "redis.call('pexpire', KEYS[1], ARGV[1]); " +
                        "return nil; " +
                        "end; " +
                        "return redis.call('pttl', KEYS[1]);",
                Collections.singletonList(getName()), internalLockLeaseTime, getLockName(threadId));
}
```



那么当以上这种情况也没有发生呢，这里就会直接返回当前锁的剩余有效期,相应的也不会去执行续约逻辑。此时一直返回到上面的方法:



如果加锁成功就直接返回，否则就会进入一个死循环，去尝试加锁，并且也会在等待一段时间之后一直循环尝试加锁，阻塞住，直到第一个服务实例释放锁。对于不同的服务实例尝试会获取一把锁，也和上面的逻辑类似，都是这样实现了锁的互斥。



```java
private void lock(long leaseTime, TimeUnit unit, boolean interruptibly) throws InterruptedException {
    long threadId = Thread.currentThread().getId();
    Long ttl = tryAcquire(-1, leaseTime, unit, threadId);
    // lock acquired
    if (ttl == null) {
        return;
    }

    RFuture<RedissonLockEntry> future = subscribe(threadId);
    if (interruptibly) {
        commandExecutor.syncSubscriptionInterrupted(future);
    } else {
        commandExecutor.syncSubscription(future);
    }

    try {
        while (true) {
            ttl = tryAcquire(-1, leaseTime, unit, threadId);
            // lock acquired
            if (ttl == null) {
                break;
            }

            // waiting for message
            if (ttl >= 0) {
                try {
                    future.getNow().getLatch().tryAcquire(ttl, TimeUnit.MILLISECONDS);
                } catch (InterruptedException e) {
                    if (interruptibly) {
                        throw e;
                    }
                    future.getNow().getLatch().tryAcquire(ttl, TimeUnit.MILLISECONDS);
                }
            } else {
                if (interruptibly) {
                    future.getNow().getLatch().acquire();
                } else {
                    future.getNow().getLatch().acquireUninterruptibly();
                }
            }
        }
    } finally {
        unsubscribe(future, threadId);
    }
//        get(lockAsync(leaseTime, unit));
}
```



### 释放锁
```java
public void unlock() {
        try {
            get(unlockAsync(Thread.currentThread().getId()));
        } catch (RedisException e) {
            if (e.getCause() instanceof IllegalMonitorStateException) {
                throw (IllegalMonitorStateException) e.getCause();
            } else {
                throw e;
            }
        }
}
```



```java
public RFuture<Void> unlockAsync(long threadId) {
        RPromise<Void> result = new RedissonPromise<Void>();
        RFuture<Boolean> future = unlockInnerAsync(threadId);

        future.onComplete((opStatus, e) -> {
            cancelExpirationRenewal(threadId);

            if (e != null) {
                result.tryFailure(e);
                return;
            }

            if (opStatus == null) {
                IllegalMonitorStateException cause = new IllegalMonitorStateException("attempt to unlock lock, not locked by current thread by node id: "
                        + id + " thread-id: " + threadId);
                result.tryFailure(cause);
                return;
            }

            result.trySuccess(null);
        });

        return result;
}
```



判断当前客户端对应的唯一key的值是否存在，如果不存在就会返回nil;否则，值自增-1，判断唯一key的值是否大于零，如果大于零，则返回0；否则删除当前锁key，并返回1。

```java
protected RFuture<Boolean> unlockInnerAsync(long threadId) {
        return evalWriteAsync(getName(), LongCodec.INSTANCE, RedisCommands.EVAL_BOOLEAN,
                "if (redis.call('hexists', KEYS[1], ARGV[3]) == 0) then " +
                        "return nil;" +
                        "end; " +
                        "local counter = redis.call('hincrby', KEYS[1], ARGV[3], -1); " +
                        "if (counter > 0) then " +
                        "redis.call('pexpire', KEYS[1], ARGV[2]); " +
                        "return 0; " +
                        "else " +
                        "redis.call('del', KEYS[1]); " +
                        "redis.call('publish', KEYS[2], ARGV[1]); " +
                        "return 1; " +
                        "end; " +
                        "return nil;",
                Arrays.asList(getName(), getChannelName()), LockPubSub.UNLOCK_MESSAGE, internalLockLeaseTime, getLockName(threadId));
}
```



返回到上一层方法，也是针对返回值进行了操作，如果返回值是1，则会去取消之前的定时续约任务，如果失败了，则会做一些类似设置状态的操作。

```java
void cancelExpirationRenewal(Long threadId) {
        ExpirationEntry task = EXPIRATION_RENEWAL_MAP.get(getEntryName());
        if (task == null) {
            return;
        }
        
        if (threadId != null) {
            task.removeThreadId(threadId);
        }

        if (threadId == null || task.hasNoThreads()) {
            Timeout timeout = task.getTimeout();
            if (timeout != null) {
                timeout.cancel();
            }
            EXPIRATION_RENEWAL_MAP.remove(getEntryName());
        }
}
```



现在来说，redis分布式锁，redisson去加锁，也就是去redis集群中选择一台master实例去实现锁机制，并且能因为一台master可能会挂载多台slave实例，这样也就实现了高可用性。

但是呢，不得不去思考，如果master和salve同步的过程中，master宕机了，偏偏在这之前某个服务实例刚刚写入了一把锁，这时候就尴尬了，salve还没有同步到这把锁，就被切换成了master，那么这时候可以说就有问题了，

另一个服务实例在新的master上获取到一把新锁，这时候就会出现俩台服务实例都持有锁，执行业务逻辑的场景，这个是有问题的。也是在生产环境中我们需要去考虑的一个问题。


