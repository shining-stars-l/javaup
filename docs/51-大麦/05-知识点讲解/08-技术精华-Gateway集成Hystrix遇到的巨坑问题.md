---
slug: /damai/knowledge/gateway-hystrix-pitfalls
---

# Gateway集成Hystrix遇到的巨坑问题

## 问题
Hystrix作为经典的熔断保护机制，虽然现在热度不如Sentinel，但依旧有很多的公司还在使用中，如果是使用Gateway集成Hystrix会有各种各样坑，
本文是将踩坑经历介绍出来，如果小伙伴有Gateway集成Hystrix的需求和排查问题的需求，可以好好阅读此文档

## 注意事项
- gateway整合hystrix是否生效和启动类上的注解`@EnableHystrix`没有什么关系

- gateway整合hystrix生效的关键是在于是否配置了hystrix的过滤器，配置了全局或路由局部的都可以，我这里配置的全局

```yaml
spring:
    gateway:
      discovery:
        locator:
          # 开启负载均衡对网关的路由转发的支持
          enabled: true
      enabled: true    
      default-filters:
        # 熔断过滤器
        - name: Hystrix
          args:
            name: fallbackcmd
            fallbackuri: forward:/fallexecute
```
- hystrix的依赖，不能去掉，否则会报异常，是因为gateway中route路由组件需hystrix
```xml
<!-- 此依赖不能去掉 -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-hystrix</artifactId>
</dependency>
```
```text
缺失hystrix依赖的报错信息：

Caused by: reactor.core.Exceptions$ErrorCallbackNotImplemented: java.lang.IllegalArgumentException: Unable to find GatewayFilterFactory with name Hystrix
Caused by: java.lang.IllegalArgumentException: Unable to find GatewayFilterFactory with name Hystrix
	at org.springframework.cloud.gateway.route.RouteDefinitionRouteLocator.loadGatewayFilters(RouteDefinitionRouteLocator.java:187) ~[spring-cloud-gateway-server-2.2.9.RELEASE.jar:2.2.9.RELEASE]
	at org.springframework.cloud.gateway.route.RouteDefinitionRouteLocator.getFilters(RouteDefinitionRouteLocator.java:228) ~[spring-cloud-gateway-server-2.2.9.RELEASE.jar:2.2.9.RELEASE]
	at org.springframework.cloud.gateway.route.RouteDefinitionRouteLocator.convertToRoute(RouteDefinitionRouteLocator.java:170) ~[spring-cloud-gateway-server-2.2.9.RELEASE.jar:2.2.9.RELEASE]
	at reactor.core.publisher.FluxMap$MapSubscriber.onNext(FluxMap.java:100) ~[reactor-core-3.3.17.RELEASE.jar:3.3.17.RELEASE]
	at reactor.core.publisher.FluxFlatMap$FlatMapMain.tryEmitScalar(FluxFlatMap.java:481) ~[reactor-core-3.3.17.RELEASE.jar:3.3.17.RELEASE]
......
```
<br/>

## gateway整合hystrix的两种模式(线程池/信号量)细节问题
```yaml
spring:
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
    gateway:
      discovery:
        locator:
          # 开启负载均衡对网关的路由转发的支持
          enabled: true
      enabled: true    
      default-filters:
        # 熔断过滤器
        - name: Hystrix
          args:
            name: fallbackcmd
            fallbackuri: forward:/fallexecute
      # 负载均衡路由规则 开启路由后的服务swagger才能显示
      routes:
        - id: test-service
          uri: lb://test-service
          predicates:
            - Path=/gateway/test/**
          filters:
            - StripPrefix=2
          metadata:
            title: 测试系统
# Hystrix 配置
hystrix:
  command:
    default:
      execution:
        timeout:
          enabled: true  
          thread:
            timeoutInMilliseconds: 6000
  threadpool:
    default:
      coreSize: 300 # Hystrix 更改默认并发数配置
```
将线程池线程数设置为300，进行压测，发现并发数在10左右就会进入fallexecute熔断。

说明参数设置的不对，按照官网设置的参数配置也不对，只好进入源码分析。

定位到`AbstractCommand#executeCommandWithSpecifiedIsolation`
```java
private Observable<R> executeCommandWithSpecifiedIsolation(final AbstractCommand<R> _cmd) {
    if (properties.executionIsolationStrategy().get() == ExecutionIsolationStrategy.THREAD) {
        // mark that we are executing in a thread (even if we end up being rejected we still were a THREAD execution and not SEMAPHORE)
        // 执行线程池的方式
    } else {
        // 执行信号量的方式
    }
}
```
发现隔离策略是SEMAPHORE(默认的并发数就是10)，但默认的策略应该是THREAD才对，只能接着来分析

<br/>

## 分析流程
当服务启动时执行从HystrixGatewayFilterFactory#apply一直调用到HystrixObservableCommand.Setter#Setter

### HystrixObservableCommand.Setter#Setter
```java
protected Setter(HystrixCommandGroupKey groupKey) {
    this.groupKey = groupKey;

    // default to using SEMAPHORE for ObservableCommand
    commandPropertiesDefaults = setDefaults(HystrixCommandProperties.Setter());
}
```
```java
private HystrixCommandProperties.Setter setDefaults(HystrixCommandProperties.Setter commandPropertiesDefaults) {
    if (commandPropertiesDefaults.getExecutionIsolationStrategy() == null) {
        // default to using SEMAPHORE for ObservableCommand if the user didn't set it
        commandPropertiesDefaults.withExecutionIsolationStrategy(ExecutionIsolationStrategy.SEMAPHORE);
    }
    return commandPropertiesDefaults;
}
```
```java
public Setter withExecutionIsolationStrategy(ExecutionIsolationStrategy value) {
    this.executionIsolationStrategy = value;
    return this;
}
```
### HystrixCommandProperties
当服务启动后，第一次调用gateway服务后，会进行加载`HystrixCommandProperties`
```java
protected HystrixCommandProperties(HystrixCommandKey key, HystrixCommandProperties.Setter builder, String propertyPrefix) {

        this.executionIsolationStrategy = getProperty(propertyPrefix, key, "execution.isolation.strategy", builder.getExecutionIsolationStrategy(), default_executionIsolationStrategy);        
}
```
注意builder.getExecutionIsolationStrategy()的值为SEMAPHORE(上面分析过了)，default_executionIsolationStrategy为THREAD

**HystrixCommandProperties#getProperty**
```java
private static HystrixProperty<ExecutionIsolationStrategy> getProperty(final String propertyPrefix, final HystrixCommandKey key, final String instanceProperty, final ExecutionIsolationStrategy builderOverrideValue, final ExecutionIsolationStrategy defaultValue) {
    return new ExecutionIsolationStrategyHystrixProperty(builderOverrideValue, key, propertyPrefix, defaultValue, instanceProperty);

}
```
**new ExecutionIsolationStrategyHystrixProperty**
```java
private static final class ExecutionIsolationStrategyHystrixProperty implements HystrixProperty<ExecutionIsolationStrategy> {
    private final HystrixDynamicProperty<String> property;
    private volatile ExecutionIsolationStrategy value;
    private final ExecutionIsolationStrategy defaultValue;

    private ExecutionIsolationStrategyHystrixProperty(ExecutionIsolationStrategy builderOverrideValue, HystrixCommandKey key, String propertyPrefix, ExecutionIsolationStrategy defaultValue, String instanceProperty) {
        //defaultValue为THREAD
        this.defaultValue = defaultValue;
        String overrideValue = null;
        //builderOverrideValue为SEMAPHORE，上面分析过的
        if (builderOverrideValue != null) {
            overrideValue = builderOverrideValue.name();
        }
        //如果不配置则默认值为SEMAPHORE，如果配置则为配置中的值。
        //进行熔断器的配置：
        //hystrix.command.fallbackcmd.execution.isolation.strategy = THREAD
        property = forString()
                .add(propertyPrefix + ".command." + key.name() + "." + instanceProperty, overrideValue)
                .add(propertyPrefix + ".command.default." + instanceProperty, defaultValue.name())
                .build();

        // initialize the enum value from the property
        // 将property的值赋值给value，用于后续判断隔离策略        
        parseProperty();

        // use a callback to handle changes so we only handle the parse cost on updates rather than every fetch
        property.addCallback(new Runnable() {

            @Override
            public void run() {
                // when the property value changes we'll update the value
                parseProperty();
            }

        });
    }

    @Override
    public ExecutionIsolationStrategy get() {
        return value;
    }

    private void parseProperty() {
        try {
            value = ExecutionIsolationStrategy.valueOf(property.get());
        } catch (Exception e) {
            logger.error("Unable to derive ExecutionIsolationStrategy from property value: " + property.get(), e);
            // use the default value
            value = defaultValue;
        }
    }
}
```
<br/>

# gateway调用方式时，选择hystrix的隔离策略
上面分析了隔离策略的赋值方式，然后就到了隔离策略的判断逻辑

**AbstractCommand#executeCommandWithSpecifiedIsolation**
```java
private Observable<R> executeCommandWithSpecifiedIsolation(final AbstractCommand<R> _cmd) {
    if (properties.executionIsolationStrategy().get() == ExecutionIsolationStrategy.THREAD) {
        // mark that we are executing in a thread (even if we end up being rejected we still were a THREAD execution and not SEMAPHORE)
        // 执行线程池的方式
    } else {
        // 执行信号量的方式
    }
}
```
上述分析后，我们知道了要将熔断器的名字来显示的设置为THREAD模式，添加配置参数`hystrix.command.fallbackcmd.execution.isolation.strategy = THREAD`
```yaml
spring:
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
    gateway:
      discovery:
        locator:
          # 开启负载均衡对网关的路由转发的支持
          enabled: true
      enabled: true    
      default-filters:
        # 熔断过滤器
        - name: Hystrix
          args:
            name: fallbackcmd
            fallbackuri: forward:/fallexecute
      # 负载均衡路由规则 开启路由后的服务swagger才能显示
      routes:
        - id: test-service
          uri: lb://test-service
          predicates:
            - Path=/gateway/test/**
          filters:
            - StripPrefix=2
          metadata:
            title: 测试系统
# Hystrix 配置
hystrix:
  command:
    default:
      execution:
        timeout:
          enabled: true  
          thread:
            timeoutInMilliseconds: 6000
    fallbackcmd:
      execution:
        isolation:
          strategy: THREAD    
  threadpool:
    default:
      coreSize: 300 # Hystrix 更改默认并发数配置
```
经过测试后，执行了线程的隔离策略，压测正常

