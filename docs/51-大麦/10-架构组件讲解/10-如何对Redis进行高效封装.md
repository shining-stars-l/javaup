---
slug: /damai/architecture-components/redis-wrapper
title: "如何对Redis进行高效封装：Redis封装、缓存Key约定、统一API、序列化处理详解"
sidebar_label: "如何对Redis进行高效封装"
pagination_label: "如何对Redis进行高效封装"
description: "围绕《如何对Redis进行高效封装》，重点讲解Redis封装、缓存Key约定、统一API、序列化处理与完整使用示例等技术实现与工程落地细节。内容进一步围绕RedisTemplate封装、缓存读写操作、键值规范管理等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目实践…"
keywords: ["Redis封装", "缓存Key约定", "统一API", "序列化处理", "RedisTemplate封装", "完整使用示例", "缓存读写操作", "键值规范管理"]
---

# 如何对Redis进行高效封装

import VipInline from '@site/src/components/VipInline';

## 前言
现在的项目基本都会使用 Redis，在 SpringBoot 中使用提供的 `RedisTemplate` 或者 `StringRedisTemplate`，但使用感觉还是有些问题，比如在使用中还是需要自己来做对象的转换工作，还有对key键的管理，当键逐渐多了后是非常的麻烦，这有一个，那里有一个，当后续修改时候，要一个个去搜索，效率非常的低下，如果想找这个缓存是谁来设计的，还需要去看代码的提交者，更是麻烦。



针对上述的痛点能不能解决下呢？比如，把对象的转换工作也做好，使用是只要指定 **对象类型** 就可以了，以及将 **key** 做好统一的管理，并要求加上 **键的含义、键值的含义、作者** 等信息。



**对于key的管理也要注意，必须要求用户在指定的类中存放，如果不用代码强制约束的话，总会有人偷懒的**。



所以为了解决这些问题，设计出对redis操作的封装组件，使用起来更加的方便和管理

## 特点
- 针对 `Springboot` 的 `StringRedisTemplate`,做了再次封装，使用了 `json` 格式存放。
- 对`键值对的操作`、`String`、`Hash`、`Set`、`ZSet`、`List`提供了封装支持。
- 在使用过程中，存放直接存放对象类型即可，拿取只需指定 `class` 类型。
- 对`key`进行了统一的管理约定，用户不能随意在代码中指定 `key` 值。
- 在使用中以接口的形式对外提供api操作，目前实现只有 `redis` 一种。



### 使用
直接使用Spring的注入即可

```java
@Autowired
private RedisCache redisCache;
```



### key的约定说明

<VipInline />