---
slug: /link-flow/tech-highlights/conditionalonmissingbean
---

import PaidCTA from '@site/src/components/PaidCTA';

# ConditionalOnMissingBean的作用

## 一、背景介绍
在 Spring Boot 的自动配置机制中，通常需要根据条件决定是否创建某个 Bean。**@ConditionalOnMissingBean** 就是为此目的而设计的条件注解。其主要作用是：

+ **条件装配**：只有当 Spring 容器中不存在指定类型或名称的 Bean 时，才会创建被注解的方法或类中的 Bean。
+ **默认配置与用户覆盖**：自动配置中常常提供默认的 Bean 定义，但允许用户自行定义并覆盖默认配置。**@ConditionalOnMissingBean** 就能检测到用户是否已经定义了相关 Bean，如果已定义，则不会再加载默认配置。

通过这种机制，Spring Boot 能够在保证提供合理默认配置的同时，又能让开发者轻松地进行个性化定制。

---

## 二、工作原理
**@ConditionalOnMissingBean** 实际上是一个组合条件注解，它背后依赖于 Spring 的条件注解机制（Conditional）。当 Spring 容器在启动时扫描配置类时，会判断是否满足条件：

+ **检查 Bean 是否存在**：根据指定的类型（`value` 或 `type` 属性）或者名称（`name` 属性）查找容器中是否已存在相关 Bean。
+ **判断条件**：如果不存在，则条件满足，当前配置类或 Bean 定义将被加载；如果存在，则跳过当前 Bean 的创建。

这种设计让 Spring Boot 的自动配置能够非常灵活，既能提供开箱即用的默认行为，又能方便用户根据实际需要进行自定义。

---

## 三、使用场景及举例说明
### 1. 自动配置类中的默认 Bean
在很多 Spring Boot Starter 中，会包含自动配置类。假设我们有一个服务接口 `MyService`，框架提供了一个默认实现，但允许用户通过自定义 Bean 来覆盖默认行为：

```java
@Configuration
public class MyServiceAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(MyService.class)
    public MyService defaultMyService() {
        return new DefaultMyServiceImpl();
    }
}
```

<PaidCTA />