---
slug: /link-flow/tech-highlights/spring-post-processors
---

import PaidCTA from '@site/src/components/PaidCTA';

# Spring的后置处理器是什么

Spring的后置处理器可能有很多人没有听说过，但是它其实是一个非常非常重要的知识点，例如AOP中的代理对象就是在后置处理器中来执行生成的。

它可以在创建对象后，对对象再做一些额外处理的工作，本章节详细后置处理器的用法，其实也非常的简单。

后置处理器其实就是实现一个接口 BeanPostProcessor
```java
@Component
public class TestBeanPostProcessor implements BeanPostProcessor {
    
    @Override
    public Object postProcessBeforeInitialization(final Object bean, final String beanName) throws BeansException {
        if (bean instanceof Test) {
            System.out.println("后置处理器执行before方法 test对象:"+bean);
        }
        return bean;
    }
    
    @Override
    public Object postProcessBeforeInitialization(final Object bean, final String beanName) {
        if (bean instanceof Test) {
            Test test = (Test) bean;
            test.setName("k");
            System.out.println("后置处理器执行after方法 test对象:"+test);
            return test;
        }
        return bean;
    }
}
```
有两个方法 postProcessBeforeInitialization 和 postProcessBeforeInitialization 可以通过这两个方法来做一些额外的处理，举一个来演示下

## Test对象
有一个Test类，类中有个成员属性name，提供了一个无参构造方法，通过无参构造方法创建后，name属性肯定是空的
```java
@Component
public class Test {
    
    private String name;
    
    public Test() {
        System.out.println("Test构造方法");
    }
    
    @Override
    public String toString() {
        return "Test{" + "name='" + name + '\'' + '}';
    }
}
```
在这里就要利用后置处理器将创建出的test，来填充name属性

## 后置处理器实现
设计一个后置处理器 **TestBeanPostProcessor**
```java
@Component
public class TestBeanPostProcessor implements BeanPostProcessor {
    
    @Override
    public Object postProcessBeforeInitialization(final Object bean, final String beanName) throws BeansException {
        if (bean instanceof Test) {
            System.out.println("后置处理器执行before方法 test对象:"+bean);
        }
        return bean;
    }
    
    @Override
    public Object postProcessAfterInitialization(final Object bean, final String beanName) {
        if (bean instanceof Test) {
            Test test = (Test) bean;
            test.setName("k");
            System.out.println("后置处理器执行after方法 test对象:"+test);
            return test;
        }
        return bean;
    }
}
```

<PaidCTA />