---
slug: /tech-sharing/skywalking-source/skywalking-part-4
---

# Skywalking流程分析_4
## 插件的结构

之前我们介绍了插件的加载，接下来就是真正开始进行插件的执行了，首先要看下插件的结构是怎么样的，以阿里的`druid`数据源为例

![](/img/technologySharing/skywalkiing/阿里的druid数据源插件.png)

skywalking-plugin.def:

```
druid-1.x=org.apache.skywalking.apm.plugin.druid.v1.define.DruidPooledConnectionInstrumentation
druid-1.x=org.apache.skywalking.apm.plugin.druid.v1.define.DruidDataSourceInstrumentation
druid-1.x=org.apache.skywalking.apm.plugin.druid.v1.define.DruidDataSourceStatManagerInstrumentation
```

以第一个获取数据源连接的插件`DruidPooledConnectionInstrumentation`为例

### DruidPooledConnectionInstrumentation

```java
/**
 * 插件的定义,继承xxxPluginDefine,通常命名为xxxInstrumentation
 */
public class DruidDataSourceInstrumentation extends ClassInstanceMethodsEnhancePluginDefine {
    private static final String ENHANCE_CLASS = "com.alibaba.druid.pool.DruidDataSource";
    private static final String ENHANCE_METHOD = "getConnection";
    private static final String INTERCEPTOR_CLASS = "org.apache.skywalking.apm.plugin.druid.v1.PoolingGetConnectInterceptor";

    /**
     * 在哪个类进行字节码增强
     * */
    @Override
    protected ClassMatch enhanceClass() {
        return byName(ENHANCE_CLASS);
    }
    /**
     * 进行构造方法的拦截
     * */
    @Override
    public ConstructorInterceptPoint[] getConstructorsInterceptPoints() {
        return new ConstructorInterceptPoint[0];
    }

    /**
     * 进行实例方法的拦截
     * */
    @Override
    public InstanceMethodsInterceptPoint[] getInstanceMethodsInterceptPoints() {
        return new InstanceMethodsInterceptPoint[]{
                new InstanceMethodsInterceptPoint() {
                    //对getConnection无参方法记性增强
                    @Override
                    public ElementMatcher<MethodDescription> getMethodsMatcher() {
                        return named(ENHANCE_METHOD).and(takesNoArguments());
                    }
                    //增强逻辑在哪个具体的插件类中执行
                    @Override
                    public String getMethodsInterceptor() {
                        return INTERCEPTOR_CLASS;
                    }

                    @Override
                    public boolean isOverrideArgs() {
                        return false;
                    }
                },
                new InstanceMethodsInterceptPoint() {
                    //对getConnection有参方法记性增强
                    @Override
                    public ElementMatcher<MethodDescription> getMethodsMatcher() {
                        return named(ENHANCE_METHOD).and(takesArguments(String.class, String.class));
                    }
                    //增强逻辑在哪个具体的插件类中执行
                    @Override
                    public String getMethodsInterceptor() {
                        return INTERCEPTOR_CLASS;
                    }
                    //在增强时是否要对原方法的入参进行改变
                    @Override
                    public boolean isOverrideArgs() {
                        return false;
                    }
                }
        };
    }

    @Override
    public StaticMethodsInterceptPoint[] getStaticMethodsInterceptPoints() {
        return new StaticMethodsInterceptPoint[0];
    }

}
```

### ClassInstanceMethodsEnhancePluginDefine

如果对构造方法/实例方法增强，则需继承此类

```java
public abstract class ClassInstanceMethodsEnhancePluginDefine extends ClassEnhancePluginDefine {

    /**
     * @return null, means enhance no static methods.
     */
    /**
     * 静态方法拦截点
     * */
    @Override
    public StaticMethodsInterceptPoint[] getStaticMethodsInterceptPoints() {
        return null;
    }

}
```

### ClassStaticMethodsEnhancePluginDefine

如果对构造方法/实例方法增强，则需继承此类

```java
public abstract class ClassStaticMethodsEnhancePluginDefine extends ClassEnhancePluginDefine {

    /**
     * @return null, means enhance no constructors.
     */
    @Override
    public ConstructorInterceptPoint[] getConstructorsInterceptPoints() {
        return null;
    }

    /**
     * @return null, means enhance no instance methods.
     */
    @Override
    public InstanceMethodsInterceptPoint[] getInstanceMethodsInterceptPoints() {
        return null;
    }
}
```

### 结构

- `ClassInstanceMethodsEnhancePluginDefine`和`ClassStaticMethodsEnhancePluginDefine`都继承了`ClassEnhancePluginDefine`
- 而`ClassEnhancePluginDefine`继承了`AbstractClassEnhancePluginDefine`

在返回要增强的类方法中`ClassMatch`就是要进行匹配的策略，有名字匹配、前缀匹配等，这里就不做详细分析了

```java
@Override
protected ClassMatch enhanceClass() {
    return byName(ENHANCE_CLASS);
}
```

这里我们知道了如何指定在哪个类，对哪个方法进行增强，下面我们就来看看增强逻辑的类是怎么做的，仍然以阿里的`druid`数据源为例。指定了是`org.apache.skywalking.apm.plugin.druid.v1.PoolingGetConnectInterceptor`

### PoolingGetConnectInterceptor

```java
public class PoolingGetConnectInterceptor implements InstanceMethodsAroundInterceptor {

    @Override
    public void beforeMethod(EnhancedInstance objInst, Method method, Object[] allArguments, Class<?>[] argumentsTypes, MethodInterceptResult result) throws Throwable {
        AbstractSpan span = ContextManager.createLocalSpan("Druid/Connection/" + method.getName());
        span.setComponent(ComponentsDefine.ALIBABA_DRUID);
    }

    @Override
    public Object afterMethod(EnhancedInstance objInst, Method method, Object[] allArguments, Class<?>[] argumentsTypes, Object ret) throws Throwable {
        ContextManager.stopSpan();
        return ret;
    }

    @Override
    public void handleMethodException(EnhancedInstance objInst, Method method, Object[] allArguments, Class<?>[] argumentsTypes, Throwable t) {
        ContextManager.activeSpan().errorOccurred().log(t);
    }
}
```

可以看到和APO非常的像，前置/后置/异常增强

### 总结

- 插件的定义 
   - 位置，resources/skywalking-plugin.def
   - 内容，插件名=插件类定义
- 插件的结构 
   - 对构造/实例方法增强，继承`ClassInstanceMethodsEnhancePluginDefine`
   - 对静态方法增强，继承`ClassStaticMethodsEnhancePluginDefine`
   - `ClassInstanceMethodsEnhancePluginDefine`和`ClassStaticMethodsEnhancePluginDefine`都继承`ClassEnhancePluginDefine`,`ClassEnhancePluginDefine`继承`AbstractClassEnhancePluginDefine`
   - 指定要拦截的类的方法，`enhanceClass()`
   - 指定要拦截的构造方法，`getConstructorsInterceptPoints`
   - 指定要拦截的实例方法，`getInstanceMethodsInterceptPoints`
   - 指定要拦截的静态方法，`getStaticMethodsInterceptPoints`
- 目标类的匹配 
   - 按类名匹配，`NameMatch`
   - 间接匹配，`IndirectMatch` 
      - `PrefixMatch`，前缀匹配
      - `MethodAnnotationMatch`，注解匹配
- 进行拦截的定义方法 
   - beforeMethod
   - afterMethod
   - handleMethodException

## 版本识别

skywalking是把不同版本的框架，来分别设置插件来对应着不用的版本，就拿常见的Srping来说，插件结构为

- `mvc-annotation-3.x-plugin`
- `mvc-annotation-4.x-plugin`
- `mvc-annotation-5.x-plugin`

但有个关键的问题，skywalking是怎么识别出不同的Spring版本来执行对应版本的插件？

skywalking对这个问题的处理很巧妙，就是判断当前的类加载器中在相应的版本是否有对应类和方法

## 类识别

判断是否存在一个或多个类仅同时存在于某一个版本中
![](/img/technologySharing/skywalkiing/类识别.jpeg)

- 在插件生效前会判断当前的版本是否存在对应的类
- 假设应用中使用的是Spring 5.x，那么Srping-5.x-plugin判断确实存在C类，那么此版本就会生效
- 而Srping-3.x-plugin和Srping-4.x-plugin不存在C类，所以Srping-5.x-plugin就不会加载
- 当spring-v3-plugin插件生效前，判断应用中同时存在A、B两个类，满足该条件，所以spring-v3-plugin插件生效
- 当spring-v4-plugin、spring-v5-plugin插件生效前，判断应用中同时存在B、C两个类，不满足该条件，所以spring-v4-plugin、spring-v5-plugin插件不生效

## 方法识别

当判断版本之间的类都相同是，类识别就没有办法了，这时就需要方法识别
![](/img/technologySharing/skywalkiing/方法识别.png)

- 如图，假设只有Spring3.x存在A类，Spring4.x和Spring5.x类都相同，但Spring4.x的A类存在`test`方法，返回类型为`Integer`，入参类型为`Integer`、`String`。Spring5.x的A类也存在`test`方法，但返回类型为`String`，入参类型为`String`
- 在插件生效前就会判断如何当前A类存在`Intger test(Integer,String)`，那么Spring-4.x-plugin生效
- 如何当前A类存在`String test(String)`，那么Spring-5.x-plugin生效

## skywalking的真正版本识别

- `witnessClasses`就是类识别
- `witnessMethods`就是方法识别
- 这两个方法都在插件的顶级接口`AbstractClassEnhancePluginDefine`定义

```java
public abstract class AbstractClassEnhancePluginDefine {

protected String[] witnessClasses() {
    return new String[] {};
}

protected List<WitnessMethod> witnessMethods() {
    return null;
}
```

## 那么skywalking到底是怎么判断类是否存在呢？

- 这些插件都是由`AgentClassLoader`加载的
- `AgentClassLoader`的父类加载器是`AppClassLoader`
- 通过双亲委派机制，`AgentClassLoader`中找不到要识别的类就会向上委派给`AppClassLoader`
- `AppClassLoader`找不到就向上委派，知道顶级的`BootStrapClassLoader`
- 通过这种方式就能判断要识别的类是否存在

##### 让我们以Spring为例看看skywalking到底是怎么判断的

## 类识别

Spring3.x

```java
public abstract class AbstractSpring3Instrumentation extends ClassInstanceMethodsEnhancePluginDefine {

    public static final String WITHNESS_CLASSES = "org.springframework.web.servlet.view.xslt.AbstractXsltView";

    @Override
    protected final String[] witnessClasses() {
        return new String[] {WITHNESS_CLASSES};
    }
}
```

Srping4.x

```java
public abstract class AbstractSpring4Instrumentation extends ClassInstanceMethodsEnhancePluginDefine {
    public static final String WITHNESS_CLASSES = "org.springframework.cache.interceptor.SimpleKey";

    @Override
    protected String[] witnessClasses() {
        return new String[] {
            WITHNESS_CLASSES,
            "org.springframework.cache.interceptor.DefaultKeyGenerator"
        };
    }
}
```

Spring5.x

```java
public abstract class AbstractSpring5Instrumentation extends ClassInstanceMethodsEnhancePluginDefine {
    public static final String WITNESS_CLASSES = "org.springframework.web.servlet.resource.HttpResource";

    @Override
    protected final String[] witnessClasses() {
        return new String[] {WITNESS_CLASSES};
    }
}
```

可以看到Spring3.x、Spring4.x、Spring5.x分别都有不同要识别的类

## 方法识别

dubbo2.7.x

```java
public class DubboInstrumentation extends ClassInstanceMethodsEnhancePluginDefine {

    private static final String ENHANCE_CLASS = "org.apache.dubbo.monitor.support.MonitorFilter";

    private static final String INTERCEPT_CLASS = "org.apache.skywalking.apm.plugin.asf.dubbo.DubboInterceptor";

    private static final String CONTEXT_TYPE_NAME = "org.apache.dubbo.rpc.RpcContext";

    private static final String GET_SERVER_CONTEXT_METHOD_NAME = "getServerContext";


    @Override
    protected List<WitnessMethod> witnessMethods() {
        return Collections.singletonList(new WitnessMethod(
            CONTEXT_TYPE_NAME,
            named(GET_SERVER_CONTEXT_METHOD_NAME).and(
                returns(named(CONTEXT_TYPE_NAME)))
        ));
    }

}
```

dubbo3.x

```java
public class DubboInstrumentation extends ClassInstanceMethodsEnhancePluginDefine {

    public static final String CONTEXT_TYPE_NAME = "org.apache.dubbo.rpc.RpcContext";

    public static final String GET_SERVER_CONTEXT_METHOD_NAME = "getServerContext";

    public static final String CONTEXT_ATTACHMENT_TYPE_NAME = "org.apache.dubbo.rpc.RpcContextAttachment";


    @Override
    protected List<WitnessMethod> witnessMethods() {
        return Collections.singletonList(
            new WitnessMethod(
                CONTEXT_TYPE_NAME,
                named(GET_SERVER_CONTEXT_METHOD_NAME).and(
                    returns(named(CONTEXT_ATTACHMENT_TYPE_NAME)))
            ));
    }

}
```

可以看到是通过dubbo2.7.x和dubbo3.x的`getServerContext`方法返回的不同类型来判断

## 总结

- witnessClasses，类识别
- witnessMethods，方法识别

接下来开始分析字节码的增强过程
