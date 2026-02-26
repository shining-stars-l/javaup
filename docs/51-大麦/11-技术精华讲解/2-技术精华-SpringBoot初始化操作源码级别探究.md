---
slug: /damai/tech-highlights/springboot-init-source
description: "围绕《Springboot初始化操作源码级别探究》，重点讲解AbstractApplicationContext.refresh()、invokeBeanFactoryPostProcessors、BeanFactoryPostProcessor 与容器刷新流程等技术实现与源码细节。"
keywords: ["Springboot初始化", "AbstractApplicationContext.refresh()", "invokeBeanFactoryPostProcessors", "BeanFactoryPostProcessor", "ApplicationContext启动", "初始化执行顺序", "启动源码分析", "容器刷新机制"]
---

# SpringBoot 初始化操作源码级别探究

import VipInline from '@site/src/components/VipInline';

## 分析的注解
SpringBoot 注解：Configuration、Bean、Component、ComponentScan、Import、ImportResource

## 从启动类入手
```java
SpringApplication.run(OrderApplication.class, args)
```


**SpringApplication.run(String... args)**



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

**SpringApplication.refreshContext(context)**

<VipInline />