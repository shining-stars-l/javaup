---
slug: /tech-sharing/nacos-source/nacos-part-5
---

# Nacos服务端服务注册原理_5

回到**Nacos服务端服务注册原理_2**中，注册的逻辑

## EphemeralClientOperationServiceImpl.registerInstance(Service service, Instance instance, String clientId)

```java
public void registerInstance(Service service, Instance instance, String clientId) {
    //确保Service单例存在(从singletonRepository中取出)
    Service singleton = ServiceManager.getInstance().getSingleton(service);
    //根据客户端id，找到客户端
    Client client = clientManager.getClient(clientId);
    if (!clientIsLegal(client, clientId)) {
        return;
    }
    LOGGER.info("registerInstance execute client:{}",JSON.toJSONString(client));
    //客户端Instance模型，转换为服务端Instance模型
    InstancePublishInfo instanceInfo = getPublishInfo(instance);
    //将client、service、instance建立起关系以及发布事件
    client.addServiceInstance(singleton, instanceInfo);
    client.setLastUpdatedTime();
    //建立Service与ClientId的关系
    //发布注册事件
    NotifyCenter.publishEvent(new ClientOperationEvent.ClientRegisterServiceEvent(singleton, clientId));
    NotifyCenter
            .publishEvent(new MetadataEvent.InstanceMetadataEvent(singleton, instanceInfo.getMetadataId(), false));
}
```

重点分析`client.addServiceInstance(singleton, instanceInfo)`，此方法的作用就是发布ClientChangeEvent事件，用来向集群中其他节点增量同步新增的Client信息

### AbstractClient.addServiceInstance(Service service, InstancePublishInfo instancePublishInfo)

```java
public boolean addServiceInstance(Service service, InstancePublishInfo instancePublishInfo) {
    if (null == publishers.put(service, instancePublishInfo)) {
        //监控指标自增实例数
        MetricsMonitor.incrementInstanceCount();
    }
    NotifyCenter.publishEvent(new ClientEvent.ClientChangedEvent(this));
    Loggers.SRV_LOG.info("Client change for service {}, {}", service, getClientId());
    return true;
}
```

可以看到这里确实发布了`ClientChangedEvent`事件，后续的事件处理流程相同这里不再赘述，最终还是会执行到`NamingEventPublisher.handleEvent(Event event)`

### NamingEventPublisher.handleEvent(Event event)

```java
private void handleEvent(Event event) {
    Class<? extends Event> eventType = event.getClass();
    //这里subscribers集合里只有一个元素是DistroClientDataProcessor
    Set<Subscriber<? extends Event>> subscribers = subscribes.get(eventType);
    if (null == subscribers) {
        if (Loggers.EVT_LOG.isDebugEnabled()) {
            Loggers.EVT_LOG.debug("[NotifyCenter] No subscribers for slow event {}", eventType.getName());
        }
        return;
    }
    for (Subscriber subscriber : subscribers) {
        notifySubscriber(subscriber, event);
    }
}
```

```java
public void notifySubscriber(Subscriber subscriber, Event event) {
    if (Loggers.EVT_LOG.isDebugEnabled()) {
        Loggers.EVT_LOG.debug("[NotifyCenter] the {} will received by {}", event, subscriber);
    }
    final Runnable job = () -> {
        subscriber.onEvent(event);
    };
    final Executor executor = subscriber.executor();
    if (executor != null) {
        executor.execute(job);
    } else {
        try {
            job.run();
        } catch (Throwable e) {
            Loggers.EVT_LOG.error("Event callback exception: ", e);
        }
    }
}
```

这里队列放入任务和之后的取出已经分析过了，这里不再赘述，直接进入`DistroClientDataProcessor.onEvent(Event event)`

### DistroClientDataProcessor.onEvent(Event event)

```java
public void onEvent(Event event) {
	//如果是单机模式则直接返回
    if (EnvUtil.getStandaloneMode()) {
        return;
    }
    if (!upgradeJudgement.isUseGrpcFeatures()) {
        return;
    }
    if (event instanceof ClientEvent.ClientVerifyFailedEvent) {
    	//将ClientVerifyFailedEvent同步给校验失败的节点，操作类型为ADD
        syncToVerifyFailedServer((ClientEvent.ClientVerifyFailedEvent) event);
    } else {
    	//增量同步给集群中其他节点
        syncToAllServer((ClientEvent) event);
    }
}
```

### DistroClientDataProcessor.syncToAllServer(ClientEvent event)

```java
private void syncToAllServer(ClientEvent event) {
    Client client = event.getClient();
    // 只有通过Distro进行临时节点的数据同步，持久节点应该通过raft进行同步
    if (null == client || !client.isEphemeral() || !clientManager.isResponsibleClient(client)) {
        return;
    }
    if (event instanceof ClientEvent.ClientDisconnectEvent) {
    	//当客户端断开连接事件ClientDisconnectEvent时，向其他节点同步DELETE操作
        DistroKey distroKey = new DistroKey(client.getClientId(), TYPE);
        distroProtocol.sync(distroKey, DataOperation.DELETE);
    } else if (event instanceof ClientEvent.ClientChangedEvent) {
    	//当客户端变更事件ClientChangedEvent时，向其他节点同步CHANGE操作
        DistroKey distroKey = new DistroKey(client.getClientId(), TYPE);
        distroProtocol.sync(distroKey, DataOperation.CHANGE);
    }
}
```

### DistroProtocol.sync(distroKey, DataOperation.CHANGE)

```java
public void sync(DistroKey distroKey, DataOperation action) {
    sync(distroKey, action, DistroConfig.getInstance().getSyncDelayMillis());
}

public void sync(DistroKey distroKey, DataOperation action, long delay) {
    for (Member each : memberManager.allMembersWithoutSelf()) {
        syncToTarget(distroKey, action, each.getAddress(), delay);
    }
}
```

### DistroProtocol.syncToTarget(distroKey, action, each.getAddress(), delay)

```java
public void syncToTarget(DistroKey distroKey, DataOperation action, String targetServer, long delay) {
    DistroKey distroKeyWithTarget = new DistroKey(distroKey.getResourceKey(), distroKey.getResourceType(),
            targetServer);
    DistroDelayTask distroDelayTask = new DistroDelayTask(distroKeyWithTarget, action, delay);
    distroTaskEngineHolder.getDelayTaskExecuteEngine().addTask(distroKeyWithTarget, distroDelayTask);
    if (Loggers.DISTRO.isDebugEnabled()) {
        Loggers.DISTRO.debug("[DISTRO-SCHEDULE] {} to {}", distroKey, targetServer);
    }
}
```

### NacosDelayTaskExecuteEngine.addTask(Object key, AbstractDelayTask newTask)

```java
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
```

可以看到到这里仍然是放入`tasks`中，然后定时任务来取出执行。

## 从tasks取任务执行

tasks中的任务是定时任务来取出执行，下面分析定时任务的构建
**DistroTaskEngineHolder**

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

**DistroDelayTaskExecuteEngine**

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

**NacosDelayTaskExecuteEngine**

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

**DistroDelayTaskProcessor.process(NacosTask task)**

```java
@Override
public boolean process(NacosTask task) {
    if (!(task instanceof DistroDelayTask)) {
        return true;
    }
    DistroDelayTask distroDelayTask = (DistroDelayTask) task;
    DistroKey distroKey = distroDelayTask.getDistroKey();
    switch (distroDelayTask.getAction()) {
    	// 删除操作
        case DELETE: 
            DistroSyncDeleteTask syncDeleteTask = new DistroSyncDeleteTask(distroKey, distroComponentHolder);
            distroTaskEngineHolder.getExecuteWorkersManager().addTask(distroKey, syncDeleteTask);
            return true;
        // 更新和新增操作    
        case CHANGE:
        case ADD: 
            DistroSyncChangeTask syncChangeTask = new DistroSyncChangeTask(distroKey, distroComponentHolder);
            distroTaskEngineHolder.getExecuteWorkersManager().addTask(distroKey, syncChangeTask);
            return true;
        default:
            return false;
    }
}
```

**NacosExecuteTaskExecuteEngine.addTask(Object tag, AbstractExecuteTask task)**

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

这个`addTask`放入队列中的操作和nacos服务端服务注册原理_3文章相同，这里就不在赘述了。详细请看 `nacos服务端服务注册原理_3(向订阅该服务的订阅者发起推送serviceInfo请求)`

最终还是会执行到`DistroSyncChangeTask的run方法中`

## DistroSyncChangeTask.run()

```java
public class DistroSyncChangeTask extends AbstractDistroExecuteTask
```

```java
public abstract class AbstractDistroExecuteTask extends AbstractExecuteTask {
    
    private final DistroKey distroKey;
    
    private final DistroComponentHolder distroComponentHolder;
    
    protected AbstractDistroExecuteTask(DistroKey distroKey, DistroComponentHolder distroComponentHolder) {
        this.distroKey = distroKey;
        this.distroComponentHolder = distroComponentHolder;
    }
    
    protected DistroKey getDistroKey() {
        return distroKey;
    }
    
    protected DistroComponentHolder getDistroComponentHolder() {
        return distroComponentHolder;
    }
    
    @Override
    public void run() {
        String type = getDistroKey().getResourceType();
        DistroTransportAgent transportAgent = distroComponentHolder.findTransportAgent(type);
        if (null == transportAgent) {
            Loggers.DISTRO.warn("No found transport agent for type [{}]", type);
            return;
        }
        Loggers.DISTRO.info("[DISTRO-START] {}", toString());
        if (transportAgent.supportCallbackTransport()) {
            doExecuteWithCallback(new DistroExecuteCallback());
        } else {
            executeDistroTask();
        }
    }

}
```

`doExecuteWithCallback(new DistroExecuteCallback())`和`executeDistroTask()`的区别在于是否存在回调，其他大致相同，这里就分析没有回调的流程

### DistroSyncChangeTask.executeDistroTask()

```java
private void executeDistroTask() {
     try {
         boolean result = doExecute();
         if (!result) {
             handleFailedTask();
         }
         Loggers.DISTRO.info("[DISTRO-END] {} result: {}", toString(), result);
     } catch (Exception e) {
         Loggers.DISTRO.warn("[DISTRO] Sync data change failed.", e);
         handleFailedTask();
     }
 }
```

```java
protected boolean doExecute() {
    String type = getDistroKey().getResourceType();
    DistroData distroData = getDistroData(type);
    if (null == distroData) {
        Loggers.DISTRO.warn("[DISTRO] {} with null data to sync, skip", toString());
        return true;
    }
    return getDistroComponentHolder().findTransportAgent(type)
            .syncData(distroData, getDistroKey().getTargetServer());
}
```

`syncData`的作用就是向指定的集群节点同步更新数据，这里分为http和grpc

### http方式 DistroHttpAgent.syncData(DistroData data, String targetServer)

```java
public boolean syncData(DistroData data, String targetServer) {
    if (!memberManager.hasMember(targetServer)) {
        return true;
    }
    byte[] dataContent = data.getContent();
    return NamingProxy.syncData(dataContent, data.getDistroKey().getTargetServer());
}
```

### grpc方式 DistroClientTransportAgent.syncData(DistroData data, String targetServer)

```java
public boolean syncData(DistroData data, String targetServer) {
    if (isNoExistTarget(targetServer)) {
        return true;
    }
    // 构造请求数据并设置数据类型
    DistroDataRequest request = new DistroDataRequest(data, data.getType());
    // 查找目标节点缓存数据
    Member member = memberManager.find(targetServer);
    // 节点状态检查需UP状态，即：可通信状态
    if (checkTargetServerStatusUnhealthy(member)) {
        Loggers.DISTRO.warn("[DISTRO] Cancel distro sync caused by target server {} unhealthy", targetServer);
        return false;
    }
    try {
    	// 向目标节点发送数据
        Response response = clusterRpcClientProxy.sendRequest(member, request);
        return checkResponse(response);
    } catch (NacosException e) {
        Loggers.DISTRO.error("[DISTRO-FAILED] Sync distro data failed! ", e);
    }
    return false;
}
```

向集群中其他节点增量同步新增的Client信息的逻辑就分析到这里，下一篇会分析集群中其他节点收到这些请求处理的逻辑。
