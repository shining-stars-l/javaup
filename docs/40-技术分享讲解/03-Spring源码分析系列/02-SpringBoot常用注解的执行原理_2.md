---
slug: /tech-sharing/spring-source/springboot-part-2
---


# SpringBoot常用注解的执行原理_2
Springboot注解Configuration、Bean、Component、ComponentScan、Import、ImportResource
## 概括

springboot的自动装配功能可以实现简单、快捷的组件依赖，只需要一个starter就可以实现引入。不再像之前传统的web.xml需要繁琐的配置。

## 版本

`springboot`:2.3.12.RELEASE

## 结构

### SpringBoot项目父依赖spring-boot-starter-parent

```xml
<parent>
	<groupId>org.springframework.boot</groupId>
	<artifactId>spring-boot-starter-parent</artifactId>
	<version>2.3.12.RELEASE</version>
	<relativePath/> <!-- lookup parent from repository -->
</parent>
```

点进入继续分析

### spring-boot-dependencies

```xml
<parent>
	<groupId>org.springframework.boot</groupId>
	<artifactId>spring-boot-dependencies</artifactId>
	<version>2.3.12.RELEASE</version>
</parent>

<build>
    <resources>
      <resource>
        <directory>${basedir}/src/main/resources</directory>
        <filtering>true</filtering>
        <includes>
          <include>**/application*.yml</include>
          <include>**/application*.yaml</include>
          <include>**/application*.properties</include>
        </includes>
      </resource>
      <resource>
        <directory>${basedir}/src/main/resources</directory>
        <excludes>
          <exclude>**/application*.yml</exclude>
          <exclude>**/application*.yaml</exclude>
          <exclude>**/application*.properties</exclude>
        </excludes>
      </resource>
    </resources>
```

可以看到依赖中已经配置好了资源库，不用自己再去配置了。

再点进`<artifactId>spring-boot-dependencies</artifactId>`进行分析。

### spring-boot-dependencies

```xml
<groupId>org.springframework.boot</groupId>
<artifactId>spring-boot-dependencies</artifactId>
<version>2.3.12.RELEASE</version>
<packaging>pom</packaging>
<name>spring-boot-dependencies</name>

<properties>
    <activemq.version>5.15.15</activemq.version>
    <antlr2.version>2.7.7</antlr2.version>
    <appengine-sdk.version>1.9.89</appengine-sdk.version>
    <artemis.version>2.12.0</artemis.version>
    <aspectj.version>1.9.6</aspectj.version>
    <assertj.version>3.16.1</assertj.version>
    <atomikos.version>4.0.6</atomikos.version>
    <awaitility.version>4.0.3</awaitility.version>
    <bitronix.version>2.1.4</bitronix.version>
    <build-helper-maven-plugin.version>3.1.0</build-helper-maven-plugin.version>
    <byte-buddy.version>1.10.22</byte-buddy.version>
    
<dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>org.apache.activemq</groupId>
        <artifactId>activemq-amqp</artifactId>
        <version>${activemq.version}</version>
      </dependency>
      <dependency>
        <groupId>org.apache.activemq</groupId>
        <artifactId>activemq-blueprint</artifactId>
        <version>${activemq.version}</version>
      </dependency>
```

可以看到SpringBoot的父依赖已经通过`dependencyManagement`引入了一套依赖模板，所以我们在引入想要的组件时，只需直接引入，不需要指定版本。

以引入`nacos`的依赖为例

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    <version>2.2.7.RELEASE</version>
</dependency>
```

点击进入分析

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd" xmlns="http://maven.apache.org/POM/4.0.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-alibaba-starters</artifactId>
    <version>2.2.7.RELEASE</version>
  </parent>
  <groupId>com.alibaba.cloud</groupId>
  <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
  <version>2.2.7.RELEASE</version>
  <name>Spring Cloud Starter Alibaba Nacos Discovery</name>
  ......
  <dependencies>
    <dependency>
      <groupId>com.alibaba.cloud</groupId>
      <artifactId>spring-cloud-alibaba-commons</artifactId>
      <version>2.2.7.RELEASE</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-actuator</artifactId>
      <version>2.3.12.RELEASE</version>
      <scope>compile</scope>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-actuator-autoconfigure</artifactId>
      <version>2.3.12.RELEASE</version>
      <scope>compile</scope>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-configuration-processor</artifactId>
      <version>2.3.12.RELEASE</version>
      <scope>compile</scope>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot</artifactId>
      <version>2.3.12.RELEASE</version>
      <scope>compile</scope>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-autoconfigure</artifactId>
      <version>2.3.12.RELEASE</version>
      <scope>compile</scope>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter</artifactId>
      <version>2.3.12.RELEASE</version>
      <scope>compile</scope>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-webflux</artifactId>
      <version>2.3.12.RELEASE</version>
      <scope>compile</scope>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>com.alibaba.nacos</groupId>
      <artifactId>nacos-client</artifactId>
      <version>2.0.3</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>com.alibaba.spring</groupId>
      <artifactId>spring-context-support</artifactId>
      <version>1.0.10</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.cloud</groupId>
      <artifactId>spring-cloud-commons</artifactId>
      <version>2.2.9.RELEASE</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.cloud</groupId>
      <artifactId>spring-cloud-context</artifactId>
      <version>2.2.9.RELEASE</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.cloud</groupId>
      <artifactId>spring-cloud-starter-netflix-ribbon</artifactId>
      <version>2.2.9.RELEASE</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.cloud</groupId>
      <artifactId>spring-cloud-config-client</artifactId>
      <version>2.2.8.RELEASE</version>
      <scope>compile</scope>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.cloud</groupId>
      <artifactId>spring-cloud-config-server</artifactId>
      <version>2.2.8.RELEASE</version>
      <scope>compile</scope>
      <optional>true</optional>
    </dependency>
  </dependencies>
</project>
```

能看到一个`spring-cloud-starter-alibaba-nacos-discovery`依赖中包含了`spring-cloud-alibaba-commons`、`spring-boot`、`spring-boot-autoconfigure`、`nacos-client`、`spring-cloud-commons`、`spring-cloud-context`、`spring-cloud-starter-netflix-ribbon`等依赖

## 流程

### this.deferredImportSelectorHandler.process()

回到文章[springboot注解Configuration、Bean、Component、ComponentScan、Import、ImportResource的执行原理_1](/tech-sharing/spring-source/springboot-part-1)中的`this.deferredImportSelectorHandler.process()`

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

进入`this.deferredImportSelectorHandler.process()`
### ConfigurationClassParser.DeferredImportSelectorHandler.process()

```java
public void process() {
    List<DeferredImportSelectorHolder> deferredImports = this.deferredImportSelectors;
    this.deferredImportSelectors = null;
    try {
        if (deferredImports != null) {
            DeferredImportSelectorGroupingHandler handler = new DeferredImportSelectorGroupingHandler();
            deferredImports.sort(DEFERRED_IMPORT_COMPARATOR);
            deferredImports.forEach(handler::register);
            handler.processGroupImports();
        }
    }
    finally {
        this.deferredImportSelectors = new ArrayList<>();
    }
}
```

### ConfigurationClassParser.processGroupImports()

```java
public void processGroupImports() {
    for (DeferredImportSelectorGrouping grouping : this.groupings.values()) {
        Predicate<String> exclusionFilter = grouping.getCandidateFilter();
        grouping.getImports().forEach(entry -> {
            ConfigurationClass configurationClass = this.configurationClasses.get(entry.getMetadata());
            try {
                processImports(configurationClass, asSourceClass(configurationClass, exclusionFilter),
                        Collections.singleton(asSourceClass(entry.getImportClassName(), exclusionFilter)),
                        exclusionFilter, false);
            }
            catch (BeanDefinitionStoreException ex) {
                throw ex;
            }
            catch (Throwable ex) {
                throw new BeanDefinitionStoreException(
                        "Failed to process import candidates for configuration class [" +
                                configurationClass.getMetadata().getClassName() + "]", ex);
            }
        });
    }
}
```

### ConfigurationClassParser.getImports()

```java
public Iterable<Group.Entry> getImports() {
	for (DeferredImportSelectorHolder deferredImport : this.deferredImports) {
		this.group.process(deferredImport.getConfigurationClass().getMetadata(),
				deferredImport.getImportSelector());
	}
	return this.group.selectImports();
}
```

### AutoConfigurationImportSelector.AutoConfigurationGroup.process(AnnotationMetadata annotationMetadata, DeferredImportSelector deferredImportSelector)

```java
public void process(AnnotationMetadata annotationMetadata, DeferredImportSelector deferredImportSelector) {
    Assert.state(deferredImportSelector instanceof AutoConfigurationImportSelector,
            () -> String.format("Only %s implementations are supported, got %s",
                    AutoConfigurationImportSelector.class.getSimpleName(),
                    deferredImportSelector.getClass().getName()));
    //获得配置类集合                
    AutoConfigurationEntry autoConfigurationEntry = ((AutoConfigurationImportSelector) deferredImportSelector)
            .getAutoConfigurationEntry(annotationMetadata);
    this.autoConfigurationEntries.add(autoConfigurationEntry);
    for (String importClassName : autoConfigurationEntry.getConfigurations()) {
        this.entries.putIfAbsent(importClassName, annotationMetadata);
    }
}
```

## AutoConfigurationImportSelector介绍

### 从启动类注解入手@SpringBootApplication

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan(excludeFilters = { @Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class),
		@Filter(type = FilterType.CUSTOM, classes = AutoConfigurationExcludeFilter.class) })
public @interface SpringBootApplication {...}
```

能发现它是一个组合注解，其中最重要的两个注解是`@SpringBootConfiguration`和`@EnableAutoConfiguration`

### SpringBootConfiguration

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Configuration
@Indexed
public @interface SpringBootConfiguration {...}
```

能看到包含`@Configuration`这个注解，他就代表自己是一个Spring的配置类，所以也可以说`@SpringBootApplication`就是`@Configuration`

### @EnableAutoConfiguration

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@AutoConfigurationPackage
@Import(AutoConfigurationImportSelector.class)
public @interface EnableAutoConfiguration {...}
```

进入`AutoConfigurationImportSelector`

### AutoConfigurationImportSelector

```java
public class AutoConfigurationImportSelector implements DeferredImportSelector, BeanClassLoaderAware,
		ResourceLoaderAware, BeanFactoryAware, EnvironmentAware, Ordered {

	private static final AutoConfigurationEntry EMPTY_ENTRY = new AutoConfigurationEntry();

	private static final String[] NO_IMPORTS = {};

	private static final Log logger = LogFactory.getLog(AutoConfigurationImportSelector.class);

	private static final String PROPERTY_NAME_AUTOCONFIGURE_EXCLUDE = "spring.autoconfigure.exclude";

	private ConfigurableListableBeanFactory beanFactory;

	private Environment environment;

	private ClassLoader beanClassLoader;

	private ResourceLoader resourceLoader;

	private ConfigurationClassFilter configurationClassFilter;


	protected AutoConfigurationEntry getAutoConfigurationEntry(AnnotationMetadata annotationMetadata) {
		if (!isEnabled(annotationMetadata)) {
			return EMPTY_ENTRY;
		}
		AnnotationAttributes attributes = getAttributes(annotationMetadata);
		//获取所有的候选配置类
		List<String> configurations = getCandidateConfigurations(annotationMetadata, attributes);
		configurations = removeDuplicates(configurations);
		Set<String> exclusions = getExclusions(annotationMetadata, attributes);
		checkExcludedClasses(configurations, exclusions);
		configurations.removeAll(exclusions);
		configurations = getConfigurationClassFilter().filter(configurations);
		fireAutoConfigurationImportEvents(configurations, exclusions);
		return new AutoConfigurationEntry(configurations, exclusions);
	}

	@Override
	public Class<? extends Group> getImportGroup() {
		return AutoConfigurationGroup.class;
	}

	//获取所有的候选配置类
	protected List<String> getCandidateConfigurations(AnnotationMetadata metadata, AnnotationAttributes attributes) {
		List<String> configurations = SpringFactoriesLoader.loadFactoryNames(getSpringFactoriesLoaderFactoryClass(),
				getBeanClassLoader());
		Assert.notEmpty(configurations, "No auto configuration classes found in META-INF/spring.factories. If you "
				+ "are using a custom packaging, make sure that file is correct.");
		return configurations;
	}

	protected Class<?> getSpringFactoriesLoaderFactoryClass() {
		return EnableAutoConfiguration.class;
	}


	private static class AutoConfigurationGroup
			implements DeferredImportSelector.Group, BeanClassLoaderAware, BeanFactoryAware, ResourceLoaderAware {

		private final Map<String, AnnotationMetadata> entries = new LinkedHashMap<>();

		private final List<AutoConfigurationEntry> autoConfigurationEntries = new ArrayList<>();

		private ClassLoader beanClassLoader;

		private BeanFactory beanFactory;

		private ResourceLoader resourceLoader;

		private AutoConfigurationMetadata autoConfigurationMetadata;

		@Override
		public void setBeanClassLoader(ClassLoader classLoader) {
			this.beanClassLoader = classLoader;
		}

		@Override
		public void setBeanFactory(BeanFactory beanFactory) {
			this.beanFactory = beanFactory;
		}

		@Override
		public void setResourceLoader(ResourceLoader resourceLoader) {
			this.resourceLoader = resourceLoader;
		}

		@Override
		public void process(AnnotationMetadata annotationMetadata, DeferredImportSelector deferredImportSelector) {
			Assert.state(deferredImportSelector instanceof AutoConfigurationImportSelector,
					() -> String.format("Only %s implementations are supported, got %s",
							AutoConfigurationImportSelector.class.getSimpleName(),
							deferredImportSelector.getClass().getName()));
			AutoConfigurationEntry autoConfigurationEntry = ((AutoConfigurationImportSelector) deferredImportSelector)
					.getAutoConfigurationEntry(annotationMetadata);
			this.autoConfigurationEntries.add(autoConfigurationEntry);
			for (String importClassName : autoConfigurationEntry.getConfigurations()) {
				this.entries.putIfAbsent(importClassName, annotationMetadata);
			}
		}

		@Override
		public Iterable<Entry> selectImports() {
			if (this.autoConfigurationEntries.isEmpty()) {
				return Collections.emptyList();
			}
			Set<String> allExclusions = this.autoConfigurationEntries.stream()
					.map(AutoConfigurationEntry::getExclusions).flatMap(Collection::stream).collect(Collectors.toSet());
			Set<String> processedConfigurations = this.autoConfigurationEntries.stream()
					.map(AutoConfigurationEntry::getConfigurations).flatMap(Collection::stream)
					.collect(Collectors.toCollection(LinkedHashSet::new));
			processedConfigurations.removeAll(allExclusions);

			return sortAutoConfigurations(processedConfigurations, getAutoConfigurationMetadata()).stream()
					.map((importClassName) -> new Entry(this.entries.get(importClassName), importClassName))
					.collect(Collectors.toList());
		}

		private AutoConfigurationMetadata getAutoConfigurationMetadata() {
			if (this.autoConfigurationMetadata == null) {
				this.autoConfigurationMetadata = AutoConfigurationMetadataLoader.loadMetadata(this.beanClassLoader);
			}
			return this.autoConfigurationMetadata;
		}

		private List<String> sortAutoConfigurations(Set<String> configurations,
				AutoConfigurationMetadata autoConfigurationMetadata) {
			return new AutoConfigurationSorter(getMetadataReaderFactory(), autoConfigurationMetadata)
					.getInPriorityOrder(configurations);
		}

		private MetadataReaderFactory getMetadataReaderFactory() {
			try {
				return this.beanFactory.getBean(SharedMetadataReaderFactoryContextInitializer.BEAN_NAME,
						MetadataReaderFactory.class);
			}
			catch (NoSuchBeanDefinitionException ex) {
				return new CachingMetadataReaderFactory(this.resourceLoader);
			}
		}

	}

	/**
  	* 省略
  	*/

}
```

1. 当springboot启动后会进入`AutoConfigurationImportSelector.AutoConfigurationGroup#process`方法
2. 接着会执行`AutoConfigurationImportSelector#getAutoConfigurationEntry`
3. 在此方法中会执行`getCandidateConfigurations(annotationMetadata, attributes)`
4. 在`SpringFactoriesLoader.loadFactoryNames(EnableAutoConfiguration.class)`中会去加载`META-INF/spring.factories`文件，key为`org.springframework.boot.autoconfigure.EnableAutoConfiguration`，value为要加载的配置类。我们进入`spring-cloud-starter-alibaba-nacos-discovery`源码包的结构

![](/img/technologySharing/spring/spring-cloud-starter-alibaba-nacos-discovery源码包的结构.png)
能看到nacos的配置类都在此。

回到**ConfigurationClassParser.getImports()**

```java
public Iterable<Group.Entry> getImports() {
	for (DeferredImportSelectorHolder deferredImport : this.deferredImports) {
		this.group.process(deferredImport.getConfigurationClass().getMetadata(),
				deferredImport.getImportSelector());
	}
	return this.group.selectImports();
}
```

进入`this.group.selectImports()`
### this.group.selectImports()

```java
public Iterable<Entry> selectImports() {
    if (this.autoConfigurationEntries.isEmpty()) {
        return Collections.emptyList();
    }
    Set<String> allExclusions = this.autoConfigurationEntries.stream()
            .map(AutoConfigurationEntry::getExclusions).flatMap(Collection::stream).collect(Collectors.toSet());
    Set<String> processedConfigurations = this.autoConfigurationEntries.stream()
            .map(AutoConfigurationEntry::getConfigurations).flatMap(Collection::stream)
            .collect(Collectors.toCollection(LinkedHashSet::new));
    processedConfigurations.removeAll(allExclusions);
	//进行排序
    return sortAutoConfigurations(processedConfigurations, getAutoConfigurationMetadata()).stream()
            .map((importClassName) -> new Entry(this.entries.get(importClassName), importClassName))
            .collect(Collectors.toList());
}
```

回到`ConfigurationClassParser.processGroupImports()`中，从spring.factories获取配置类集合后，循环进行添加到spring容器中
### ConfigurationClassParser.processGroupImports()

```java
public void processGroupImports() {
    for (DeferredImportSelectorGrouping grouping : this.groupings.values()) {
        Predicate<String> exclusionFilter = grouping.getCandidateFilter();
        grouping.getImports().forEach(entry -> {
            ConfigurationClass configurationClass = this.configurationClasses.get(entry.getMetadata());
            try {
            	//执行grouping.getImports()从spring.factories获取配置类集合后，
            	//循环执行processImports进行添加到spring容器中
                processImports(configurationClass, asSourceClass(configurationClass, exclusionFilter),
                        Collections.singleton(asSourceClass(entry.getImportClassName(), exclusionFilter)),
                        exclusionFilter, false);
            }
            catch (BeanDefinitionStoreException ex) {
                throw ex;
            }
            catch (Throwable ex) {
                throw new BeanDefinitionStoreException(
                        "Failed to process import candidates for configuration class [" +
                                configurationClass.getMetadata().getClassName() + "]", ex);
            }
        });
    }
}
```

### ConfigurationClassParser.processImports

```java
private void processImports(ConfigurationClass configClass, SourceClass currentSourceClass,
        Collection<SourceClass> importCandidates, Predicate<String> exclusionFilter,
        boolean checkForCircularImports) {

        //...
        processConfigurationClass(candidate.asConfigClass(configClass), exclusionFilter);
        //...
}
```

### ConfigurationClassParser.processConfigurationClass

```java
protected void processConfigurationClass(ConfigurationClass configClass, Predicate<String> filter) throws IOException {
    //...
    this.configurationClasses.put(configClass, configClass);
}
```

到这里，配置类集合一个一个的添加到了`configurationClasses`集合中。

回到文章[springboot注解Configuration、Bean、Component、ComponentScan、Import、ImportResource的执行原理_1](/tech-sharing/spring-source/springboot-part-1)中的`ConfigurationClassPostProcessor.processConfigBeanDefinitions(registry)`

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

    //...
    
    // 解析带有@Controller、@Import、@ImportResource、@ComponentScan、@ComponentScans、@Bean的BeanDefinition
    parser.parse(candidates);
    // 将解析完的Configuration配置类进行校验，1、配置类不能是final，2、@Bean修饰的方法必须可以重写以支持CGLIB
    parser.validate();

    // parser.parse(candidates)执行完后将这类配置类元数据放进了configurationClasses集合中，
    // parser.getConfigurationClasses()从configurationClasses集合获取这些元数据
    Set<ConfigurationClass> configClasses = new LinkedHashSet<>(parser.getConfigurationClasses());
    // 清除掉已经解析处理过的配置类
    configClasses.removeAll(alreadyParsed);

    // ...
    // 核心方法，将完全填充好的ConfigurationClass实例转化为BeanDefinition注册入IOC容器
    this.reader.loadBeanDefinitions(configClasses);
    // 添加到已经处理的集合中
    alreadyParsed.addAll(configClasses);
}
```

可以看到`this.reader.loadBeanDefinitions(configClasses)`将获取到的这些配置类元数据集合放进了容器中的的`BeanDefinitions`中。

后续会在`AbstractApplicationContext.refresh()`刷新方法中的`finishBeanFactoryInitialization(beanFactory)`进行真正的加载生成bean
