---
slug: /tech-sharing/springboot-issues/springboot
---


# SpringBoot灵活的映射配置信息

在用`@ConfigurationProperties`最常用的功能是用此注解对类进行修饰，设置好`prefix`前缀，这样在springboot的配置文件中，配置信息的key和value就会对应的配置到类中的属性上。

## 以设置eureka信息为例设置实例id

```java
@ConfigurationProperties("eureka.instance")
public class EurekaInstanceConfigBean
		implements CloudEurekaInstanceConfig, EnvironmentAware {

	private static final String UNKNOWN = "unknown";


	/**
	 * Get the unique Id (within the scope of the appName) of this instance to be
	 * registered with eureka.
	 */
	private String instanceId;

	/**
	 * set get省略
	 */

}
```

```yaml
eureka:
  instance:
    instance-id: ${spring.cloud.client.ip-address}:${server.port}
```

一般都是这么使用的。但还有一种情况，要加上新的配置信息，但又不想在`@ConfigurationProperties`类中添加新的属性值，想要更加的灵活。这种情况一般用于对于框架的扩展，又不能修改源码的情况下。

这时，可以在类中设置`Map`类型的属性，这样既不用添加或修改属性，又能实现灵活的设置添加和删除配置信息。

## 仍以eureka为例

```java
@ConfigurationProperties("eureka.instance")
public class EurekaInstanceConfigBean
		implements CloudEurekaInstanceConfig, EnvironmentAware {

	private static final String UNKNOWN = "unknown";


	/**
	 * Gets the metadata name/value pairs associated with this instance. This information
	 * is sent to eureka server and can be used by other instances.
	 */
	private Map<String, String> metadataMap = new HashMap<>();

	/**
	 * set get省略
	 */

}
```

```yaml
eureka:
  instance:
    metadata-map:
      test-flag: true
```

这样`metadataMap`中就有了以`test-flag`为key，`true`为value的配置信息。

`nacos`中也提供了这样的配置

## 以nacos为例

```java
@ConfigurationProperties("spring.cloud.nacos.discovery")
public class NacosDiscoveryProperties {

	private static final Logger log = LoggerFactory
			.getLogger(NacosDiscoveryProperties.class);


	public static final String PREFIX = "spring.cloud.nacos.discovery";

	

	/**
	 * extra metadata to register.
	 */
	private Map<String, String> metadata = new HashMap<>();

	
	/**
	 * set get省略
	 */
}
```

```yaml
spring:
  cloud:
    nacos:
      discovery:
        metadata:
          test-flag: true
```

`eureka`和`nacos`这样做，也是为了让我们用户来灵活的存放自己设置的信息来达到想要的功能。

**当灰度和生产使用同一个注册中心来做环境隔离的负载均衡功能正好可以利用这一点。**

# 思路

- 先设置一个灰度标识，利用这种灵活的配置特性放到`eureka`或`nacos`中服务列表中

- 继承`ribbon-loadbalance`中的`AbstractServerPredicate`，重写`apply(PredicateKey input)`方法，此方法作用是当`ribbon`从`eureka`或`nacos`获取了服务列表后，列表要循环调用此方法，返回`true`保留，返回`false`则过滤掉。

- 在`apply(PredicateKey input)`方法中，通过查看服务中的`request`中灰度标识。 

   - 如果为`false`，则为生产环境的请求。和`eureka`或`nacos`中服务列表中的灰度标识进行对比，也为`false`的，说明是生产的服务，则`apply(PredicateKey input)`返回`true`保留。为`true`的说明为灰度服务，则`apply(PredicateKey input)`返回`false`过滤掉。
  
   - 如果为`true`，则为灰度环境的请求。和`eureka`或`nacos`中服务列表中的灰度标识进行对比，为`false`的，说明是生产的服务，则`apply(PredicateKey input)`返回`false`过滤掉。为`true`的说明为灰度服务，则`apply(PredicateKey input)`返回`true`保留。
