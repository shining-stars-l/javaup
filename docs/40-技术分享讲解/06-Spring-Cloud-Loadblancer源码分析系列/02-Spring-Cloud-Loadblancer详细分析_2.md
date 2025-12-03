---
slug: /tech-sharing/sclb-source/spring-cloud-loadblancer-part-2
---

# Spring-Cloud-Loadblancer详细分析_2

## @LoadBalancerClients

终于分析到了此注解的作用，它是实现不同服务之间的配置隔离的关键

```java
@Configuration(proxyBeanMethods = false)
@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.TYPE })
@Documented
@Import(LoadBalancerClientConfigurationRegistrar.class)
public @interface LoadBalancerClients {

	LoadBalancerClient[] value() default {};

	/**
	 * {@link LoadBalancerClientConfigurationRegistrar} creates a
	 * {@link LoadBalancerClientSpecification} with this as an argument. These in turn are
	 * added as default contexts in {@link LoadBalancerClientFactory}. Configuration
	 * defined in these classes are used as defaults if values aren't defined via
	 * {@link LoadBalancerClient#configuration()}
	 * @return classes for default configurations
	 */
	Class<?>[] defaultConfiguration() default {};

}

@Configuration(proxyBeanMethods = false)
@Import(LoadBalancerClientConfigurationRegistrar.class)
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface LoadBalancerClient {

	/**
	 * Synonym for name (the name of the client).
	 *
	 * @see #name()
	 * @return the name of the load balancer client
	 */
	@AliasFor("name")
	String value() default "";

	/**
	 * The name of the load balancer client, uniquely identifying a set of client
	 * resources, including a load balancer.
	 * @return the name of the load balancer client
	 */
	@AliasFor("value")
	String name() default "";

	/**
	 * A custom <code>@Configuration</code> for the load balancer client. Can contain
	 * override <code>@Bean</code> definition for the pieces that make up the client.
	 *
	 * @see LoadBalancerClientConfiguration for the defaults
	 * @return configuration classes for the load balancer client.
	 */
	Class<?>[] configuration() default {};

}
```

- `LoadBalancerClients`就是其实就是多个`LoadBalancerClient`
- `LoadBalancerClient` 相当于一个负载均衡配置，name/value 就是 serviceId，configuration 就是负载均衡配置
- 通过`@Import(LoadBalancerClientConfigurationRegistrar.class)`来进行注入

## LoadBalancerClientConfigurationRegistrar

```java
public class LoadBalancerClientConfigurationRegistrar implements ImportBeanDefinitionRegistrar {

	private static String getClientName(Map<String, Object> client) {
		if (client == null) {
			return null;
		}
		String value = (String) client.get("value");
		if (!StringUtils.hasText(value)) {
			value = (String) client.get("name");
		}
		if (StringUtils.hasText(value)) {
			return value;
		}
		throw new IllegalStateException("Either 'name' or 'value' must be provided in @LoadBalancerClient");
	}

	private static void registerClientConfiguration(BeanDefinitionRegistry registry, Object name,
			Object configuration) {
		BeanDefinitionBuilder builder = BeanDefinitionBuilder
				.genericBeanDefinition(LoadBalancerClientSpecification.class);
		builder.addConstructorArgValue(name);
		builder.addConstructorArgValue(configuration);
		//每个LoadBalancerClient其实就是LoadBalancerClientSpecification
		registry.registerBeanDefinition(name + ".LoadBalancerClientSpecification", builder.getBeanDefinition());
	}

	@Override
	public void registerBeanDefinitions(AnnotationMetadata metadata, BeanDefinitionRegistry registry) {
		Map<String, Object> attrs = metadata.getAnnotationAttributes(LoadBalancerClients.class.getName(), true);
		//获取LoadBalancerClients 注解的属性
		if (attrs != null && attrs.containsKey("value")) {
			//value属性为LoadBalancerClient注解，可以给configuration赋值，填写需要的配置类，比如RandomLoadBalancerConfig.class
			AnnotationAttributes[] clients = (AnnotationAttributes[]) attrs.get("value");
			for (AnnotationAttributes client : clients) {
				//将配置类 注册到当前容器
				registerClientConfiguration(registry, getClientName(client), client.get("configuration"));
			}
		}
		if (attrs != null && attrs.containsKey("defaultConfiguration")) {
			String name;
			if (metadata.hasEnclosingClass()) {
				name = "default." + metadata.getEnclosingClassName();
			}
			else {
				name = "default." + metadata.getClassName();
			}
			//如果defaultConfiguration有配置，当做默认配置注册中，并赋值给所有容器
			registerClientConfiguration(registry, name, attrs.get("defaultConfiguration"));
		}
		//处理@LoadBalancerClient注解，逻辑和上面LoadBalancerClients的相同
		Map<String, Object> client = metadata.getAnnotationAttributes(LoadBalancerClient.class.getName(), true);
		String name = getClientName(client);
		if (name != null) {
			//configuration 属性的类 注册到容器中
			registerClientConfiguration(registry, name, client.get("configuration"));
		}
	}

}
```

- `LoadBalancerClients`有一个默认的配置属性 `Class<?>[] configuration() default {};`这个属性的类以`default. 开头`来命名

- `LoadBalancerClients`含有多个`LoadBalancerClient`，属性`value`是`serviceId` 。`属性 Class<?>[] configuration() default {};`是当前`serviceId名字`下的配置

- `LoadBalancerClients`和每个`LoadBalancerClient`的`configuration`都会被封装以`clientName`为维度的`LoadBalancerClientSpecification`，注册到当前容器中

- **注意！** 这时注册的是`BeanDefinition`类型的元数据，还没有开始真正的实例化bean！真正的实例化是在子容器创建的时候会将父容器添加进去，也相当于子容器也含有了，然后会启动子容器这时，就会进行真正的实例化。

- 最终注入到`LoadBalancerAutoConfiguration`配置类的属性`configurations`，用于`LoadBalancerClientFactory` 的实例化

- 当`LoadBalancerClientFactory`实例化的时候，就会获取`LoadBalancerClientSpecification`的对象了

![](/img/technologySharing/Spring-Cloud-Loadblancer/LoadBalancerClientFactory实例化1.jpg)
![](/img/technologySharing/Spring-Cloud-Loadblancer/LoadBalancerClientFactory实例化2.jpg)
- 可以看到将`LoadBalancerAutoConfiguration`和`BlockingLoadBalancerClientAutoConfiguration`注入，包装成`LoadBalancerClientSpecification`类型

## LoadBalancerClientFactory

再看一眼`LoadBalancerClientFactory`bean实例生成的过程
![](/img/technologySharing/Spring-Cloud-Loadblancer/LoadBalancerClientFactory.jpg)
可以看到将`LoadBalancerClientSpecification`类型的`LoadBalancerAutoConfiguration`和`BlockingLoadBalancerClientAutoConfiguration`通过`setConfiguations`方法注入了进入

`setConfiguations`方法是在父类`NamedContextFactory`中执行的，稍微会分析`NamedContextFactory`，这里先分析`LoadBalancerClientFactory`的结构

```java
public class LoadBalancerClientFactory extends NamedContextFactory<LoadBalancerClientSpecification>
		implements ReactiveLoadBalancer.Factory<ServiceInstance> {

	private static final Log log = LogFactory.getLog(LoadBalancerClientFactory.class);

	/**
	 * Property source name for load balancer.
	 */
	public static final String NAMESPACE = "loadbalancer";

	/**
	 * Property for client name within the load balancer namespace.
	 */
	public static final String PROPERTY_NAME = NAMESPACE + ".client.name";

	private final LoadBalancerClientsProperties properties;


	public LoadBalancerClientFactory(LoadBalancerClientsProperties properties) {
		//记住这个LoadBalancerClientConfiguration，被当成了默认配置类注入到 NamedContextFactory ，也就是每个子容器都会有这个配置类
		super(LoadBalancerClientConfiguration.class, NAMESPACE, PROPERTY_NAME);
		this.properties = properties;
	}

	public static String getName(Environment environment) {
		return environment.getProperty(PROPERTY_NAME);
	}

	@Override
	public ReactiveLoadBalancer<ServiceInstance> getInstance(String serviceId) {
		return getInstance(serviceId, ReactorServiceInstanceLoadBalancer.class);
	}

	@Override
	public LoadBalancerProperties getProperties(String serviceId) {
		if (properties == null) {
			if (log.isWarnEnabled()) {
				log.warn("LoadBalancerClientsProperties is null. Please use the new constructor.");
			}
			return null;
		}
		if (serviceId == null || !properties.getClients().containsKey(serviceId)) {
			// no specific client properties, return default
			return properties;
		}
		// because specifics are overlayed on top of defaults, everything in `properties`,
		// unless overridden, is in `clientsProperties`
		return properties.getClients().get(serviceId);
	}

}
```

既然`LoadBalancerClientConfiguration`注入到`NamedContextFactory`中，我们就分析此配置类

## LoadBalancerClientConfiguration

```java
@Configuration(proxyBeanMethods = false)
@ConditionalOnDiscoveryEnabled
public class LoadBalancerClientConfiguration {

	private static final int REACTIVE_SERVICE_INSTANCE_SUPPLIER_ORDER = 193827465;
    
    /**
     * 怕读者忘了此配置的注入过程，这里再说一下
     * 上文说的LoadBalancerAutoConfiguration配置类中，创建了 LoadBalancerClientFactory 的bean对象，存在于父容器中
     * 在此bean创建的过程中，会通过构造方法将此配置LoadBalancerClientConfiguration转入到LoadBalancerClientFactory中
     * 然后会当做默认配置类注册到 NamedContextFactory 的子容器中，这样每个子容器都拥有
     * 我们也可以自己实现这个ReactorLoadBalancer类型的bean，覆盖此配置
     *
     * */
	@Bean
	@ConditionalOnMissingBean
	public ReactorLoadBalancer<ServiceInstance> reactorServiceInstanceLoadBalancer(Environment environment,
			LoadBalancerClientFactory loadBalancerClientFactory) {
        // 获取当前子容器的名称（也是服务名）
		String name = environment.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
		return new RoundRobinLoadBalancer(loadBalancerClientFactory.getLazyProvider(name, ServiceInstanceListSupplier.class), name);
	}

	//省略...

	@Configuration(proxyBeanMethods = false)
	@ConditionalOnBlockingDiscoveryEnabled
	@Order(REACTIVE_SERVICE_INSTANCE_SUPPLIER_ORDER + 1)
	public static class BlockingSupportConfiguration {
        //ServiceInstanceListSupplier来查询ServiceInstance服务列表，能看到这里是DiscoveryClient提供的。这样就和注册中心关联了
		@Bean
		@ConditionalOnBean(DiscoveryClient.class)
		@ConditionalOnMissingBean
		@Conditional(DefaultConfigurationCondition.class)
		public ServiceInstanceListSupplier discoveryClientServiceInstanceListSupplier(
				ConfigurableApplicationContext context) {
			return ServiceInstanceListSupplier.builder().withBlockingDiscoveryClient().withCaching().build(context);
		}

	}

	//省略...

}
```

`LoadBalancerClientConfiguration`的作用分析完了，在上文中

```java
public LoadBalancerClientFactory(LoadBalancerClientsProperties properties) {
	//记住这个LoadBalancerClientConfiguration，被当成了默认配置类注入到 NamedContextFactory ，也就是每个子容器都会有这个配置类
	super(LoadBalancerClientConfiguration.class, NAMESPACE, PROPERTY_NAME);
	this.properties = properties;
}
```

`LoadBalancerClientConfiguration`是传给了父类，`LoadBalancerClientFactory`的结构

```java
public class LoadBalancerClientFactory extends NamedContextFactory<LoadBalancerClientSpecification>
		implements ReactiveLoadBalancer.Factory<ServiceInstance> {..}
```

在`LoadBalancerClientFactory`生成bean的过程中，调用完构造方法后，又执行了`clientFactory.setConfigurations(this.configurations.getIfAvailable(Collections::emptyList))`，此方法是在父类`NamedContextFactory`执行的

看一下`clientFactory.setConfigurations(this.configurations.getIfAvailable(Collections::emptyList))`执行结果
![](/img/technologySharing/Spring-Cloud-Loadblancer/clientFactory.setConfigurations.png)

下面我们要分析父类`NamedContextFactory`，非常的重要

## NamedContextFactory

```java
public abstract class NamedContextFactory<C extends NamedContextFactory.Specification>
		implements DisposableBean, ApplicationContextAware {

	private final String propertySourceName;

	private final String propertyName;

	private Map<String, AnnotationConfigApplicationContext> contexts = new ConcurrentHashMap<>();

	private Map<String, C> configurations = new ConcurrentHashMap<>();

	private ApplicationContext parent;

	private Class<?> defaultConfigType;

	/**
	 * defaultConfigType是刚才文中说的子类LoadBalancerClientFactory创建时注入的。类型为LoadBalancerClientConfiguration
	 * */
	public NamedContextFactory(Class<?> defaultConfigType, String propertySourceName, String propertyName) {
		this.defaultConfigType = defaultConfigType;
		this.propertySourceName = propertySourceName;
		this.propertyName = propertyName;
	}

	@Override
	public void setApplicationContext(ApplicationContext parent) throws BeansException {
		this.parent = parent;
	}

	public ApplicationContext getParent() {
		return parent;
	}
	/**
	 * configurations为LoadBalancerAutoConfiguration和BlockingLoadBalancerClientAutoConfiguration，
	 * 文中刚才分析过
	 * */

	public void setConfigurations(List<C> configurations) {
		for (C client : configurations) {
			this.configurations.put(client.getName(), client);
		}
	}

	public Set<String> getContextNames() {
		return new HashSet<>(this.contexts.keySet());
	}

	@Override
	public void destroy() {
		Collection<AnnotationConfigApplicationContext> values = this.contexts.values();
		for (AnnotationConfigApplicationContext context : values) {
			// This can fail, but it never throws an exception (you see stack traces
			// logged as WARN).
			context.close();
		}
		this.contexts.clear();
	}

	protected AnnotationConfigApplicationContext getContext(String name) {
		if (!this.contexts.containsKey(name)) {
			synchronized (this.contexts) {
				if (!this.contexts.containsKey(name)) {
					//如果不存在则先创建容器
					this.contexts.put(name, createContext(name));
				}
			}
		}
		return this.contexts.get(name);
	}

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
		//也就是将configurations中LoadBalancerClientSpecification类型的LoadBalancerAutoConfiguration和BlockingLoadBalancerClientAutoConfiguration注册到容器中
		//这样每个容器就拥有了
		for (Map.Entry<String, C> entry : this.configurations.entrySet()) {
			if (entry.getKey().startsWith("default.")) {
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

	protected String generateDisplayName(String name) {
		return this.getClass().getSimpleName() + "-" + name;
	}
	/**
	 * 每个LoadBalancerClientSpecification都创建一个AnnotationConfigApplicationContext
	 * 也就是每个LoadBalancerClient会对应一个容器，其中的配置就对应容器中bean实例
	 * */
	public <T> T getInstance(String name, Class<T> type) {
		//获取AnnotationConfigApplicationContext类型的容器
		AnnotationConfigApplicationContext context = getContext(name);
		try {
			//从容器中获取对应的实例
			return context.getBean(type);
		}
		catch (NoSuchBeanDefinitionException e) {
			// ignore
		}
		return null;
	}

	public <T> ObjectProvider<T> getLazyProvider(String name, Class<T> type) {
		return new ClientFactoryObjectProvider<>(this, name, type);
	}

	public <T> ObjectProvider<T> getProvider(String name, Class<T> type) {
		AnnotationConfigApplicationContext context = getContext(name);
		return context.getBeanProvider(type);
	}

	public <T> T getInstance(String name, Class<?> clazz, Class<?>... generics) {
		ResolvableType type = ResolvableType.forClassWithGenerics(clazz, generics);
		return getInstance(name, type);
	}

	@SuppressWarnings("unchecked")
	public <T> T getInstance(String name, ResolvableType type) {
		AnnotationConfigApplicationContext context = getContext(name);
		String[] beanNames = BeanFactoryUtils.beanNamesForTypeIncludingAncestors(context, type);
		if (beanNames.length > 0) {
			for (String beanName : beanNames) {
				if (context.isTypeMatch(beanName, type)) {
					return (T) context.getBean(beanName);
				}
			}
		}
		return null;
	}

	public <T> Map<String, T> getInstances(String name, Class<T> type) {
		AnnotationConfigApplicationContext context = getContext(name);

		return BeanFactoryUtils.beansOfTypeIncludingAncestors(context, type);
	}

	/**
	 * Specification with name and configuration.
	 */
	public interface Specification {

		String getName();

		Class<?>[] getConfiguration();

	}

}
```

到这里将每个`@LoadBalancerClient`都创建了`AnnotationConfigApplicationContext`的容器，然后放到了 `LoadBalancerClientFactory`中

到这里bean的生成过程分析完毕，下一篇文章会分析整个执行过程
