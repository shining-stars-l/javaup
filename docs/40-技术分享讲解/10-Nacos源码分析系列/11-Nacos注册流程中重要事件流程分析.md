---
slug: /tech-sharing/nacos-source/nacos/event
---

# Nacos注册流程中重要事件流程分析

当nacos接收到服务的注册或者注销后，要执行一系列的动作，比如添加进nacos的服务中，或者从nacos的服务中剔除，通知订阅此服务的客户端。这些动作都是靠一些事件来执行的，由于本人有业务需求要对nacos进行改造，在之前的文章中有对nacos整个流程都做完整的分析，而此文章的重点是分析整个nacos接收服务注册后的详细流程，把这些重要的事件梳理出来

## nacos版本

2.2.0

## 分析

以注册流程为例

### EphemeralClientOperationServiceImpl

```java
public void registerInstance(Service service, Instance instance, String clientId) throws NacosException {
	//确保Service单例存在，注意Service的equals和hasCode方法
    Service singleton = ServiceManager.getInstance().getSingleton(service);
    //省略。。。
    NotifyCenter.publishEvent(new ClientOperationEvent.ClientRegisterServiceEvent(singleton, clientId));
    NotifyCenter.publishEvent(
            new MetadataEvent.InstanceMetadataEvent(singleton, batchInstancePublishInfo.getMetadataId(), false));
}
```

- `Service singleton = ServiceManager.getInstance().getSingleton(service)`存放本地列表
- 发布了`NotifyCenter.publishEvent(new ClientOperationEvent.ClientRegisterServiceEvent(singleton, clientId))`事件

### Service singleton = ServiceManager.getInstance().getSingleton(service)

```java
public Service getSingleton(Service service) {
    singletonRepository.computeIfAbsent(service, key -> {
        NotifyCenter.publishEvent(new MetadataEvent.ServiceMetadataEvent(service, false));
        return service;
    });
    Service result = singletonRepository.get(service);
    namespaceSingletonMaps.computeIfAbsent(result.getNamespace(), namespace -> new ConcurrentHashSet<>());
    namespaceSingletonMaps.get(result.getNamespace()).add(result);
    return result;
}
```

`namespaceSingletonMaps`就是本地的服务缓存列表，nacos控制台的服务列表查看就是通过此列表查看的

### NotifyCenter.publishEvent(new ClientOperationEvent.ClientRegisterServiceEvent(singleton, clientId))事件

此事件是将服务注册到缓存列表中，以及通知订阅了服务的客户端

- 此事件执行后又会发布一个`ServiceEvent.ServiceChangedEvent`事件
- 接着会执行到`com.alibaba.nacos.naming.core.v2.index.ClientServiceIndexesManager#onEvent`

```java
public void onEvent(Event event) {
    if (event instanceof ClientEvent.ClientDisconnectEvent) {
        handleClientDisconnect((ClientEvent.ClientDisconnectEvent) event);
    } else if (event instanceof ClientOperationEvent) {
        //注册走这个分支
        handleClientOperation((ClientOperationEvent) event);
    }
}
```

```java
private void handleClientOperation(ClientOperationEvent event) {
    Service service = event.getService();
    String clientId = event.getClientId();
    if (event instanceof ClientOperationEvent.ClientRegisterServiceEvent) {
        //注册走这个分支
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
    //存放到本地发布者的缓存中
    //publisherIndexes维护Service与发布clientId列表的映射关系，当有新的clientId注册，将clientId添加到clientId列表中
    //另外还有个subscriberIndexes，维护Service与订阅clientId列表的映射关系，当有clientId断开连接或取消订阅，将clientId从clientId列表中移除
    publisherIndexes.computeIfAbsent(service, key -> new ConcurrentHashSet<>());
    publisherIndexes.get(service).add(clientId);
    //继续发布事件
    NotifyCenter.publishEvent(new ServiceEvent.ServiceChangedEvent(service, true));
}
```

`ServiceEvent.ServiceChangedEvent` 此事件添加后会执行到`com.alibaba.nacos.naming.push.v2.NamingSubscriberServiceV2Impl#onEvent`

```java
public void onEvent(Event event) {
    if (event instanceof ServiceEvent.ServiceChangedEvent) {
        // If service changed, push to all subscribers.
        ServiceEvent.ServiceChangedEvent serviceChangedEvent = (ServiceEvent.ServiceChangedEvent) event;
        //拿到service
        Service service = serviceChangedEvent.getService();
        //将Service封装成PushDelayTask事件然后添加到延迟任务引擎里面
        //delayTaskEngine的类型为PushDelayTaskExecuteEngine
        delayTaskEngine.addTask(service, new PushDelayTask(service, PushConfig.getInstance().getPushTaskDelay()));
        MetricsMonitor.incrementServiceChangeCount(service.getNamespace(), service.getGroup(), service.getName());
    } else if (event instanceof ServiceEvent.ServiceSubscribedEvent) {
        // If service is subscribed by one client, only push this client.
        ServiceEvent.ServiceSubscribedEvent subscribedEvent = (ServiceEvent.ServiceSubscribedEvent) event;
        Service service = subscribedEvent.getService();
        delayTaskEngine.addTask(service, new PushDelayTask(service, PushConfig.getInstance().getPushTaskDelay(),
                subscribedEvent.getClientId()));
    }
}
```

```java
public void addTask(Object key, AbstractDelayTask newTask) {
    lock.lock();
    try {
        AbstractDelayTask existTask = tasks.get(key);
        if (null != existTask) {
            newTask.merge(existTask);
        }
        //将PushDelayTask事件放进tasks中
        tasks.put(key, newTask);
    } finally {
        lock.unlock();
    }
}
```

**PushDelayTaskExecuteEngine**

我们要分析这个引擎，它就是不断从`tasks`取出来执行

`PushDelayTaskExecuteEngine`继承了`NacosDelayTaskExecuteEngine`

```java
public class NacosDelayTaskExecuteEngine extends AbstractNacosTaskExecuteEngine<AbstractDelayTask> {
    
    private final ScheduledExecutorService processingExecutor;
    
    protected final ConcurrentHashMap<Object, AbstractDelayTask> tasks;
    
    protected final ReentrantLock lock = new ReentrantLock();
    
    public NacosDelayTaskExecuteEngine(String name) {
        this(name, null);
    }
    
    public NacosDelayTaskExecuteEngine(String name, Logger logger) {
        this(name, 32, logger, 100L);
    }
    
    public NacosDelayTaskExecuteEngine(String name, Logger logger, long processInterval) {
        this(name, 32, logger, processInterval);
    }
    
    public NacosDelayTaskExecuteEngine(String name, int initCapacity, Logger logger) {
        this(name, initCapacity, logger, 100L);
    }
    
    public NacosDelayTaskExecuteEngine(String name, int initCapacity, Logger logger, long processInterval) {
        super(logger);
        tasks = new ConcurrentHashMap<>(initCapacity);
        processingExecutor = ExecutorFactory.newSingleScheduledExecutorService(new NameThreadFactory(name));
        processingExecutor
                .scheduleWithFixedDelay(new ProcessRunnable(), processInterval, processInterval, TimeUnit.MILLISECONDS);
    }


    public void addTask(Object key, AbstractDelayTask newTask) {
        lock.lock();
        try {
            AbstractDelayTask existTask = tasks.get(key);
            if (null != existTask) {
                newTask.merge(existTask);
            }
            tasks.put(key, newTask);
        } finally {
            lock.unlock();
        }
    }
    
    /**
     * process tasks in execute engine.
     */
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
                getEngineLog().error("Nacos task execute error ", e);
                retryFailedTask(taskKey, task);
            }
        }
    }


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
}
```

-  可以看到刚才的把PushDelayTask事件然后添加到延迟任务引擎里面这个动作，其实就是`NacosDelayTaskExecuteEngine`做的 
-  当`NacosDelayTaskExecuteEngine`创建时，会创建一个`processingExecutor`定时线程池 
-  然后这个线程池不断的执行`processTasks()`方法，从`tasks`取出执行 

现在来分析方法`com.alibaba.nacos.common.task.engine.NacosDelayTaskExecuteEngine#getAllTaskKeys`

```java
public Collection<Object> getAllTaskKeys() {
    Collection<Object> keys = new HashSet<>();
    lock.lock();
    try {
        keys.addAll(tasks.keySet());
    } finally {
        lock.unlock();
    }
    return keys;
}
```

取出任务后执行`com.alibaba.nacos.common.task.engine.NacosDelayTaskExecuteEngine#processTasks`

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
            getEngineLog().error("Nacos task execute error ", e);
            retryFailedTask(taskKey, task);
        }
    }
}
```

处理`com.alibaba.nacos.naming.push.v2.task.PushDelayTaskExecuteEngine.PushDelayTaskProcessor#process`

```java
public boolean process(NacosTask task) {
    PushDelayTask pushDelayTask = (PushDelayTask) task;
    Service service = pushDelayTask.getService();
    //NamingExecuteTaskDispatcher为分配任务执行
    NamingExecuteTaskDispatcher.getInstance()
            .dispatchAndExecuteTask(service, new PushExecuteTask(service, executeEngine, pushDelayTask));
    return true;
}
```

### 总结

- 服务注册后，执行`NotifyCenter.publishEvent(new ClientOperationEvent.ClientRegisterServiceEvent(singleton, clientId))`发布`ClientOperationEvent.ClientRegisterServiceEvent`事件
- 然后注册事件的订阅者`ClientServiceIndexesManager`，又执行了`NotifyCenter.publishEvent(new ServiceEvent.ServiceChangedEvent(service, true))`发布了`ServiceChangedEvent`事件
- 另一个事件订阅者`NamingSubscriberServiceV2Impl`将`ServiceChangedEvent`事件包装成`PushDelayTask`放进了`delayTaskEngine`延迟处理引擎中
- 这个延迟处理引擎其实就是定制线程池，会定制处理`PushDelayTask`

让我们在来回顾下这个方法`NamingExecuteTaskDispatcher.getInstance().dispatchAndExecuteTask...`

### NamingExecuteTaskDispatcher

```java
public class NamingExecuteTaskDispatcher {
    
    private static final NamingExecuteTaskDispatcher INSTANCE = new NamingExecuteTaskDispatcher();
    
    private final NacosExecuteTaskExecuteEngine executeEngine;
    
    private NamingExecuteTaskDispatcher() {
        executeEngine = new NacosExecuteTaskExecuteEngine(EnvUtil.FUNCTION_MODE_NAMING, Loggers.SRV_LOG);
    }
    
    public static NamingExecuteTaskDispatcher getInstance() {
        return INSTANCE;
    }
    
    public void dispatchAndExecuteTask(Object dispatchTag, AbstractExecuteTask task) {
        executeEngine.addTask(dispatchTag, task);
    }
    
    public String workersStatus() {
        return executeEngine.workersStatus();
    }
    
    public void destroy() throws Exception {
        executeEngine.shutdown();
    }
}
```

能够看到其实是调用到了`executeEngine.addTask(dispatchTag, task)`

```java
public void addTask(Object tag, AbstractExecuteTask task) {
    NacosTaskProcessor processor = getProcessor(tag);
    if (null != processor) {
        processor.process(task);
        return;
    }
    TaskExecuteWorker worker = getWorker(tag);
    //进行这里进行处理
    worker.process(task);
}

private TaskExecuteWorker getWorker(Object tag) {
    int idx = (tag.hashCode() & Integer.MAX_VALUE) % workersCount();
    return executeWorkers[idx];
}
```

- `executeWorkers`其实就是自定义的线程
- `worker.process(task)`来处理任务

`com.alibaba.nacos.common.task.engine.TaskExecuteWorker#process`

```java
private final BlockingQueue<Runnable> queue;

public TaskExecuteWorker(final String name, final int mod, final int total, final Logger logger) {
    this.name = name + "_" + mod + "%" + total;
    this.queue = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
    this.closed = new AtomicBoolean(false);
    this.log = null == logger ? LoggerFactory.getLogger(TaskExecuteWorker.class) : logger;
    realWorker = new InnerWorker(this.name);
    realWorker.start();
}

public boolean process(NacosTask task) {
    if (task instanceof AbstractExecuteTask) {
        putTask((Runnable) task);
    }
    return true;
}

private void putTask(Runnable task) {
    try {
        queue.put(task);
    } catch (InterruptedException ire) {
        log.error(ire.toString(), ire);
    }
}
```

将`PushExecuteTask`放进了`queue`本地队列中，然后另一个线程会不断循环的从`queue`取出

`com.alibaba.nacos.common.task.engine.TaskExecuteWorker.InnerWorker#run`

```java
public void run() {
    while (!closed.get()) {
        try {
            //task类型为PushExecuteTask
            Runnable task = queue.take();
            long begin = System.currentTimeMillis();
            task.run();
            long duration = System.currentTimeMillis() - begin;
            if (duration > 1000L) {
                log.warn("task {} takes {}ms", task, duration);
            }
        } catch (Throwable e) {
            log.error("[TASK-FAILED] " + e, e);
        }
    }
}
```

task.run()会执行到PushExecuteTask.run()

```java
public void run() {
    try {
        //将推送的数据包装起来
        PushDataWrapper wrapper = generatePushData();
        if (!StringUtils.isEmpty(notifyService) && PushConstants.NOTIFY_SERVICE.equals(notifyService)) {
            wrapper = generatePushData(notifyService);
        }
        ClientManager clientManager = delayTaskEngine.getClientManager();
        for (String each : getTargetClientIds()) {
            Client client = clientManager.getClient(each);
            if (null == client) {
                // means this client has disconnect
                continue;
            }
            //拿到客户端的订阅者
            Subscriber subscriber = clientManager.getClient(each).getSubscriber(service);
            delayTaskEngine.getPushExecutor().doPushWithCallback(each, subscriber, wrapper,
                    new ServicePushCallback(each, subscriber, wrapper.getOriginalData(), delayTask.isPushToAll()));
        }
    } catch (Exception e) {
        Loggers.PUSH.error("Push task for service" + service.getGroupedServiceName() + " execute failed ", e);
        delayTaskEngine.addTask(service, new PushDelayTask(service, 1000L));
    }
}
```

然后开始通知订阅此服务的客户端了和Nacos集群数据同步

### 总结

- 将`PushDelayTask`任务保证成了`PushExecuteTask`
- 将`PushExecuteTask`，交由`NamingExecuteTaskDispatcher`处理，`NamingExecuteTaskDispatcher`又会交给`NacosExecuteTaskExecuteEngine`处理
- `NacosExecuteTaskExecuteEngine`将`PushExecuteTask`任务放进了本地队列`queue`
- `NacosExecuteTaskExecuteEngine`中的线程`TaskExecuteWorker`不断的循环从本地队列`queue`取出任务然后处理
