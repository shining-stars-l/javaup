---
slug: /framework/spring/auto-replace-configuration
sidebar_class_name: has-paid-badge
---

import PaidCTA from '@site/src/components/PaidCTA';

# 到底为什么要使用自动装配？而不是@Configuration

## 场景描述


`SpringBoot`自动装配的好处到底优势到底在哪里？直接用@Configuration注解加在配置类上，也一样的能加载Bean，就连复杂的`@Conditional...`这些的注解也都支持。  
但`Springboot`为什么一定要这么费事，在服务启动后，还要通过扫描`spring.factories`文件中的`EnableAutoConfiguration`指定下的配置类，然后去加载这些配置类呢？  
看完本文后，会给你一个清晰的答案



## 解答


1. `@Configuration`要求在自动配置扫描范围下才能生效，默认是`SpringBoot`启动类所在的包以及子包范围，也可以自己指定。然后我们要设计一个组件给其他部门使用，如果每个部门的包命令是不同的话，就没法确定`@Configuration`是不是在扫描范围内，所以就要利用自动装配来加载这个配置类。
2. 有时我们要实现复杂的需求，例如说，我们要在服务启动时排除掉这个配置类，例如：



```plain
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
  com.example.test.TestConfig2
```



```java
public class TestConfig2 {
    
    public TestConfig2(){
        System.out.println("====TestConfig2====");
    }
    
    @Bean
    public Base base(){
        System.out.println("====base2====");
        return new Base(2);
    }
}
```



```java
@SpringBootApplication(exclude = {TestConfig2.class})
public class ServerCaseApplication {

    public static void main(String[] args) {
        SpringApplication.run(ServerCaseApplication.class, args);
    }

}
```



这样利用springboot的自动装配是可以实现这个功能。那么直接用@Configuration试试呢？



```java
@Configuration
public class TestConfig2 {
    
    public TestConfig2(){
        System.out.println("====TestConfig2====");
    }
    
    @Bean
    public Base base(){
        System.out.println("====base2====");
        return new Base(2);
    }
}
```



```java
@SpringBootApplication(exclude = {TestConfig2.class})
public class ServerCaseApplication {

    public static void main(String[] args) {
        SpringApplication.run(ServerCaseApplication.class, args);
    }

}
```



结果：



```plain
java.lang.IllegalStateException: The following classes could not be excluded because they are not auto-configuration classes:
	- com.example.test.TestConfig2
```



可以看到服务启动后是报错的，大概意思是此配置类无法被排除，因为不是一个自动装配的配置类。

<PaidCTA />

