---
slug: /tech-sharing/nacos-source/springboot-nacos-part-1
---

# SpringBoot客户端服务注册Nacos原理_1

- `nacos`:2.0.3
- `spring-cloud-starter-alibaba-nacos-discovery`:2.2.7.RELEASE

## 根据springboot自动装配原理

依赖：

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    <version>2.2.7.RELEASE</version>
</dependency>
```
![](/img/technologySharing/nacos/spring-cloud-starter-alibaba-nacos-discovery.png)

**spring.factories**

```
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
  com.alibaba.cloud.nacos.discovery.NacosDiscoveryAutoConfiguration,\
  com.alibaba.cloud.nacos.ribbon.RibbonNacosAutoConfiguration,\
  com.alibaba.cloud.nacos.endpoint.NacosDiscoveryEndpointAutoConfiguration,\
  com.alibaba.cloud.nacos.registry.NacosServiceRegistryAutoConfiguration,\
  com.alibaba.cloud.nacos.discovery.NacosDiscoveryClientConfiguration,\
  com.alibaba.cloud.nacos.discovery.reactive.NacosReactiveDiscoveryClientConfiguration,\
  com.alibaba.cloud.nacos.discovery.configclient.NacosConfigServerAutoConfiguration,\
  com.alibaba.cloud.nacos.NacosServiceAutoConfiguration
```

重点关注`NacosServiceRegistryAutoConfiguration`
### NacosServiceRegistryAutoConfiguration:

```java
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties
@ConditionalOnNacosDiscoveryEnabled
@ConditionalOnProperty(value = "spring.cloud.service-registry.auto-registration.enabled",
		matchIfMissing = true)
@AutoConfigureAfter({ AutoServiceRegistrationConfiguration.class,
		AutoServiceRegistrationAutoConfiguration.class,
		NacosDiscoveryAutoConfiguration.class })
public class NacosServiceRegistryAutoConfiguration {

	@Bean
	public NacosServiceRegistry nacosServiceRegistry(
			NacosServiceManager nacosServiceManager,
			NacosDiscoveryProperties nacosDiscoveryProperties) {
		return new NacosServiceRegistry(nacosServiceManager, nacosDiscoveryProperties);
	}

	@Bean
	@ConditionalOnBean(AutoServiceRegistrationProperties.class)
	public NacosRegistration nacosRegistration(
			ObjectProvider<List<NacosRegistrationCustomizer>> registrationCustomizers,
			NacosDiscoveryProperties nacosDiscoveryProperties,
			ApplicationContext context) {
		return new NacosRegistration(registrationCustomizers.getIfAvailable(),
				nacosDiscoveryProperties, context);
	}

	@Bean
	@ConditionalOnBean(AutoServiceRegistrationProperties.class)
	public NacosAutoServiceRegistration nacosAutoServiceRegistration(
			NacosServiceRegistry registry,
			AutoServiceRegistrationProperties autoServiceRegistrationProperties,
			NacosRegistration registration) {
		return new NacosAutoServiceRegistration(registry,
				autoServiceRegistrationProperties, registration);
	}

}
```

重点关注`nacosAutoServiceRegistration方法`，进入此方法

```java
public NacosAutoServiceRegistration(ServiceRegistry<Registration> serviceRegistry,
    AutoServiceRegistrationProperties autoServiceRegistrationProperties,
    NacosRegistration registration) {
  super(serviceRegistry, autoServiceRegistrationProperties);
  this.registration = registration;
}
```

再进入`super(serviceRegistry, autoServiceRegistrationProperties)`
### AbstractAutoServiceRegistration:

```java
public abstract class AbstractAutoServiceRegistration<R extends Registration>
		implements AutoServiceRegistration, ApplicationContextAware,
		ApplicationListener<WebServerInitializedEvent> {

    /**
    * 省略部分代码
    */
	protected AbstractAutoServiceRegistration(ServiceRegistry<R> serviceRegistry,
			AutoServiceRegistrationProperties properties) {
		this.serviceRegistry = serviceRegistry;
		this.properties = properties;
	}

	@Override
	@SuppressWarnings("deprecation")
	public void onApplicationEvent(WebServerInitializedEvent event) {
		bind(event);
	}

	@Deprecated
	public void bind(WebServerInitializedEvent event) {
		ApplicationContext context = event.getApplicationContext();
		if (context instanceof ConfigurableWebServerApplicationContext) {
			if ("management".equals(((ConfigurableWebServerApplicationContext) context)
					.getServerNamespace())) {
				return;
			}
		}
        //将端口记录
		this.port.compareAndSet(0, event.getWebServer().getPort());
        //服务注册
		this.start();
	}

	public void start() {
    
		if (!isEnabled()) {
			if (logger.isDebugEnabled()) {
				logger.debug("Discovery Lifecycle disabled. Not starting");
			}
			return;
		}

		// only initialize if nonSecurePort is greater than 0 and it isn't already running
		// because of containerPortInitializer below
        //服务不是运行状态的话进行注册服务
		if (!this.running.get()) {
            //发布事件
			this.context.publishEvent(
					new InstancePreRegisteredEvent(this, getRegistration()));
            //注册服务逻辑
			register();
			if (shouldRegisterManagement()) {
				registerManagement();
			}
			this.context.publishEvent(
					new InstanceRegisteredEvent<>(this, getConfiguration()));
			this.running.compareAndSet(false, true);
		}

	}
	

	/**
	 * Register the local service with the {@link ServiceRegistry}.
	 */
	protected void register() {
        //真正的服务注册逻辑，serviceRegistry实际为NacosServiceRegistry
		this.serviceRegistry.register(getRegistration());
	}


	/**
	 * De-register the local service with the {@link ServiceRegistry}.
	 */
	protected void deregister() {
		this.serviceRegistry.deregister(getRegistration());
	}
}
```

可以看到结构：
![](/img/technologySharing/nacos/结构.png)

1. 可见`NacosAutoServiceRegistration`的父类`AbstractAutoServiceRegistration`实现了`ApplicationListener`接口。
2. 所以要找`onApplicationEvent`方法，spring容器启动后会执行这个方法。

有上述代码可知`onApplicationEvent`最终会执行到`NacosServiceRegistry#register`

### NacosServiceRegistry:

```java
public void register(Registration registration) {

	if (StringUtils.isEmpty(registration.getServiceId())) {
		log.warn("No service to register for nacos client...");
		return;
	}
  //这个namingService实际为namingService，后续会详细说明
	NamingService namingService = namingService();
  //服务名
	String serviceId = registration.getServiceId();
  //服务组
	String group = nacosDiscoveryProperties.getGroup();

	Instance instance = getNacosInstanceFromRegistration(registration);

	try {
    	//nacos的核心服务注册逻辑
		namingService.registerInstance(serviceId, group, instance);
		log.info("nacos registry, {} {} {}:{} register finished", group, serviceId,
				instance.getIp(), instance.getPort());
	}
	catch (Exception e) {
		if (nacosDiscoveryProperties.isFailFast()) {
			log.error("nacos registry, {} register failed...{},", serviceId,
					registration.toString(), e);
			rethrowRuntimeException(e);
		}
		else {
			log.warn("Failfast is false. {} register failed...{},", serviceId,
					registration.toString(), e);
		}
	}
}
```
