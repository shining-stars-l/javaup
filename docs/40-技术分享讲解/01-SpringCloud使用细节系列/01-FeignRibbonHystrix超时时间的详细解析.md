---
slug: /tech-sharing/springcloud-details/feignribbonhystrix
---


# 微服务组件各种超时时间的介绍

在微服务整个系统中，需要设置相应的服务调用超时时间来保护服务，常见的调用链为 网关 -> 服务A -> 服务B

常见的设置超时时间的几个方面:

- 网关(gateway、zuul)
- 服务间的调用(feign)
- 服务间的熔断(hystrix)
- 服务间的负载均衡(ribbon)

## feign

```yaml
feign:
  client:
        config:
         # default 设置的全局超时时间，指定服务名称可以设置单个服务的超时时间，超时时间默认为1s
         default:
              #不设置connectTimeout会导致readTimeout设置不生效
              #服务之间建立连接所用的时间
             connectTimeout: 10000
              #建立连接后从服务端读取到数据用的时间
             readTimeout: 10000
```

## ribbon

如果不配置的话，超时时间默认为1s，要注意这是个坑，一般要指定的配置和hystrix配合

```yaml
#OpenFeign默认支持ribbon
ribbon:
  #对所有操作请求都进行重试,默认false
  OkToRetryOnAllOperations: false
  #服务之间建立连接所用的时间
  ConnectTimeout: 10000
  #建立连接后从服务端读取到数据用的时间
  ReadTimeout: 10000
  #对当前实例的重试次数，默认0
  MaxAutoRetries: 0  
  #对切换实例的重试次数，默认1   
  MaxAutoRetriesNextServer: 1
```

```java
public class RibbonClientConfiguration {

	/**
	 * Ribbon client default connect timeout.
	 */
	public static final int DEFAULT_CONNECT_TIMEOUT = 1000;

	/**
	 * Ribbon client default read timeout.
	 */
	public static final int DEFAULT_READ_TIMEOUT = 1000;
}
```

ribbon和Feign默认超时时间都是1s，从`RibbonClientConfiguration`也能看到指明了ribbon的`默认连接超时时间`和`默认读取超时时间`都是`1s`

**feign和ribbon的优先级关系**

- Feign 和 Ribbon 的超时时间只会有一个生效
- 如果没有配置feign的超时时间，只是配置了ribbon的超时时间，则只有ribbon的配置超时时间会生效，feign默认的1s超时无效
- 如果feign和ribbon的超时时间都配置了，则以feign配置的为准

## hystrix

```yaml
hystrix:
  command:
  	# default全局有效，service id指定应用有效
    default:
      execution:
        timeout:
          enabled: true
        isolation:
          thread:
          	#熔断超时时间，默认1000ms
            timeoutInMilliseconds: 200000
    # 针对单个服务及方法的设置方法
    TestService#save(TestDto):
      execution:
        timeout:
          enabled: true
        isolation:
          thread:
          	#熔断超时时间，默认1000ms
            timeoutInMilliseconds: 300000
```

```java
public abstract class HystrixCommandProperties {
	private static final Integer default_executionTimeoutInMilliseconds = 1000;
}
```

可以看到`HystrixCommandProperties`类中，超时时间默认为1000ms

**Feign集成Hystrix单个方法设置超时时间：**

- 类名#方法名(参数类型，参数类型……)
- 类名：要设置的某个FeignClient的类名
- 方法名：设置FeignClient里面的方法
- 参数类型：方法里面需要传入的参数。如果是基础类型，就直接填基础类型：String/int等；如果是某个对象，就直接填对象的类名

**hystrix和ribbon的超时时间关系**

- 如果`hystrix.command.default.execution.timeout.enabled`为true,则hystrix的超时时间配置和ribbon的超时时间配置是同时生效的,一个就是ribbon的`ReadTimeout`,一个就是熔断器hystrix的`timeoutInMilliseconds`, 此时谁的值小谁生效
- 如果`hystrix.command.default.execution.timeout.enabled`为false,则熔断器不进行超时熔断,而是根据ribbon的`ReadTimeout`抛出的异常而熔断,也就是取决于ribbon
- ribbon的`ConnectTimeout`,配置的是请求服务的超时时间,除非服务找不到,或者网络原因,这个时间才会生效
由于ribbon的重试机制,通常熔断的超时时间需要配置的比`ReadTimeout`长,`ReadTimeout`比`ConnectTimeout`长,否则还未重试,就熔断了
- hystrix超时时间的配置： 
   - 先计算Ribbon重试次数(包含首次) = `1 + ribbon.MaxAutoRetries + ribbon.MaxAutoRetriesNextServer + (ribbon.MaxAutoRetries * ribbon.MaxAutoRetriesNextServer)`
   - hystrix超时时间 = `Ribbon的重试次数(包含首次) * (ribbon.ReadTimeout + ribbon.ConnectTimeout)`
   - 如果hystrix配置的时间比ribbon计算重试次数超时时间小，会出现警告级别日志`The Hystrix timeout of 60000 ms for the command "foo" is set lower than the combination of the Ribbon read and connect timeout, 200000ms.`

## gateway

```yaml
spring:
  cloud:
    gateway:
      httpclient:
        #连接服务超时时间
        connect-timeout: 10000
        #连接服务后数据返回超时时间
        response-timeout: 10000
```

**gateway和ribbon、hystrix超时时间关系**

- 首先ribbon的超时时间ribbon.ReadTimeout、ribbon.ConnectTimeout在gateway转发服务中是不生效的，如果是调用feign的话依旧生效
- gateway的超时参数和hystrix的超时参数关系 
   - 如果同时存在的话，则哪个的超时配置时间小，就以哪个为准
   - 如果不同时存在，配置了hystrix的超时时间，则以hystrix为准。配置了gateway超时时间，则超时时间为1s(这个不知道为什么)

所以通常做法是使用hystrix的超时时间配置，注意：要让hystrix的超时生效的话**一定要配置hystrix过滤器**

```yaml
spring:
  cloud:
    gateway:
      enabled: true
      discovery:
        locator:
          # 开启负载均衡对网关的路由转发的支持
          enabled: true
      #全局熔断
      default-filters:
        # 熔断过滤器
          - name: Hystrix
            args:
              name: fallBackHandler
              id: Hystrix
              fallbackuri: forward:/fallBackHandler
#hystrix: 顶层配置，表示这是Hystrix的配置。
hystrix:
  #command: 表示要配置的是Hystrix命令（即要应用断路器的方法）。
  command:
    default:
      #execution: 表示与命令执行相关的配置。
      execution:
        timeout:
          enabled: true
        #isolation: 表示与命令隔离相关的配置。
        isolation:
          #thread: 表示使用线程隔离策略。
          thread:
            #timeoutInMilliseconds: 设置超时时间，单位为毫秒。
            timeoutInMilliseconds: 10000
```

## zuul

```yaml
zuul:
 host:
  socket-timeout-millis: 10000
  connect-timeout-millis: 10000
```

**zuul和ribbon、hystrix超时时间关系**

- 首先ribbon的超时时间ribbon.ReadTimeout、ribbon.ConnectTimeout在zuul转发服务和feign调用都是生效的，遵守ribbon和hystrix的计算公式原则
- gateway的超时参数和ribbon的超时参数关系 
   - 如果同时存在的话，以ribbon为准
   - 如果不同时存在，配置了ribbon的超时时间，则以ribbon为准。配置了zuul超时时间，则超时时间为1s(这个不知道为什么)