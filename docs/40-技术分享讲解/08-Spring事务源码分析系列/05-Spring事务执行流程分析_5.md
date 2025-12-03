---
slug: /tech-sharing/spring-tx-source/spring-part-5
---

# Spring事务执行流程分析_5

依旧进入刷新refresh方法`AbstractApplicationContext#refresh` ->

在上一篇文章 解析`@EnableTransactionManagement`注解就是在此方法进行的,也就是在会注册

- 名字：`internalAutoProxyCreator` 类型：`InfrastructureAdvisorAutoProxyCreator`

- 名字：`internalTransactionAdvisor` 类型：`BeanFactoryTransactionAttributeSourceAdvisor`、

- 名字：`transactionAttributeSource` 类型：`TransactionAttributeSource`、

- 名字：`transactionInterceptor` 类型：`TransactionInterceptor`

然后调用各种beanFactory处理器`AbstractApplicationContext#invokeBeanFactoryPostProcessors`

## 执行beanFactory处理器AbstractApplicationContext#invokeBeanFactoryPostProcessors

```java
/***省略部分代码*/

//postProcessorNames = org.springframework.context.annotation.internalConfigurationAnnotationProcessor(类型为ConfigurationClassPostProcessor)
String[] postProcessorNames =
    beanFactory.getBeanNamesForType(BeanDefinitionRegistryPostProcessor.class, true, false);
// 遍历处理所有符合规则的postProcessorNames
for (String ppName : postProcessorNames) {
    // 检测是否实现了PriorityOrdered接口
    if (beanFactory.isTypeMatch(ppName, PriorityOrdered.class)) {
        // 获取名字对应的bean实例，添加到currentRegistryProcessors中
        currentRegistryProcessors.add(beanFactory.getBean(ppName, BeanDefinitionRegistryPostProcessor.class));
        // 将要被执行的BFPP名称添加到processedBeans，避免后续重复执行
        processedBeans.add(ppName);
    }
}
// 按照优先级进行排序操作
sortPostProcessors(currentRegistryProcessors, beanFactory);
// 添加到registryProcessors中，用于最后执行postProcessBeanFactory方法
registryProcessors.addAll(currentRegistryProcessors);
// 遍历currentRegistryProcessors，执行postProcessBeanDefinitionRegistry方法
invokeBeanDefinitionRegistryPostProcessors(currentRegistryProcessors, registry);

/***省略部分代码*/
```

分析`invokeBeanDefinitionRegistryPostProcessors(currentRegistryProcessors, registry)`这一行接着深入调用直到`ConfigurationClassPostProcessor#processConfigBeanDefinitions`

### ConfigurationClassPostProcessor#processConfigBeanDefinitions

```java
/**
 * 构建和验证一个类是否被@Configuration修饰，并做相关的解析工作
 *
 * 如果你对此方法了解清楚了，那么springboot的自动装配原理就清楚了
 *
 * Build and validate a configuration model based on the registry of
 * {@link Configuration} classes.
 */
public void processConfigBeanDefinitions(BeanDefinitionRegistry registry) {
	// 创建存放BeanDefinitionHolder的对象集合
	List<BeanDefinitionHolder> configCandidates = new ArrayList<>();
	// 当前registry就是DefaultListableBeanFactory，获取所有已经注册的BeanDefinition的beanName
	String[] candidateNames = registry.getBeanDefinitionNames();

	// 遍历所有要处理的beanDefinition的名称,筛选对应的beanDefinition（被注解修饰的）
	for (String beanName : candidateNames) {
		// 获取指定名称的BeanDefinition对象
		BeanDefinition beanDef = registry.getBeanDefinition(beanName);
		// 如果beanDefinition中的configurationClass属性不等于空，那么意味着已经处理过，输出日志信息
		if (beanDef.getAttribute(ConfigurationClassUtils.CONFIGURATION_CLASS_ATTRIBUTE) != null) {
			if (logger.isDebugEnabled()) {
				logger.debug("Bean definition has already been processed as a configuration class: " + beanDef);
			}
		}
		// 判断当前BeanDefinition是否是一个配置类，并为BeanDefinition设置属性为lite或者full，此处设置属性值是为了后续进行调用
		// 如果Configuration配置proxyBeanMethods代理为true则为full
		// 如果加了@Bean、@Component、@ComponentScan、@Import、@ImportResource注解，则设置为lite
		// 如果配置类上被@Order注解标注，则设置BeanDefinition的order属性值
		else if (ConfigurationClassUtils.checkConfigurationClassCandidate(beanDef, this.metadataReaderFactory)) {
			// 添加到对应的集合对象中
			configCandidates.add(new BeanDefinitionHolder(beanDef, beanName));
		}
	}

	// Return immediately if no @Configuration classes were found
	// 如果没有发现任何配置类，则直接返回
	if (configCandidates.isEmpty()) {
		return;
	}

	// Sort by previously determined @Order value, if applicable
	// 如果适用，则按照先前确定的@Order的值排序
	configCandidates.sort((bd1, bd2) -> {
		int i1 = ConfigurationClassUtils.getOrder(bd1.getBeanDefinition());
		int i2 = ConfigurationClassUtils.getOrder(bd2.getBeanDefinition());
		return Integer.compare(i1, i2);
	});

	// Detect any custom bean name generation strategy supplied through the enclosing application context
	// 判断当前类型是否是SingletonBeanRegistry类型
	SingletonBeanRegistry sbr = null;
	if (registry instanceof SingletonBeanRegistry) {
		// 类型的强制转换
		sbr = (SingletonBeanRegistry) registry;
		// 判断是否有自定义的beanName生成器
		if (!this.localBeanNameGeneratorSet) {
			// 获取自定义的beanName生成器
			BeanNameGenerator generator = (BeanNameGenerator) sbr.getSingleton(
					AnnotationConfigUtils.CONFIGURATION_BEAN_NAME_GENERATOR);
			// 如果有自定义的命名生成策略
				if (generator != null) {
				//设置组件扫描的beanName生成策略
				this.componentScanBeanNameGenerator = generator;
				// 设置import bean name生成策略
				this.importBeanNameGenerator = generator;
			}
		}
	}

	// 如果环境对象等于空，那么就重新创建新的环境对象
	if (this.environment == null) {
		this.environment = new StandardEnvironment();
	}

	// Parse each @Configuration class
	// 实例化ConfigurationClassParser类，并初始化相关的参数，完成配置类的解析工作
	ConfigurationClassParser parser = new ConfigurationClassParser(
			this.metadataReaderFactory, this.problemReporter, this.environment,
			this.resourceLoader, this.componentScanBeanNameGenerator, registry);

	// 创建两个集合对象，
	// 存放相关的BeanDefinitionHolder对象
	Set<BeanDefinitionHolder> candidates = new LinkedHashSet<>(configCandidates);
	// 存放扫描包下的所有bean
	Set<ConfigurationClass> alreadyParsed = new HashSet<>(configCandidates.size());
	do {
		// 解析带有@Controller、@Import、@ImportResource、@ComponentScan、@ComponentScans、@Bean的BeanDefinition
		parser.parse(candidates);
		// 将解析完的Configuration配置类进行校验，1、配置类不能是final，2、@Bean修饰的方法必须可以重写以支持CGLIB
		parser.validate();

		// 获取所有的bean,包括扫描的bean对象，@Import导入的bean对象
		Set<ConfigurationClass> configClasses = new LinkedHashSet<>(parser.getConfigurationClasses());
		// 清除掉已经解析处理过的配置类
		configClasses.removeAll(alreadyParsed);

		// Read the model and create bean definitions based on its content
		// 判断读取器是否为空，如果为空的话，就创建完全填充好的ConfigurationClass实例的读取器
		if (this.reader == null) {
			this.reader = new ConfigurationClassBeanDefinitionReader(
					registry, this.sourceExtractor, this.resourceLoader, this.environment,
					this.importBeanNameGenerator, parser.getImportRegistry());
		}
		// 核心方法，将完全填充好的ConfigurationClass实例转化为BeanDefinition注册入IOC容器
		this.reader.loadBeanDefinitions(configClasses);
		// 添加到已经处理的集合中
		alreadyParsed.addAll(configClasses);

		candidates.clear();
		// 这里判断registry.getBeanDefinitionCount() > candidateNames.length的目的是为了知道reader.loadBeanDefinitions(configClasses)这一步有没有向BeanDefinitionMap中添加新的BeanDefinition
		// 实际上就是看配置类(例如AppConfig类会向BeanDefinitionMap中添加bean)
		// 如果有，registry.getBeanDefinitionCount()就会大于candidateNames.length
		// 这样就需要再次遍历新加入的BeanDefinition，并判断这些bean是否已经被解析过了，如果未解析，需要重新进行解析
		// 这里的AppConfig类向容器中添加的bean，实际上在parser.parse()这一步已经全部被解析了
		if (registry.getBeanDefinitionCount() > candidateNames.length) {
			String[] newCandidateNames = registry.getBeanDefinitionNames();
			Set<String> oldCandidateNames = new HashSet<>(Arrays.asList(candidateNames));
			Set<String> alreadyParsedClasses = new HashSet<>();
			for (ConfigurationClass configurationClass : alreadyParsed) {
				alreadyParsedClasses.add(configurationClass.getMetadata().getClassName());
			}
			// 如果有未解析的类，则将其添加到candidates中，这样candidates不为空，就会进入到下一次的while的循环中
			for (String candidateName : newCandidateNames) {
				if (!oldCandidateNames.contains(candidateName)) {
					BeanDefinition bd = registry.getBeanDefinition(candidateName);
					if (ConfigurationClassUtils.checkConfigurationClassCandidate(bd, this.metadataReaderFactory) &&
							!alreadyParsedClasses.contains(bd.getBeanClassName())) {
						candidates.add(new BeanDefinitionHolder(bd, candidateName));
					}
				}
			}
			candidateNames = newCandidateNames;
		}
	}
	while (!candidates.isEmpty());

	// Register the ImportRegistry as a bean in order to support ImportAware @Configuration classes
	if (sbr != null && !sbr.containsSingleton(IMPORT_REGISTRY_BEAN_NAME)) {
		sbr.registerSingleton(IMPORT_REGISTRY_BEAN_NAME, parser.getImportRegistry());
	}

	if (this.metadataReaderFactory instanceof CachingMetadataReaderFactory) {
		// Clear cache in externally provided MetadataReaderFactory; this is a no-op
		// for a shared cache since it'll be cleared by the ApplicationContext.
		((CachingMetadataReaderFactory) this.metadataReaderFactory).clearCache();
	}
}
```

可以看到此方法会解析带有`@Controller、@Import、@ImportResource、@ComponentScan、@ComponentScans、@Bean`的BeanDefinition

分析`parser.parse(candidates)` 这一行，此时的解析的bean是`TransactionConfig`，然后接着会执行到`ConfigurationClassParser#doProcessConfigurationClass`

### ConfigurationClassParser#doProcessConfigurationClass

```java
protected final SourceClass doProcessConfigurationClass(
		ConfigurationClass configClass, SourceClass sourceClass, Predicate<String> filter)
		throws IOException {
	// @Configuration继承了@Component
	if (configClass.getMetadata().isAnnotated(Component.class.getName())) {
		// Recursively process any member (nested) classes first
		// 递归处理内部类，因为内部类也是一个配置类，配置类上有@configuration注解，该注解继承@Component，if判断为true，调用processMemberClasses方法，递归解析配置类中的内部类
		processMemberClasses(configClass, sourceClass, filter);
	}

	// Process any @PropertySource annotations
	// 如果配置类上加了@PropertySource注解，那么就解析加载properties文件，并将属性添加到spring上下文中
	for (AnnotationAttributes propertySource : AnnotationConfigUtils.attributesForRepeatable(
			sourceClass.getMetadata(), PropertySources.class,
			org.springframework.context.annotation.PropertySource.class)) {
		if (this.environment instanceof ConfigurableEnvironment) {
			processPropertySource(propertySource);
		}
		else {
			logger.info("Ignoring @PropertySource annotation on [" + sourceClass.getMetadata().getClassName() +
					"]. Reason: Environment must implement ConfigurableEnvironment");
		}
	}

	// Process any @ComponentScan annotations
	// 处理@ComponentScan或者@ComponentScans注解，并将扫描包下的所有bean转换成填充后的ConfigurationClass
	// 此处就是将自定义的bean加载到IOC容器，因为扫描到的类可能也添加了@ComponentScan和@ComponentScans注解，因此需要进行递归解析
	Set<AnnotationAttributes> componentScans = AnnotationConfigUtils.attributesForRepeatable(
			sourceClass.getMetadata(), ComponentScans.class, ComponentScan.class);
	if (!componentScans.isEmpty() &&
			!this.conditionEvaluator.shouldSkip(sourceClass.getMetadata(), ConfigurationPhase.REGISTER_BEAN)) {
		for (AnnotationAttributes componentScan : componentScans) {
			// The config class is annotated with @ComponentScan -> perform the scan immediately
			// 解析@ComponentScan和@ComponentScans配置的扫描的包所包含的类
			// 比如 basePackages = com.mashibing, 那么在这一步会扫描出这个包及子包下的class，然后将其解析成BeanDefinition
			// (BeanDefinition可以理解为等价于BeanDefinitionHolder)
			Set<BeanDefinitionHolder> scannedBeanDefinitions =
					this.componentScanParser.parse(componentScan, sourceClass.getMetadata().getClassName());
			// Check the set of scanned definitions for any further config classes and parse recursively if needed
			// 通过上一步扫描包com.mashibing，有可能扫描出来的bean中可能也添加了ComponentScan或者ComponentScans注解.
			//所以这里需要循环遍历一次，进行递归(parse)，继续解析，直到解析出的类上没有ComponentScan和ComponentScans
			for (BeanDefinitionHolder holder : scannedBeanDefinitions) {
				BeanDefinition bdCand = holder.getBeanDefinition().getOriginatingBeanDefinition();
				if (bdCand == null) {
					bdCand = holder.getBeanDefinition();
				}
				// 判断是否是一个配置类，并设置full或lite属性
				if (ConfigurationClassUtils.checkConfigurationClassCandidate(bdCand, this.metadataReaderFactory)) {
					// 通过递归方法进行解析
					parse(bdCand.getBeanClassName(), holder.getBeanName());
				}
			}
		}
	}

	// Process any @Import annotations
	// 处理@Import注解
	processImports(configClass, sourceClass, getImports(sourceClass), filter, true);

	// Process any @ImportResource annotations
	// 处理@ImportResource注解，导入spring的配置文件
	AnnotationAttributes importResource =
			AnnotationConfigUtils.attributesFor(sourceClass.getMetadata(), ImportResource.class);
	if (importResource != null) {
		String[] resources = importResource.getStringArray("locations");
		Class<? extends BeanDefinitionReader> readerClass = importResource.getClass("reader");
		for (String resource : resources) {
			String resolvedResource = this.environment.resolveRequiredPlaceholders(resource);
			configClass.addImportedResource(resolvedResource, readerClass);
		}
	}

	// Process individual @Bean methods
	// 处理加了@Bean注解的方法，将@Bean方法转化为BeanMethod对象，保存再集合中
	Set<MethodMetadata> beanMethods = retrieveBeanMethodMetadata(sourceClass);
	for (MethodMetadata methodMetadata : beanMethods) {
		configClass.addBeanMethod(new BeanMethod(methodMetadata, configClass));
	}

	// Process default methods on interfaces
	// 处理接口的默认方法实现，从jdk8开始，接口中的方法可以有自己的默认实现，因此如果这个接口的方法加了@Bean注解，也需要被解析
	processInterfaces(configClass, sourceClass);

	// Process superclass, if any
	// 解析父类，如果被解析的配置类继承了某个类，那么配置类的父类也会被进行解析
	if (sourceClass.getMetadata().hasSuperClass()) {
		String superclass = sourceClass.getMetadata().getSuperClassName();
		if (superclass != null && !superclass.startsWith("java") &&
				!this.knownSuperclasses.containsKey(superclass)) {
			this.knownSuperclasses.put(superclass, configClass);
			// Superclass found, return its annotation metadata and recurse
			return sourceClass.getSuperClass();
		}
	}

	// No superclass -> processing is complete
	return null;
}
```

注意下@EnableTransactionManagement注解

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Import(TransactionManagementConfigurationSelector.class)
public @interface EnableTransactionManagement
```

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Import(TransactionManagementConfigurationSelector.class)
public @interface EnableTransactionManagement
```

所以在执行`ConfigurationClassParser#doProcessConfigurationClass`中的处理@Import注解
在上一篇文章：[spring事务执行流程分析_4(注解形式 @EnableTransactionManagement的作用)](/tech-sharing/spring-tx-source/spring-part-4)

解析`@EnableTransactionManagement`注解就是在`processImports(configClass, sourceClass, getImports(sourceClass), filter, true)`这一行中执行的。

### 此时的beanDefinitionMap：
![](/img/technologySharing/spring/beanDefinitionMap.png)
### 此时的singletonObjects:
![](/img/technologySharing/spring/singletonObjects.png)

## 执行BeanPostProcessors处理器

依旧进入刷新refresh方法开始
`AbstractApplicationContext#refresh` ->
`AbstractApplicationContext#registerBeanPostProcessors` ->
...
`AbstractApplicationContext#registerBeanPostProcessors`

### AbstractApplicationContext#registerBeanPostProcessors

在这个方法中会生成 名字：`internalAutoProxyCreator` 类型：`InfrastructureAdvisorAutoProxyCreator`的bean

```java
/**
 * 注册beanPostProcessor
 * @param beanFactory
 * @param applicationContext
 */
public static void registerBeanPostProcessors(
        ConfigurableListableBeanFactory beanFactory, AbstractApplicationContext applicationContext) {

    // 找到所有实现了BeanPostProcessor接口的类
    //0   org.springframework.context.annotation.internalAutowiredAnnotationProcessor
    //1   org.springframework.context.annotation.internalCommonAnnotationProcessor
    //2   org.springframework.aop.config.internalAutoProxyCreator
    String[] postProcessorNames = beanFactory.getBeanNamesForType(BeanPostProcessor.class, true, false);

    // Register BeanPostProcessorChecker that logs an info message when
    // a bean is created during BeanPostProcessor instantiation, i.e. when
    // a bean is not eligible for getting processed by all BeanPostProcessors.
    // 记录下BeanPostProcessor的目标计数
    // 此处为什么要+1呢，原因非常简单，在此方法的最后会添加一个BeanPostProcessorChecker的类
    int beanProcessorTargetCount = beanFactory.getBeanPostProcessorCount() + 1 + postProcessorNames.length;
    // 添加BeanPostProcessorChecker(主要用于记录信息)到beanFactory中
    beanFactory.addBeanPostProcessor(new BeanPostProcessorChecker(beanFactory, beanProcessorTargetCount));

    // Separate between BeanPostProcessors that implement PriorityOrdered,
    // Ordered, and the rest.
    // 定义存放实现了PriorityOrdered接口的BeanPostProcessor集合
    List<BeanPostProcessor> priorityOrderedPostProcessors = new ArrayList<>();
    // 定义存放spring内部的BeanPostProcessor
    List<BeanPostProcessor> internalPostProcessors = new ArrayList<>();
    // 定义存放实现了Ordered接口的BeanPostProcessor的name集合
    List<String> orderedPostProcessorNames = new ArrayList<>();
    // 定义存放普通的BeanPostProcessor的name集合
    List<String> nonOrderedPostProcessorNames = new ArrayList<>();
    // 遍历beanFactory中存在的BeanPostProcessor的集合postProcessorNames，
    for (String ppName : postProcessorNames) {
        // 如果ppName对应的BeanPostProcessor实例实现了PriorityOrdered接口，则获取到ppName对应的BeanPostProcessor的实例添加到priorityOrderedPostProcessors中
        if (beanFactory.isTypeMatch(ppName, PriorityOrdered.class)) {
            BeanPostProcessor pp = beanFactory.getBean(ppName, BeanPostProcessor.class);
            priorityOrderedPostProcessors.add(pp);
            // 如果ppName对应的BeanPostProcessor实例也实现了MergedBeanDefinitionPostProcessor接口，那么则将ppName对应的bean实例添加到internalPostProcessors中
            if (pp instanceof MergedBeanDefinitionPostProcessor) {
                internalPostProcessors.add(pp);
            }
        }
        // 如果ppName对应的BeanPostProcessor实例没有实现PriorityOrdered接口，但是实现了Ordered接口，那么将ppName对应的bean实例添加到orderedPostProcessorNames中
        else if (beanFactory.isTypeMatch(ppName, Ordered.class)) {
            orderedPostProcessorNames.add(ppName);
        } else {
            // 否则将ppName添加到nonOrderedPostProcessorNames中
            nonOrderedPostProcessorNames.add(ppName);
        }
    }

    // First, register the BeanPostProcessors that implement PriorityOrdered.
    // 首先，对实现了PriorityOrdered接口的BeanPostProcessor实例进行排序操作
    sortPostProcessors(priorityOrderedPostProcessors, beanFactory);
    // 注册实现了PriorityOrdered接口的BeanPostProcessor实例添加到beanFactory中
    registerBeanPostProcessors(beanFactory, priorityOrderedPostProcessors);

    // Next, register the BeanPostProcessors that implement Ordered.
    // 注册所有实现Ordered的beanPostProcessor
    List<BeanPostProcessor> orderedPostProcessors = new ArrayList<>(orderedPostProcessorNames.size());
    for (String ppName : orderedPostProcessorNames) {
        // 根据ppName找到对应的BeanPostProcessor实例对象
        BeanPostProcessor pp = beanFactory.getBean(ppName, BeanPostProcessor.class);
        // 将实现了Ordered接口的BeanPostProcessor添加到orderedPostProcessors集合中
        orderedPostProcessors.add(pp);
        // 如果ppName对应的BeanPostProcessor实例也实现了MergedBeanDefinitionPostProcessor接口，那么则将ppName对应的bean实例添加到internalPostProcessors中
        if (pp instanceof MergedBeanDefinitionPostProcessor) {
            internalPostProcessors.add(pp);
        }
    }
    // 对实现了Ordered接口的BeanPostProcessor进行排序操作
    sortPostProcessors(orderedPostProcessors, beanFactory);
    //  注册实现了Ordered接口的BeanPostProcessor实例添加到beanFactory中
    registerBeanPostProcessors(beanFactory, orderedPostProcessors);

    // Now, register all regular BeanPostProcessors.
    // 创建存放没有实现PriorityOrdered和Ordered接口的BeanPostProcessor的集合
    List<BeanPostProcessor> nonOrderedPostProcessors = new ArrayList<>(nonOrderedPostProcessorNames.size());
    // 遍历集合
    for (String ppName : nonOrderedPostProcessorNames) {
        // 根据ppName找到对应的BeanPostProcessor实例对象
        BeanPostProcessor pp = beanFactory.getBean(ppName, BeanPostProcessor.class);
        // 将没有实现PriorityOrdered和Ordered接口的BeanPostProcessor添加到nonOrderedPostProcessors集合中
        nonOrderedPostProcessors.add(pp);
        // 如果ppName对应的BeanPostProcessor实例也实现了MergedBeanDefinitionPostProcessor接口，那么则将ppName对应的bean实例添加到internalPostProcessors中
        if (pp instanceof MergedBeanDefinitionPostProcessor) {
            internalPostProcessors.add(pp);
        }
    }
    //  注册没有实现PriorityOrdered和Ordered的BeanPostProcessor实例添加到beanFactory中
    registerBeanPostProcessors(beanFactory, nonOrderedPostProcessors);

    // Finally, re-register all internal BeanPostProcessors.
    // 将所有实现了MergedBeanDefinitionPostProcessor类型的BeanPostProcessor进行排序操作
    sortPostProcessors(internalPostProcessors, beanFactory);
    // 注册所有实现了MergedBeanDefinitionPostProcessor类型的BeanPostProcessor到beanFactory中
    registerBeanPostProcessors(beanFactory, internalPostProcessors);

    // Re-register post-processor for detecting inner beans as ApplicationListeners,
    // moving it to the end of the processor chain (for picking up proxies etc).
    // 注册ApplicationListenerDetector到beanFactory中
    beanFactory.addBeanPostProcessor(new ApplicationListenerDetector(applicationContext));
}
```

此时的singletonObjects：
![](/img/technologySharing/spring/此时的singletonObjects2.png)

## 初始化剩下的单实例（非懒加载的）

依旧进入刷新refresh方法开始
`AbstractApplicationContext#refresh` ->
`AbstractApplicationContext#finishBeanFactoryInitialization` ->
`DefaultListableBeanFactory#preInstantiateSingletons`

```java
public void preInstantiateSingletons() throws BeansException {
    if (logger.isTraceEnabled()) {
        logger.trace("Pre-instantiating singletons in " + this);
    }

    // Iterate over a copy to allow for init methods which in turn register new bean definitions.
    // While this may not be part of the regular factory bootstrap, it does otherwise work fine.
    // 将所有BeanDefinition的名字创建一个集合
    List<String> beanNames = new ArrayList<>(this.beanDefinitionNames);

    // Trigger initialization of all non-lazy singleton beans...
    // 触发所有非延迟加载单例bean的初始化，遍历集合的对象
    for (String beanName : beanNames) {
        // 合并父类BeanDefinition
        RootBeanDefinition bd = getMergedLocalBeanDefinition(beanName);
        // 条件判断，抽象，单例，非懒加载
        if (!bd.isAbstract() && bd.isSingleton() && !bd.isLazyInit()) {
            // 判断是否实现了FactoryBean接口
            if (isFactoryBean(beanName)) {
                // 根据&+beanName来获取具体的对象
                Object bean = getBean(FACTORY_BEAN_PREFIX + beanName);
                // 进行类型转换
                if (bean instanceof FactoryBean) {
                    FactoryBean<?> factory = (FactoryBean<?>) bean;
                    // 判断这个FactoryBean是否希望立即初始化
                    boolean isEagerInit;
                    if (System.getSecurityManager() != null && factory instanceof SmartFactoryBean) {
                        isEagerInit = AccessController.doPrivileged(
                                (PrivilegedAction<Boolean>) ((SmartFactoryBean<?>) factory)::isEagerInit,
                                getAccessControlContext());
                    }
                    else {
                        isEagerInit = (factory instanceof SmartFactoryBean &&
                                ((SmartFactoryBean<?>) factory).isEagerInit());
                    }
                    //  如果希望急切的初始化，则通过beanName获取bean实例
                    if (isEagerInit) {
                        getBean(beanName);
                    }
                }
            }
            else {
                // 如果beanName对应的bean不是FactoryBean，只是普通的bean，通过beanName获取bean实例
                getBean(beanName);
            }
        }
    }

    // Trigger post-initialization callback for all applicable beans...
    // 遍历beanNames，触发所有SmartInitializingSingleton的后初始化回调
    for (String beanName : beanNames) {
        // 获取beanName对应的bean实例
        Object singletonInstance = getSingleton(beanName);
        // 判断singletonInstance是否实现了SmartInitializingSingleton接口
        if (singletonInstance instanceof SmartInitializingSingleton) {
            // 类型转换
            SmartInitializingSingleton smartSingleton = (SmartInitializingSingleton) singletonInstance;
            // 触发SmartInitializingSingleton实现类的afterSingletonsInstantiated方法
            if (System.getSecurityManager() != null) {
                AccessController.doPrivileged((PrivilegedAction<Object>) () -> {
                    smartSingleton.afterSingletonsInstantiated();
                    return null;
                }, getAccessControlContext());
            }
            else {
                smartSingleton.afterSingletonsInstantiated();
            }
        }
    }
}
```

到这里就是创建出真正的对象bean了，其中会把
名字：`internalTransactionAdvisor` 类型：`BeanFactoryTransactionAttributeSourceAdvisor`、
名字：`transactionAttributeSource` 类型：`TransactionAttributeSource`、
名字：`transactionInterceptor` 类型：`TransactionInterceptor`
的对象创建出来

分析`getBean(beanName)`此方法是真正创建对象的逻辑
`AbstractBeanFactory#getBean` ->
...
`AbstractAutowireCapableBeanFactory#createBean` ->
`AbstractAutowireCapableBeanFactory#resolveBeforeInstantiation` ->
`AbstractAutoProxyCreator#postProcessBeforeInstantiation`

### AbstractAutoProxyCreator#postProcessBeforeInstantiation

```java
public Object postProcessBeforeInstantiation(Class<?> beanClass, String beanName) {
	Object cacheKey = getCacheKey(beanClass, beanName);

	if (!StringUtils.hasLength(beanName) || !this.targetSourcedBeans.contains(beanName)) {
		//查缓存，是否有处理过了，不管是不是需要通知增强的，只要处理过了就会放里面
		if (this.advisedBeans.containsKey(cacheKey)) {
			return null;
		}
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

### AbstractAutoProxyCreator#shouldSkip

```java
protected boolean shouldSkip(Class<?> beanClass, String beanName) {
	return AutoProxyUtils.isOriginalInstance(beanName, beanClass);
}
```

之前在xml解析的时候执行到shouldSkip方法时会将adviosr、pointcout创建好，而注解的方式这里不会创建

## advisor对象的创建

从初始化剩下的单实例（非懒加载的）方法开始分析,beanName为transactionConfig时，调用链路为
`DefaultListableBeanFactory#preInstantiateSingletons` ->
`AbstractAutowireCapableBeanFactory#createBean` ->
`AbstractAutowireCapableBeanFactory#doCreateBean` ->
`AbstractAutowireCapableBeanFactory#initializeBean` ->
`AbstractAutowireCapableBeanFactory#applyBeanPostProcessorsAfterInitialization`

> `InfrastructureAdvisorAutoProxyCreator`的第一次`postProcessAfterInitialization`方法的`wrapIfNecessary`中创建`BeanFactoryTransactionAttributeSourceAdvisor`，由于`InfrastructureAdvisorAutoProxyCreator`继承了`AbstractAdvisorAutoProxyCreator`，`AbstractAdvisorAutoProxyCreator` 继承了 `AbstractAutoProxyCreator`，所以显示是`AbstractAutoProxyCreator#postProcessAfterInitialization`


`AbstractAutoProxyCreator#postProcessAfterInitialization` ->
`AbstractAutoProxyCreator#wrapIfNecessary`

```java
/**
 * 先判断是否已经处理过，是否需要跳过，跳过的话直接就放进advisedBeans里，表示不进行代理，如果这个bean处理过了，获取通知拦截器，然后开始进行代理
 *
 * Wrap the given bean if necessary, i.e. if it is eligible for being proxied.
 * @param bean the raw bean instance
 * @param beanName the name of the bean
 * @param cacheKey the cache key for metadata access
 * @return a proxy wrapping the bean, or the raw bean instance as-is
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

根据目标对象和容器中所有的advisor做判断匹配返回符合目标对象的advisor，在这个方法中，会创建所有的advisor，并返回和指定的bean匹配的advisor，创建出了名字：`internalTransactionAdvisor` 类型：`BeanFactoryTransactionAttributeSourceAdvisor`

分析`AbstractAdvisorAutoProxyCreator#getAdvicesAndAdvisorsForBean`这行，里面执行了`AbstractAdvisorAutoProxyCreator#findCandidateAdvisors`

### AbstractAdvisorAutoProxyCreator#findCandidateAdvisors

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
	extendAdvisors(eligibleAdvisors);
	if (!eligibleAdvisors.isEmpty()) {
		//排序，将org.springframework.aop.interceptor.ExposeInvocationInterceptor.ADVISOR排在集合首位
		eligibleAdvisors = sortAdvisors(eligibleAdvisors);
	}
	return eligibleAdvisors;
}
```

获取所有的增强并创建

1. 因为`BeanFactoryTransactionAttributeSourceAdvisor`是bean注解的工厂方法，所以要先实例化工厂factoryBean，也就是实例化`ProxyTransactionManagementConfiguration`
2. 因为`BeanFactoryTransactionAttributeSourceAdvisor`工厂方法有参数依赖，所以要注入依赖，创建`AnnotationTransactionAttributeSource和TransactionInterceptor`实例
3. 最后反射调用方法创建`BeanFactoryTransactionAttributeSourceAdvisor`设置依赖属性

寻找所有增强中适用于bean的增强并应用返回，这时的beanName为transactionConfig，执行后的eligibleAdvisors为空的。所以换成beanName为bookService的时候来分析

分析`findAdvisorsThatCanApply(candidateAdvisors, beanClass, beanName);`这一行

### AbstractAdvisorAutoProxyCreator#findAdvisorsThatCanApply

```java
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

### 此方法具体逻辑：

> 遍历Advisors集合，
在遍历Advisors集合的过程中，遍历这个bean的所有方法，
优先方法上解析的事务注解的属性，会去找父类或者接口的方法，如果存在解析事务注解的属性并放入
AbstractFallbackTransactionAttributeSource的this.attributeCache.put(cacheKey, txAttr);缓存中。
cacheKey：MethodClassKey类型 ， public void com.test.tx.annotation.service.impl.BookService.addUser(com.test.tx.entity.User) on class com.test.tx.annotation.service.impl.BookService
txAttr：RuleBasedTransactionAttribute类型， PROPAGATION_REQUIRED,ISOLATION_DEFAULT
将该Advisors放入符合条件的新Advisors 

如果没有，再尝试声明该方法的类上搞得注解属性，会去父类或者接口找，如果存在解析事务注解的属性并放入
AbstractFallbackTransactionAttributeSource的this.attributeCache.put(cacheKey, txAttr);缓存中。
cacheKey：MethodClassKey类型 ， public void com.test.tx.annotation.service.impl.BookService.addUser(com.test.tx.entity.User) on class com.test.tx.annotation.service.impl.BookService
txAttr：RuleBasedTransactionAttribute类型， PROPAGATION_REQUIRED,ISOLATION_DEFAULT
将该Advisors放入符合条件的新Advisors

将新Advisors集合返回，如果以上都不符合返回的就是空的


执行完后返回`AbstractAutoProxyCreator#wrapIfNecessary`
`Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null);`执行完毕。
如果specificInterceptors 不为空则进行创建动态代理类。
`AbstractAutoProxyCreator#createProxy`创建完后回到`AbstractAutowireCapableBeanFactory#initializeBean`返回动态代理类。

到这里后续的和xml中的逻辑相同。

### 注解形式 事务的初始化流程图

![](/img/technologySharing/spring/注解形式事务的初始化流程图.png)