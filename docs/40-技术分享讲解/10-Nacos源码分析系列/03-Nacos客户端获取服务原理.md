---
slug: /tech-sharing/nacos-source/nacos/client
---

# Nacos客户端获取服务原理

## NacosNamingService.selectInstances(String serviceName, String groupName, List clusters, boolean healthy, boolean subscribe)

此方法在ribbon的加载原理的文章中提到过，是ribbon定时任务更新缓存时从nacos拉取调用的方法，此流程在这里会进行详细分析。

```java
public List<Instance> selectInstances(String serviceName, String groupName, List<String> clusters, boolean healthy,
        boolean subscribe) throws NacosException {

    ServiceInfo serviceInfo;
    String clusterString = StringUtils.join(clusters, ",");
    // 是否为订阅模式
    if (subscribe) {
        // 先从本地缓存获取服务信息
        serviceInfo = serviceInfoHolder.getServiceInfo(serviceName, groupName, clusterString);
        // 如果本地缓存不存在服务信息，则进行订阅
        if (null == serviceInfo) {
            serviceInfo = clientProxy.subscribe(serviceName, groupName, clusterString);
        }
    } else {
        // 如果未订阅服务信息，则直接从服务器进行查询
        serviceInfo = clientProxy.queryInstancesOfService(serviceName, groupName, clusterString, 0, false);
    }
    // 从服务信息中获取实例列表
    return selectInstances(serviceInfo, healthy);
}
```

### 总结：

1. 是否为订阅模式，不是的话直接从服务器查询
2. 是订阅模式，先从本地缓存获取，存在直接返回
3. 本地缓存为空的话，进行订阅(第一次进来缓存肯定是空就会进行订阅)。

## serviceInfoHolder.getServiceInfo(serviceName, groupName, clusterString) 从本地缓存获取

```java
private final ConcurrentMap<String, ServiceInfo> serviceInfoMap;

public ServiceInfo getServiceInfo(final String serviceName, final String groupName, final String clusters) {
    NAMING_LOGGER.debug("failover-mode: " + failoverReactor.isFailoverSwitch());
    String groupedServiceName = NamingUtils.getGroupedName(serviceName, groupName);
    String key = ServiceInfo.getKey(groupedServiceName, clusters);
    if (failoverReactor.isFailoverSwitch()) {
        return failoverReactor.getService(key);
    }
    return serviceInfoMap.get(key);
}
```

可以看到获取缓存的方法里面实际存放缓存的是`serviceInfoMap`，是`ConcurrentMap`结构，key为服务名，value为服务实例。一开始是为空的话，需要进行订阅后会往里设值。

## clientProxy.subscribe(serviceName, groupName, clusterString) 订阅机制

NamingClientProxyDelegate.subscribe(String serviceName, String groupName, String clusters)

```java
public ServiceInfo subscribe(String serviceName, String groupName, String clusters) throws NacosException {
    String serviceNameWithGroup = NamingUtils.getGroupedName(serviceName, groupName);
    String serviceKey = ServiceInfo.getKey(serviceNameWithGroup, clusters);
    // 定时调度UpdateTask
    serviceInfoUpdateService.scheduleUpdateIfAbsent(serviceName, groupName, clusters);
    // 获取缓存中的ServiceInfo
    ServiceInfo result = serviceInfoHolder.getServiceInfoMap().get(serviceKey);
    if (null == result) {
        // 如果为null，则进行订阅逻辑处理，基于gRPC协议
        result = grpcClientProxy.subscribe(serviceName, groupName, clusters);
    }
    // ServiceInfo本地缓存处理
    serviceInfoHolder.processServiceInfo(result);
    return result;
}
```

### 订阅模式总结：

1. 开启定时任务来更新缓存
2. 从缓存中获取服务
3. 不能获取到，基于grpc协议直接从服务端查询，然后更新到缓存中
4. 能获取到，直接获取缓存中的服务
5. 将获取到的服务返回
![](/img/technologySharing/nacos/订阅模式.png)

## serviceInfoUpdateService.scheduleUpdateIfAbsent(serviceName, groupName, clusters)定时任务

ServiceInfoUpdateService.scheduleUpdateIfAbsent(String serviceName, String groupName, String clusters)

```java
public void scheduleUpdateIfAbsent(String serviceName, String groupName, String clusters) {
    String serviceKey = ServiceInfo.getKey(NamingUtils.getGroupedName(serviceName, groupName), clusters);
    if (futureMap.get(serviceKey) != null) {
        return;
    }
    synchronized (futureMap) {
        if (futureMap.get(serviceKey) != null) {
            return;
        }
        //构建UpdateTask
        ScheduledFuture<?> future = addTask(new UpdateTask(serviceName, groupName, clusters));
        futureMap.put(serviceKey, future);
    }
}
```

```java
private static final long DEFAULT_DELAY = 1000L;
private synchronized ScheduledFuture<?> addTask(UpdateTask task) {
    return executor.schedule(task, DEFAULT_DELAY, TimeUnit.MILLISECONDS);
}
```

### 总结：

1. 通过`serviceName`、`groupName`、`clusters`构建了`serviceKey`
2. 通过`serviceKey`判断定时任务是否重复，不存在则添加定时任务，存在就直接返回，保证每个服务只有一个定时任务在执行。
3. 任务为`new UpdateTask(serviceName, groupName, clusters)`，而`addTask()`就是添加任务
4. 添加后默认为延迟1000毫秒后执行

## UpdateTask.run()定时任务真正要执行的逻辑

```java
public void run() {
    long delayTime = DEFAULT_DELAY;
    
    try {
        // 判断是服务是否已暂定
        if (!changeNotifier.isSubscribed(groupName, serviceName, clusters) && !futureMap.containsKey(serviceKey)) {
            NAMING_LOGGER
                    .info("update task is stopped, service:" + groupedServiceName + ", clusters:" + clusters);
            return;
        }
        //获取本地缓存中的service信息
        ServiceInfo serviceObj = serviceInfoHolder.getServiceInfoMap().get(serviceKey);
        if (serviceObj == null) {
            //直接从服务的拉取最新的Service信息
            serviceObj = namingClientProxy.queryInstancesOfService(serviceName, groupName, clusters, 0, false);
            serviceInfoHolder.processServiceInfo(serviceObj);
            lastRefTime = serviceObj.getLastRefTime();
            return;
        }

        // 如果服务的最新更新时间小于等于缓存刷新（最后一次拉取数据的时间）时间，从注册中心重新查询
        if (serviceObj.getLastRefTime() <= lastRefTime) {
            serviceObj = namingClientProxy.queryInstancesOfService(serviceName, groupName, clusters, 0, false);
            serviceInfoHolder.processServiceInfo(serviceObj);
        }
        lastRefTime = serviceObj.getLastRefTime();

        //如果拉取到的服务没有实例，则记为失败
        if (CollectionUtils.isEmpty(serviceObj.getHosts())) {
            incFailCount();
            return;
        }
        // 下次更新缓存时间设置，默认6秒(1000ms * 6)
        delayTime = serviceObj.getCacheMillis() * DEFAULT_UPDATE_CACHE_TIME_MULTIPLE;
        // 重置失败数量为0(可能会出现失败情况，没有ServiceInfo，连接失败)
        resetFailCount();
    } catch (Throwable e) {
        incFailCount();
        NAMING_LOGGER.warn("[NA] failed to update serviceName: " + groupedServiceName, e);
    } finally {
        executor.schedule(this, Math.min(delayTime << failCount, DEFAULT_DELAY * 60), TimeUnit.MILLISECONDS);
    }
}
```

### 总结：

- 从缓存获取服务 
   - 不存在的话直接从服务端拉取列表更新到缓存中
   - 存在的话，如果服务最新更新时间`<=`最后一次拉取数据的时间，直接从服务端拉取列表更新到缓存中
- 更新最后一次拉取数据的时间
- 计算下次要执行的时间
- 循环执行
- 默认间隔时间为6秒，当发生异常时会延长，但不会超过1分钟
![](/img/technologySharing/nacos/定时任务.png)

## serviceInfoHolder.processServiceInfo(serviceObj)更新缓存

```java
public ServiceInfo processServiceInfo(ServiceInfo serviceInfo) {
    String serviceKey = serviceInfo.getKey();
    if (serviceKey == null) {
        return null;
    }
    ServiceInfo oldService = serviceInfoMap.get(serviceInfo.getKey());
    if (isEmptyOrErrorPush(serviceInfo)) {
        //empty or error push, just ignore
        return oldService;
    }
    // 缓存服务信息
    serviceInfoMap.put(serviceInfo.getKey(), serviceInfo);
    // 判断注册的实例信息是否已变更
    boolean changed = isChangedServiceInfo(oldService, serviceInfo);
    if (StringUtils.isBlank(serviceInfo.getJsonFromServer())) {
        serviceInfo.setJsonFromServer(JacksonUtils.toJson(serviceInfo));
    }
    // 监控服务监控缓存Map的大小
    MetricsMonitor.getServiceInfoMapSizeMonitor().set(serviceInfoMap.size());
    // 服务实例以更变
    if (changed) {
        NAMING_LOGGER.info("current ips:(" + serviceInfo.ipCount() + ") service: " + serviceInfo.getKey() + " -> "
                + JacksonUtils.toJson(serviceInfo.getHosts()));
        // 添加实例变更事件，会被订阅者执行
        NotifyCenter.publishEvent(new InstancesChangeEvent(serviceInfo.getName(), serviceInfo.getGroupName(),
                serviceInfo.getClusters(), serviceInfo.getHosts()));
        // 记录Service本地文件
        DiskCache.write(serviceInfo, cacheDir);
    }
    return serviceInfo;
}
```

![](/img/technologySharing/nacos/serviceInfoHolder.processServiceInfo.png)
### 事件发布机制 NotifyCenter.publishEvent(new InstancesChangeEvent(...))

这部分的讲解在`nacos服务端服务注册原理_4`中。
