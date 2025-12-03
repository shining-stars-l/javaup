---
slug: /tech-sharing/sclb-source/spring-cloud-loadblancer-part-3
---

# Spring-Cloud-Loadblancer详细分析_3

前两篇文章介绍了加载过程，本文从Feign的入口开始分析执行过程，还是从`FeignBlockingLoadBalancerClient.execute`来入手

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
		//在这步创建了每个服务的子容器		
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

## loadBalancerClientFactory.getInstances(serviceId, LoadBalancerLifecycle.class)

在这步是创建了每个服务的负载均衡子容器，`loadBalancerClientFactory`的生成过程在上篇文章已经分析了，这里`getInstances`实际调用的是父类`NamedContextFactory`

## NamedContextFactory.getInstances

```java
public <T> Map<String, T> getInstances(String name, Class<T> type) {
	AnnotationConfigApplicationContext context = getContext(name);

	return BeanFactoryUtils.beansOfTypeIncludingAncestors(context, type);
}
```

## NamedContextFactory.getContext

```java
protected AnnotationConfigApplicationContext getContext(String name) {
	if (!this.contexts.containsKey(name)) {
		synchronized (this.contexts) {
			if (!this.contexts.containsKey(name)) {
				//创建子容器，name为服务名 value为容器
				this.contexts.put(name, createContext(name));
			}
		}
	}
	return this.contexts.get(name);
}
```

## NamedContextFactory.createContext

```java
protected AnnotationConfigApplicationContext createContext(String name) {
	AnnotationConfigApplicationContext context;
	//创建容器
	if (this.parent != null) {
		DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
		if (parent instanceof ConfigurableApplicationContext) {
			beanFactory.setBeanClassLoader(
					((ConfigurableApplicationContext) parent).getBeanFactory().getBeanClassLoader());
		}
		else {
			beanFactory.setBeanClassLoader(parent.getClassLoader());
		}
		context = new AnnotationConfigApplicationContext(beanFactory);
		context.setClassLoader(this.parent.getClassLoader());
	}
	else {
		context = new AnnotationConfigApplicationContext();
	}
	//configurations就是LoadBalancerClientSpecification类型的LoadBalancerAutoConfiguration和BlockingLoadBalancerClientAutoConfiguration
	//这里是将@LoadBalancerClient对应的负载均衡配置注册到对应的容器中
	//由以上可知通过此步我们可以使用@LoadBalancerClient自定义负载均衡策略
	//如果不自定义的话，这里为false
	if (this.configurations.containsKey(name)) {
		for (Class<?> configuration : this.configurations.get(name).getConfiguration()) {
			context.register(configuration);
		}
	}
	//这时的configurations中会有LoadBalancerClientSpecification类型的LoadBalancerAutoConfiguration和BlockingLoadBalancerClientAutoConfiguration
	for (Map.Entry<String, C> entry : this.configurations.entrySet()) {
		if (entry.getKey().startsWith("default.")) {
			//不会进去for循环体，因为LoadBalancerAutoConfiguration和BlockingLoadBalancerClientAutoConfiguration
			//包装成LoadBalancerClientSpecification后entry.getValue().getConfiguration()没有值
			for (Class<?> configuration : entry.getValue().getConfiguration()) {
				context.register(configuration);
			}
		}
	}
	//defaultConfigType就是LoadBalancerClientConfiguration，在子类LoadBalancerClientFactory的构造方法传入
	//在刚才分析LoadBalancerClientFactory的时候介绍过
	context.register(PropertyPlaceholderAutoConfiguration.class, this.defaultConfigType);
	context.getEnvironment().getPropertySources().addFirst(new MapPropertySource(this.propertySourceName,
			Collections.<String, Object>singletonMap(this.propertyName, name)));
	//将父容器添加进去
	if (this.parent != null) {
		// Uses Environment from parent as well as beans
		context.setParent(this.parent);
	}
	context.setDisplayName(generateDisplayName(name));
	context.refresh();
	return context;
}
```

### 重点：

可以看到当每个服务创建子容器后，`LoadBalancerAutoConfiguration`、`BlockingLoadBalancerClientAutoConfiguration`、`LoadBalancerClientConfiguration`这三个非常重要的装配配置类都注册到了每个子容器中

服务的子容器创建完成后，下面就开始执行负载均衡的流程了

## BlockingLoadBalancerClient.choose

```java
public <T> ServiceInstance choose(String serviceId, Request<T> request) {
	//获取负载均衡器
	ReactiveLoadBalancer<ServiceInstance> loadBalancer = loadBalancerClientFactory.getInstance(serviceId);
	if (loadBalancer == null) {
		return null;
	}
	Response<ServiceInstance> loadBalancerResponse = Mono.from(loadBalancer.choose(request)).block();
	if (loadBalancerResponse == null) {
		return null;
	}
	return loadBalancerResponse.getServer();
}
```

## loadBalancerClientFactory.getInstance(serviceId)

```java
public ReactiveLoadBalancer<ServiceInstance> getInstance(String serviceId) {
	return getInstance(serviceId, ReactorServiceInstanceLoadBalancer.class);
}
```

这时的getInstance调用的是父类`NamedContextFactory.getInstance`

## NamedContextFactory.getInstance

```java
public <T> T getInstance(String name, Class<T> type) {
	AnnotationConfigApplicationContext context = getContext(name);
	try {
		return context.getBean(type);
	}
	catch (NoSuchBeanDefinitionException e) {
		// ignore
	}
	return null;
}
```

```java
protected AnnotationConfigApplicationContext getContext(String name) {
	if (!this.contexts.containsKey(name)) {
		synchronized (this.contexts) {
			if (!this.contexts.containsKey(name)) {
				this.contexts.put(name, createContext(name));
			}
		}
	}
	return this.contexts.get(name);
}
```

刚才介绍了，在`BlockingLoadBalancerClient.choose`执行之前，子容器已经创建完毕，这里就执行返回

容器返回后，获取`ReactorServiceInstanceLoadBalancer`类型的对象，此类型的对象就是在`LoadBalancerClientConfiguration`创建的，我们再看一眼

```java
@Configuration(proxyBeanMethods = false)
@ConditionalOnDiscoveryEnabled
public class LoadBalancerClientConfiguration {

	private static final int REACTIVE_SERVICE_INSTANCE_SUPPLIER_ORDER = 193827465;

	@Bean
	@ConditionalOnMissingBean
	public ReactorLoadBalancer<ServiceInstance> reactorServiceInstanceLoadBalancer(Environment environment,
			LoadBalancerClientFactory loadBalancerClientFactory) {
		String name = environment.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
		return new RoundRobinLoadBalancer(
				loadBalancerClientFactory.getLazyProvider(name, ServiceInstanceListSupplier.class), name);
	}

	//省略
}
```

## RoundRobinLoadBalancer结构图
![](/img/technologySharing/Spring-Cloud-Loadblancer/RoundRobinLoadBalancer结构图.png)
所以`loadBalancerClientFactory.getInstance(serviceId)`返回的就是`RoundRobinLoadBalancer`，然后就会调用此策略进行执行

## RoundRobinLoadBalancer.choose

```java
public Mono<Response<ServiceInstance>> choose(Request request) {
	ServiceInstanceListSupplier supplier = serviceInstanceListSupplierProvider
			.getIfAvailable(NoopServiceInstanceListSupplier::new);
	return supplier.get(request).next()
			.map(serviceInstances -> processInstanceResponse(supplier, serviceInstances));
}
```

- `serviceInstanceListSupplierProvider.getIfAvailable(NoopServiceInstanceListSupplier::new)`就是获取注册中心的服务列表了
- `processInstanceResponse`执行具体的负载均衡策略

## serviceInstanceListSupplierProvider

```java
public T getIfAvailable(Supplier<T> defaultSupplier) throws BeansException {
	return delegate().getIfAvailable(defaultSupplier);
}

default T getIfAvailable(Supplier<T> defaultSupplier) throws BeansException {
	T dependency = getIfAvailable();
	//dependency 的类型是CachingServiceInstanceListSupplier
	return (dependency != null ? dependency : defaultSupplier.get());
}
```

## RoundRobinLoadBalancer.processInstanceResponse

```java
private Response<ServiceInstance> processInstanceResponse(ServiceInstanceListSupplier supplier,
		List<ServiceInstance> serviceInstances) {
	//serviceInstances就是获取的服务列表了	
	//getInstanceResponse(serviceInstances)就是真正的负债均衡策略了
	Response<ServiceInstance> serviceInstanceResponse = getInstanceResponse(serviceInstances);
	if (supplier instanceof SelectedInstanceCallback && serviceInstanceResponse.hasServer()) {
		//
		((SelectedInstanceCallback) supplier).selectedServiceInstance(serviceInstanceResponse.getServer());
	}
	return serviceInstanceResponse;
}
```

## RoundRobinLoadBalancer.getInstanceResponse

```java
private Response<ServiceInstance> getInstanceResponse(List<ServiceInstance> instances) {
	if (instances.isEmpty()) {
		if (log.isWarnEnabled()) {
			log.warn("No servers available for service: " + serviceId);
		}
		return new EmptyResponse();
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

可以看到是轮训的策略

那么服务列表是怎么获取的呢，在下篇文章中我们回详细的分析
