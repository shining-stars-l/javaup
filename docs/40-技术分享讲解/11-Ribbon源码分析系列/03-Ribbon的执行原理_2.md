---
slug: /tech-sharing/ribbon-source/ribbon-part-2
---

# Ribbon的执行原理_2
## RibbonLoadBalancerClient.getServer(ILoadBalancer loadBalancer, Object hint)

在ribbon的执行原理_1文章中分析了`loadBalancer.execute`方法中，`ILoadBalancer loadBalancer = getLoadBalancer(serviceId)`获得均衡器ZoneAwareLoadBalancer创建容器设置定时任务更新缓存列表的过程。接下来接着分析`RibbonLoadBalancerClient.getServer(ILoadBalancer loadBalancer, Object hint)`

```java
protected Server getServer(ILoadBalancer loadBalancer, Object hint) {
    if (loadBalancer == null) {
        return null;
    }
    // Use 'default' on a null hint, or just pass it on?
    return loadBalancer.chooseServer(hint != null ? hint : "default");
}
```

### ZoneAwareLoadBalancer.chooseServer(Object key)

```java
public Server chooseServer(Object key) {
    if (!ENABLED.get() || getLoadBalancerStats().getAvailableZones().size() <= 1) {
        logger.debug("Zone aware logic disabled or there is only one zone");
        return super.chooseServer(key);
    }
    /**
     * 省略
     */
}
```

### BaseLoadBalancer.chooseServer(Object key)

```java
public Server chooseServer(Object key) {
    if (counter == null) {
        counter = createCounter();
    }
    counter.increment();
    if (rule == null) {
        return null;
    } else {
        try {
            return rule.choose(key);
        } catch (Exception e) {
            logger.warn("LoadBalancer [{}]:  Error choosing server for key {}", name, key, e);
            return null;
        }
    }
}
```

内部的规则是`ZoneAvoidanceRule`，就是前面说的把默认的RoundRobinRule给覆盖了，但是复合策略里面默认的又是`RoundRobinRule`，只是加了一些过滤器，根据一些条件过滤服务器

### PredicateBasedRule.choose(Object key)

```java
public Server choose(Object key) {
    //获得负载均衡器，这里获得的是ZoneAwareLoadBalancer
    ILoadBalancer lb = getLoadBalancer();
    //过滤器
    Optional<Server> server = getPredicate().chooseRoundRobinAfterFiltering(lb.getAllServers(), key);
    if (server.isPresent()) {
        return server.get();
    } else {
        return null;
    }       
}
```

### AbstractServerPredicate.chooseRoundRobinAfterFiltering(List servers, Object loadBalancerKey)

先走过滤器，过滤一遍，然后再轮询出服务器

```java
public Optional<Server> chooseRoundRobinAfterFiltering(List<Server> servers, Object loadBalancerKey) {
    List<Server> eligible = getEligibleServers(servers, loadBalancerKey);
    if (eligible.size() == 0) {
        return Optional.absent();
    }
    return Optional.of(eligible.get(incrementAndGetModulo(eligible.size())));
}
```

### getEligibleServers(List servers, Object loadBalancerKey)

进行过滤器过滤

```java
public List<Server> getEligibleServers(List<Server> servers, Object loadBalancerKey) {
    List<Server> result = super.getEligibleServers(servers, loadBalancerKey);
    Iterator<AbstractServerPredicate> i = fallbacks.iterator();
    while (!(result.size() >= minimalFilteredServers && result.size() > (int) (servers.size() * minimalFilteredPercentage))
            && i.hasNext()) {
        AbstractServerPredicate predicate = i.next();
        result = predicate.getEligibleServers(servers, loadBalancerKey);
    }
    return result;
}
```

```java
public List<Server> getEligibleServers(List<Server> servers, Object loadBalancerKey) {
    if (loadBalancerKey == null) {
        //在这里执行过滤的逻辑
        return ImmutableList.copyOf(Iterables.filter(servers, this.getServerOnlyPredicate()));            
    } else {
        List<Server> results = Lists.newArrayList();
        for (Server server: servers) {
            if (this.apply(new PredicateKey(loadBalancerKey, server))) {
                results.add(server);
            }
        }
        return results;            
    }
}
```

```java
public static <T> UnmodifiableIterator<T> filter(
    final Iterator<T> unfiltered, final Predicate<? super T> retainIfTrue) {
  checkNotNull(unfiltered);
  checkNotNull(retainIfTrue);
  return new AbstractIterator<T>() {
    @Override
    protected T computeNext() {
      //unfiltered迭代器中存放的是一个服务下的多个实例集合，也就是循环遍历实例集合，每个都
      //调用过滤器执行apply过滤逻辑
      while (unfiltered.hasNext()) {
        T element = unfiltered.next();
        //真正的过滤逻辑
        //retainIfTrue为组合式过滤器CompositePredicate，里面默认为两个过滤器ZoneAvoidancePredicate和AvailabilityPredicate，下面有介绍
        if (retainIfTrue.apply(element)) {
          return element;
        }
      }
      return endOfData();
    }
  };
}
```

### CompositePredicate

- 组合模式，能将多个过滤器包含在其中。
- 它还具有“回退”到更多（不止一个）不同谓词之一的功能。如果主的Predicate产生的过滤服务器太少，它将一个接一个地尝试fallback的Predicate，直到过滤服务器的数量超过一定数量的阈值或百分比阈值。

![](/img/technologySharing/ribbon/CompositePredicate.png)
**参数说明**

- `delegate` primary首选的Predicate断言器。注意：它可能是一个，也可能是多个断言器组成的一个chain
- `fallbacks` 回退。当然primary没有达到过滤的要求的时候，会时候fallabck里的进行过滤
- `minimalFilteredServers` 默认值是1
- `minimalFilteredPercentage` 上面是按照个数，这是按照百分比控制阈值，默认值是0
接下来一直调用到过滤器的循环过滤逻辑
- 以上两个参数代表阈值：表示经过过滤后，我最少希望有1台服务器

接着执行，然后就是执行delegate中的两个过滤器了

```java
public boolean apply(@Nullable T t) {
  // Avoid using the Iterator to avoid generating garbage (issue 820).
  for (int i = 0; i < components.size(); i++) {
    //components为过滤器，在这里循环执行过滤器的过滤逻辑   
    //t为每个实例                                    
    if (!components.get(i).apply(t)) {
      return false;
    }
  }
  return true;
}
```

`components`中含有`ZoneAvoidancePredicate`和`AvailabilityPredicate`两个过滤器的过滤，只要有一个不满足就被过滤掉了

**ZoneAvoidancePredicate可用性过滤器**

当某个zone很糟糕，达到了threshold的阈值，就会过滤掉这个zone中的所有server列表，所以可以得出此过滤器是很有zone区域意识的。是springcloud默认的过滤器，规则ZoneAvoidanceRule就是基于此断言器来实现服务器过滤的。

**成员属性**

```java
public class ZoneAvoidancePredicate extends  AbstractServerPredicate {
    /**
    * 成员属性
    */
    private volatile DynamicDoubleProperty triggeringLoad = new DynamicDoubleProperty("ZoneAwareNIWSDiscoveryLoadBalancer.triggeringLoadPerServerThreshold", 0.2d);
    private volatile DynamicDoubleProperty triggeringBlackoutPercentage = new DynamicDoubleProperty("ZoneAwareNIWSDiscoveryLoadBalancer.avoidZoneWithBlackoutPercetage", 0.99999d);
	  private static final DynamicBooleanProperty ENABLED = DynamicPropertyFactory.getInstance().getBooleanProperty("niws.loadbalancer.zoneAvoidanceRule.enabled", true);
}
```

**过滤逻辑**

```java
public boolean apply(@Nullable PredicateKey input) {
    //若开关关闭了，也就是禁用了这个策略。那就永远true
    if (!ENABLED.get()) {
        return true;
    }
    // 拿到该Server所在的zone，进而完成判断
    String serverZone = input.getServer().getZone();
    if (serverZone == null) {
        // there is no zone information from the server, we do not want to filter
        // out this server
        return true;
    }
    LoadBalancerStats lbStats = getLBStats();
    if (lbStats == null) {
        // no stats available, do not filter
        return true;
    }
     // 若可用区只剩一个了，那也不要过滤了
    if (lbStats.getAvailableZones().size() <= 1) {
        // only one zone is available, do not filter
        return true;
    }
    Map<String, ZoneSnapshot> zoneSnapshot = ZoneAvoidanceRule.createSnapshot(lbStats);
    if (!zoneSnapshot.keySet().contains(serverZone)) {
        // The server zone is unknown to the load balancer, do not filter it out 
        return true;
    }
    logger.debug("Zone snapshots: {}", zoneSnapshot);
    // 拿到全部可用的zone后，判断该Server坐在的Zone是否属于可用区内
    Set<String> availableZones = ZoneAvoidanceRule.getAvailableZones(zoneSnapshot, triggeringLoad.get(), triggeringBlackoutPercentage.get());
    logger.debug("Available zones: {}", availableZones);
    if (availableZones != null) {
        return availableZones.contains(input.getServer().getZone());
    } else {
        return false;
    }
}
```

分析一下`ZoneAvoidanceRule.getAvailableZones(zoneSnapshot, triggeringLoad.get(), triggeringBlackoutPercentage.get())`这行，还是比较重要的

```java
// snapshot：zone对应的ZoneSnapshot的一个map
public static Set<String> getAvailableZones(
        Map<String, ZoneSnapshot> snapshot,
        double triggeringLoad,
        double triggeringBlackoutPercentage) {
    if (snapshot.isEmpty()) {
        return null;
    }
    
    //拿到所有的可用区availableZones，后续逻辑会进行过滤
    Set<String> availableZones = new HashSet<>(snapshot.keySet());
    // 如果只有一个，那就只能用这个不能过滤了
    if (availableZones.size() == 1) {
        return availableZones;
    }
    
    // 记录很糟糕情况的
    Set<String> worstZones = new HashSet<>();
    // 所有zone中，平均负载最高值
    double maxLoadPerServer = 0;
    // true：zone有限可用
    // false：zone全部可用
    boolean limitedZoneAvailability = false;

    // 循环遍历每个zone的情况
    for (Map.Entry<String, ZoneSnapshot> zoneEntry : snapshot.entrySet()) {
        String zone = zoneEntry.getKey();
        ZoneSnapshot zoneSnapshot = zoneEntry.getValue();
        int instanceCount = zoneSnapshot.getInstanceCount();
        
        // 若该zone内一个实例没有了，那就是完全不可用，必须移除该zone
        // 然后标记zone是有限可用的（并非全部可用）
        if (instanceCount == 0) {
            availableZones.remove(zone);
            limitedZoneAvailability = true;
        } else {
            // 该zone的平均负载
            double loadPerServer = zoneSnapshot.getLoadPerServer();
            
            // 机器的熔断总数 / 总实例数已经超过了阈值（默认为1，也就是全部熔断才会认为该zone完全不可用）
            // 或者 loadPerServer < 0
            if (((double) zoneSnapshot.getCircuitTrippedCount()) / instanceCount >= triggeringBlackoutPercentage
                    || loadPerServer < 0) {
                // 证明这个zone完全不可用，就移除掉
                availableZones.remove(zone);
                limitedZoneAvailability = true;
            } else { // 并不是完全不可用，就看看状态是不是很糟糕

                // 若当前负载和最大负载相当，那认为已经很糟糕了
                if (Math.abs(loadPerServer - maxLoadPerServer) < 0.000001d) {
                    worstZones.add(zone);
                
                // 或者若当前负载大于最大负载了
                } else if (loadPerServer > maxLoadPerServer) {
                    maxLoadPerServer = loadPerServer;
                    worstZones.clear();
                    worstZones.add(zone);
                }
            }
        }
    }

    // 若最大负载小于设定的负载阈值 并且limitedZoneAvailability=false
    // 就是说全部zone都可用，并且最大负载都还没有达到阈值，那就把全部zone返回
    if (maxLoadPerServer < triggeringLoad && !limitedZoneAvailability) {
        // zone override is not needed here
        return availableZones;
    }
    String zoneToAvoid = randomChooseZone(snapshot, worstZones);
    if (zoneToAvoid != null) {
        availableZones.remove(zoneToAvoid);
    }
    return availableZones;
}
```

**AvailabilityPredicate可用性过滤器**

这个是用来过滤掉不可用的服务器，比如连接不上，还有并发太多的，他就是获取服务器信息，然后判断一些问题

```java
public boolean apply(@Nullable PredicateKey input) {
    LoadBalancerStats stats = getLBStats();
    if (stats == null) {
        return true;
    }
    return !shouldSkipServer(stats.getSingleServerStat(input.getServer()));
}
```

```java
//根据Server状态ServerStats来判断该Server是否应该被跳过
private boolean shouldSkipServer(ServerStats stats) {  
    /**
     *  isCircuitBreakerTripped()即断路器是否在生效中 
     *  默认断路器生效中就会忽略此Server。
     *  但是你也可以配置niws.loadbalancer.availabilityFilteringRule.filterCircuitTri  pped=false来关闭此时对断路器的检查
    * */
    /**
     * 该Server的并发请求数activeRequestsCount大于阈值，默认值非常大：Integer.MAX_VALUE 
     * */ 
    if ((CIRCUIT_BREAKER_FILTERING.get() && stats.isCircuitBreakerTripped()) 
            || stats.getActiveRequestsCount() >= activeConnectionsLimit.get()) {
        return true;
    }
    return false;
}
```

### incrementAndGetModulo(eligible.size())

执行完`getEligibleServers(servers, loadBalancerKey)`过滤器过滤服务后，将过滤后的服务进行负载均衡的选择策略

```java
private final AtomicInteger nextIndex = new AtomicInteger();  
private int incrementAndGetModulo(int modulo) {
    for (;;) {
        int current = nextIndex.get();
        int next = (current + 1) % modulo;
        if (nextIndex.compareAndSet(current, next) && current < modulo)
            return current;
    }
}
```

可以看到默认的负载均衡策略是轮训策略

## RibbonServer ribbonServer = new RibbonServer...

在ribbon的执行原理_1和上文中分析了`loadBalancer.execute`方法中分析了如下逻辑：

1. `ILoadBalancer loadBalancer = getLoadBalancer(serviceId)`获得均衡器ZoneAwareLoadBalancer创建容器设置定时任务更新缓存列表的过程。
2. `RibbonLoadBalancerClient.getServer(ILoadBalancer loadBalancer, Object hint)`获得ribbon的中的服务列表后进行相应的过滤，然后向过滤后的服务列表进行负载均衡策略。

下面继续分析`loadBalancer.execute`方法中的逻辑`RibbonServer ribbonServer = new RibbonServer...`创建一个RibbonServer来封装信息

```java
RibbonServer ribbonServer = new RibbonServer(serviceId, server,
				isSecure(server, serviceId),
				serverIntrospector(serviceId).getMetadata(server));
```

# execute(String serviceId, ServiceInstance serviceInstance, LoadBalancerRequest request)

到目前为止，`loadBalancer.execute`方法中分析完了：

1. `ILoadBalancer loadBalancer = getLoadBalancer(serviceId)`获得均衡器ZoneAwareLoadBalancer创建容器设置定时任务更新缓存列表的过程。
2. `RibbonLoadBalancerClient.getServer(ILoadBalancer loadBalancer, Object hint)`获得ribbon的中的服务列表后进行相应的过滤，然后向过滤后的服务列表进行负载均衡策略。
3. `RibbonServer ribbonServer = new RibbonServer...`创建一个RibbonServer来封装信息

下面执行`execute(String serviceId, ServiceInstance serviceInstance, LoadBalancerRequest request)`

```java
public <T> T execute(String serviceId, ServiceInstance serviceInstance,
        LoadBalancerRequest<T> request) throws IOException {
    Server server = null;
    if (serviceInstance instanceof RibbonServer) {
        server = ((RibbonServer) serviceInstance).getServer();
    }
    if (server == null) {
        throw new IllegalStateException("No instances available for " + serviceId);
    }

    RibbonLoadBalancerContext context = this.clientFactory
            .getLoadBalancerContext(serviceId);
    RibbonStatsRecorder statsRecorder = new RibbonStatsRecorder(context, server);

    try {
        T returnVal = request.apply(serviceInstance);
        statsRecorder.recordStats(returnVal);
        return returnVal;
    }
    // catch IOException and rethrow so RestTemplate behaves correctly
    catch (IOException ex) {
        statsRecorder.recordStats(ex);
        throw ex;
    }
    catch (Exception ex) {
        statsRecorder.recordStats(ex);
        ReflectionUtils.rethrowRuntimeException(ex);
    }
    return null;
}
```

`request.apply(serviceInstance)`就是之前在ribbon的执行原理_1文章中提到过，这里会直接执行lambda表达式中的内容

```java
public LoadBalancerRequest<ClientHttpResponse> createRequest(
        final HttpRequest request, final byte[] body,
        final ClientHttpRequestExecution execution) {
    return instance -> {
        HttpRequest serviceRequest = new ServiceRequestWrapper(request, instance,
                this.loadBalancer);
        if (this.transformers != null) {
            for (LoadBalancerRequestTransformer transformer : this.transformers) {
                serviceRequest = transformer.transformRequest(serviceRequest,
                        instance);
            }
        }
        return execution.execute(serviceRequest, body);
    };
}
```

http调用服务请求的流程了

```java
private class InterceptingRequestExecution implements ClientHttpRequestExecution {

    private final Iterator<ClientHttpRequestInterceptor> iterator;

    public InterceptingRequestExecution() {
        this.iterator = interceptors.iterator();
    }

    @Override
    public ClientHttpResponse execute(HttpRequest request, byte[] body) throws IOException {
        if (this.iterator.hasNext()) {
            ClientHttpRequestInterceptor nextInterceptor = this.iterator.next();
            return nextInterceptor.intercept(request, body, this);
        }
        else {
            HttpMethod method = request.getMethod();
            Assert.state(method != null, "No standard HTTP method");
            ClientHttpRequest delegate = requestFactory.createRequest(request.getURI(), method);
            request.getHeaders().forEach((key, value) -> delegate.getHeaders().addAll(key, value));
            if (body.length > 0) {
                if (delegate instanceof StreamingHttpOutputMessage) {
                    StreamingHttpOutputMessage streamingOutputMessage = (StreamingHttpOutputMessage) delegate;
                    streamingOutputMessage.setBody(outputStream -> StreamUtils.copy(body, outputStream));
                }
                else {
                    StreamUtils.copy(body, delegate.getBody());
                }
            }
            return delegate.execute();
        }
    }
}
```

到这里就会将服务名替换为ip地址，发起真正的http调用
