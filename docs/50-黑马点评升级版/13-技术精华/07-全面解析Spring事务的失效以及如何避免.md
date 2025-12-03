---
slug: /hmdp-plus/tech-essentials/spring-transaction-failure
---
# 全面解析Spring事务的失效以及如何避免

:::info plus 版本专属
此章节是黑马点评 Plus 版本中专有的内容，而在整套文档中将普通版本和 Plus 版本都融合在了一起，让大家更方便的学习。
:::

在使用Spring框架进行企业级应用开发时，事务管理是保证数据一致性和系统稳定性的关键。Spring通过提供声明式事务管理，使得开发者可以通过简单的注解（如`@Transactional`）来控制事务的边界，极大地简化了事务管理的复杂性。

然而，在实际开发中，事务注解失效的问题时有发生，这不仅增加了系统的复杂度，也给应用的稳定性和数据的一致性带来了严重的风险。理解事务注解失效的原因及其危害，对于开发高质量、可靠的Spring应用至关重要。

## 什么会发生事务失效？
Spring的`@Transactional`注解是实现声明式事务管理的强大工具，但在某些情况下，开发者可能会遇到事务注解失效的问题，导致预期中的事务管理机制不起作用。理解为什么会发生事务注解失效是避免这一问题的关键。以下是事务注解失效的一些常见原因：

### 1. 方法访问级别不当
Spring的事务管理默认要求事务方法必须是public。如果你将一个使用`@Transactional`注解的方法设置为private、protected或是package-private，事务代理将无法正常工作，导致事务注解失效。

### 2. **事务方法在同一个类中调用**
Spring事务管理是基于代理的。当一个事务方法直接从同一个类的另一个方法内部调用时，由于代理是基于方法调用的外部拦截，这种"自调用"情况会导致事务失效。

### 3. **异常处理不当**
`@Transactional`注解默认只对运行时异常（`RuntimeException`及其子类）进行回滚。如果方法内部抛出的是检查型异常（`Exception`的直接子类），而不是运行时异常，且没有通过`@Transactional`的`rollbackFor`属性明确指定异常类型，事务将不会回滚，导致事务失效。

### 4. **事务管理器配置错误**
在Spring配置中，如果未正确配置事务管理器，或者在多事务管理器的情况下未指定正确的事务管理器，也可能导致`@Transactional`注解失效。

### 5. **数据源或持久化框架配置不正确**
正确配置数据源和持久化框架（如Hibernate或JPA）对于事务管理至关重要。如果数据源未配置为支持事务的数据源，或者持久化框架的配置不支持当前的事务管理方式，都可能导致事务失效。

### 6. **Spring Bean的错误创建或注入**
如果使用`@Transactional`注解的类没有被 Spring 容器管理，即该类的实例不是通过 Spring 创建的 Bean，而是通过`new`关键字直接实例化的，那么`@Transactional`注解将不会生效，因为 Spring 无法对这样的实例应用代理和事务管理。

### 7. **事务传播行为配置不当**
Spring 提供了多种事务传播行为（如REQUIRED、REQUIRES_NEW等），错误地选择事务传播行为可能导致事务不按预期执行。例如，如果一个事务方法被另一个已经在运行中的事务方法调用，并且事务传播行为设置为REQUIRES_NEW，那么原有事务将被挂起，新的事务开始执行。如果对这些行为的理解不正确，可能会导致事务管理复杂化，甚至失效。

以上列出的这几点都是常规的造成事务失效的问题，但除了这几点外，还有更加细节的使用也会导致事务失效，并且这些在平时开发时还会经常的遇到，下面就来详细的介绍这些细节问题

## 案例1
```java
@Transactional
public int insert(Test test) {
    testMapper.insert(test);
    insert2(test);
    return 1;
}

@Transactional(propagation = Propagation.NEVER)
public int insert2(Test test){
    return testMapper.insert(test);
}
```

`Propagation.NEVER`的作用是不在事务中执行，如果之前已经存在事务的话，那么直接抛出异常不再执行。上述代码中，我们期望的结果是执行到insert2方法时会抛出已经存在事务的错误，然而实际上是什么错也没有抛出，这两个insert操作都成功执行了

### 分析执行流程：
**其实事务也是利用了apo的原理**

1. 方法执行时，其实是执行了事务代理对象的方法
2. 事务代理对象的方法中首先会开启事务，获取数据源连接
3. 然后再执行代理对象中的`target`也就是普通对象的方法，这里就是执行真正我们的业务
4. 然后事务代理对象会判断上述执行过程中有没有出现异常，进而判断是`commit`还是`rollback`

#### 原理流程伪代码
```java
class TestServiceProxy extends TestService {

	TestService target;

	public void insert(){

		//1.开启事务
		//2.从数据源连接中获取一个连接connect
		
		//执行真正的业务
		//target就是真正的普通对象TestService
		target.insert

		//判断是否出现异常
		//commit或者rollback
	}
}
```

### 流程图
<img src="/img/hmdp-plus/技术精华/事务执行-1.png" alt="表关系" width="60%" />

在上述案例中，当调用到`insert(Test test)`这时调用到此方法的对象已经是真正的普通对象了。  
所以在执行`insert2(test);`时仍是普通对象，也就直接执行`insert2(test);`。所以不会出现抛出已存在事务的异常。

## 案例2
```java
@Override
public int insert(Test test) {
    testMapper.insert(test);
    insert2(test);
    return 1;
}

@Transactional
@Override
public int insert2(Test test) {
    Long id = test.getId();
    test.setId(id+10);
    int result = testMapper.insert(test);
    int i = 1 / 0;
    return result;
}
```

如果第一个案例理解的话，那么这么案例自然也很容易掌握了，执行结果是两个都不能回滚，原因也是一样，insert 方法没有事务，在方法内再执行 insert2 因为是 this 调用，同样也没有事务，所以出现异常后不会回滚

## 案例3
```java
@RequestMapping("/insert/{id}")
public Integer insert(@PathVariable Long id){
    Test test = new Test();
    test.setId(id);
    test.setColumn1("test1-" + id);
    test.setColumn2("test2-" + id);
    test.setColumn3("test3-" + id);
    test.setColumn4("test4-" + id);
    test.setColumn5("test5-" + id);
    test.setColumn6("test6-" + id);
    test.setNumber(id);
    int result = 0;
    try {
        result = testService.insert(test);
    }catch (Exception e) {
        log.error("出现异常",e);
    }
    return result;
}
```



```java
public int insert(Test test) {
    testMapper.insert(test);
    int i = 1 / 0;
    return 1;
}
```



大部分人会觉得service的方法已经被try住了，肯定不会被回滚了，然后事实并非如此，在这个案例中依旧能够被回滚

### 分析流程
<img src="/img/hmdp-plus/技术精华/事务执行-2.png" alt="表关系" width="60%" />

+ 从开启事务获得数据库的connect -> 执行添加操作 -> 根据是否出现异常进行提交或回滚这整个逻辑都在代理对象中的invokeWithinTransaction方法内的
+ try包裹的是service的方法，也就是说try包裹的范围是在invokeWithinTransaction方法的外面，异常依旧能被感知到还是能回滚的

