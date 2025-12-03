---
slug: /tech-sharing/spring-tx-source/spring-part-3
---

# Spring事务执行流程分析_3

`AbstractApplicationContext#refresh` ->
`AbstractApplicationContext#registerBeanPostProcessors(beanFactory)`

经过此方法向容器中真正注册了`AspectJAwareAdvisorAutoProxyCreator`对象

singletonObjects的map缓存中存放了名字为 `org.springframework.aop.config.internalAutoProxyCreator`，类型为`AspectJAwareAdvisorAutoProxyCreator`的对象
![](/img/technologySharing/spring/AspectJAwareAdvisorAutoProxyCreator.png)

## 初始化剩下的单实例（非懒加载的）

AbstractApplicationContext#finishBeanFactoryInitialization ->
实例化剩下的单例对象
DefaultListableBeanFactory#preInstantiateSingletons ->
真正的创建bean
AbstractAutowireCapableBeanFactory#createBean
给BeanPostProcessors一个机会来返回代理来替代真正的实例，应用实例化前的前置处理器
AbstractAutowireCapableBeanFactory#resolveBeforeInstantiation

### AbstractAutowireCapableBeanFactory#resolveBeforeInstantiation

```java
protected Object resolveBeforeInstantiation(String beanName, RootBeanDefinition mbd) {
	Object bean = null;
	// 如果beforeInstantiationResolved值为null或者true，那么表示尚未被处理，进行后续的处理
	if (!Boolean.FALSE.equals(mbd.beforeInstantiationResolved)) {
		// Make sure bean class is actually resolved at this point.
		// 确认beanclass确实在此处进行处理
		// 判断当前mbd是否是合成的，只有在实现aop的时候synthetic的值才为true，并且是否实现了InstantiationAwareBeanPostProcessor接口
		if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
			// 获取类型
			Class<?> targetType = determineTargetType(beanName, mbd);
			if (targetType != null) {
				bean = applyBeanPostProcessorsBeforeInstantiation(targetType, beanName);
				if (bean != null) {
					bean = applyBeanPostProcessorsAfterInitialization(bean, beanName);
				}
			}
		}
		// 是否解析了
		mbd.beforeInstantiationResolved = (bean != null);
	}
	return bean;
}
```

由于之前注册了AspectJAwareAdvisorAutoProxyCreator，所以applyBeanPostProcessorsAfterInitialization方法是可以执行的

### AbstractAutoProxyCreator#postProcessBeforeInstantiation

```java
public Object postProcessBeforeInstantiation(Class<?> beanClass, String beanName) {
	Object cacheKey = getCacheKey(beanClass, beanName);

	if (!StringUtils.hasLength(beanName) || !this.targetSourcedBeans.contains(beanName)) {
		//查缓存，是否有处理过了，不管是不是需要通知增强的，只要处理过了就会放里面
		if (this.advisedBeans.containsKey(cacheKey)) {
			return null;
		}
           //判断是否是基础设施类,是否是Advice、Pointcut、Advisor、AopInfrastructureBean的类型
           //是否应该跳过，比较重要
		if (isInfrastructureClass(beanClass) || shouldSkip(beanClass, beanName)) {
			// 要跳过的直接设置FALSE
			this.advisedBeans.put(cacheKey, Boolean.FALSE);
			return null;
		}
	}

	// Create proxy here if we have a custom TargetSource.
	// Suppresses unnecessary default instantiation of the target bean:
	// The TargetSource will handle target instances in a custom fashion.
	TargetSource targetSource = getCustomTargetSource(beanClass, beanName);
	if (targetSource != null) {
		if (StringUtils.hasLength(beanName)) {
			this.targetSourcedBeans.add(beanName);
		}
		Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(beanClass, beanName, targetSource);
		Object proxy = createProxy(beanClass, beanName, specificInterceptors, targetSource);
		this.proxyTypes.put(cacheKey, proxy.getClass());
		return proxy;
	}

	return null;
}
```

### AspectJAwareAdvisorAutoProxyCreator#shouldSkip

```java
protected boolean shouldSkip(Class<?> beanClass, String beanName) {
	// TODO: Consider optimization by caching the list of the aspect names
   	//寻找所有Advisor.class的bean，创建好，然后返回集合
	List<Advisor> candidateAdvisors = findCandidateAdvisors();
	for (Advisor advisor : candidateAdvisors) {
		if (advisor instanceof AspectJPointcutAdvisor &&
				((AspectJPointcutAdvisor) advisor).getAspectName().equals(beanName)) {
			return true;
		}
	}
	return super.shouldSkip(beanClass, beanName);
}
```

### AbstractAdvisorAutoProxyCreator#findCandidateAdvisors

```java
/**
 * 调用BeanFactoryAdvisorRetrievalHelper来寻找是否有Advisor的bean定义
 *
 * Find all candidate Advisors to use in auto-proxying.
 * @return the List of candidate Advisors
 */
protected List<Advisor> findCandidateAdvisors() {
	Assert.state(this.advisorRetrievalHelper != null, "No BeanFactoryAdvisorRetrievalHelper available");
	// 获取所有的增强处理
	return this.advisorRetrievalHelper.findAdvisorBeans();
}
```

### BeanFactoryAdvisorRetrievalHelper#findAdvisorBeans

```java
/**
 * 寻找所有Advisor.class的bean名字，如果存在就放入缓存，并进行创建，然后返回
 *
 */
public List<Advisor> findAdvisorBeans() {
	// Determine list of advisor bean names, if not cached already.
	String[] advisorNames = this.cachedAdvisorBeanNames;
	if (advisorNames == null) {
		// Do not initialize FactoryBeans here: We need to leave all regular beans
		// uninitialized to let the auto-proxy creator apply to them!
		// 获取所有的beanName
		advisorNames = BeanFactoryUtils.beanNamesForTypeIncludingAncestors(
				this.beanFactory, Advisor.class, true, false);
		this.cachedAdvisorBeanNames = advisorNames;
	}
	if (advisorNames.length == 0) {
		return new ArrayList<>();
	}

	List<Advisor> advisors = new ArrayList<>();
	// 循环所有的beanName，找出对应的增强方法
	for (String name : advisorNames) {
		// 判断当前bean是否合法，不合法则略过，由子类定义规则，默认返回是true
		if (isEligibleBean(name)) {
			if (this.beanFactory.isCurrentlyInCreation(name)) {
				if (logger.isTraceEnabled()) {
					logger.trace("Skipping currently created advisor '" + name + "'");
				}
			}
			else {
				try {
                       //name = org.springframework.aop.support.DefaultBeanFactoryPointcutAdvisor#0
					//在这里真正的创建Advisor 把案例advisor标签内的advice-ref和pointcut-ref属性所引用的bean也创建好，并赋值 但并没有创建好引用中的advice的bean
					advisors.add(this.beanFactory.getBean(name, Advisor.class));
				}
				catch (BeanCreationException ex) {
					Throwable rootCause = ex.getMostSpecificCause();
					if (rootCause instanceof BeanCurrentlyInCreationException) {
						BeanCreationException bce = (BeanCreationException) rootCause;
						String bceBeanName = bce.getBeanName();
						if (bceBeanName != null && this.beanFactory.isCurrentlyInCreation(bceBeanName)) {
							if (logger.isTraceEnabled()) {
								logger.trace("Skipping advisor '" + name +
										"' with dependency on currently created bean: " + ex.getMessage());
							}
							// Ignore: indicates a reference back to the bean we're trying to advise.
							// We want to find advisors other than the currently created bean itself.
							continue;
						}
					}
					throw ex;
				}
			}
		}
	}
	return advisors;
}
```

执行到这里容器中真正创建好的对象：
![](/img/technologySharing/spring/容器中真正创建好的对象.png)
这时`DefaultBeanFactoryPointcutAdvisor#0`对象中的advice属性还是空的

## bookService对象的创建

bookService对象的创建执行链路：
`AbstractAutowireCapableBeanFactory#createBean` ->
`AbstractAutowireCapableBeanFactory#doCreateBean` ->
`AbstractAutowireCapableBeanFactory#initializeBean`(初始化给定的bean实例，应用工厂回调以及init方法和BeanPostProcessors) ->
`AbstractAutowireCapableBeanFactory#applyBeanPostProcessorsAfterInitialization`(将bookService转变为代理对象的bookService)
`AbstractAutoProxyCreator#postProcessAfterInitialization`(此处是真正创建aop代理的地方，在实例化之后，初始化之后就行处理)

### bstractAutoProxyCreator#postProcessAfterInitialization

首先查看是否在earlyProxyReferences里存在，如果有就说明处理过了，不存在就考虑是否要包装，也就是代理

```java
public Object postProcessAfterInitialization(@Nullable Object bean, String beanName) {
	if (bean != null) {
		// 根据给定bean的name和class构建出一个key
		Object cacheKey = getCacheKey(bean.getClass(), beanName);
		if (this.earlyProxyReferences.remove(cacheKey) != bean) {
			// 如果它需要被代理，则需要封装指定的bean
			return wrapIfNecessary(bean, beanName, cacheKey);
		}
	}
	return bean;
}
```

### AbstractAutoProxyCreator#wrapIfNecessary

```java
/**
 * 先判断是否已经处理过，是否需要跳过，跳过的话直接就放进advisedBeans里，表示不进行代理，如果这个bean处理过了，获取通知拦截器，然后开始进行代理
 *
 */
protected Object wrapIfNecessary(Object bean, String beanName, Object cacheKey) {
	// 如果已经处理过，直接返回
	if (StringUtils.hasLength(beanName) && this.targetSourcedBeans.contains(beanName)) {
		return bean;
	}
	// 如果不需要增强，则直接返回
	if (Boolean.FALSE.equals(this.advisedBeans.get(cacheKey))) {
		return bean;
	}
	// 判断给定的bean类是否代表一个基础设施类，基础设施类不应代理，或者配置了指定bean不需要自动代理
	if (isInfrastructureClass(bean.getClass()) || shouldSkip(bean.getClass(), beanName)) {
		this.advisedBeans.put(cacheKey, Boolean.FALSE);
		return bean;
	}

	// Create proxy if we have advice.
       // 根据目标对象和容器中所有的advisor做判断匹配返回符合目标对象的advisor
	// 如果存在增强方法则创建代理
	Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null);
	// 如果获取到了增强则需要针对增强创建代理
	if (specificInterceptors != DO_NOT_PROXY) {
		this.advisedBeans.put(cacheKey, Boolean.TRUE);
		// 创建代理
		Object proxy = createProxy(
				bean.getClass(), beanName, specificInterceptors, new SingletonTargetSource(bean));
		this.proxyTypes.put(cacheKey, proxy.getClass());
		return proxy;
	}

	this.advisedBeans.put(cacheKey, Boolean.FALSE);
	return bean;
}
```

### AbstractAdvisorAutoProxyCreator#getAdvicesAndAdvisorsForBean

```java
/**
 * 检查前面切面解析是否有通知器advisors创建，有就返回，没有就是null
 */
@Override
@Nullable
protected Object[] getAdvicesAndAdvisorsForBean(
		Class<?> beanClass, String beanName, @Nullable TargetSource targetSource) {

	List<Advisor> advisors = findEligibleAdvisors(beanClass, beanName);
	if (advisors.isEmpty()) {
		return DO_NOT_PROXY;
	}
	return advisors.toArray();
}
```

### AbstractAdvisorAutoProxyCreator#findEligibleAdvisors

由于之前已经创建除了advisor，所以执行到这里findCandidateAdvisors()方法内部可以直接从缓存中获取

```java
/**
 * 找到所有符合条件的通知对于自动代理的类
 * 
 */
protected List<Advisor> findEligibleAdvisors(Class<?> beanClass, String beanName) {
	// 获取所有的增强
	List<Advisor> candidateAdvisors = findCandidateAdvisors();
	// 寻找所有增强中适用于bean的增强并应用
	List<Advisor> eligibleAdvisors = findAdvisorsThatCanApply(candidateAdvisors, beanClass, beanName);
       // 在Advisor集合中添加一个org.springframework.aop.interceptor.ExposeInvocationInterceptor.ADVISOR 用于执行事务链时的调用
       // 在这个方法内逻辑 AspectJProxyUtils.makeAdvisorChainAspectJCapableIfNecessary(candidateAdvisors); -> isAspectJAdvice(advisor) -> advisor.getAdvice()
       // advisor.getAdvice()中，将advisor中属性为空的advice创建好并赋值。 advice的类型为TransactionInterceptor(TransactionInterceptor实现了advice接口)
	extendAdvisors(eligibleAdvisors);
	if (!eligibleAdvisors.isEmpty()) {
           //排序，将org.springframework.aop.interceptor.ExposeInvocationInterceptor.ADVISOR排在集合首位
		eligibleAdvisors = sortAdvisors(eligibleAdvisors);
	}
	return eligibleAdvisors;
}
```

![](/img/technologySharing/spring/eligibleAdvisors.png)

### AbstractAdvisorAutoProxyCreator#findAdvisorsThatCanApply

```java
/**
 * 检测实例化之后的bean是否需要通知器，其实就是检测方法或者类上是否需要事务注解
 *
 */
protected List<Advisor> findAdvisorsThatCanApply(
		List<Advisor> candidateAdvisors, Class<?> beanClass, String beanName) {

	ProxyCreationContext.setCurrentProxiedBeanName(beanName);
	try {
		// 过滤已经得到的advisors
		return AopUtils.findAdvisorsThatCanApply(candidateAdvisors, beanClass);
	}
	finally {
		ProxyCreationContext.setCurrentProxiedBeanName(null);
	}
}
```

### AopUtils#findAdvisorsThatCanApply

```java
/**
 * 遍历每一个advisor，然后判断是否可以应用到目标类clazz上，可以的话就加入候选列表
 */
public static List<Advisor> findAdvisorsThatCanApply(List<Advisor> candidateAdvisors, Class<?> clazz) {
	if (candidateAdvisors.isEmpty()) {
		return candidateAdvisors;
	}
	List<Advisor> eligibleAdvisors = new ArrayList<>();
	// 处理增强器
	for (Advisor candidate : candidateAdvisors) {
		if (candidate instanceof IntroductionAdvisor && canApply(candidate, clazz)) {
			eligibleAdvisors.add(candidate);
		}
	}
	boolean hasIntroductions = !eligibleAdvisors.isEmpty();
	for (Advisor candidate : candidateAdvisors) {
		// 增强器已经处理
		if (candidate instanceof IntroductionAdvisor) {
			// already processed
			continue;
		}
		// 对于普通bean的处理
		if (canApply(candidate, clazz, hasIntroductions)) {
			eligibleAdvisors.add(candidate);
		}
	}
	return eligibleAdvisors;
}
```

### AopUtils#canApply

```java
public static boolean canApply(Advisor advisor, Class<?> targetClass, boolean hasIntroductions) {
	if (advisor instanceof IntroductionAdvisor) {
		return ((IntroductionAdvisor) advisor).getClassFilter().matches(targetClass);
	}
	else if (advisor instanceof PointcutAdvisor) {
		PointcutAdvisor pca = (PointcutAdvisor) advisor;
		// 是否匹配切点表达式信息
		return canApply(pca.getPointcut(), targetClass, hasIntroductions);
	}
	else {
		// It doesn't have a pointcut so we assume it applies.
		return true;
	}
}
```

### AopUtils#canApply(Pointcut pc, `Class<?>` targetClass, boolean hasIntroductions)

```java
public static boolean canApply(Pointcut pc, Class<?> targetClass, boolean hasIntroductions) {
	Assert.notNull(pc, "Pointcut must not be null");
	// targetClass是否匹配切点表达式
	if (!pc.getClassFilter().matches(targetClass)) {
		return false;
	}
	//案例中执行到这里 methodMatcher： AspectJExpressionPointcut: () execution(* com.test.tx.*.*.*(..))
	MethodMatcher methodMatcher = pc.getMethodMatcher();
	if (methodMatcher == MethodMatcher.TRUE) {
		// No need to iterate the methods if we're matching any method anyway...
		return true;
	}

	IntroductionAwareMethodMatcher introductionAwareMethodMatcher = null;
	if (methodMatcher instanceof IntroductionAwareMethodMatcher) {
		introductionAwareMethodMatcher = (IntroductionAwareMethodMatcher) methodMatcher;
	}

	// 存放要代理的类以及他的接口
	Set<Class<?>> classes = new LinkedHashSet<>();
	// 不是JDK的代理类
	if (!Proxy.isProxyClass(targetClass)) {
		classes.add(ClassUtils.getUserClass(targetClass));
	}
	classes.addAll(ClassUtils.getAllInterfacesForClassAsSet(targetClass));

	// 查找方法是否是切点表达式匹配的
	for (Class<?> clazz : classes) {
		Method[] methods = ReflectionUtils.getAllDeclaredMethods(clazz);
		for (Method method : methods) {
			if (introductionAwareMethodMatcher != null ?
                	//判断目标对象和expression表达式是否匹配
					introductionAwareMethodMatcher.matches(method, targetClass, hasIntroductions) :
					methodMatcher.matches(method, targetClass)) {
				return true;
			}
		}
	}

	return false;
}
```

然后回到`AbstractAutoProxyCreator#wrapIfNecessary`中，此时方法内的
`Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null)`执行完，获得了和目标对象匹配的advisor，如果不为空的话则创建代理对象。

### AbstractAutoProxyCreator#createProxy

```java
/**
 * 进行代理工厂的创建，然后判断是否需要设置proxyTargetClass，以便于后面决定是不是要进行jdk动态代理还是cglib的动态代理
 * 然后把通知器advisors包装下，加入到代理工厂，获取代理对象
 * @see #buildAdvisors
 */
protected Object createProxy(Class<?> beanClass, @Nullable String beanName,
		@Nullable Object[] specificInterceptors, TargetSource targetSource) {

	// 给bean定义设置暴露属性
	if (this.beanFactory instanceof ConfigurableListableBeanFactory) {
		AutoProxyUtils.exposeTargetClass((ConfigurableListableBeanFactory) this.beanFactory, beanName, beanClass);
	}

	// 创建代理工厂
	ProxyFactory proxyFactory = new ProxyFactory();
	// 获取当前类中相关属性
	proxyFactory.copyFrom(this);
	// 决定对于给定的bean是否应该使用targetClass而不是他的接口代理，检查proxyTargetClass设置以及preserverTargetClass属性
	if (!proxyFactory.isProxyTargetClass()) {
		if (shouldProxyTargetClass(beanClass, beanName)) {
			proxyFactory.setProxyTargetClass(true);
		}
		else {
			// 添加代理接口
			evaluateProxyInterfaces(beanClass, proxyFactory);
		}
	}

	// 构建增强器
	Advisor[] advisors = buildAdvisors(beanName, specificInterceptors);
	proxyFactory.addAdvisors(advisors);
	// 设置到要代理的类
	proxyFactory.setTargetSource(targetSource);
	// 定制代理
	customizeProxyFactory(proxyFactory);

	// 控制代理工程被配置之后，是否还允许修改通知，默认值是false
	proxyFactory.setFrozen(this.freezeProxy);
	if (advisorsPreFiltered()) {
		proxyFactory.setPreFiltered(true);
	}

	return proxyFactory.getProxy(getProxyClassLoader());
}
```

### ProxyFactory#getProxy(@Nullable ClassLoader classLoader) 

```java
public Object getProxy(@Nullable ClassLoader classLoader) {
	return createAopProxy().getProxy(classLoader);
}
```

```java
/**
 * 创建AOP代理，如果激活了，就需要有激活通知
 *
 * Subclasses should call this to get a new AOP proxy. They should <b>not</b>
 * create an AOP proxy with {@code this} as an argument.
 */
protected final synchronized AopProxy createAopProxy() {
	if (!this.active) {
		activate();
	}
	// 通过AopProxyFactory获得AopProxy，这个AopProxyFactory是在初始化函数中定义的，使用的是DefaultAopProxyFactory
	return getAopProxyFactory().createAopProxy(this);
}
```

解决使用jdk还是cglib代理

### DefaultAopProxyFactory#createAopProxy

```java
/**
 * 真正的创建代理，判断一些列条件，有自定义的接口的就会创建jdk代理，否则就是cglib
 * @param config the AOP configuration in the form of an
 * AdvisedSupport object
 * @return
 * @throws AopConfigException
 */
@Override
public AopProxy createAopProxy(AdvisedSupport config) throws AopConfigException {
	// 通过cglib创建的代理是否使用激进的优化策略
	// 当proxyTargetClass为true时，目标类本身被代理而不是目标类的接口
	// 是否存在代理接口
	if (config.isOptimize() || config.isProxyTargetClass() || hasNoUserSuppliedProxyInterfaces(config)) {
		Class<?> targetClass = config.getTargetClass();
		if (targetClass == null) {
			throw new AopConfigException("TargetSource cannot determine target class: " +
					"Either an interface or a target is required for proxy creation.");
		}
		// 如果targetClass是接口类，使用jdk来生成proxy
		if (targetClass.isInterface() || Proxy.isProxyClass(targetClass)) {
			return new JdkDynamicAopProxy(config);
		}
		// 如果不是接口类要使用cglib来生成
		return new ObjenesisCglibAopProxy(config);
	}
	else {
		// 用jdk
		return new JdkDynamicAopProxy(config);
	}
}
```

执行到这里创建了jdk或者cglib的代理类，回到`ProxyFactory#getProxy(ClassLoader classLoader)`执行getProxy，进入代理类的getProxy方法。

这里进入jdk的代理类`JdkDynamicAopProxy`

### JdkDynamicAopProxy#getProxy(@Nullable ClassLoader classLoader) 

```java
public Object getProxy(@Nullable ClassLoader classLoader) {
	if (logger.isTraceEnabled()) {
		logger.trace("Creating JDK dynamic proxy: " + this.advised.getTargetSource());
	}
	Class<?>[] proxiedInterfaces = AopProxyUtils.completeProxiedInterfaces(this.advised, true);
	findDefinedEqualsAndHashCodeMethods(proxiedInterfaces);
	// 调用jdk生成proxy
	return Proxy.newProxyInstance(classLoader, proxiedInterfaces, this);
}
```

执行到这里创建了jdk的代理对象

回到`AbstractAutowireCapableBeanFactory#initializeBean`将代理对象返回
![](/img/technologySharing/spring/AbstractAutowireCapableBeanFactoryInitializeBean.png)