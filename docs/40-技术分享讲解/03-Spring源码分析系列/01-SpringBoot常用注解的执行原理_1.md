---
slug: /tech-sharing/spring-source/springboot-part-1
---


# SpringBoot常用注解的执行原理_1
Springboot注解Configuration、Bean、Component、ComponentScan、Import、ImportResource
## 从启动类入手

```java
SpringApplication.run(OrderApplication.class, args)
```

## SpringApplication.run(String... args)

```java
public ConfigurableApplicationContext run(String... args) {
	StopWatch stopWatch = new StopWatch();
	stopWatch.start();
	ConfigurableApplicationContext context = null;
	configureHeadlessProperty();
	SpringApplicationRunListeners listeners = getRunListeners(args);
	listeners.starting();
	try {
		context = createApplicationContext();
		prepareContext(context, environment, listeners, applicationArguments, printedBanner);
		refreshContext(context);
		//...
	}
	catch (Throwable ex) {
		//...
	}
	return context;
	//...
}
```

## SpringApplication.refreshContext(context)

```java
private void refreshContext(ConfigurableApplicationContext context) {
	if (this.registerShutdownHook) {
		try {
			context.registerShutdownHook();
		}
		catch (AccessControlException ex) {
			// Not allowed in some environments.
		}
	}
	refresh((ApplicationContext) context);
}
```

点击进入最终来到`AbstractApplicationContext.refresh()`重要的容器`refresh`方法

## AbstractApplicationContext.refresh()

```java
public void refresh() throws BeansException, IllegalStateException {
	synchronized (this.startupShutdownMonitor) {
		// Prepare this context for refreshing.
		/**
		 * 前戏，做容器刷新前的准备工作
		 * 1、设置容器的启动时间
		 * 2、设置活跃状态为true
		 * 3、设置关闭状态为false
		 * 4、获取Environment对象，并加载当前系统的属性值到Environment对象中
		 * 5、准备监听器和事件的集合对象，默认为空的集合
		 */

		prepareRefresh();

		// Tell the subclass to refresh the internal bean factory.
		// 创建容器对象：DefaultListableBeanFactory
		// 加载xml配置文件的属性值到当前工厂中，最重要的就是BeanDefinition
		ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

		// Prepare the bean factory for use in this context.
		// beanFactory的准备工作，对各种属性进行填充
		prepareBeanFactory(beanFactory);

		try {
			// Allows post-processing of the bean factory in context subclasses.
			// 子类覆盖方法做额外的处理，此处我们自己一般不做任何扩展工作，但是可以查看web中的代码，是有具体实现的
			postProcessBeanFactory(beanFactory);

			// Invoke factory processors registered as beans in the context.
			// 调用各种beanFactory处理器
			invokeBeanFactoryPostProcessors(beanFactory);

			// Register bean processors that intercept bean creation.
			// 注册bean处理器，这里只是注册功能，真正调用的是getBean方法
			registerBeanPostProcessors(beanFactory);

			// Initialize message source for this context.
			// 为上下文初始化message源，即不同语言的消息体，国际化处理,在springmvc的时候通过国际化的代码重点讲
			initMessageSource();

			// Initialize event multicaster for this context.
			// 初始化事件监听多路广播器
			initApplicationEventMulticaster();

			// Initialize other special beans in specific context subclasses.
			// 留给子类来初始化其他的bean
			onRefresh();

			// Check for listener beans and register them.
			// 在所有注册的bean中查找listener bean,注册到消息广播器中
			registerListeners();

			// Instantiate all remaining (non-lazy-init) singletons.
			// 初始化剩下的单实例（非懒加载的）
			finishBeanFactoryInitialization(beanFactory);

			// Last step: publish corresponding event.
			// 完成刷新过程，通知生命周期处理器lifecycleProcessor刷新过程，同时发出ContextRefreshEvent通知别人
			finishRefresh();
		}

		catch (BeansException ex) {
			//...
		}

		finally {
			resetCommonCaches();
		}
	}
}
```

分析调用各种beanFactory处理器`invokeBeanFactoryPostProcessors(beanFactory)`

## AbstractApplicationContext.invokeBeanFactoryPostProcessors

```java
protected void invokeBeanFactoryPostProcessors(ConfigurableListableBeanFactory beanFactory) {
	PostProcessorRegistrationDelegate.invokeBeanFactoryPostProcessors(beanFactory, getBeanFactoryPostProcessors());
	//...
}
```

## PostProcessorRegistrationDelegate.invokeBeanFactoryPostProcessors

```java
//此方法用来执行实现接口：
//BeanDefinitionRegistryPostProcessor#postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry)
//BeanFactoryPostProcessor#postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory)
//regularPostProcessors List<BeanFactoryPostProcessor>
//registryProcessors List<BeanDefinitionRegistryPostProcessor>
//1先将入参传入的集合是BeanDefinitionRegistryPostProcessor接口的，执行postProcessBeanDefinitionRegistry(registry)方法，
//然后再放入registryProcessors集合中，用于后续执行BeanFactoryPostProcessor接口的postProcessBeanFactor方法
//2获取容器中BeanDefinitionRegistryPostProcessor类型的集合，
//然后分别执行 实现PriorityOrdered接口的，Ordered接口的，没实现排序接口的  postProcessBeanDefinitionRegistry方法，并且都放在registryProcessors集合中，
//来一起执行BeanFactoryPostProcessor的postProcessBeanFactory方法
//3获取容器中BeanFactoryPostProcessor类型的集合，
//然后分别执行 实现PriorityOrdered接口的，Ordered接口的，没实现排序接口的  postProcessBeanFactory方法
public static void invokeBeanFactoryPostProcessors(
        ConfigurableListableBeanFactory beanFactory, List<BeanFactoryPostProcessor> beanFactoryPostProcessors) {

    // Invoke BeanDefinitionRegistryPostProcessors first, if any.
    // 无论是什么情况，优先执行BeanDefinitionRegistryPostProcessors
    // 将已经执行过的BFPP存储在processedBeans中，防止重复执行
    Set<String> processedBeans = new HashSet<>();

    // 判断beanfactory是否是BeanDefinitionRegistry类型，此处是DefaultListableBeanFactory,实现了BeanDefinitionRegistry接口，所以为true
    if (beanFactory instanceof BeanDefinitionRegistry) {
        // 类型转换
        BeanDefinitionRegistry registry = (BeanDefinitionRegistry) beanFactory;
        // 此处希望大家做一个区分，两个接口是不同的，BeanDefinitionRegistryPostProcessor是BeanFactoryPostProcessor的子集
        // BeanFactoryPostProcessor主要针对的操作对象是BeanFactory，而BeanDefinitionRegistryPostProcessor主要针对的操作对象是BeanDefinition
        // 存放BeanFactoryPostProcessor的集合
        List<BeanFactoryPostProcessor> regularPostProcessors = new ArrayList<>();
        // 存放BeanDefinitionRegistryPostProcessor的集合
        List<BeanDefinitionRegistryPostProcessor> registryProcessors = new ArrayList<>();

        // 首先处理入参中的beanFactoryPostProcessors,遍历所有的beanFactoryPostProcessors，将BeanDefinitionRegistryPostProcessor
        // 和BeanFactoryPostProcessor区分开
        for (BeanFactoryPostProcessor postProcessor : beanFactoryPostProcessors) {
            // 如果是BeanDefinitionRegistryPostProcessor
            if (postProcessor instanceof BeanDefinitionRegistryPostProcessor) {
                BeanDefinitionRegistryPostProcessor registryProcessor =
                        (BeanDefinitionRegistryPostProcessor) postProcessor;
                // 直接执行BeanDefinitionRegistryPostProcessor接口中的postProcessBeanDefinitionRegistry方法
                registryProcessor.postProcessBeanDefinitionRegistry(registry);
                // 添加到registryProcessors，用于后续执行postProcessBeanFactory方法
                registryProcessors.add(registryProcessor);
            } else {
                // 否则，只是普通的BeanFactoryPostProcessor，添加到regularPostProcessors，用于后续执行postProcessBeanFactory方法
                regularPostProcessors.add(postProcessor);
            }
        }

        // 用于保存本次要执行的BeanDefinitionRegistryPostProcessor
        List<BeanDefinitionRegistryPostProcessor> currentRegistryProcessors = new ArrayList<>();

        // First, invoke the BeanDefinitionRegistryPostProcessors that implement PriorityOrdered.
        // 调用所有实现PriorityOrdered接口的BeanDefinitionRegistryPostProcessor实现类
        // 找到所有实现BeanDefinitionRegistryPostProcessor接口bean的beanName
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
        // 执行完毕之后，清空currentRegistryProcessors
        currentRegistryProcessors.clear();

        // 调用所有实现Ordered接口的BeanDefinitionRegistryPostProcessor实现类
        // 找到所有实现BeanDefinitionRegistryPostProcessor接口bean的beanName，
        // 此处需要重复查找的原因在于上面的执行过程中可能会新增其他的BeanDefinitionRegistryPostProcessor
        postProcessorNames = beanFactory.getBeanNamesForType(BeanDefinitionRegistryPostProcessor.class, true, false);
        for (String ppName : postProcessorNames) {
            // 检测是否实现了Ordered接口，并且还未执行过
            if (!processedBeans.contains(ppName) && beanFactory.isTypeMatch(ppName, Ordered.class)) {
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
        // 执行完毕之后，清空currentRegistryProcessors
        currentRegistryProcessors.clear();

        // Finally, invoke all other BeanDefinitionRegistryPostProcessors until no further ones appear.
        // 最后，调用所有剩下的BeanDefinitionRegistryPostProcessors
        boolean reiterate = true;
        while (reiterate) {
            reiterate = false;
            // 找出所有实现BeanDefinitionRegistryPostProcessor接口的类
            postProcessorNames = beanFactory.getBeanNamesForType(BeanDefinitionRegistryPostProcessor.class, true, false);
            // 遍历执行
            for (String ppName : postProcessorNames) {
                // 跳过已经执行过的BeanDefinitionRegistryPostProcessor
                if (!processedBeans.contains(ppName)) {
                    // 获取名字对应的bean实例，添加到currentRegistryProcessors中
                    currentRegistryProcessors.add(beanFactory.getBean(ppName, BeanDefinitionRegistryPostProcessor.class));
                    // 将要被执行的BFPP名称添加到processedBeans，避免后续重复执行
                    processedBeans.add(ppName);
                    reiterate = true;
                }
            }
            // 按照优先级进行排序操作
            sortPostProcessors(currentRegistryProcessors, beanFactory);
            // 添加到registryProcessors中，用于最后执行postProcessBeanFactory方法
            registryProcessors.addAll(currentRegistryProcessors);
            // 遍历currentRegistryProcessors，执行postProcessBeanDefinitionRegistry方法
            invokeBeanDefinitionRegistryPostProcessors(currentRegistryProcessors, registry);
            // 执行完毕之后，清空currentRegistryProcessors
            currentRegistryProcessors.clear();
        }

        // 调用所有BeanDefinitionRegistryPostProcessor的postProcessBeanFactory方法
        invokeBeanFactoryPostProcessors(registryProcessors, beanFactory);
        // 最后，调用入参beanFactoryPostProcessors中的普通BeanFactoryPostProcessor的postProcessBeanFactory方法
        invokeBeanFactoryPostProcessors(regularPostProcessors, beanFactory);
    } else {
        // Invoke factory processors registered with the context instance.
        // 如果beanFactory不归属于BeanDefinitionRegistry类型，那么直接执行postProcessBeanFactory方法
        invokeBeanFactoryPostProcessors(beanFactoryPostProcessors, beanFactory);
    }

    // 到这里为止，入参beanFactoryPostProcessors和容器中的所有BeanDefinitionRegistryPostProcessor已经全部处理完毕，下面开始处理容器中
    // 所有的BeanFactoryPostProcessor
    // 可能会包含一些实现类，只实现了BeanFactoryPostProcessor，并没有实现BeanDefinitionRegistryPostProcessor接口

    // 找到所有实现BeanFactoryPostProcessor接口的类
    String[] postProcessorNames =
            beanFactory.getBeanNamesForType(BeanFactoryPostProcessor.class, true, false);

    // 用于存放实现了PriorityOrdered接口的BeanFactoryPostProcessor
    List<BeanFactoryPostProcessor> priorityOrderedPostProcessors = new ArrayList<>();
    // 用于存放实现了Ordered接口的BeanFactoryPostProcessor的beanName
    // List<String> orderedPostProcessorNames = new ArrayList<>();
    List<BeanFactoryPostProcessor> orderedPostProcessor = new ArrayList<>();
    // 用于存放普通BeanFactoryPostProcessor的beanName
    // List<String> nonOrderedPostProcessorNames = new ArrayList<>();
    List<BeanFactoryPostProcessor> nonOrderedPostProcessorNames = new ArrayList<>();
    // 遍历postProcessorNames,将BeanFactoryPostProcessor按实现PriorityOrdered、实现Ordered接口、普通三种区分开
    for (String ppName : postProcessorNames) {
        // 跳过已经执行过的BeanFactoryPostProcessor
        if (processedBeans.contains(ppName)) {
            // skip - already processed in first phase above
        }
        // 添加实现了PriorityOrdered接口的BeanFactoryPostProcessor到priorityOrderedPostProcessors
        else if (beanFactory.isTypeMatch(ppName, PriorityOrdered.class)) {
            priorityOrderedPostProcessors.add(beanFactory.getBean(ppName, BeanFactoryPostProcessor.class));
        }
        // 添加实现了Ordered接口的BeanFactoryPostProcessor的beanName到orderedPostProcessorNames
        else if (beanFactory.isTypeMatch(ppName, Ordered.class)) {
        // orderedPostProcessorNames.add(ppName);
            orderedPostProcessor.add(beanFactory.getBean(ppName, BeanFactoryPostProcessor.class));
        } else {
            // 添加剩下的普通BeanFactoryPostProcessor的beanName到nonOrderedPostProcessorNames
        // nonOrderedPostProcessorNames.add(ppName);
            nonOrderedPostProcessorNames.add(beanFactory.getBean(ppName, BeanFactoryPostProcessor.class));
        }
    }

    // 对实现了PriorityOrdered接口的BeanFactoryPostProcessor进行排序
    sortPostProcessors(priorityOrderedPostProcessors, beanFactory);
    // 遍历实现了PriorityOrdered接口的BeanFactoryPostProcessor，执行postProcessBeanFactory方法
    invokeBeanFactoryPostProcessors(priorityOrderedPostProcessors, beanFactory);

    // 对实现了Ordered接口的BeanFactoryPostProcessor进行排序操作
    sortPostProcessors(orderedPostProcessor, beanFactory);
    // 遍历实现了Ordered接口的BeanFactoryPostProcessor，执行postProcessBeanFactory方法
    invokeBeanFactoryPostProcessors(orderedPostProcessor, beanFactory);
    // 遍历普通的BeanFactoryPostProcessor，执行postProcessBeanFactory方法
    invokeBeanFactoryPostProcessors(nonOrderedPostProcessorNames, beanFactory);

    // 清除元数据缓存（mergeBeanDefinitions、allBeanNamesByType、singletonBeanNameByType）
    // 因为后置处理器可能已经修改了原始元数据，例如，替换值中的占位符
    beanFactory.clearMetadataCache();
}
```

分析这行，遍历currentRegistryProcessors，执行postProcessBeanDefinitionRegistry方法`invokeBeanDefinitionRegistryPostProcessors(currentRegistryProcessors, registry)`

### PostProcessorRegistrationDelegate.invokeBeanDefinitionRegistryPostProcessors(currentRegistryProcessors, registry)

```java
private static void invokeBeanDefinitionRegistryPostProcessors(
        Collection<? extends BeanDefinitionRegistryPostProcessor> postProcessors, BeanDefinitionRegistry registry) {

    for (BeanDefinitionRegistryPostProcessor postProcessor : postProcessors) {
    	//当postProcessor实际为ConfigurationClassPostProcessor时，进行分析
        postProcessor.postProcessBeanDefinitionRegistry(registry);
    }
}
```

### ConfigurationClassPostProcessor.postProcessBeanDefinitionRegistry(registry)

```java
public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
    // 根据对应的registry对象生成hashcode值，此对象只会操作一次，如果之前处理过则抛出异常
    int registryId = System.identityHashCode(registry);
    if (this.registriesPostProcessed.contains(registryId)) {
        throw new IllegalStateException(
                "postProcessBeanDefinitionRegistry already called on this post-processor against " + registry);
    }
    if (this.factoriesPostProcessed.contains(registryId)) {
        throw new IllegalStateException(
                "postProcessBeanFactory already called on this post-processor against " + registry);
    }
    // 将马上要进行处理的registry对象的id值放到已经处理的集合对象中
    this.registriesPostProcessed.add(registryId);

    // 处理配置类的bean定义信息
    processConfigBeanDefinitions(registry);
}
```

### ConfigurationClassPostProcessor.processConfigBeanDefinitions(registry)

```java
/**
 * 构建和验证一个类是否被@Configuration修饰，并做相关的解析工作
 *
 * 那么springboot的自动装配原理就在此方法
 *
 * @Bean、@Component、@ComponentScan、@Import、@ImportResource注解就是在此方法内解析
 * @Component修饰的会放到this.configurationClasses.put(configClass, configClass);
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

    // 如果没有发现任何配置类，则直接返回
    if (configCandidates.isEmpty()) {
        return;
    }

    // 如果适用，则按照先前确定的@Order的值排序
    configCandidates.sort((bd1, bd2) -> {
        int i1 = ConfigurationClassUtils.getOrder(bd1.getBeanDefinition());
        int i2 = ConfigurationClassUtils.getOrder(bd2.getBeanDefinition());
        return Integer.compare(i1, i2);
    });

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

    if (sbr != null && !sbr.containsSingleton(IMPORT_REGISTRY_BEAN_NAME)) {
        sbr.registerSingleton(IMPORT_REGISTRY_BEAN_NAME, parser.getImportRegistry());
    }

    if (this.metadataReaderFactory instanceof CachingMetadataReaderFactory) {
        ((CachingMetadataReaderFactory) this.metadataReaderFactory).clearCache();
    }
}
```

分析这行，解析带有@Controller、@Import、@ImportResource、@ComponentScan、@ComponentScans、@Bean的BeanDefinition的方法`parser.parse(candidates)`
### ConfigurationClassParser.parse(candidates)

```java
public void parse(Set<BeanDefinitionHolder> configCandidates) {
    for (BeanDefinitionHolder holder : configCandidates) {
        BeanDefinition bd = holder.getBeanDefinition();
        try {
            if (bd instanceof AnnotatedBeanDefinition) {
                parse(((AnnotatedBeanDefinition) bd).getMetadata(), holder.getBeanName());
            }
            //...
        }
        catch (BeanDefinitionStoreException ex) {
            throw ex;
        }
        //...
    }

    this.deferredImportSelectorHandler.process();
}
```

### ConfigurationClassParser.parse(AnnotationMetadata metadata, String beanName)

```java
protected final void parse(AnnotationMetadata metadata, String beanName) throws IOException {
	processConfigurationClass(new ConfigurationClass(metadata, beanName), DEFAULT_EXCLUSION_FILTER);
}
```

### ConfigurationClassParser.processConfigurationClass

```java
protected void processConfigurationClass(ConfigurationClass configClass, Predicate<String> filter) throws IOException {
    //...
    SourceClass sourceClass = asSourceClass(configClass, filter);
    do {
        sourceClass = doProcessConfigurationClass(configClass, sourceClass, filter);
    }
    while (sourceClass != null);

    this.configurationClasses.put(configClass, configClass);
}
```

### ConfigurationClassParser.doProcessConfigurationClass(configClass, sourceClass, filter)

```java
//处理@Component，@PropertySource，@ComponentScan，@Import，@Bean
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

    // 处理加了@Bean注解的方法，将@Bean方法转化为BeanMethod对象，保存再集合中
    Set<MethodMetadata> beanMethods = retrieveBeanMethodMetadata(sourceClass);
    for (MethodMetadata methodMetadata : beanMethods) {
        configClass.addBeanMethod(new BeanMethod(methodMetadata, configClass));
    }

    // 处理接口的默认方法实现，从jdk8开始，接口中的方法可以有自己的默认实现，因此如果这个接口的方法加了@Bean注解，也需要被解析
    processInterfaces(configClass, sourceClass);

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

分析这行，处理@Import注解`processImports(configClass, sourceClass, getImports(sourceClass), filter, true)`

### ConfigurationClassParser.processImports(ConfigurationClass configClass, SourceClass currentSourceClass,Collection importCandidates, Predicate exclusionFilter,boolean checkForCircularImports)

```java
//解析import相关
private void processImports(ConfigurationClass configClass, SourceClass currentSourceClass,
        Collection<SourceClass> importCandidates, Predicate<String> exclusionFilter,
        boolean checkForCircularImports) {

    // 如果使用@Import注解修饰的类集合为空，那么直接返回
    if (importCandidates.isEmpty()) {
        return;
    }
    // 通过一个栈结构解决循环引入
    if (checkForCircularImports && isChainedImportOnStack(configClass)) {
        this.problemReporter.error(new CircularImportProblem(configClass, this.importStack));
    }
    else {
        // 添加到栈中，用于处理循环引入的问题
        this.importStack.push(configClass);
        try {
            // 遍历每一个@Import注解的类
            for (SourceClass candidate : importCandidates) {
                // 检验配置类Import引入的类是否是ImportSelector子类
                if (candidate.isAssignable(ImportSelector.class)) {
                    // 候选类是一个导入选择器->委托来确定是否进行导入
                    Class<?> candidateClass = candidate.loadClass();
                    // 通过反射生成一个ImportSelect对象
                    ImportSelector selector = ParserStrategyUtils.instantiateClass(candidateClass, ImportSelector.class,
                            this.environment, this.resourceLoader, this.registry);
                    // 获取选择器的额外过滤器
                    Predicate<String> selectorFilter = selector.getExclusionFilter();
                    if (selectorFilter != null) {
                        exclusionFilter = exclusionFilter.or(selectorFilter);
                    }
                    // 判断引用选择器是否是DeferredImportSelector接口的实例
                    // 如果是则应用选择器将会在所有的配置类都加载完毕后加载
                    if (selector instanceof DeferredImportSelector) {
                        // 将选择器添加到deferredImportSelectorHandler实例中，预留到所有的配置类加载完成后统一处理自动化配置类
                        this.deferredImportSelectorHandler.handle(configClass, (DeferredImportSelector) selector);
                    }
                    else {
                        // 获取引入的类，然后使用递归方式将这些类中同样添加了@Import注解引用的类
                        String[] importClassNames = selector.selectImports(currentSourceClass.getMetadata());
                        Collection<SourceClass> importSourceClasses = asSourceClasses(importClassNames, exclusionFilter);
                        // 递归处理，被Import进来的类也有可能@Import注解
                        processImports(configClass, currentSourceClass, importSourceClasses, exclusionFilter, false);
                    }
                }
                // 如果是实现了ImportBeanDefinitionRegistrar接口的bd
                else if (candidate.isAssignable(ImportBeanDefinitionRegistrar.class)) {
                    // 候选类是ImportBeanDefinitionRegistrar  -> 委托给当前注册器注册其他bean
                    Class<?> candidateClass = candidate.loadClass();
                    ImportBeanDefinitionRegistrar registrar =
                            ParserStrategyUtils.instantiateClass(candidateClass, ImportBeanDefinitionRegistrar.class,
                                    this.environment, this.resourceLoader, this.registry);
                    /**
                     * 放到当前configClass的importBeanDefinitionRegistrars中
                     * 在ConfigurationClassPostProcessor处理configClass时会随之一起处理
                     */
                    configClass.addImportBeanDefinitionRegistrar(registrar, currentSourceClass.getMetadata());
                }
                else {
                    // 候选类既不是ImportSelector也不是ImportBeanDefinitionRegistrar-->将其作为@Configuration配置类处理
                    this.importStack.registerImport(
                            currentSourceClass.getMetadata(), candidate.getMetadata().getClassName());
                    /**
                     * 如果Import的类型是普通类，则将其当作带有@Configuration的类一样处理
                     * 将candidate构造为ConfigurationClass，标注为importedBy，意味着它是通过被@Import进来的
                     * 后面处理会用到这个判断将这个普通类注册进DefaultListableBeanFactory
                     */
                    processConfigurationClass(candidate.asConfigClass(configClass), exclusionFilter);
                }
            }
        }
        catch (BeanDefinitionStoreException ex) {
            throw ex;
        }
        catch (Throwable ex) {
            throw new BeanDefinitionStoreException(
                    "Failed to process import candidates for configuration class [" +
                    configClass.getMetadata().getClassName() + "]", ex);
        }
        finally {
            this.importStack.pop();
        }
    }
}
```
