---
slug: /link-flow/lb-enhancement/lb-strategy-enhancement
---

import PaidCTA from '@site/src/components/PaidCTA';

# 微服务中的LoadBalancer策略增强

本章节是讲解如何对原有的微服务中负载均衡的逻辑进行定制化增强，这里的逻辑有点难度，涉及到了对源码的修改，但本人会以最容易理解的方式来讲解，请放心食用。

负载均衡的功能简单介绍下，比如请求中的逻辑要A服务 调用 B服务，由于此业务并发比较高。为了缓解B服务的压力，B服务就会有多台服务实例，来缓解单个实例的压力，比如有B1、B2、B3。

而A服务调用B服务时，就会将压力分担到这三个实例上，最常见的调用方式就是轮询策略，比如 此业务有3个请求，那么A服务来调用B服务时，被调用的实例依次就是B1、B2、B3。除了除轮询策略，还有随机策略、权重策略等。而这些策略就是所谓的负载均衡了。

而在 SpringBoot 2.6之后，负载均衡的实现从 Ribbon 变成 LoadBalancer，link-flow 的SpringBoot版本为3.3.0，所以就是 LoadBalancer。

关于 LoadBalancer 负载均衡的详细原理分析，并不要求掌握，因为真的有难度，能把 link-flow 能掌握就已经可以了，但如果确实想了解的话，请跳转到 Spirng-Cloud-LoadBlancer源码分析 系列章节。

而 link-flow 要做的就是将满足路由条件的服务实例留下，剩下的服务实例再负载均衡。

比如说请求调用规则 路由参数 version=2，意思是只能调用版本是2的服务实例。假设B1版本是1、B2版本是2、B3版本是2。那么link-flow就会将B1过滤掉，留下B2和B3，接着再从B2和B3中执行负载均衡。
所以我们要在原有的 SpringCloud 逻辑中，添加 link-flow 的功能。

# LoadBalancer负载均衡配置
原有的负载均衡配置
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

		@Bean
		@ConditionalOnBean(ReactiveDiscoveryClient.class)
		@ConditionalOnMissingBean
		@Conditional(ZonePreferenceConfigurationCondition.class)
		public ServiceInstanceListSupplier zonePreferenceDiscoveryClientServiceInstanceListSupplier(
				ConfigurableApplicationContext context) {
			return ServiceInstanceListSupplier.builder().withDiscoveryClient().withCaching().withZonePreference()
					.build(context);
		}

		@Bean
		@ConditionalOnBean(LoadBalancerClientFactory.class)
		@ConditionalOnMissingBean
		public XForwardedHeadersTransformer xForwarderHeadersTransformer(LoadBalancerClientFactory clientFactory) {
			return new XForwardedHeadersTransformer(clientFactory);
		}

    }
    //省略... ...
}    
```
别担心，并不要求清楚这里都是干嘛的，只是让你知道一下 LoadBalancer 的配置是在这里的，而要做的功能就是把这里的配置替换掉，换成 link-flow 的

那么应该怎样能替换成功呢？仔细看每个bean上面都有个这个注解 @ConditionalOnMissingBean

关于此注解的详细讲解，请跳转到 技术精华精讲-@ConditionalOnMissingBean的作用 章节

依然这些bean的生成都有 @ConditionalOnMissingBean 注解，那就说明是可以被替换的，那就替换成 link-flow 的呗，替换也简单，就是要保证 link-flow中的bean加载时机要比这些原有bean的加载时机要早！

这里要用到 @AutoConfigureBefore 注解，关于此注解的详细讲解，请跳转到 技术精华精讲-@AutoConfigureBefore的作用 章节。

<PaidCTA />