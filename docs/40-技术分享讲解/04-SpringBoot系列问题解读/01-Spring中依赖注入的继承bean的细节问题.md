---
slug: /tech-sharing/springboot-issues/spring-bean
---


# Spring中依赖注入的继承bean的细节问题

有时我们会对一种类型的bean进行继承，在Spring生成bean的时候，返回类型有时是子类类型，有时会父类类型。那么到底在什么情况下用哪种类型呢？肯定有不少人会忽略这点，本篇文章就是把这个细节讲清楚

## 案例

父类Base

```java
public class Base {
    
    public int i;
    
    public Base(){};
    
    public Base(int i){
        this.i = i;
    }
}
```

子类TestBase继承Base

```java
public class TestBase extends Base{
}
```

test中依赖了Base类型的对象

```java
public class Test {
    
    @Autowired
    public Base base;
    
    @PostConstruct
    public void init(){
        System.out.println(base.i);
    }
}
```

TestConfig配置类

```java
public class TestConfig {
    
    @Bean
    public Base base1(){
        System.out.println("base1");
        return new Base(1);
    }
    
    @Bean
    public TestBase testBase(){
        System.out.println("testBase");
        return new TestBase();
    }
    
    @Bean
    public Test test(){
        return new Test();
    }
}
```

重点来了，`TestConfig`中生成了`Base`类型的对象base1，和`TestBase`类型的对象testBase，`TestBase`继承了`Base`，
`Test`对象依赖注入了`Base`类型的对象base

## 容器启动结果

```
Description:

Field base in com.example.test.Test required a single bean, but 2 were found:
	- base1: defined by method 'base1' in class path resource [com/example/test/TestConfig.class]
	- testBase: defined by method 'testBase' in class path resource [com/example/test/TestConfig.class]


Action:

Consider marking one of the beans as @Primary, updating the consumer to accept multiple beans, or using @Qualifier to identify the bean that should be consumed
```

启动错误，提示要注入的base发现了两个bean，这说明虽然注入对象testBase类型是`TestBase`,但因为继承了`Base`关系，所以还当对象被依赖`Base`类型时，testBase对象也算进`Base`类型中。也就是说testBase的对象生成bean后，在容器中有着`TestBase`和`Base`两种类型。

这是极小的细节，这部分源码本人没有看，其实也没必要，记住这个特点就可以了
