---
slug: /tech-sharing/skywalking-source/skywalking-part-10
---

# Skywalking流程分析_10

## 介绍

在使用异步时，Skywalking的链路会断掉，不能形成一条完整的链路，解决此问题，skywalking提供了多种方法来实现
**使用@TraceCrossThread注解**
`@TraceCrossThread`是Skywalking提供的注解，其有一定的侵入性。方式是在线程类上加上注解，在类加载时，其构造方法会被Skywalking代理增强

```java
@TraceCrossThread
public class TestRunnable implements Runnable{

    @Override
    public void run() {
        System.out.println(TraceContext.traceId());
        //你的逻辑
        do()

    }
}
```

## @Trace注解
@Trace可以对Spring下的注解@Async做修饰，使用方法如下

```java
@Service
public class TestService {

    @Trace
    @Async
    public void traceAsync() throws InterruptedException {
        Thread.sleep(10);
        doNothing();

    }
}
```

## apm-jdk-threading-plugin
apm-jdk-threading-plugin是Skywalking提供的一个插件，这个插件位于Skywalking目录下的/agent/bootstrap-plugins目录下，使用方法就是将其复制到Skywalking目录下的/agent/plugins目录下。

还需要对代理的配置进行修改Skywalking目录下的/agent/config/agent.config，配置对哪些包下的线程池进行增强，添加如下配置：

```
jdkthreading.threading_class_prefixes=com.test1,com.test2
```

## RunnableWrapper/CallableWrapper
很多时候在线程池的时候，并不是要额外弄一个类实现Runnable或者Callable，都是用lambda表达式的，这时RunnableWrapper/CallableWrapper就排上用场了

```java
ExecutorService executorService = Executors.newSingleThreadExecutor();
executorService.execute(RunnableWrapper.of(() -> {
    //你的逻辑
    do();
}));
```

```java
ExecutorService executorService = Executors.newSingleThreadExecutor();
executorService.submit(CallableWrapper.of(() -> {
    //你的逻辑
    return do();
}));
```

其实RunnableWrapper/CallableWrapper本质也是利用了`@TraceCrossThread`注解

```java
@TraceCrossThread
public class RunnableWrapper implements Runnable {
    final Runnable runnable;

    public RunnableWrapper(Runnable runnable) {
        this.runnable = runnable;
    }

    public static RunnableWrapper of(Runnable r) {
        return new RunnableWrapper(r);
    }

    public void run() {
        this.runnable.run();
    }
}
```

```java
@TraceCrossThread
public class CallableWrapper<V> implements Callable<V> {
    final Callable<V> callable;

    public static <V> CallableWrapper<V> of(Callable<V> r) {
        return new CallableWrapper(r);
    }

    public CallableWrapper(Callable<V> callable) {
        this.callable = callable;
    }

    public V call() throws Exception {
        return this.callable.call();
    }
}
```

## 原理

### 对@TraceCrossThread注解的类进行增强

在`apm-sniffer\apm-toolkit-activation\apm-toolkit-trace-activation`

### CallableOrRunnableActivation

将含有`TraceCrossThread`注解的类进行匹配，然后指定在`CallableOrRunnableConstructInterceptor`中进行构造方法的增强，指定在`CallableOrRunnableInvokeInterceptor`中做`call`、`run`、`get`、`apply`、`accept`方法的增强

```java
public class CallableOrRunnableActivation extends ClassInstanceMethodsEnhancePluginDefine {

    public static final String ANNOTATION_NAME = "org.apache.skywalking.apm.toolkit.trace.TraceCrossThread";
    private static final String INIT_METHOD_INTERCEPTOR = "org.apache.skywalking.apm.toolkit.activation.trace.CallableOrRunnableConstructInterceptor";
    private static final String CALL_METHOD_INTERCEPTOR = "org.apache.skywalking.apm.toolkit.activation.trace.CallableOrRunnableInvokeInterceptor";
    private static final String CALL_METHOD_NAME = "call";
    private static final String RUN_METHOD_NAME = "run";
    private static final String GET_METHOD_NAME = "get";
    private static final String APPLY_METHOD_NAME = "apply";
    private static final String ACCEPT_METHOD_NAME = "accept";

    @Override
    public ConstructorInterceptPoint[] getConstructorsInterceptPoints() {
        return new ConstructorInterceptPoint[] {
            new ConstructorInterceptPoint() {
                @Override
                public ElementMatcher<MethodDescription> getConstructorMatcher() {
                    return any();
                }

                @Override
                public String getConstructorInterceptor() {
                    return INIT_METHOD_INTERCEPTOR;
                }
            }
        };
    }

    @Override
    public InstanceMethodsInterceptPoint[] getInstanceMethodsInterceptPoints() {
        return new InstanceMethodsInterceptPoint[] {
            new InstanceMethodsInterceptPoint() {
                @Override
                public ElementMatcher<MethodDescription> getMethodsMatcher() {
                    return named(CALL_METHOD_NAME)
                        .and(takesArguments(0))
                        .or(named(RUN_METHOD_NAME).and(takesArguments(0)))
                        .or(named(GET_METHOD_NAME).and(takesArguments(0)))
                        .or(named(APPLY_METHOD_NAME).and(takesArguments(1)))
                        .or(named(ACCEPT_METHOD_NAME).and(takesArguments(1)));
                }

                @Override
                public String getMethodsInterceptor() {
                    return CALL_METHOD_INTERCEPTOR;
                }

                @Override
                public boolean isOverrideArgs() {
                    return false;
                }
            }
        };
    }

    @Override
    protected ClassMatch enhanceClass() {
        return byClassAnnotationMatch(new String[] {ANNOTATION_NAME});
    }

}
```

### CallableOrRunnableConstructInterceptor

```java
public class CallableOrRunnableConstructInterceptor implements InstanceConstructorInterceptor {
    @Override
    public void onConstruct(EnhancedInstance objInst, Object[] allArguments) {
        if (ContextManager.isActive()) {
            objInst.setSkyWalkingDynamicField(ContextManager.capture());
        }
    }

}
```

### CallableOrRunnableInvokeInterceptor

```java
public class CallableOrRunnableInvokeInterceptor implements InstanceMethodsAroundInterceptor {
    @Override
    public void beforeMethod(EnhancedInstance objInst, Method method, Object[] allArguments, Class<?>[] argumentsTypes,
        MethodInterceptResult result) throws Throwable {
        ContextManager.createLocalSpan("Thread/" + objInst.getClass().getName() + "/" + method.getName());
        ContextSnapshot cachedObjects = (ContextSnapshot) objInst.getSkyWalkingDynamicField();
        if (cachedObjects != null) {
            ContextManager.continued(cachedObjects);
        }
    }

    @Override
    public Object afterMethod(EnhancedInstance objInst, Method method, Object[] allArguments, Class<?>[] argumentsTypes,
        Object ret) throws Throwable {
        ContextManager.stopSpan();
        // clear ContextSnapshot
        objInst.setSkyWalkingDynamicField(null);
        return ret;
    }

    @Override
    public void handleMethodException(EnhancedInstance objInst, Method method, Object[] allArguments,
        Class<?>[] argumentsTypes, Throwable t) {
        ContextManager.activeSpan().log(t);
    }
}
```

## 线程池的增强插件

在`apm-sniffer\bootstrap-plugins\jdk-threadpool-plugin`

### ThreadPoolExecutorInstrumentation

在这里指定了对`java.util.concurrent.ThreadPoolExecutor`中的`execute`和`submit`方法进行增强，分别在`org.apache.skywalking.apm.plugin.ThreadPoolExecuteMethodInterceptor`和`org.apache.skywalking.apm.plugin.ThreadPoolSubmitMethodInterceptor`中来实现

```java
public class ThreadPoolExecutorInstrumentation extends ClassInstanceMethodsEnhancePluginDefine {

    private static final String ENHANCE_CLASS = "java.util.concurrent.ThreadPoolExecutor";

    private static final String INTERCEPT_EXECUTE_METHOD = "execute";

    private static final String INTERCEPT_SUBMIT_METHOD = "submit";

    private static final String INTERCEPT_EXECUTE_METHOD_HANDLE = "org.apache.skywalking.apm.plugin.ThreadPoolExecuteMethodInterceptor";

    private static final String INTERCEPT_SUBMIT_METHOD_HANDLE = "org.apache.skywalking.apm.plugin.ThreadPoolSubmitMethodInterceptor";

    @Override
    public boolean isBootstrapInstrumentation() {
        return true;
    }

    @Override
    protected ClassMatch enhanceClass() {
        return LogicalMatchOperation.or(HierarchyMatch.byHierarchyMatch(ENHANCE_CLASS), MultiClassNameMatch.byMultiClassMatch(ENHANCE_CLASS));
    }

    @Override
    public ConstructorInterceptPoint[] getConstructorsInterceptPoints() {
        return new ConstructorInterceptPoint[0];
    }

    @Override
    public InstanceMethodsInterceptPoint[] getInstanceMethodsInterceptPoints() {
        return new InstanceMethodsInterceptPoint[]{
                new InstanceMethodsInterceptPoint() {
                    @Override
                    public ElementMatcher<MethodDescription> getMethodsMatcher() {
                        return ElementMatchers.named(INTERCEPT_EXECUTE_METHOD);
                    }

                    @Override
                    public String getMethodsInterceptor() {
                        return INTERCEPT_EXECUTE_METHOD_HANDLE;
                    }

                    @Override
                    public boolean isOverrideArgs() {
                        return true;
                    }
                },
                new InstanceMethodsInterceptPoint() {
                    @Override
                    public ElementMatcher<MethodDescription> getMethodsMatcher() {
                        return ElementMatchers.named(INTERCEPT_SUBMIT_METHOD);
                    }

                    @Override
                    public String getMethodsInterceptor() {
                        return INTERCEPT_SUBMIT_METHOD_HANDLE;
                    }

                    @Override
                    public boolean isOverrideArgs() {
                        return true;
                    }
                }
        };
    }
}
```

`ThreadPoolExecuteMethodInterceptor`和`ThreadPoolSubmitMethodInterceptor`都继承了`AbstractThreadingPoolInterceptor`，所以我们要去这个类来分析

### AbstractThreadingPoolInterceptor

```java
public abstract class AbstractThreadingPoolInterceptor implements InstanceMethodsAroundInterceptor {
    @Override
    public void beforeMethod(EnhancedInstance objInst, Method method, Object[] allArguments, Class<?>[] argumentsTypes, MethodInterceptResult result) throws Throwable {
        if (!ContextManager.isActive()) {
            return;
        }

        if (allArguments == null || allArguments.length < 1) {
            return;
        }

        Object argument = allArguments[0];

        Object wrappedObject = wrap(argument);
        if (wrappedObject != null) {
            allArguments[0] = wrappedObject;
        }
    }

    /**
     * wrap the Callable or Runnable object if needed
     * @param param  Callable or Runnable object
     * @return Wrapped object or null if not needed to wrap
     */
    public abstract Object wrap(Object param);

    @Override
    public Object afterMethod(EnhancedInstance objInst, Method method, Object[] allArguments, Class<?>[] argumentsTypes, Object ret) throws Throwable {
        return ret;
    }

    @Override
    public void handleMethodException(EnhancedInstance objInst, Method method, Object[] allArguments, Class<?>[] argumentsTypes, Throwable t) {
        ContextManager.activeSpan().log(t);
    }
}
```

- 这里的`allArguments`第一个元素的`argument`其实就是`Runnable`或者`Callable`
- `wrap`方法在`AbstractThreadingPoolInterceptor`进行了定义，具体的实现在各自的实现类中，这里用了模版方法
- 放`wrap`包装好后的对象在重新放回`allArguments`中，这样原始的`Runnable`或者`Callable`就被替换成了包装对象

下面来分析各自的实现类

### ThreadPoolExecuteMethodInterceptor

```java
public class ThreadPoolExecuteMethodInterceptor extends AbstractThreadingPoolInterceptor {

    @Override
    public Object wrap(Object param) {
        if (param instanceof SwRunnableWrapper) {
            return null;
        }

        if (param instanceof RunnableFuture) {
            return null;
        }

        if (!(param instanceof Runnable)) {
            return null;
        }

        Runnable runnable = (Runnable) param;
        return new SwRunnableWrapper(runnable, ContextManager.capture());
    }

}
```

```java
public class SwRunnableWrapper implements Runnable {

    private Runnable runnable;

    private ContextSnapshot contextSnapshot;

    public SwRunnableWrapper(Runnable runnable, ContextSnapshot contextSnapshot) {
        this.runnable = runnable;
        this.contextSnapshot = contextSnapshot;
    }

    @Override
    public void run() {
        AbstractSpan span = ContextManager.createLocalSpan(getOperationName());
        span.setComponent(ComponentsDefine.JDK_THREADING);
        ContextManager.continued(contextSnapshot);
        try {
            runnable.run();
        } finally {
            ContextManager.stopSpan();
        }
    }

    private String getOperationName() {
        return "SwRunnableWrapper/" + Thread.currentThread().getName();
    }
}
```

- 可以看到这里的思想也是和之前的一样，在主线程创建`SwRunnableWrapper`时，将`runnable`和`contextSnapshot`传入进去
- 然后子线程执行时，会调用包装好的run方法，先执行span来进行链路监控，然后执行业务逻辑，再将监控span停止

### ThreadPoolSubmitMethodInterceptor

```java
public class ThreadPoolSubmitMethodInterceptor extends AbstractThreadingPoolInterceptor {

    @Override
    public Object wrap(Object param) {
        if (param instanceof SwRunnableWrapper || param instanceof SwCallableWrapper) {
            return null;
        }

        if (param instanceof Callable) {
            Callable callable = (Callable) param;
            return new SwCallableWrapper(callable, ContextManager.capture());
        }

        if (param instanceof Runnable) {
            Runnable runnable = (Runnable) param;
            return new SwRunnableWrapper(runnable, ContextManager.capture());
        }

        return null;
    }
}
```

```java
public class SwCallableWrapper implements Callable {

    private Callable callable;

    private ContextSnapshot contextSnapshot;

    public SwCallableWrapper(Callable callable, ContextSnapshot contextSnapshot) {
        this.callable = callable;
        this.contextSnapshot = contextSnapshot;
    }

    @Override
    public Object call() throws Exception {
        AbstractSpan span = ContextManager.createLocalSpan(getOperationName());
        span.setComponent(ComponentsDefine.JDK_THREADING);
        ContextManager.continued(contextSnapshot);
        try {
            return callable.call();
        } finally {
            ContextManager.stopSpan();
        }
    }

    private String getOperationName() {
        return "SwCallableWrapper/" + Thread.currentThread().getName();
    }
}
```

可以看到`ThreadPoolSubmitMethodInterceptor`和`ThreadPoolExecuteMethodInterceptor`原理相同
