---
slug: /damai/tech-highlights/springboot-event
title: "SpringBoot 事件机制讲解：Springboot事件机制、@PostConstruct详解"
sidebar_label: "SpringBoot 事件机制讲解"
pagination_label: "SpringBoot 事件机制讲解"
description: "围绕《Springboot事件机制讲解》，重点讲解@PostConstruct执行机制、ContextRefreshedEvent、ApplicationStartedEvent、SpringApplication#run 与 AbstractApplicationContext#refresh 的事件发布链路等技术…"
keywords: ["Springboot事件机制", "@PostConstruct", "ContextRefreshedEvent", "ApplicationStartedEvent", "SpringApplication#run", "AbstractApplicationContext#refresh", "EventPublishingRunListener#started", "事件发布链路"]
---

# SpringBoot 事件机制讲解

import VipInline from '@site/src/components/VipInline';

## @PostConstruct执行机制


### 进入SpringApplication#run(java.lang.String...)


```java
public ConfigurableApplicationContext run(String... args) {
	StopWatch stopWatch = new StopWatch();
	stopWatch.start();
	ConfigurableApplicationContext context = null;
	configureHeadlessProperty();
	SpringApplicationRunListeners listeners = getRunListeners(args);
	listeners.starting();
	try {
		ApplicationArguments applicationArguments = new DefaultApplicationArguments(args);
		ConfigurableEnvironment environment = prepareEnvironment(listeners, applicationArguments);
		configureIgnoreBeanInfo(environment);
		Banner printedBanner = printBanner(environment);
		context = createApplicationContext();
		prepareContext(context, environment, listeners, applicationArguments, printedBanner);
		//这里进入就会执行经典的refresh方法进行容器创建工作
		refreshContext(context);
		afterRefresh(context, applicationArguments);
		stopWatch.stop();
		if (this.logStartupInfo) {
			new StartupInfoLogger(this.mainApplicationClass).logStarted(getApplicationLog(), stopWatch);
		}
		listeners.started(context);
		callRunners(context, applicationArguments);
	}
	catch (Throwable ex) {
		handleRunFailure(context, ex, listeners);
		throw new IllegalStateException(ex);
	}

	try {
		listeners.running(context);
	}
	catch (Throwable ex) {
		handleRunFailure(context, ex, null);
		throw new IllegalStateException(ex);
	}
	return context;
}
```



### 进入AbstractApplicationContext#refresh


<VipInline />