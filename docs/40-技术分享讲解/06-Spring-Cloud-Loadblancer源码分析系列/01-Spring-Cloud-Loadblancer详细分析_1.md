---
slug: /tech-sharing/sclb-source/spring-cloud-loadblancer-part-1
---

# Spring-Cloud-Loadblancer详细分析_1

# 背景

从SpringCloud 2020 版本之后，组件移除了除 Eureka 以外，所有 Netflix 的相关，包括最常用的 Ribbon Hystrix 等，所以 SpringCloud 在 spring-cloud-commons 提供了Loadbalancer 用来替代 Ribbon。本系列就来介绍Loadbalancer 的执行流程

**项目版本:**

- `Spring-Boot`2.6.13
- `Spring-Cloud` 2021.0.5
- `spring-cloud-alibaba` 2021.0.5.0
- `Loadbalancer` 3.1.5

从项目中最常用的Feign来当做入口，不了解Feign的原理也没有关系，直接从Feign和Loadbalancer 的集成部分分析即可

## 入口处

### FeignBlockingLoadBalancerClient

```java
public class FeignBlockingLoadBalancerClient implements Client {

	private static final Log LOG = LogFactory.getLog(FeignBlockingLoadBalancerClient.class);

	private final Client delegate;

	private final LoadBalancerClient loadBalancerClient;

	private final LoadBalancerClientFactory loadBalancerClientFactory;


	@Override
	public Response execute(Request request, Request.Options options) throws IOException {
		//请求路径
		final URI originalUri = URI.create(request.url());
		//获取到要调用的服务id
		String serviceId = originalUri.getHost();
		DefaultRequest<RequestDataContext> lbRequest = new DefaultRequest<>(
				new RequestDataContext(buildRequestData(request), hint));	
		Set<LoadBalancerLifecycle> supportedLifecycleProcessors = LoadBalancerLifecycleValidator
				.getSupportedLifecycleProcessors(
						//在这步创建了每个服务的子容器	
						loadBalancerClientFactory.getInstances(serviceId, LoadBalancerLifecycle.class),
						RequestDataContext.class, ResponseData.class, ServiceInstance.class);
		supportedLifecycleProcessors.forEach(lifecycle -> lifecycle.onStart(lbRequest));		
		//执行loadBalancer的负载均衡策略，返回将过滤后的服务，非常重要
		ServiceInstance instance = loadBalancerClient.choose(serviceId, lbRequest);
		org.springframework.cloud.client.loadbalancer.Response<ServiceInstance> lbResponse = new DefaultResponse(
				instance);
		//省略...

		//将ServiceInstance进行解析后，转换为真正的http方式进行远程调用服务
		String reconstructedUrl = loadBalancerClient.reconstructURI(instance, originalUri).toString();
		Request newRequest = buildRequest(request, reconstructedUrl);
		LoadBalancerProperties loadBalancerProperties = loadBalancerClientFactory.getProperties(serviceId);
		return executeWithLoadBalancerLifecycleProcessing(delegate, options, newRequest, lbRequest, lbResponse,
				supportedLifecycleProcessors, loadBalancerProperties.isUseRawStatusCodeInResponseData());
	}

	protected Request buildRequest(Request request, String reconstructedUrl) {
		return Request.create(request.httpMethod(), reconstructedUrl, request.headers(), request.body(),
				request.charset(), request.requestTemplate());
	}

	private String getHint(String serviceId) {
		LoadBalancerProperties properties = loadBalancerClientFactory.getProperties(serviceId);
		String defaultHint = properties.getHint().getOrDefault("default", "default");
		String hintPropertyValue = properties.getHint().get(serviceId);
		return hintPropertyValue != null ? hintPropertyValue : defaultHint;
	}

}
```

可以看到，在OpenFeign中调用了`loadBalancerClient.choose(serviceId, lbRequest)`来实现负载均衡策略，然后返回过滤后的服务`ServiceInstance`，也就是服务的对象。我们要重点分析此过程

首先分析`loadBalancerClient`是怎么注入进来的呢，我们先看下其结构

### ServiceInstanceChooser

```java
public interface ServiceInstanceChooser {

	ServiceInstance choose(String serviceId);

	
	<T> ServiceInstance choose(String serviceId, Request<T> request);

}
```

### LoadBalancerClient

```java
public interface LoadBalancerClient extends ServiceInstanceChooser {

	
	<T> T execute(String serviceId, LoadBalancerRequest<T> request) throws IOException;

	
	<T> T execute(String serviceId, ServiceInstance serviceInstance, LoadBalancerRequest<T> request) throws IOException;

	
	URI reconstructURI(ServiceInstance instance, URI original);

}
```

可以看到`ServiceInstanceChooser`定义了负载均衡的方法， `LoadBalancerClient`则继承了`ServiceInstanceChooser`额外定义了`execute`执行和`reconstructURI`构建真正http请求的方法

那么`LoadBalancerClient`的实现是谁呢，刚才的疑问中又是怎么被注入的呢，其实`LoadBalancerClient`的实现是`BlockingLoadBalancerClient`，在配置类`BlockingLoadBalancerClientAutoConfiguration`中被注入

这里既然提到了自动装配配置类，那么我们就需要看下其结构，来了解各个作用

```latex
# AutoConfiguration
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
org.springframework.cloud.loadbalancer.config.LoadBalancerAutoConfiguration,\
org.springframework.cloud.loadbalancer.config.BlockingLoadBalancerClientAutoConfiguration,\
org.springframework.cloud.loadbalancer.config.LoadBalancerCacheAutoConfiguration,\
org.springframework.cloud.loadbalancer.security.OAuth2LoadBalancerClientAutoConfiguration,\
org.springframework.cloud.loadbalancer.config.LoadBalancerStatsAutoConfiguration
```

- `LoadBalancerAutoConfiguration` 是最核心最重要的配置，随后会详细的分析
- `BlockingLoadBalancerClientAutoConfiguration` 上文中提高的`LoadBalancerClient`的实现类`BlockingLoadBalancerClient`就是在此装配的

### BlockingLoadBalancerClientAutoConfiguration

```java
@Configuration(proxyBeanMethods = false)
@LoadBalancerClients
@AutoConfigureAfter(LoadBalancerAutoConfiguration.class)
@AutoConfigureBefore({ org.springframework.cloud.client.loadbalancer.LoadBalancerAutoConfiguration.class,
		AsyncLoadBalancerAutoConfiguration.class })
@ConditionalOnClass(RestTemplate.class)
public class BlockingLoadBalancerClientAutoConfiguration {

	@Bean
	@ConditionalOnBean(LoadBalancerClientFactory.class)
	@ConditionalOnMissingBean
	public LoadBalancerClient blockingLoadBalancerClient(LoadBalancerClientFactory loadBalancerClientFactory) {
		return new BlockingLoadBalancerClient(loadBalancerClientFactory);
	}

	//省略

}
```

可以看到注入了`LoadBalancerClient`的实现类`BlockingLoadBalancerClient`。但此自动配置类的装配有很多的规则：

1. `@LoadBalancerClients` 此注解非常重要，实现每个服务间的负载均衡配置隔离就是通过此注解，后面会详细的分析
2. `@AutoConfigureAfter(LoadBalancerAutoConfiguration.class)`在`LoadBalancerAutoConfiguration`之后进行装配，`LoadBalancerAutoConfiguration`也很重要，后面也会详细的分析
3. `@AutoConfigureBefore({ org.springframework.cloud.client.loadbalancer.LoadBalancerAutoConfiguration.class, AsyncLoadBalancerAutoConfiguration.class })`  在`org.springframework.cloud.client.loadbalancer.LoadBalancerAutoConfiguration`和`AsyncLoadBalancerAutoConfiguration`之前进行装配。注意：**2和3中的LoadBalancerAutoConfiguration不是一个对象，2中的是在spring-cloud-loadbalancer模块中，3中的是在spring-cloud-commons模块中**，这也是有步骤2的原因，毕竟肯定是要先装配本模块下的
4. `@ConditionalOnClass(RestTemplate.class)`这个不是重点，可以略过
5. `@ConditionalOnBean(LoadBalancerClientFactory.class)` 在注入时依赖了`LoadBalancerClientFactory`，`LoadBalancerClientFactory`也非常的重要，后面也会进行详细的分析

上面多次提到了`LoadBalancerAutoConfiguration`，自动装配中也有它，那么现在就来分析下其流程

### LoadBalancerAutoConfiguration

```java
@Configuration(proxyBeanMethods = false)
@LoadBalancerClients
@EnableConfigurationProperties(LoadBalancerClientsProperties.class)
@AutoConfigureBefore({ ReactorLoadBalancerClientAutoConfiguration.class,
		LoadBalancerBeanPostProcessorAutoConfiguration.class })
@ConditionalOnProperty(value = "spring.cloud.loadbalancer.enabled", havingValue = "true", matchIfMissing = true)
public class LoadBalancerAutoConfiguration {
	//依赖了LoadBalancerClientSpecification类型的对象集合
	private final ObjectProvider<List<LoadBalancerClientSpecification>> configurations;

	public LoadBalancerAutoConfiguration(ObjectProvider<List<LoadBalancerClientSpecification>> configurations) {
		this.configurations = configurations;
	}

	@Bean
	@ConditionalOnMissingBean
	public LoadBalancerZoneConfig zoneConfig(Environment environment) {
		return new LoadBalancerZoneConfig(environment.getProperty("spring.cloud.loadbalancer.zone"));
	}

	@ConditionalOnMissingBean
	@Bean
	public LoadBalancerClientFactory loadBalancerClientFactory(LoadBalancerClientsProperties properties) {
		LoadBalancerClientFactory clientFactory = new LoadBalancerClientFactory(properties);
		//LoadBalancerClientSpecification类型的配置类集合对象注入到NamedContextFactory，实现个性化配置
		clientFactory.setConfigurations(this.configurations.getIfAvailable(Collections::emptyList));
		return clientFactory;
	}

}
```

可以看到此配置类的装配规则也比较复杂，但大部分都和本系列要分析的内容关联性不大，直接略过即可，我们只关心两个地方

- `@LoadBalancerClients` 这个注解出现多次，我们会做详细的分析
- 注入了`loadBalancerClientFactory`，这个也非常的重要，随后会做详细的分析

到这里我们要解决的三个重点：

- `@LoadBalancerClients`的作用
- `ObjectProvider<List<LoadBalancerClientSpecification>> configurations`的作用
- `LoadBalancerClientFactory`的作用，别忘了负载均衡的执行对象`BlockingLoadBalancerClient`在生成时，将此对象注入了进去

下一篇文章我们进行详细分析
