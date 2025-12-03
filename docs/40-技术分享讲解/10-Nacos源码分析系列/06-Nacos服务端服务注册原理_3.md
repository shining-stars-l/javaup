---
slug: /tech-sharing/nacos-source/nacos-part-3
---

# Nacos服务端服务注册原理_3
## ClientServiceIndexesManager.onEvent(Event event)

```java
public void notifySubscriber(Subscriber subscriber, Event event) {
    if (Loggers.EVT_LOG.isDebugEnabled()) {
        Loggers.EVT_LOG.debug("[NotifyCenter] the {} will received by {}", event, subscriber);
    }
    //订阅者执行时间
    final Runnable job = () -> {
        //这里的subscriber实际为ClientServiceIndexesManager类型
        subscriber.onEvent(event);
    };

    final Executor executor = subscriber.executor();
    //异步执行
    if (executor != null) {
        executor.execute(job);
    } else {
        try {
            //同步执行
            job.run();
        } catch (Throwable e) {
            Loggers.EVT_LOG.error("Event callback exception: ", e);
        }
    }
}
```

接着分析`subscriber.onEvent(event)`

### ClientServiceIndexesManager.onEvent(Event event)

```java
public void onEvent(Event event) {
    if (event instanceof ClientEvent.ClientDisconnectEvent) {
        handleClientDisconnect((ClientEvent.ClientDisconnectEvent) event);
    } else if (event instanceof ClientOperationEvent) {
        handleClientOperation((ClientOperationEvent) event);
    }
}
```

```java
private void handleClientOperation(ClientOperationEvent event) {
    Service service = event.getService();
    String clientId = event.getClientId();
    if (event instanceof ClientOperationEvent.ClientRegisterServiceEvent) {
        addPublisherIndexes(service, clientId);
    } else if (event instanceof ClientOperationEvent.ClientDeregisterServiceEvent) {
        removePublisherIndexes(service, clientId);
    } else if (event instanceof ClientOperationEvent.ClientSubscribeServiceEvent) {
        addSubscriberIndexes(service, clientId);
    } else if (event instanceof ClientOperationEvent.ClientUnsubscribeServiceEvent) {
        removeSubscriberIndexes(service, clientId);
    }
}
```

```java
private void addPublisherIndexes(Service service, String clientId) {
    publisherIndexes.computeIfAbsent(service, (key) -> new ConcurrentHashSet<>());
    //一个服务通常有多个ClientId，clientId缓存在ConcurrentHashSet，通过ConcurrentHashMap关联
    publisherIndexes.get(service).add(clientId);
    //又发布了一个ServiceChangedEvent事件
    NotifyCenter.publishEvent(new ServiceEvent.ServiceChangedEvent(service, true));
}
```

可以看到当服务注册后服务端接收的逻辑会发布一个`ClientRegisterServiceEvent`事件，然后处理这个事件后又会发布一个`ServiceChangedEvent`事件。

`ServiceChangedEvent`事件是什么时候添加到订阅者集合中的呢

`@Service NamingSubscriberServiceV2Impl.NamingSubscriberServiceV2Impl构造方法`

--->
`NotifyCenter.registerSubscriber(this, NamingEventPublisherFactory.getInstance())`

--->`NamingSubscriberServiceV2Impl.subscribeTypes()`

```java
public List<Class<? extends Event>> subscribeTypes() {
	List<Class<? extends Event>> result = new LinkedList<>();
	result.add(ServiceEvent.ServiceChangedEvent.class);
	result.add(ServiceEvent.ServiceSubscribedEvent.class);
	return result;
}
```

--->`NotifyCenter.addSubscriber(consumer, subscribeType, factory)`

可以看到`ServiceChangedEvent`事件是通过`NamingSubscriberServiceV2Impl`被@Service修饰，然后执行构造方法一直调用。

## ServiceChangedEvent事件

发布`ServiceChangedEvent`事件后，仍然放入队列然后从队列中取出后，或者放入队列失败，执行`notifySubscriber(Subscriber subscriber, Event event)`

```java
public void notifySubscriber(Subscriber subscriber, Event event) {
    if (Loggers.EVT_LOG.isDebugEnabled()) {
        Loggers.EVT_LOG.debug("[NotifyCenter] the {} will received by {}", event, subscriber);
    }
    //订阅者执行时间
    final Runnable job = () -> {
        //这里的subscriber实际为ClientServiceIndexesManager类型
        subscriber.onEvent(event);
    };

    final Executor executor = subscriber.executor();
    //异步执行
    if (executor != null) {
        executor.execute(job);
    } else {
        try {
            //同步执行
            job.run();
        } catch (Throwable e) {
            Loggers.EVT_LOG.error("Event callback exception: ", e);
        }
    }
}
```

### NamingSubscriberServiceV2Impl.onEvent(event)

```java
public void onEvent(Event event) {
    if (!upgradeJudgement.isUseGrpcFeatures()) {
        return;
    }
    if (event instanceof ServiceEvent.ServiceChangedEvent) {
        // If service changed, push to all subscribers.
        ServiceEvent.ServiceChangedEvent serviceChangedEvent = (ServiceEvent.ServiceChangedEvent) event;
        Service service = serviceChangedEvent.getService();
        //向delayTaskEngine引擎添加PushDelayTask任务
        delayTaskEngine.addTask(service, new PushDelayTask(service, PushConfig.getInstance().getPushTaskDelay()));
    } else if (event instanceof ServiceEvent.ServiceSubscribedEvent) {
        // If service is subscribed by one client, only push this client.
        ServiceEvent.ServiceSubscribedEvent subscribedEvent = (ServiceEvent.ServiceSubscribedEvent) event;
        Service service = subscribedEvent.getService();
        delayTaskEngine.addTask(service, new PushDelayTask(service, PushConfig.getInstance().getPushTaskDelay(),
                subscribedEvent.getClientId()));
    }
}
```

### NacosDelayTaskExecuteEngine.addTask(Object key, AbstractDelayTask newTask)

```java
protected final ConcurrentHashMap<Object, AbstractDelayTask> tasks;

public void addTask(Object key, AbstractDelayTask newTask) {
    lock.lock();
    try {
        AbstractDelayTask existTask = tasks.get(key);
        if (null != existTask) {
            newTask.merge(existTask);
        }
        //Service{namespace='public', group='DEFAULT_GROUP', 
        //name='order', ephemeral=true, revision=2}
        tasks.put(key, newTask);
    } finally {
        lock.unlock();
    }
}
```

构建一个任务放入`tasks`中,`tasks`为ConcurrentHashMap，key为`service服务`，value为`PushDelayTask`。

## 从tasks取任务执行

tasks中的任务是定时任务来取出执行，下面分析定时任务的构建

### DistroTaskEngineHolder

```java
@Component
public class DistroTaskEngineHolder {
    
    private final DistroDelayTaskExecuteEngine delayTaskExecuteEngine = 
                    new DistroDelayTaskExecuteEngine();
    /**
     * 省略
     * */
}
```

### DistroDelayTaskExecuteEngine

```java
public class DistroDelayTaskExecuteEngine extends NacosDelayTaskExecuteEngine {
    
    public DistroDelayTaskExecuteEngine() {
        super(DistroDelayTaskExecuteEngine.class.getName(), Loggers.DISTRO);
    }
    
    /**
     * 省略
     * */
}
```

### NacosDelayTaskExecuteEngine

```java
public NacosDelayTaskExecuteEngine(String name, Logger logger) {
    this(name, 32, logger, 100L);
}
```

```java
public NacosDelayTaskExecuteEngine(String name, int initCapacity, Logger logger, long processInterval) {
    super(logger);
    tasks = new ConcurrentHashMap<>(initCapacity);
    processingExecutor = ExecutorFactory.newSingleScheduledExecutorService(new NameThreadFactory(name));
    processingExecutor
            .scheduleWithFixedDelay(new ProcessRunnable(), processInterval, processInterval, TimeUnit.MILLISECONDS);
}
```

构建出一个`processingExecutor`定时任务，延迟和间隔执行时间都为100毫秒。

任务`new ProcessRunnable()`

```java
private class ProcessRunnable implements Runnable {

    @Override
    public void run() {
        try {
            processTasks();
        } catch (Throwable e) {
            getEngineLog().error(e.toString(), e);
        }
    }
}
```

```java
protected void processTasks() {
    Collection<Object> keys = getAllTaskKeys();
    for (Object taskKey : keys) {
        AbstractDelayTask task = removeTask(taskKey);
        if (null == task) {
            continue;
        }
        NacosTaskProcessor processor = getProcessor(taskKey);
        if (null == processor) {
            getEngineLog().error("processor not found for task, so discarded. " + task);
            continue;
        }
        try {
            // ReAdd task if process failed
            if (!processor.process(task)) {
                retryFailedTask(taskKey, task);
            }
        } catch (Throwable e) {
            getEngineLog().error("Nacos task execute error : " + e.toString(), e);
            retryFailedTask(taskKey, task);
        }
    }
}

public Collection<Object> getAllTaskKeys() {
    Collection<Object> keys = new HashSet<Object>();
    lock.lock();
    try {
        keys.addAll(tasks.keySet());
    } finally {
        lock.unlock();
    }
    return keys;
}
```

### PushDelayTaskProcessor.process(task)

```java
public boolean process(NacosTask task) {
    PushDelayTask pushDelayTask = (PushDelayTask) task;
    Service service = pushDelayTask.getService();
    //NamingExecuteTaskDispatcher.getInstance()得到的是
    //NamingExecuteTaskDispatcher
    NamingExecuteTaskDispatcher.getInstance()
            .dispatchAndExecuteTask(service, 
            new PushExecuteTask(service, executeEngine, pushDelayTask));
    return true;
}
```

### NamingExecuteTaskDispatcher.dispatchAndExecuteTask(Object dispatchTag, AbstractExecuteTask task)

```java
public void dispatchAndExecuteTask(Object dispatchTag, AbstractExecuteTask task) {
    //这里的executeEngine为NacosExecuteTaskExecuteEngine
    executeEngine.addTask(dispatchTag, task);
}
```

### NacosExecuteTaskExecuteEngine.addTask(Object tag, AbstractExecuteTask task)

```java
public void addTask(Object tag, AbstractExecuteTask task) {
    NacosTaskProcessor processor = getProcessor(tag);
    if (null != processor) {
        processor.process(task);
        return;
    }
    TaskExecuteWorker worker = getWorker(tag);
    worker.process(task);
}
```

### TaskExecuteWorker.process(NacosTask task)

```java
public boolean process(NacosTask task) {
    if (task instanceof AbstractExecuteTask) {
        putTask((Runnable) task);
    }
    return true;
}
```

```java
private final BlockingQueue<Runnable> queue;
private void putTask(Runnable task) {
    try {
        queue.put(task);
    } catch (InterruptedException ire) {
        log.error(ire.toString(), ire);
    }
}
```

把任务又放入了一个队列中。

从队列中取出任务的流程

```java
@Component
public class DistroTaskEngineHolder {
    
    private final DistroExecuteTaskExecuteEngine executeWorkersManager = new DistroExecuteTaskExecuteEngine();   
}
```

```java
public class DistroExecuteTaskExecuteEngine extends NacosExecuteTaskExecuteEngine {
    
    public DistroExecuteTaskExecuteEngine() {
        super(DistroExecuteTaskExecuteEngine.class.getSimpleName(), Loggers.DISTRO);
    }
}
```

```java
public NacosExecuteTaskExecuteEngine(String name, Logger logger) {
    this(name, logger, ThreadUtils.getSuitableThreadCount(1));
}
```

```java
public NacosExecuteTaskExecuteEngine(String name, Logger logger, int dispatchWorkerCount) {
    super(logger);
    executeWorkers = new TaskExecuteWorker[dispatchWorkerCount];
    for (int mod = 0; mod < dispatchWorkerCount; ++mod) {
        executeWorkers[mod] = new TaskExecuteWorker(name, mod, dispatchWorkerCount, getEngineLog());
    }
}
```

```java
public TaskExecuteWorker(final String name, final int mod, final int total, final Logger logger) {
    this.name = name + "_" + mod + "%" + total;
    this.queue = new ArrayBlockingQueue<Runnable>(QUEUE_CAPACITY);
    this.closed = new AtomicBoolean(false);
    this.log = null == logger ? LoggerFactory.getLogger(TaskExecuteWorker.class) : logger;
    new InnerWorker(name).start();
}
```

```java
private class InnerWorker extends Thread {

    InnerWorker(String name) {
        setDaemon(false);
        setName(name);
    }

    @Override
    public void run() {
        while (!closed.get()) {
            try {
                Runnable task = queue.take();
                long begin = System.currentTimeMillis();
                task.run();
                long duration = System.currentTimeMillis() - begin;
                if (duration > 1000L) {
                    log.warn("task {} takes {}ms", task, duration);
                }
            } catch (Throwable e) {
                log.error("[TASK-FAILED] " + e.toString(), e);
            }
        }
    }
}
```

分析执行的任务也就是`PushExecuteTask.run()`

## PushExecuteTask.run()

```java
public void run() {
    try {
        //构建要给客户端推送的数据，主要的是service信息和注册的host
        PushDataWrapper wrapper = generatePushData();
        //获取需要通知的客户端集合
        for (String each : getTargetClientIds()) {
            Client client = delayTaskEngine.getClientManager().getClient(each);
            if (null == client) {
                // means this client has disconnect
                continue;
            }
            //获取服务订阅者Subscriber
            Subscriber subscriber = delayTaskEngine.getClientManager().getClient(each).getSubscriber(service);
            //根据clientId从connections集合中获取连接，将变更推送给客户端
            delayTaskEngine.getPushExecutor().doPushWithCallback(each, subscriber, wrapper,
                    new NamingPushCallback(each, subscriber, wrapper.getOriginalData(), delayTask.isPushToAll()));
        }
    } catch (Exception e) {
        Loggers.PUSH.error("Push task for service" + service.getGroupedServiceName() + " execute failed ", e);
        delayTaskEngine.addTask(service, new PushDelayTask(service, 1000L));
    }
}
```

### PushExecutorRpcImpl.doPushWithCallback(String clientId, Subscriber subscriber, PushDataWrapper data,PushCallBack callBack)

```java
public void doPushWithCallback(String clientId, Subscriber subscriber, PushDataWrapper data,
        PushCallBack callBack) {
    pushService.pushWithCallback(clientId, NotifySubscriberRequest.buildSuccessResponse(data.getOriginalData()),
            callBack, GlobalExecutor.getCallbackExecutor());
}
```

```java
public void pushWithCallback(String connectionId, ServerRequest request, PushCallBack requestCallBack,
        Executor executor) {
    Connection connection = connectionManager.getConnection(connectionId);
    if (connection != null) {
        try {
            connection.asyncRequest(request, new AbstractRequestCallBack(requestCallBack.getTimeout()) {

                @Override
                public Executor getExecutor() {
                    return executor;
                }

                @Override
                public void onResponse(Response response) {
                    if (response.isSuccess()) {
                        requestCallBack.onSuccess();
                    } else {
                        requestCallBack.onFail(new NacosException(response.getErrorCode(), response.getMessage()));
                    }
                }

                @Override
                public void onException(Throwable e) {
                    requestCallBack.onFail(e);
                }
            });
        } catch (ConnectionAlreadyClosedException e) {
            connectionManager.unregister(connectionId);
            requestCallBack.onSuccess();
        } catch (Exception e) {
            Loggers.REMOTE_DIGEST
                    .error("error to send push response to connectionId ={},push response={}", connectionId,
                            request, e);
            requestCallBack.onFail(e);
        }
    } else {
        requestCallBack.onSuccess();
    }
}
```

下一篇文章分析订阅者客户端接收服务端推送的serviceInfo请求
