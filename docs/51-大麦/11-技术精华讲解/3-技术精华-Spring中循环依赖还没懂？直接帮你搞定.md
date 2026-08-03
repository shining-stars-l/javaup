---
slug: /damai/tech-highlights/spring-circular-dependency
title: "Spring中循环依赖还没懂？直接帮你搞定：Spring循环依赖、1级缓存、2级缓存详解"
sidebar_label: "Spring中循环依赖还没懂？直接帮你搞定"
pagination_label: "Spring中循环依赖还没懂？直接帮你搞定"
description: "围绕《Spring中循环依赖还没懂？直接帮你搞定》，重点讲解1级缓存、2级缓存、3级缓存、对象加载流程与三级缓存解决循环依赖机制等技术实现与源码细节。内容进一步围绕Spring循环依赖、a和b对象加载、缓存提前暴露、单例Bean创建、三级缓存机制等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。"
keywords: ["Spring循环依赖", "1级缓存", "2级缓存", "3级缓存", "a和b对象加载", "缓存提前暴露", "单例Bean创建", "三级缓存机制"]
---

# Spring中循环依赖还没懂？直接帮你搞定

import VipInline from '@site/src/components/VipInline';

## 场景


存在两个Bean对象A和B，每个对象中通过 `@Autowired` 注入对方的对象，也就是说两个对象相互引用。



```java
@Component
public class A {

    @Autowired
    private B b;

    public void testa(){
        System.out.println("执行a对象方法");
    }
}
```



```java
@Component
public class B {

    @Autowired
    private A a;

    public void testb(){
        System.out.println("执行b对象方法");
    }
}
```

## 缓存类型
### **1级缓存**


- 存放的是最终创建完的完整对象



```java
Map<String, Object> singletonObjects = new ConcurrentHashMap<>(256)
```



### **2级缓存**


- 如果不存在aop情况下，存放的是普通不完整对象，属性没有填充。
- 如果存在aop情况下，存放的是aop的代理对象，目标对象仍然是不完整的。

<VipInline />