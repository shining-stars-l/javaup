---
slug: /link-flow/design/web-service-design
---

import PaidCTA from '@site/src/components/PaidCTA';

# Web服务的详细设计

在服务的过滤调用时，服务可以分为两类：Gateway服务和Web服务。Gateway服务是业务网关，Web服务就是业务为主的服务，比如用户服务、订单服务等。
而Gateway服务和Web服务最大的区别就是 request 和 response 的设计，就拿 request 来说：

- Gateway服务中的请求头操作是 ServerHttpRequest 类型

- 普通Web服务中的请求头操作是 HttpServletRequest 类型

这两种是互不兼容的，而这两种服务都有从请求头获取参数的操作，为了将这两种操作进行统一适配，link-flow 也做了适配，关于此部分的详细讲解，请跳转到 项目设计讲解-请求上下文的操作设计 章节。

如果要在Web服务中实现 link-flow 的功能，那么就要引入以下模块依赖：
```xml
<dependency>
    <groupId>org.javaup</groupId>
    <artifactId>link-flow-work-service-starter</artifactId>
    <version>${revision}</version>
</dependency>
```
而本文将详细讲解web服务功能的设计

# ServiceWorkContextAutoConfiguration

首先看配置类，知道都加载了哪些
```java
@AutoConfigureBefore(LoadBalancerClientConfiguration.class)
public class ServiceWorkContextAutoConfiguration {
    
    /**
     * 请求上下文的web服务实现
     * */
    @Bean
    public ServiceContextConfigOperation serviceStrategyContextHolder(MetaDataOperation metaDataOperation) {
        return new ServiceContextConfigOperation(metaDataOperation);
    }
    
    @Bean
    public LinkFlowWrapCallable linkFlowServiceWrapCallable(){
        return new LinkFlowServiceWrapCallable();
    }
    
    /**
     * request监听
     * */
    @Bean
    public RequestContextListener requestContextListener(){
        return new RequestContextListener();
    }
    /**
     * request过滤器
     * */
    @Bean
    public OncePerRequestFilter requestParamContextFilter(){
        return new RequestParamContextFilter();
    }
}
```


<PaidCTA />