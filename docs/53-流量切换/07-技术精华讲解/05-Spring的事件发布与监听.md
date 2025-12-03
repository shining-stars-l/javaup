---
slug: /link-flow/tech-highlights/spring-events
---

# Spring的事件发布与监听

Spring的事件发布与监听机制其实就是设计模式中的观察者模式，这种机制在Spring以及第三方中间件中，例如：Naocs 都会经常用到，是一种用于服务启动完成后通知另一种机制行为的操作。本文讲解一下此机制的使用。

使用Spring的事件其实特别特别的简单！



# 事件定义
首先肯定要有个时间嘛，先创建一个 TestEvent 并继承 ApplicationEvent，只有继承了 ApplicationEvent，才可以表示这是一个事件

```java
public class TestEvent extends ApplicationEvent {
    
    public TestEvent(final Object source) {
        super(source);
    }
}
```

因为 ApplicationEven 是抽象类，有两个有参构造方法:

```java
public ApplicationEvent(Object source) {
    super(source);
    this.timestamp = System.currentTimeMillis();
}


public ApplicationEvent(Object source, Clock clock) {
    super(source);
    this.timestamp = clock.millis();
}
```

所以继承 ApplicationEven 后，只调用其中一个就可以，我就调用第一个了，source 参数的作用是当发布事件时，可以用这个参数当做数据，接收事件后可以用这个数据

## 事件接收者
自定了事件后，就要有接收者处理事件了，也特别的简单，只需要实现 ApplicationListener 接口，并被Spring管理即可

```java
@Component
public class TestEventHandler implements ApplicationListener<TestEvent> {
    @Override   
    public void onApplicationEvent(final TestEvent event) {
        System.out.println("TestEventHandler监听到事件：" + event);
    }
}
```

实现 ApplicationListener 接口后，会被要求实现 onApplicationEvent 方法，此方法就是用来处理事件的，这里我直接输出一行话了。

而 onApplicationEvent 方法中的参数就是刚才自定义的事件了

# 事件发送者
事件的发送需要使用Spring中的上下文，这里我就再写一个发送者

```java
@Component
public class TestEventPush implements ApplicationContextAware {
    
    private ApplicationContext applicationContext;
    
    @PostConstruct    
    public void push(){
        System.out.println("TestEventPush发布了事件");
        applicationContext.publishEvent(new TestEvent(this));
    }
    
    @Override
    public void setApplicationContext(final ApplicationContext applicationContext) throws BeansException {
        this.applicationContext = applicationContext;
    }
}
```

通过 ApplicationContextAware 先拿到Spring中的上下文容器 applicationContext。

当服务启动后，会执行 push 方法，就会通过 applicationContext 调用 publishEvent 来发送时间了，方法中的参数就是自定义的事件 TestEvent



直接看下结果

```latex
TestEventPush发布了事件
TestEventHandler监听到事件：com.example.listen.TestEvent[source=com.example.listen.TestEventPush@86d6bf7]
```

能看到 发送和监听都成功了，真的很简单
