---
slug: /link-flow/threading-details/reactor-multithread-data-loss
---

import PaidCTA from '@site/src/components/PaidCTA';

# 多线程和Reactor模式下解决数据丢失

到了此章节，相信你对 link-flow 的整体流程有了大致的掌握了，但在整个流程中，对于线程方面有很多的细节，稍微处理不好就容易丢失，所以此章节将会讲清楚这些细节问题。

## 多线程的切换

首先来看这四个部分，在这四个部分中都进行了线程名的输出

### 第1处：服务过滤执行的开始
```java
public Mono<Response<ServiceInstance>> choose(Request request) {
    ServiceInstanceListSupplier supplier = serviceInstanceListSupplierProvider
            .getIfAvailable(NoopServiceInstanceListSupplier::new);
    System.out.println("第一处执行的线程；"+Thread.currentThread().getName());
    return supplier.get(request).next()
            .map(serviceInstances -> processInstanceResponse(supplier, serviceInstances));
}
```
### 第2处：获取到所有服务列表   第3处：服务的路由过滤
```java
/**
 * 当要调用服务的时候，会调用此方法，此方法会返回所有的服务列表。路由过滤器会在此处执行
 * */
@Override
public Flux<List<ServiceInstance>> get() {
    //获取所有的服务列表
    Flux<List<ServiceInstance>> listFlux = super.get();
    //从ThreadLocal获取参数
    Map<String, Object> parameterMap = BaseParameterHolder.getParameterMap();
    Map<String,Object> newMap = new HashMap<>(BaseParameterHolder.getParameterMap().size());
    newMap.putAll(parameterMap);
    System.out.println("第2处执行的线程；"+Thread.currentThread().getName());
    listFlux = listFlux.map(serviceInstances -> {
        System.out.println("第3处执行的线程；"+Thread.currentThread().getName());
        //到这里线程已经发生变化了，所以要把之前线程的将参数放入到ThreadLocal中，这样才能在后续的过滤器中获取到参数
        BaseParameterHolder.setParameterMap(newMap);
        List<ServiceInstance> allServers = new ArrayList<>();
        Optional.ofNullable(serviceInstances).ifPresent(allServers::addAll);
        //执行过滤器
        linkFlowFilterLoadBalance.selectServer(allServers);
        return allServers;
    });
    //返回结果
    return listFlux;
}
```
### 第4处：服务版本权重的执行
```java
private Response<ServiceInstance> getInstanceResponse(List<ServiceInstance> instances) {
    if (instances.isEmpty()) {
        if (log.isWarnEnabled()) {
            log.warn("No servers available for service: " + serviceId);
        }
        return new EmptyResponse();
    }
    
    System.out.println("第四处执行的线程；"+Thread.currentThread().getName());
    
    //经过权重过滤选择后，肯定是一个服务实例了
    WeightInfoWrapper weightInfoWrapper = linkFlowWeight.parseWeightInfo();
    if (linkFlowWeight.isServiceWeight(instances,weightInfoWrapper)) {
        ServiceInstance serviceInstance = linkFlowWeight.selectServiceInstance(instances, weightInfoWrapper);
        instances.clear();
        instances.add(serviceInstance);
    }
    
    
    // Do not move position when there is only 1 instance, especially some suppliers
    // have already filtered instances
    if (instances.size() == 1) {
        return new DefaultResponse(instances.get(0));
    }
    
    // Ignore the sign bit, this allows pos to loop sequentially from 0 to
    // Integer.MAX_VALUE
    int pos = this.position.incrementAndGet() & Integer.MAX_VALUE;
    
    ServiceInstance instance = instances.get(pos % instances.size());
    
    return new DefaultResponse(instance);
}
```

<PaidCTA />
