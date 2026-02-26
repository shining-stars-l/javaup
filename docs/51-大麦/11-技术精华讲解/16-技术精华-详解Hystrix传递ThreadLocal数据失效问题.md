---
slug: /damai/tech-highlights/hystrix-threadlocal-loss
description: "围绕《详解Hystrix传递ThreadLocal数据失效问题》，重点讲解Hystrix线程隔离、ThreadLocal失效、concurrencyStrategy扩展、wrapCallable包装与SPI机制接入等技术实现与工程实践。"
keywords: ["Hystrix", "ThreadLocal失效", "concurrencyStrategy", "wrapCallable", "SPI机制", "线程隔离", "上下文传递", "Hystrix并发策略"]
---

# 详解Hystrix传递ThreadLocal数据失效问题

import VipInline from '@site/src/components/VipInline';

## 场景


在 SpringCloud 微服务体系下，从网关层开始要在 request 请求头放置一些重要参数，比如 traceId，并要求在 Feign 之间的调用时，也能够一直传递下去，由于实际项目使用中，都是 Feign 集成了 Hystrix 一起配合使用的，而 Hystrix 有两种模式，一种信号量，一种线程池，我们业务中需要使用线程池模式，而且hystrix也是推荐这种。



## 问题


使用线程池模式就会存在问题，因为 Tomcat 中的 HttpServletRequest 是会复用的，当请求从发送到结束后此 request 就会被回收，如果在此开启线程就会出现获取request中参数为null的问题，Hystrix 的线程池同样会遇到此问题。详细的request与线程池的关系查看这篇文章，分析的很全面

[千万不要把Request传递到异步线程里面！有坑！ - 掘金](https://juejin.cn/post/7121564878988378126)



## 思路


我们可以自定义线程池来解决，先从官网的github入手，有没有提供类似的方案 [hystrix官方wiki](https://github.com/Netflix/Hystrix/wiki/Plugins)

重点是`HystrixConcurrencyStrategy`的`getThreadPool()`和`wrapCallable()`，尤其是`wrapCallable()`正是我们想实现的功能，那么到底具体怎么使用呢。我们需要从源码来入手

<VipInline />