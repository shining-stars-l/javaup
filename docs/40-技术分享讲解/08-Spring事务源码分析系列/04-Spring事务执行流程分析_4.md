---
slug: /tech-sharing/spring-tx-source/spring-part-4
---

# Spring事务执行流程分析_4

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Import(TransactionManagementConfigurationSelector.class)
public @interface EnableTransactionManagement {
	/**
	 * 指定使用什么代理模式(true为cglib代理,false 为jdk代理)
	 * */
	boolean proxyTargetClass() default false;

	/**
	 * 通知模式 是使用代理模式还是aspectj  我们一般使用Proxy
	 * */
	AdviceMode mode() default AdviceMode.PROXY;

	int order() default Ordered.LOWEST_PRECEDENCE;

}
```

可以看到通过@Import导入了`TransactionManagementConfigurationSelector`组件

## TransactionManagementConfigurationSelector

```java
public class TransactionManagementConfigurationSelector extends AdviceModeImportSelector<EnableTransactionManagement> {
	/**
	 * 此处是AdviceMode的作用，默认是用代理，另外一个是ASPECTJ
	 *
     * 往容器中添加组件 1) AutoProxyRegistrar
     *                  2) ProxyTransactionManagementConfiguration
	 */
	@Override
	protected String[] selectImports(AdviceMode adviceMode) {
		switch (adviceMode) {
			case PROXY:
				return new String[] {AutoProxyRegistrar.class.getName(),
						ProxyTransactionManagementConfiguration.class.getName()};
			case ASPECTJ:
				return new String[] {determineTransactionAspectClass()};
			default:
				return null;
		}
	}
}
```

我们可以分析处向容器中导入了二个组件

1. `AutoProxyRegistrar`
2. `ProxyTransactionManagementConfiguration`

首先分析`AutoProxyRegistrar`

### AutoProxyRegistrar#registerBeanDefinitions

`AutoProxyRegistrar`为我们容器注册了一个`InfrastructureAdvisorAutoProxyCreator`组件

```java
public class AutoProxyRegistrar implements ImportBeanDefinitionRegistrar {

	private final Log logger = LogFactory.getLog(getClass());

	/**
	 * 注册AOP处理器InfrastructureAdvisorAutoProxyCreator
	 *
	 */
	@Override
	public void registerBeanDefinitions(AnnotationMetadata importingClassMetadata, BeanDefinitionRegistry registry) {
		boolean candidateFound = false;
		//从我们传入进去的配置类上获取所有的注解的
        //annTypes : 
        //0:org.springframework.context.annotation.Configuration
        //1:org.springframework.transaction.annotation.EnableTransactionManagement
		Set<String> annTypes = importingClassMetadata.getAnnotationTypes();
		// 遍历所有注解，找到有mode和proxyTargetClass的注解
		for (String annType : annTypes) {
			AnnotationAttributes candidate = AnnotationConfigUtils.attributesFor(importingClassMetadata, annType);
			if (candidate == null) {
				continue;
			}
			Object mode = candidate.get("mode");
			Object proxyTargetClass = candidate.get("proxyTargetClass");
			if (mode != null && proxyTargetClass != null && AdviceMode.class == mode.getClass() &&
					Boolean.class == proxyTargetClass.getClass()) {
				candidateFound = true;
				if (mode == AdviceMode.PROXY) {
					// 注册aop
					AopConfigUtils.registerAutoProxyCreatorIfNecessary(registry);
					// 强制设置proxyTargetClass=true后面使用cglib
					if ((Boolean) proxyTargetClass) {
						AopConfigUtils.forceAutoProxyCreatorToUseClassProxying(registry);
						return;
					}
				}
			}
		}
		if (!candidateFound && logger.isInfoEnabled()) {
			String name = getClass().getSimpleName();
			logger.info(String.format("%s was imported but no annotations were found " +
					"having both 'mode' and 'proxyTargetClass' attributes of type " +
					"AdviceMode and boolean respectively. This means that auto proxy " +
					"creator registration and configuration may not have occurred as " +
					"intended, and components may not be proxied as expected. Check to " +
					"ensure that %s has been @Import'ed on the same class where these " +
					"annotations are declared; otherwise remove the import of %s " +
					"altogether.", name, name, name));
		}
	}

}
```

在遍历到EnableTransactionManagement注解时，会进入`AopConfigUtils#registerAutoProxyCreatorIfNecessary`

### AopConfigUtils#registerAutoProxyCreatorIfNecessary

```java
public static BeanDefinition registerAutoProxyCreatorIfNecessary(
		BeanDefinitionRegistry registry, @Nullable Object source) {

	return registerOrEscalateApcAsRequired(InfrastructureAdvisorAutoProxyCreator.class, registry, source);
}
```

### AopConfigUtils#registerOrEscalateApcAsRequired

```java
private static BeanDefinition registerOrEscalateApcAsRequired(
		Class<?> cls, BeanDefinitionRegistry registry, @Nullable Object source) {

	Assert.notNull(registry, "BeanDefinitionRegistry must not be null");

	// 如果已经存在了自动代理创建器且存在的自动代理创建器与现在不一致，那么需要根据优先级来判断到底需要使用哪个
	// AUTO_PROXY_CREATOR_BEAN_NAME : org.springframework.aop.config.internalAutoProxyCreator
	if (registry.containsBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME)) {
		BeanDefinition apcDefinition = registry.getBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME);
		if (!cls.getName().equals(apcDefinition.getBeanClassName())) {
			int currentPriority = findPriorityForClass(apcDefinition.getBeanClassName());
			int requiredPriority = findPriorityForClass(cls);
			if (currentPriority < requiredPriority) {
				// 改变bean所对应的className的属性
				apcDefinition.setBeanClassName(cls.getName());
			}
		}
		// 如果已经存在自动代理创建器并且与将要创建的一致，那么无须再次创建
		return null;
	}

	RootBeanDefinition beanDefinition = new RootBeanDefinition(cls);
	beanDefinition.setSource(source);
	beanDefinition.getPropertyValues().add("order", Ordered. HIGHEST_PRECEDENCE);
	beanDefinition.setRole(BeanDefinition.ROLE_INFRASTRUCTURE);
	registry.registerBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME, beanDefinition);
	return beanDefinition;
}
```

可以看到注册了名字`org.springframework.aop.config.internalAutoProxyCreator`，类型`org.springframework.aop.framework.autoproxy.InfrastructureAdvisorAutoProxyCreator`的bean
![](/img/technologySharing/spring/InfrastructureAdvisorAutoProxyCreator.png)
`AutoProxyRegistrar`的作用分析完毕，接下来分析`ProxyTransactionManagementConfiguration`

### ProxyTransactionManagementConfiguration

`ProxyTransactionManagementConfiguration`分别注册了
- 名字：`internalTransactionAdvisor` 类型：`BeanFactoryTransactionAttributeSourceAdvisor`、

- 名字：`transactionAttributeSource` 类型：`TransactionAttributeSource`、

- 名字：`transactionInterceptor` 类型：`TransactionInterceptor`
的bean

```java
/**
 * 代理事务配置，注册事务需要用的一些类，而且Role=ROLE_INFRASTRUCTURE都是属于内部级别的
 *
 * {@code @Configuration} class that registers the Spring infrastructure beans
 * necessary to enable proxy-based annotation-driven transaction management.
 */
@Configuration(proxyBeanMethods = false)
@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
public class ProxyTransactionManagementConfiguration extends AbstractTransactionManagementConfiguration {

	/**
	 * 为我我们容器中导入了 beanName为org.springframework.transaction.config.internalTransactionAdvisor
	 * 类型为:BeanFactoryTransactionAttributeSourceAdvisor 的增强器
	 **
	 */
	@Bean(name = TransactionManagementConfigUtils.TRANSACTION_ADVISOR_BEAN_NAME)
	@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
	public BeanFactoryTransactionAttributeSourceAdvisor transactionAdvisor(
			TransactionAttributeSource transactionAttributeSource, TransactionInterceptor transactionInterceptor) {

		BeanFactoryTransactionAttributeSourceAdvisor advisor = new BeanFactoryTransactionAttributeSourceAdvisor();
		//设置了事物源属性对象
		advisor.setTransactionAttributeSource(transactionAttributeSource);
		//设置了事物拦截器对象
		advisor.setAdvice(transactionInterceptor);
		if (this.enableTx != null) {
			advisor.setOrder(this.enableTx.<Integer>getNumber("order"));
		}
		return advisor;
	}

	/**
	 * 定义了一个事物属性源对象
	 * */
	@Bean
	@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
	public TransactionAttributeSource transactionAttributeSource() {
		return new AnnotationTransactionAttributeSource();
	}

	/**
	 * 事物拦截器对象
	 **
	 */
	@Bean
	@Role(BeanDefinition.ROLE_INFRASTRUCTURE)
	public TransactionInterceptor transactionInterceptor(TransactionAttributeSource transactionAttributeSource) {
		TransactionInterceptor interceptor = new TransactionInterceptor();
		//把事物属性源对象设置到我们的事物拦截器对象中
		interceptor.setTransactionAttributeSource(transactionAttributeSource);
		//把我们容器中的 事物对象配置到事物拦截器中
		if (this.txManager != null) {
			interceptor.setTransactionManager(this.txManager);
		}
		return interceptor;
	}

}
```

### 相关继承结构：
![](/img/technologySharing/spring/BeanFactoryTransactionAttributeSourceAdvisor.png)
![](/img/technologySharing/spring/TransactionInterceptor.png)

### 此时beanDefinitionMap中的存储bean情况：
![](/img/technologySharing/spring/此时beanDefinitionMap中的存储bean情况.png)
