---
slug: /tech-sharing/skywalking-source/skywalking-part-6
---

# Skywalking流程分析_6

## 前言

在上文中，介绍了`SkyWalkingAgent.Transformer#transform`方法，分析了：

- 找到对此类匹配的所有插件
- 设置增强上下文标识
- 字节码增强 define.define 
   - 版本查找，类识别和方法识别 
      - finder.exist判断是否存在
   - 真正的字节码增强，this.enhance
接下来我们就来分析真正的字节码增强逻辑

## this.enhance

```java
protected DynamicType.Builder<?> enhance(TypeDescription typeDescription, DynamicType.Builder<?> newClassBuilder,
                                         ClassLoader classLoader, EnhanceContext context) throws PluginException {
    //静态方法的增强
    newClassBuilder = this.enhanceClass(typeDescription, newClassBuilder, classLoader);
    //构造、实例方法的增强
    newClassBuilder = this.enhanceInstance(typeDescription, newClassBuilder, classLoader, context);

    return newClassBuilder;
}
```

这里分为`ClassEnhancePluginDefine`和`ClassEnhancePluginDefineV2`，逻辑都差不多，我们只分析`ClassEnhancePluginDefine`即可

### 静态方法增强

**ClassEnhancePluginDefine.enhanceClass**

```java
protected DynamicType.Builder<?> enhanceClass(TypeDescription typeDescription, DynamicType.Builder<?> newClassBuilder,
    ClassLoader classLoader) throws PluginException {
    //获取要拦截的静态方法
    StaticMethodsInterceptPoint[] staticMethodsInterceptPoints = getStaticMethodsInterceptPoints();
    String enhanceOriginClassName = typeDescription.getTypeName();
    if (staticMethodsInterceptPoints == null || staticMethodsInterceptPoints.length == 0) {
        return newClassBuilder;
    }

    for (StaticMethodsInterceptPoint staticMethodsInterceptPoint : staticMethodsInterceptPoints) {
        //获取要在切点进行具体增强逻辑的类
        String interceptor = staticMethodsInterceptPoint.getMethodsInterceptor();
        if (StringUtil.isEmpty(interceptor)) {
            throw new EnhanceException("no StaticMethodsAroundInterceptor define to enhance class " + enhanceOriginClassName);
        }
        //如果要修改原方法的入参
        if (staticMethodsInterceptPoint.isOverrideArgs()) {
            //要增加的类是Bootstrap类加载器加载的
            if (isBootstrapInstrumentation()) {
                newClassBuilder = newClassBuilder.method(isStatic().and(staticMethodsInterceptPoint.getMethodsMatcher()))
                                                 .intercept(MethodDelegation.withDefaultConfiguration()
                                                                            .withBinders(Morph.Binder.install(OverrideCallable.class))
                                                                            .to(BootstrapInstrumentBoost.forInternalDelegateClass(interceptor)));
            } else {
                newClassBuilder = newClassBuilder.method(isStatic().and(staticMethodsInterceptPoint.getMethodsMatcher()))
                                                 .intercept(MethodDelegation.withDefaultConfiguration()
                                                                            .withBinders(Morph.Binder.install(OverrideCallable.class))
                                                                            .to(new StaticMethodsInterWithOverrideArgs(interceptor)));
            }
        //不用修改原方法的入参    
        } else {
            //要增加的类是Bootstrap类加载器加载的
            if (isBootstrapInstrumentation()) {
                newClassBuilder = newClassBuilder.method(isStatic().and(staticMethodsInterceptPoint.getMethodsMatcher()))
                                                 .intercept(MethodDelegation.withDefaultConfiguration()
                                                                            .to(BootstrapInstrumentBoost.forInternalDelegateClass(interceptor)));
            } else {
                newClassBuilder = newClassBuilder.method(isStatic().and(staticMethodsInterceptPoint.getMethodsMatcher()))
                                                 .intercept(MethodDelegation.withDefaultConfiguration()
                                                                            .to(new StaticMethodsInter(interceptor)));
            }
        }

    }

    return newClassBuilder;
}
```

- `getStaticMethodsInterceptPoints()`,获取静态方法拦截点
- 通过是否修改原方法入参、要加载的类是否是BootStrapClassLoader加载，来分别执行增强逻辑

### 不修改原方法入参

```java
newClassBuilder = newClassBuilder.method(isStatic().and(staticMethodsInterceptPoint.getMethodsMatcher()))
                                                     .intercept(MethodDelegation.withDefaultConfiguration()
                                                                                .to(new StaticMethodsInter(interceptor)));
```

以阿里数据源`druid`为例，不需要修改方法入参，被拦截的类也不是JDK类库的类，所以直接执行最下面的分支逻辑

```java
public class DruidDataSourceStatManagerInstrumentation extends ClassStaticMethodsEnhancePluginDefine {
    private static final String ENHANCE_CLASS = "com.alibaba.druid.stat.DruidDataSourceStatManager";
    private static final String ENHANCE_METHOD = "addDataSource";
    private static final String INTERCEPTOR_CLASS = "org.apache.skywalking.apm.plugin.druid.v1.PoolingAddDruidDataSourceInterceptor";

    @Override
    protected ClassMatch enhanceClass() {
        return byName(ENHANCE_CLASS);
    }

    //省略...

    @Override
    public StaticMethodsInterceptPoint[] getStaticMethodsInterceptPoints() {
        return new StaticMethodsInterceptPoint[]{
                new StaticMethodsInterceptPoint() {
                    @Override
                    public ElementMatcher<MethodDescription> getMethodsMatcher() {
                        return named(ENHANCE_METHOD).and(takesArguments(Object.class, String.class));
                    }

                    @Override
                    public String getMethodsInterceptor() {
                        return INTERCEPTOR_CLASS;
                    }

                    @Override
                    public boolean isOverrideArgs() {
                        return false;
                    }
                }
        };
    }
}
```

能明确看到是对`com.alibaba.druid.stat.DruidDataSourceStatManager`中的`addDataSource`进行增强的

获取要拦截的增强点后，开始调用`bytebuddy`提供的API:

- 指定该方法为静态方法`isStatic()`
- 指定方法名`staticMethodsInterceptPoint.getMethodsMatcher()`
- 传入`interceptor`实例交给`StaticMethodsInter`去处理
- `new StaticMethodsInter(interceptor)`去做真正的字节码增强

下面来分析`StaticMethodsInter`看看具体是怎么做增强的

### StaticMethodsInter

```java
public class StaticMethodsInter {
    private static final ILog LOGGER = LogManager.getLogger(StaticMethodsInter.class);

    /**
     * A class full name, and instanceof {@link StaticMethodsAroundInterceptor} This name should only stay in {@link
     * String}, the real {@link Class} type will trigger classloader failure. If you want to know more, please check on
     * books about Classloader or Classloader appointment mechanism.
     * 
     * 进行具体增强逻辑的类
     */
    private String staticMethodsAroundInterceptorClassName;

    /**
     * Set the name of {@link StaticMethodsInter#staticMethodsAroundInterceptorClassName}
     *
     * @param staticMethodsAroundInterceptorClassName class full name.
     */
    public StaticMethodsInter(String staticMethodsAroundInterceptorClassName) {
        this.staticMethodsAroundInterceptorClassName = staticMethodsAroundInterceptorClassName;
    }

    /**
     * Intercept the target static method.
     *
     * @param clazz        target class 要修改的字节码的原生类
     * @param allArguments all method arguments 原方法的入参
     * @param method       method description. 原方法
     * @param zuper        the origin call ref. 原方法的调用
     * @return the return value of target static method.
     * @throws Exception only throw exception because of zuper.call() or unexpected exception in sky-walking ( This is a
     *                   bug, if anything triggers this condition ).
     * 开始进行环绕增强                  
     *                   
     */
    @RuntimeType
    public Object intercept(@Origin Class<?> clazz, @AllArguments Object[] allArguments, @Origin Method method,
        @SuperCall Callable<?> zuper) throws Throwable {
        // 实例化自定义的拦截器
        StaticMethodsAroundInterceptor interceptor = InterceptorInstanceLoader.load(staticMethodsAroundInterceptorClassName, clazz
            .getClassLoader());

        MethodInterceptResult result = new MethodInterceptResult();
        try {
            //前置增强
            interceptor.beforeMethod(clazz, method, allArguments, method.getParameterTypes(), result);
        } catch (Throwable t) {
            LOGGER.error(t, "class[{}] before static method[{}] intercept failure", clazz, method.getName());
        }

        Object ret = null;
        try {
            //如果设置不再调用，则返回你指定的结果
            if (!result.isContinue()) {
                ret = result._ret();
            } else {
                //原方法继续调用
                ret = zuper.call();
            }
        } catch (Throwable t) {
            try {
                //异常增强
                interceptor.handleMethodException(clazz, method, allArguments, method.getParameterTypes(), t);
            } catch (Throwable t2) {
                LOGGER.error(t2, "class[{}] handle static method[{}] exception failure", clazz, method.getName(), t2.getMessage());
            }
            throw t;
        } finally {
            try {
                //后置增强
                ret = interceptor.afterMethod(clazz, method, allArguments, method.getParameterTypes(), ret);
            } catch (Throwable t) {
                LOGGER.error(t, "class[{}] after static method[{}] intercept failure:{}", clazz, method.getName(), t.getMessage());
            }
        }
        return ret;
    }
}
```

### intercept方法总结：

- 加载实例化自定义的拦截器
- 执行前置增强beforeMethod()方法
- 如果需要执行原方法，执行原方法调用，否则调用_ret()方法
- 如果方法执行抛出异常，执行异常增强handleMethodException()方法
- 在finally执行后置增强afterMethod()方法

注意看这行

```java
MethodInterceptResult result = new MethodInterceptResult();
try {
    //前置增强
    interceptor.beforeMethod(clazz, method, allArguments, method.getParameterTypes(), result);
} catch (Throwable t) {
    LOGGER.error(t, "class[{}] before static method[{}] intercept failure", clazz, method.getName());
}

Object ret = null;
try {
    //如果设置不再调用，则返回你指定的结果
    if (!result.isContinue()) {
        ret = result._ret();
    } else {
        //原方法继续调用
        ret = zuper.call();
    }
} catch (Throwable t)
```

MethodInterceptResult结构

```java
public class MethodInterceptResult {
    private boolean isContinue = true;

    private Object ret = null;

    /**
     * define the new return value.
     *
     * @param ret new return value.
     */
    public void defineReturnValue(Object ret) {
        this.isContinue = false;
        this.ret = ret;
    }

    /**
     * @return true, will trigger method interceptor({@link InstMethodsInter} and {@link StaticMethodsInter}) to invoke
     * the origin method. Otherwise, not.
     */
    public boolean isContinue() {
        return isContinue;
    }

    /**
     * @return the new return value.
     */
    public Object _ret() {
        return ret;
    }
}
```

`MethodInterceptResult`创建对象`result`后传入了前置增强`beforeMethod`中，然后根据`result.isContinue()`返回的结果判断是否继续调用原方法，也就是说:
如果插件的beforeMethod()方法实现中调用了defineReturnValue()传入了返回值，则不会再调用原方法，直接返回传入的返回值

### 修改原方法入参

```java
newClassBuilder = newClassBuilder.method(isStatic().and(staticMethodsInterceptPoint.getMethodsMatcher()))
                     .intercept(MethodDelegation.withDefaultConfiguration()
                                                .withBinders(Morph.Binder.install(OverrideCallable.class))
                                                .to(new StaticMethodsInterWithOverrideArgs(interceptor)));
```

获取要拦截的增强点后，开始调用`bytebuddy`提供的API:

- 指定该方法为静态方法`isStatic()`
- 指定方法名`staticMethodsInterceptPoint.getMethodsMatcher()`
- 传入`interceptor`实例交给`StaticMethodsInterWithOverrideArgs`去处理
- `new StaticMethodsInterWithOverrideArgs(interceptor)`去做真正的字节码增强

下面来分析`StaticMethodsInterWithOverrideArgs`看看具体是怎么做增强的

### StaticMethodsInterWithOverrideArgs

```java
public class StaticMethodsInterWithOverrideArgs {
    private static final ILog LOGGER = LogManager.getLogger(StaticMethodsInterWithOverrideArgs.class);

    /**
     * A class full name, and instanceof {@link StaticMethodsAroundInterceptor} This name should only stay in {@link
     * String}, the real {@link Class} type will trigger classloader failure. If you want to know more, please check on
     * books about Classloader or Classloader appointment mechanism.
     */
    private String staticMethodsAroundInterceptorClassName;

    /**
     * Set the name of {@link StaticMethodsInterWithOverrideArgs#staticMethodsAroundInterceptorClassName}
     *
     * @param staticMethodsAroundInterceptorClassName class full name.
     */
    public StaticMethodsInterWithOverrideArgs(String staticMethodsAroundInterceptorClassName) {
        this.staticMethodsAroundInterceptorClassName = staticMethodsAroundInterceptorClassName;
    }

    /**
     * Intercept the target static method.
     *
     * @param clazz        target class
     * @param allArguments all method arguments
     * @param method       method description.
     * @param zuper        the origin call ref.
     * @return the return value of target static method.
     * @throws Exception only throw exception because of zuper.call() or unexpected exception in sky-walking ( This is a
     *                   bug, if anything triggers this condition ).
     */
    @RuntimeType
    public Object intercept(@Origin Class<?> clazz, @AllArguments Object[] allArguments, @Origin Method method,
        @Morph OverrideCallable zuper) throws Throwable {
        StaticMethodsAroundInterceptor interceptor = InterceptorInstanceLoader.load(staticMethodsAroundInterceptorClassName, clazz
            .getClassLoader());

        MethodInterceptResult result = new MethodInterceptResult();
        try {
            //beforeMethod可以通过操作allArguments来修改原方法入参
            interceptor.beforeMethod(clazz, method, allArguments, method.getParameterTypes(), result);
        } catch (Throwable t) {
            LOGGER.error(t, "class[{}] before static method[{}] intercept failure", clazz, method.getName());
        }

        Object ret = null;
        try {
            if (!result.isContinue()) {
                ret = result._ret();
            } else {
                // 原方法的调用时传入修改后的原方法入参
                ret = zuper.call(allArguments);
            }
        } catch (Throwable t) {
            try {
                //异常增强
                interceptor.handleMethodException(clazz, method, allArguments, method.getParameterTypes(), t);
            } catch (Throwable t2) {
                LOGGER.error(t2, "class[{}] handle static method[{}] exception failure", clazz, method.getName(), t2.getMessage());
            }
            throw t;
        } finally {
            try {
                //后置增强
                ret = interceptor.afterMethod(clazz, method, allArguments, method.getParameterTypes(), ret);
            } catch (Throwable t) {
                LOGGER.error(t, "class[{}] after static method[{}] intercept failure:{}", clazz, method.getName(), t.getMessage());
            }
        }
        return ret;
    }
}
```

其实能看到`StaticMethodsInter和StaticMethodsInterWithOverrideArgs的区别`就在于执行原方法调用是的方法不同:

```java
Callable<?> zuper

ret = zuper.call();
```

```java
OverrideCallable zuper

ret = zuper.call(allArguments);
```

### 静态方法增强的总结：

- 不修改原方法入参 
   - 要增强的类是JDK的类库(待分析)
   - 要增强的类不是JDK的类库 
      - 实例化插件中定义的`Interceptor`
      - 执行前置增强`beforeMethod`
      - 执行原方法
      - 如果出现异常，执行异常增强`handleMethodException`
      - 执行后置增强`afterMethod`
- 要修改原方法入参 
   - 要增强的类是JDK的类库(待分析)
   - 要增强的类不是JDK的类库 
      - 实例化插件中定义的`Interceptor`
      - 执行前置增强`beforeMethod`
      - 执行原方法
      - 如果出现异常，执行异常增强`handleMethodException`
      - 执行后置增强`afterMethod`

静态方法的具体增强逻辑我们已经分析完毕，后面的文章会分析构造/实例方法增强，以及JDK类库的类是怎么增强的
