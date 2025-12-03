---
slug: /link-flow/loadbalancer-analysis/sclb-analysis-4
---

# Spring-Cloud-Loadblancer详细分析_4

在`RoundRobinLoadBalancer.choose`中的`serviceInstanceListSupplierProvider`就是获取服务列表的关键，那么此对象是怎么拿到的呢，让我们回到`RoundRobinLoadBalancer`的创建过程

```java
@Configuration(proxyBeanMethods = false)
@ConditionalOnDiscoveryEnabled
public class LoadBalancerClientConfiguration {

	private static final int REACTIVE_SERVICE_INSTANCE_SUPPLIER_ORDER = 193827465;

	/**
	 * 轮训的负载均衡策略
	 */
	@Bean
	@ConditionalOnMissingBean
	public ReactorLoadBalancer<ServiceInstance> reactorServiceInstanceLoadBalancer(Environment environment,
			LoadBalancerClientFactory loadBalancerClientFactory) {
		String name = environment.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
		return new RoundRobinLoadBalancer(
				loadBalancerClientFactory.getLazyProvider(name, ServiceInstanceListSupplier.class), name);
	}

	/**
	 * WebFlux环境下的ServiceInstanceListSupplier的bean
	 */
	@Configuration(proxyBeanMethods = false)
	@ConditionalOnReactiveDiscoveryEnabled
	@Order(REACTIVE_SERVICE_INSTANCE_SUPPLIER_ORDER)
	public static class ReactiveSupportConfiguration {

		@Bean
		@ConditionalOnBean(ReactiveDiscoveryClient.class)
		@ConditionalOnMissingBean
		@Conditional(DefaultConfigurationCondition.class)
		public ServiceInstanceListSupplier discoveryClientServiceInstanceListSupplier(
				ConfigurableApplicationContext context) {
			return ServiceInstanceListSupplier.builder().withDiscoveryClient().withCaching().build(context);
		}
		//省略	
	}

	/**
	 * web环境的ServiceInstanceListSupplier的bean
	 */
	@Configuration(proxyBeanMethods = false)
	@ConditionalOnBlockingDiscoveryEnabled
	@Order(REACTIVE_SERVICE_INSTANCE_SUPPLIER_ORDER + 1)
	public static class BlockingSupportConfiguration {

		@Bean
		@ConditionalOnBean(DiscoveryClient.class)
		@ConditionalOnMissingBean
		@Conditional(DefaultConfigurationCondition.class)
		public ServiceInstanceListSupplier discoveryClientServiceInstanceListSupplier(
				ConfigurableApplicationContext context) {
			return ServiceInstanceListSupplier.builder().withBlockingDiscoveryClient().withCaching().build(context);
		}

	}

	//省略
}
```

可以看都是在`LoadBalancerClientConfiguration`中配置的，可见此配置类的重要程度

web环境的加载就是`BlockingSupportConfiguration`下的`discoveryClientServiceInstanceListSupplier`

```java
@Bean
@ConditionalOnBean(DiscoveryClient.class)
@ConditionalOnMissingBean
@Conditional(DefaultConfigurationCondition.class)
public ServiceInstanceListSupplier discoveryClientServiceInstanceListSupplier(
		ConfigurableApplicationContext context) {
	return ServiceInstanceListSupplier.builder().withBlockingDiscoveryClient().withCaching().build(context);
}
```

调用了`ServiceInstanceListSupplier.builder().withBlockingDiscoveryClient().withCaching().build(context)`来创建`ServiceInstanceListSupplier`。这一行有多个方法，我们逐个分析

## ServiceInstanceListSupplier

```java
public interface ServiceInstanceListSupplier extends Supplier<Flux<List<ServiceInstance>>> {

	String getServiceId();

	default Flux<List<ServiceInstance>> get(Request request) {
		return get();
	}

	static ServiceInstanceListSupplierBuilder builder() {
		return new ServiceInstanceListSupplierBuilder();
	}

}
```

提供了`builder`方法返回 `ServiceInstanceListSupplierBuilder` 实例

## ServiceInstanceListSupplierBuilder

```java
public final class ServiceInstanceListSupplierBuilder {

	private static final Log LOG = LogFactory.getLog(ServiceInstanceListSupplierBuilder.class);

	private Creator baseCreator;

	private DelegateCreator cachingCreator;

	private final List<DelegateCreator> creators = new ArrayList<>();

	ServiceInstanceListSupplierBuilder() {
	}

	/**
	 * Sets a blocking {@link DiscoveryClient}-based
	 * {@link DiscoveryClientServiceInstanceListSupplier} as a base
	 * {@link ServiceInstanceListSupplier} in the hierarchy.
	 * @return the {@link ServiceInstanceListSupplierBuilder} object
	 */
	public ServiceInstanceListSupplierBuilder withBlockingDiscoveryClient() {
		if (baseCreator != null && LOG.isWarnEnabled()) {
			LOG.warn("Overriding a previously set baseCreator with a blocking DiscoveryClient baseCreator.");
		}
		this.baseCreator = context -> {
			//获取注册中心的操作对象 discoveryClient 
			DiscoveryClient discoveryClient = context.getBean(DiscoveryClient.class);

			return new DiscoveryClientServiceInstanceListSupplier(discoveryClient, context.getEnvironment());
		};
		return this;
	}


	/**
	 * If {@link LoadBalancerCacheManager} is available in the context, wraps created
	 * {@link ServiceInstanceListSupplier} hierarchy with a
	 * {@link CachingServiceInstanceListSupplier} instance to provide a caching mechanism
	 * for service instances. Uses {@link ObjectProvider} to lazily resolve
	 * {@link LoadBalancerCacheManager}.
	 * @return the {@link ServiceInstanceListSupplierBuilder} object
	 */
	public ServiceInstanceListSupplierBuilder withCaching() {
		if (cachingCreator != null && LOG.isWarnEnabled()) {
			LOG.warn(
					"Overriding a previously set cachingCreator with a CachingServiceInstanceListSupplier-based cachingCreator.");
		}
		this.cachingCreator = (context, delegate) -> {
			ObjectProvider<LoadBalancerCacheManager> cacheManagerProvider = context
					.getBeanProvider(LoadBalancerCacheManager.class);
			if (cacheManagerProvider.getIfAvailable() != null) {
				return new CachingServiceInstanceListSupplier(delegate, cacheManagerProvider.getIfAvailable());
			}
			if (LOG.isWarnEnabled()) {
				LOG.warn("LoadBalancerCacheManager not available, returning delegate without caching.");
			}
			return delegate;
		};
		return this;
	}

	
	/**
	 * Builds the {@link ServiceInstanceListSupplier} hierarchy.
	 * @param context application context
	 * @return a {@link ServiceInstanceListSupplier} instance on top of the delegate
	 * hierarchy
	 */
	public ServiceInstanceListSupplier build(ConfigurableApplicationContext context) {
		Assert.notNull(baseCreator, "A baseCreator must not be null");

		ServiceInstanceListSupplier supplier = baseCreator.apply(context);

		for (DelegateCreator creator : creators) {
			supplier = creator.apply(context, supplier);
		}

		if (this.cachingCreator != null) {
			supplier = this.cachingCreator.apply(context, supplier);
		}
		return supplier;
	}

	//省略
}
```

在调用`withBlockingDiscoveryClient()`方法，内部调用了`new DiscoveryClientServiceInstanceListSupplier(discoveryClient, context.getEnvironment())`

## DiscoveryClientServiceInstanceListSupplier

```java
public class DiscoveryClientServiceInstanceListSupplier implements ServiceInstanceListSupplier {

	/**
	 * Property that establishes the timeout for calls to service discovery.
	 */
	public static final String SERVICE_DISCOVERY_TIMEOUT = "spring.cloud.loadbalancer.service-discovery.timeout";

	private static final Log LOG = LogFactory.getLog(DiscoveryClientServiceInstanceListSupplier.class);

	private Duration timeout = Duration.ofSeconds(30);

	private final String serviceId;

	private final Flux<List<ServiceInstance>> serviceInstances;

	public DiscoveryClientServiceInstanceListSupplier(DiscoveryClient delegate, Environment environment) {
		this.serviceId = environment.getProperty(PROPERTY_NAME);
		resolveTimeout(environment);
		//delegate.getInstances(serviceId)就是从注册中心拉取服务列表了，
		//然后赋给serviceInstances 
		this.serviceInstances = Flux.defer(() -> Mono.fromCallable(() -> delegate.getInstances(serviceId)))
				.timeout(timeout, Flux.defer(() -> {
					logTimeout();
					return Flux.just(new ArrayList<>());
				}), Schedulers.boundedElastic()).onErrorResume(error -> {
					logException(error);
					return Flux.just(new ArrayList<>());
				});
	}

	//省略

	@Override
	public String getServiceId() {
		return serviceId;
	}

	@Override
	public Flux<List<ServiceInstance>> get() {
		return serviceInstances;
	}

	private void resolveTimeout(Environment environment) {
		String providedTimeout = environment.getProperty(SERVICE_DISCOVERY_TIMEOUT);
		if (providedTimeout != null) {
			timeout = DurationStyle.detectAndParse(providedTimeout);
		}
	}

	private void logTimeout() {
		if (LOG.isDebugEnabled()) {
			LOG.debug(String.format("Timeout occurred while retrieving instances for service %s."
					+ "The instances could not be retrieved during %s", serviceId, timeout));
		}
	}

	private void logException(Throwable error) {
		if (LOG.isErrorEnabled()) {
			LOG.error(String.format("Exception occurred while retrieving instances for service %s", serviceId), error);
		}
	}

}
```

然后就来到了`withCaching()`

```java
public ServiceInstanceListSupplierBuilder withCaching() {
	if (cachingCreator != null && LOG.isWarnEnabled()) {
		LOG.warn(
				"Overriding a previously set cachingCreator with a CachingServiceInstanceListSupplier-based cachingCreator.");
	}
	this.cachingCreator = (context, delegate) -> {
		ObjectProvider<LoadBalancerCacheManager> cacheManagerProvider = context
				.getBeanProvider(LoadBalancerCacheManager.class);
		if (cacheManagerProvider.getIfAvailable() != null) {
			return new CachingServiceInstanceListSupplier(delegate, cacheManagerProvider.getIfAvailable());
		}
		if (LOG.isWarnEnabled()) {
			LOG.warn("LoadBalancerCacheManager not available, returning delegate without caching.");
		}
		return delegate;
	};
	return this;
}
```

`build(context)`进行构建

```java
public ServiceInstanceListSupplier build(ConfigurableApplicationContext context) {
	Assert.notNull(baseCreator, "A baseCreator must not be null");

	ServiceInstanceListSupplier supplier = baseCreator.apply(context);

	for (DelegateCreator creator : creators) {
		supplier = creator.apply(context, supplier);
	}

	if (this.cachingCreator != null) {
		supplier = this.cachingCreator.apply(context, supplier);
	}
	return supplier;
}
```
