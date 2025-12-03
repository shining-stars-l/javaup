---
slug: /link-flow/tech-highlights/logging-mdc
---

import PaidCTA from '@site/src/components/PaidCTA';

# 日志中的MDC到底是什么

## 一、什么是 MDC？
**MDC（Mapped Diagnostic Context）** 是 log4j2 和 logback 等日志框架提供的一个功能，用于在日志中附加上下文信息。  
在多线程环境下，例如 Web 应用服务器中，不同的线程可能同时处理多个用户请求，直接输出的日志往往混在一起。利用 MDC，可以在每个线程中存放一些与请求相关的信息（如用户ID、会话ID、请求追踪号等），让每条日志记录自动带上这些上下文数据，从而便于后续定位问题和追踪日志流。

## 二、MDC 的工作原理
MDC 的实现主要依赖于 **ThreadLocal**（或 InheritableThreadLocal）机制，将一个 Map 与当前线程绑定。

+ **存储方式：** 每个线程都有一份独立的 MDC 数据，开发者可以调用 `MDC.put(key, value)` 方法将信息写入该 Map。
+ **数据读取：** 当日志框架输出日志时，通过在日志格式中使用特殊转换符（例如 `%X{key}`）自动从当前线程的 MDC 中获取相应的值。
+ **子线程传递：** 默认情况下，子线程不会继承父线程的 MDC 数据；如果需要传递，则需要使用 InheritableThreadLocal 或手动传递副本（例如通过 `MDC.getCopyOfContextMap()` 和 `MDC.setContextMap()`）来实现。

这种设计确保了在多线程并发执行时，各个线程之间的 MDC 数据不会互相干扰，但也带来了一定的管理责任，必须在请求结束后及时清除数据，避免数据残留或内存泄露。

## 三、MDC 在日志框架中的应用
### 1. MDC 的设置与获取
在 Log4j2 中，我们可以使用 `org.apache.log4j.MDC` 类来操作 MDC。常用的方法包括：

+ `MDC.put(String key, Object value)`：将一个键值对放入当前线程的 MDC 中。
+ `MDC.get(String key)`：获取当前线程中指定 key 对应的值。
+ `MDC.remove(String key)`：移除某个键值对。
+ `MDC.clear()`：清空当前线程的所有 MDC 数据。

<PaidCTA />