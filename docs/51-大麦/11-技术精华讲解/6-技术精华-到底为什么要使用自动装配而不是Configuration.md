---
slug: /damai/tech-highlights/autoconfigure-vs-configuration
description: "围绕《到底为什么要使用自动装配而不是Configuration》，重点讲解自动装配机制、spring.factories、AutoConfigurationImportSelector、checkExcludedClasses 与条件装配等技术实现与源码细节。"
keywords: ["自动装配", "Configuration", "spring.factories", "AutoConfigurationImportSelector", "checkExcludedClasses", "条件装配", "配置类加载", "装配顺序"]
---

# 到底为什么要使用自动装配而不是Configuration

import VipInline from '@site/src/components/VipInline';

## 场景描述


- `SpringBoot` 自动装配的好处到底优势到底在哪里？直接用@Configuration注解加在配置类上，也一样的能加载Bean，就连复杂的 `@Conditional...` 这些的注解也都支持。  
- 但`SpringBoot` 为什么一定要这么费事，在服务启动后，还要通过扫描 `spring.factories` 文件中的 `EnableAutoConfiguration` 指定下的配置类，然后去加载这些配置类呢？  

看完本文后，会给你一个清晰的答案



## 解答


1. `@Configuration` 要求在自动配置扫描范围下才能生效，默认是 `SpringBoot` 启动类所在的包以及子包范围，也可以自己指定。然后我们要设计一个组件给其他部门使用，如果每个部门的包命令是不同的话，就没法确定 `@Configuration` 是不是在扫描范围内，所以就要利用自动装配来加载这个配置类。
2. 有时我们要实现复杂的需求，例如说，我们要在服务启动时排除掉这个配置类，例如：


<VipInline />