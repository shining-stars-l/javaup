---
slug: /tech-sharing/nacos-source/nacos-part-2
---

# Nacos服务端服务注册原理_2
## 三种事件类型

- **ClientRegisterServiceEvent** 
   - 当注册请求到服务端时，服务端会给订阅该服务的Clients发送推送请求，通知实例变了。
   - 当注册请求到服务端时，服务端发布了客户端注册事件`ClientRegisterServiceEvent`。
   - `ClientRegisterServiceEvent`事件被`ClientServiceIndexesManager`订阅后发布服务变更事件`ServiceChangedEvent`。
   - `ServiceChangedEvent`被`NamingSubscriberServiceV2Impl`订阅，创建`PushDelayTask`被`PushExecuteTask`执行，负责向订阅该服务的订阅者发起推送serviceInfo请求。
   - 推送的请求被`NamingPushRequestHandler`处理并发布`InstancesChangeEvent`，最终回调到我们的代码逻辑`AbstractEventListener`。

- **ClientChangedEvent** 
   - 当注册请求到服务端时，该节点会向集群中其他节点增量同步新增的Client信息
   - 当注册请求到服务端时，发布`ClientChangedEvent`事件
   - 该事件被`DistroClientDataProcessor`订阅发起与其他节点的增量同步

- **InstanceMetadataEvent** 
   - 当注册请求到服务端时，发布`ClientChangedEvent`事件，属性expired为false
   - `NamingMetadataManager`订阅了该事件主要判断元数据是否过期

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

## NotifyCenter.publishEvent(new ClientOperationEvent.ClientRegisterServiceEvent(singleton, clientId))

```java
private static boolean publishEvent(final Class<? extends Event> eventType, final Event event) {
    if (ClassUtils.isAssignableFrom(SlowEvent.class, eventType)) {
        return INSTANCE.sharePublisher.publish(event);
    }
    //这里的topic为ClientOperationEvent.ClientRegisterServiceEvent
    final String topic = ClassUtils.getCanonicalName(eventType);
    //根据topic从INSTANCE.publisherMap获取对象的事件发布者
    //这里的publisher实际为NamingEventPublisher
    EventPublisher publisher = INSTANCE.publisherMap.get(topic);
    if (publisher != null) {
        return publisher.publish(event);
    }
    LOGGER.warn("There are no [{}] publishers for this event, please register", topic);
    return false;
}
```

## 事件发布者的管理缓存INSTANCE.publisherMap

在发布的时候从`INSTANCE.publisherMap`拿到了对应的`EventPublisher`，下面分析下
`INSTANCE.publisherMap`事件发布者是什么时候放入的。

**ClientServiceIndexesManager**

```java
@Component
public class ClientServiceIndexesManager extends SmartSubscriber {
    
    private final ConcurrentMap<Service, Set<String>> publisherIndexes = new ConcurrentHashMap<>();
    
    private final ConcurrentMap<Service, Set<String>> subscriberIndexes = new ConcurrentHashMap<>();
    
    public ClientServiceIndexesManager() {
        NotifyCenter.registerSubscriber(this, NamingEventPublisherFactory.getInstance());
    }
}
```

`ClientServiceIndexesManager`被spring管理，加载bean执行构造方法时会执行`NotifyCenter.registerSubscriber(this, NamingEventPublisherFactory.getInstance()`

```java
public static void registerSubscriber(final Subscriber consumer, final EventPublisherFactory factory) {
    // If you want to listen to multiple events, you do it separately,
    // based on subclass's subscribeTypes method return list, it can register to publisher.
    if (consumer instanceof SmartSubscriber) {
        //((SmartSubscriber) consumer).subscribeTypes()获得注册、注销、订阅、取消订阅的事件发布者，
        //这里的consumer实际类型为ClientServiceIndexesManager
        for (Class<? extends Event> subscribeType : ((SmartSubscriber) consumer).subscribeTypes()) {
            // For case, producer: defaultSharePublisher -> consumer: smartSubscriber.
            if (ClassUtils.isAssignableFrom(SlowEvent.class, subscribeType)) {
                INSTANCE.sharePublisher.addSubscriber(consumer, subscribeType);
            } else {
                //会执行到这里将注册事件发布者放入进去
                addSubscriber(consumer, subscribeType, factory);
            }
        }
        return;
    }
    
    final Class<? extends Event> subscribeType = consumer.subscribeType();
    if (ClassUtils.isAssignableFrom(SlowEvent.class, subscribeType)) {
        INSTANCE.sharePublisher.addSubscriber(consumer, subscribeType);
        return;
    }
    
    addSubscriber(consumer, subscribeType, factory);
}
```

**((SmartSubscriber) consumer).subscribeTypes()**

```java
public List<Class<? extends Event>> subscribeTypes() {
    List<Class<? extends Event>> result = new LinkedList<>();
    result.add(ClientOperationEvent.ClientRegisterServiceEvent.class);
    result.add(ClientOperationEvent.ClientDeregisterServiceEvent.class);
    result.add(ClientOperationEvent.ClientSubscribeServiceEvent.class);
    result.add(ClientOperationEvent.ClientUnsubscribeServiceEvent.class);
    result.add(ClientEvent.ClientDisconnectEvent.class);
    return result;
}
```

到这里可以看到有注册、注销、订阅、取消订阅的事件发布者

**NotifyCenter.addSubscriber(consumer, subscribeType, factory)**

```java
private static void addSubscriber(final Subscriber consumer, Class<? extends Event> subscribeType,
        EventPublisherFactory factory) {

    final String topic = ClassUtils.getCanonicalName(subscribeType);
    synchronized (NotifyCenter.class) {
        //在这里就会将上述的几种事件发布者放入到INSTANCE.publisherMap中，
        MapUtil.computeIfAbsent(INSTANCE.publisherMap, topic, factory, subscribeType, ringBufferSize);
    }
    EventPublisher publisher = INSTANCE.publisherMap.get(topic);
    if (publisher instanceof ShardedEventPublisher) {
        //这里就会将几种订阅者放入订阅者集合中。
        ((ShardedEventPublisher) publisher).addSubscriber(consumer, subscribeType);
    } else {
        publisher.addSubscriber(consumer);
    }
}
```

到这里就将`INSTANCE.publisherMap`存放事件发布者的流程分析完毕，下面接着回到事件发布的流程`publisher.publish(event)`。

## publisher.publish(event)

**NamingEventPublisher**

```java
public boolean publish(Event event) {
    checkIsStart();
    boolean success = this.queue.offer(event);
    if (!success) {
        Loggers.EVT_LOG.warn("Unable to plug in due to interruption, synchronize sending time, event : {}", event);
        handleEvent(event);
        return true;
    }
    return true;
}
```

到这里可以看到的逻辑是往事件放入阻塞队列里面。如果放入失败那么就直接执行`handleEvent(event)`，从队列中取出事件执行的方法也是`handleEvent(event)`，那么就可以理解成如果放入队列失败的话就立即执行。

## 分析事件放入队列成功后，如何从队列中取出事件的流程

![](/img/technologySharing/nacos/从队列中取出事件的流程.png)
可以看出`DistroClientComponentRegistry`被`@Component`修饰，`doRegister()`被`@PostConstruct`修饰，spring容器启动后会执行此方法。一直会调动到`NamingEventPublisher.run()`。

**NamingEventPublisher.run()**

```java
public void run() {
    try {
        //延时效果，启动后最多是延时60秒，
        //这段时间内隔1秒判断一下当前线程是否关闭，是否有订阅者，是否超过60秒。
        //如果满足一个条件，就可以提前跳出死循环
        waitSubscriberForInit();
        //真正的处理逻辑，死循环不断从队列中取出事件执行handleEvent(event)
        handleEvents();
    } catch (Exception e) {
        Loggers.EVT_LOG.error("Naming Event Publisher {}, stop to handle event due to unexpected exception: ",
                this.publisherName, e);
    }
}
```

```java
private void waitSubscriberForInit() {
    // To ensure that messages are not lost, enable EventHandler when
    // waiting for the first Subscriber to register
    for (int waitTimes = DEFAULT_WAIT_TIME; waitTimes > 0; waitTimes--) {
        if (shutdown || !subscribes.isEmpty()) {
            break;
        }
        ThreadUtils.sleep(1000L);
    }
}
```

```java
private void handleEvents() {
    while (!shutdown) {
        try {
            final Event event = queue.take();
            handleEvent(event);
        } catch (InterruptedException e) {
            Loggers.EVT_LOG.warn("Naming Event Publisher {} take event from queue failed:", this.publisherName, e);
        }
    }
}
```

## NamingEventPublisher.handleEvent(Event event)

```java
private void handleEvent(Event event) {
    Class<? extends Event> eventType = event.getClass();
    //根据事件获取相应的订阅执行
    //这时subscribers集合中只有一个元素为ClientServiceIndexesManager 
    Set<Subscriber<? extends Event>> subscribers = subscribes.get(eventType);
    if (null == subscribers) {
        if (Loggers.EVT_LOG.isDebugEnabled()) {
            Loggers.EVT_LOG.debug("[NotifyCenter] No subscribers for slow event {}", eventType.getName());
        }
        return;
    }
    //subscribers集合一个元素:
    // ClientServiceIndexesManager 向订阅该服务的订阅者发起推送serviceInfo请求
    for (Subscriber subscriber : subscribers) {
        notifySubscriber(subscriber, event);
    }
}
```

这个逻辑就是循环订阅者集合`subscribers`然后执行通知订阅者的方法。

`subscribers`中的订阅者集合是什么时候添加进入的呢？其实和刚才的存放事件发布者缓存的流程在一起，方法是`((ShardedEventPublisher) publisher).addSubscriber(consumer, subscribeType)`可翻阅进行查看。

将订阅事件、发布者、订阅者三者进行绑定。而发布者与事件通过Map进行维护、发布者与订阅者通过关联关系进行维护。下面分析notifySubscriber。

## NamingEventPublisher.notifySubscriber(subscriber, event)

循环`subscribers`集合，调用`notifySubscriber(subscriber, event)`，`subscriber`为集合中的每个元素。也就是`DistroClientDataProcessor、ClientServiceIndexesManager、NamingMetadataManager`调用每个元素中的`onEvent(event)`方法。

```java
public void notifySubscriber(Subscriber subscriber, Event event) {
    if (Loggers.EVT_LOG.isDebugEnabled()) {
        Loggers.EVT_LOG.debug("[NotifyCenter] the {} will received by {}", event, subscriber);
    }
    //订阅者执行时间
    final Runnable job = () -> {
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

下一篇文章分析`ClientServiceIndexesManager`向订阅该服务的订阅者发起推送serviceInfo请求。
