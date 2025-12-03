---
slug: /tech-sharing/production-issues/abandon-connection
---

# abandon connection问题分析

1. 出现`abandon connection, owner thread: http-nio-80-exec-19, connected at : 1610323631944, open stackTrace.....`错误日志信息
2. 出现异常`nested exception is com.alibaba.druid.pool.GetConnectionTimeoutException: wait millis 60004, active 60, maxActive 60, creating 0] with root cause`

## 流程

### 1. 项目启动时，利用springboot自动装配的原理会加载阿里数据源配置类`DruidDataSourceAutoConfigure`

```java
public class DruidDataSourceAutoConfigure {

    private static final Logger LOGGER = LoggerFactory.getLogger(DruidDataSourceAutoConfigure.class);

    @Bean(initMethod = "init")
    @ConditionalOnMissingBean
    public DataSource dataSource() {
        LOGGER.info("Init DruidDataSource");
        return new DruidDataSourceWrapper();
    }
}
```

`DruidDataSourceWrapper`继承了`DruidDataSource`。由于指定了initMethod = "init"，所以spring在创建`DruidDataSourceWrapper`对象时，会执行`DruidDataSource`的`init`方法。

## 2. init()初始化

### 2.1 设置连接池的最大容量

```java
private volatile DruidConnectionHolder[] connections;
.......

connections = new DruidConnectionHolder[maxActive];
```

### 2.2 init()内的createAndStartCreatorThread()方法

会开一个线程，用来创建连接，并放入DruidConnectionHolder[]中，但线程一开始进入会被阻塞，知道有获取连接的方法执行，再将其唤醒。

### 2.3 init()内的createAndStartDestroyThread()方法

会开一个定时线程池定时执行扫描。

```java
protected void createAndStartDestroyThread() {
    destroyTask = new DestroyTask();

    if (destroyScheduler != null) {
        long period = timeBetweenEvictionRunsMillis;
        if (period <= 0) {
            period = 1000;
        }
        destroySchedulerFuture = destroyScheduler.scheduleAtFixedRate(destroyTask, period, period,
                                                                      TimeUnit.MILLISECONDS);
        initedLatch.countDown();
        return;
    }

    String threadName = "Druid-ConnectionPool-Destroy-" + System.identityHashCode(this);
    destroyConnectionThread = new DestroyConnectionThread(threadName);
    destroyConnectionThread.start();
}
```

```java
public class DestroyTask implements Runnable {

      @Override
      public void run() {
          shrink(true, keepAlive);

          if (isRemoveAbandoned()) {
              removeAbandoned();
          }
      }

  }
```

当配置了removeAbandoned = true，if条件会进入执行removeAbandoned()。

```java
public int removeAbandoned() {
    int removeCount = 0;

    long currrentNanos = System.nanoTime();

    List<DruidPooledConnection> abandonedList = new ArrayList<DruidPooledConnection>();

    activeConnectionLock.lock();
    try {
        Iterator<DruidPooledConnection> iter = activeConnections.keySet().iterator();

        for (; iter.hasNext();) {
            DruidPooledConnection pooledConnection = iter.next();

            if (pooledConnection.isRunning()) {
                continue;
            }

            long timeMillis = (currrentNanos - pooledConnection.getConnectedTimeNano()) / (1000 * 1000);

            if (timeMillis >= removeAbandonedTimeoutMillis) {
                iter.remove();
                pooledConnection.setTraceEnable(false);
                abandonedList.add(pooledConnection);
            }
        }
    } finally {
        activeConnectionLock.unlock();
    }

    if (abandonedList.size() > 0) {
        for (DruidPooledConnection pooledConnection : abandonedList) {
            final ReentrantLock lock = pooledConnection.lock;
            lock.lock();
            try {
                if (pooledConnection.isDisable()) {
                    continue;
                }
            } finally {
                lock.unlock();
            }

            JdbcUtils.close(pooledConnection);
            pooledConnection.abandond();
            removeAbandonedCount++;
            removeCount++;

            if (isLogAbandoned()) {
                StringBuilder buf = new StringBuilder();
                buf.append("abandon connection, owner thread: ");
                buf.append(pooledConnection.getOwnerThread().getName());
                buf.append(", connected at : ");
                buf.append(pooledConnection.getConnectedTimeMillis());
                buf.append(", open stackTrace\n");

                StackTraceElement[] trace = pooledConnection.getConnectStackTrace();
                for (int i = 0; i < trace.length; i++) {
                    buf.append("\tat ");
                    buf.append(trace[i].toString());
                    buf.append("\n");
                }

                buf.append("ownerThread current state is " + pooledConnection.getOwnerThread().getState()
                           + ", current stackTrace\n");
                trace = pooledConnection.getOwnerThread().getStackTrace();
                for (int i = 0; i < trace.length; i++) {
                    buf.append("\tat ");
                    buf.append(trace[i].toString());
                    buf.append("\n");
                }

                LOG.error(buf.toString());
            }
        }
    }

    return removeCount;
}
```

可以分析出init()执行后，会有个定时线程池每秒执行一次任务，这个任务逻辑是获取活跃连接，判断目前的时间和当时获取连接时的时间相减是否超过了removeAbandonedTimeout配置的时间。超过的话`将这个连接从活跃连接中删掉，并加入废弃连接的集合中`，如果配置了logAbandoned为true，则打印错误日志：abandon connection, owner thread:.......

## 3. 获取连接

`service`添加默认事务后，`controller`调用`service`方法时，会执行`spring`的代理方法在开启事务时获取数据源的连接。
`DataSourceTransactionManager`:

```java
Connection newCon = this.dataSource.getConnection();
```

这里的`dataSource`实际为`DruidDataSource`

getConnection() -> getConnectionInternal()

### pollLast(long nanos)

1. 如果连接池数量poolingCount为0，也就是没有池中没有连接，则：
执行emptySignal() 将之前init()方法中的createAndStartCreatorThread()创建的创建线程任务从被阻塞转为唤醒，创建连接连接，放入DruidConnectionHolder[]数组中`(前提是不要超过maxActive数量)`。
2. 如果连接池数量poolingCount仍然后为0，则直接返回null。
3. 检查从pollLast(long nanos)获取的连接，如果为空，则抛出异常。

```java
if (holder == null) {
    long waitNanos = waitNanosLocal.get();

    StringBuilder buf = new StringBuilder();
    buf.append("wait millis ")//
       .append(waitNanos / (1000 * 1000))//
       .append(", active ").append(activeCount)//
       .append(", maxActive ").append(maxActive)//
       .append(", creating ").append(creatingCount)//
    ;

    List<JdbcSqlStatValue> sqlList = this.getDataSourceStat().getRuningSqlList();
    for (int i = 0; i < sqlList.size(); ++i) {
        if (i != 0) {
            buf.append('\n');
        } else {
            buf.append(", ");
        }
        JdbcSqlStatValue sql = sqlList.get(i);
        buf.append("runningSqlCount ").append(sql.getRunningCount());
        buf.append(" : ");
        buf.append(sql.getSql());
    }

    String errorMessage = buf.toString();

    if (this.createError != null) {
        throw new GetConnectionTimeoutException(errorMessage, createError);
    } else {
        throw new GetConnectionTimeoutException(errorMessage);
    }
}
```

## 解决方案

由以上分析可知，是获取连接执行时间过长导致的。所以在执行时间较长不需要回滚的情况下，使用`Propagation.PROPAGATION_NOT_SUPPORTED`不使用事务的传播行为配置

### 注意

- 要在从controller控制层调用的service方法上使用`@Transactional`注解，因为事务原理是用aop动态代理。
