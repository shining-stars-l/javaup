---
slug: /tech-sharing/skywalking-source/skywalking-part-9
---

# Skywalking流程分析_9

## 前言

之前的文章详细介绍了关于非JDK类库的静态方法、构造方法、实例方法的增强拦截流程，本文会详细分析JDK类库中的类是如何被增强拦截的

回到最开始的`SkyWalkingAgent#premain`

```java
try {
    /*
    * 里面有个重点逻辑 把一些类注入到Boostrap类加载器中 为了解决Bootstrap类加载器不能访问App类加载器中的内容的问题
    * */
    agentBuilder = BootstrapInstrumentBoost.inject(pluginFinder, instrumentation, agentBuilder, edgeClasses);
} catch (Exception e) {
    LOGGER.error(e, "SkyWalking agent inject bootstrap instrumentation failure. Shutting down.");
    return;
}
```

### BootstrapInstrumentBoost.inject

这里是将必要的类注入到Bootstrap ClassLoader

```java
public static AgentBuilder inject(PluginFinder pluginFinder, Instrumentation instrumentation,
    AgentBuilder agentBuilder, JDK9ModuleExporter.EdgeClasses edgeClasses) throws PluginException {
    //所有要注入到 Bootstrap ClassLoader 里的类
    Map<String, byte[]> classesTypeMap = new LinkedHashMap<>();
    //针对于目标类是JDK核心类库的插件，这里根据插件的拦截点的不同(实例方法、静态方法、构造方法)
    //使用不同的模板(XxxTemplate)来定义新的拦截器的核心处理逻辑，并且将插件本身定义的拦截器的全类名赋值给模板的
    //TARGET_INTERCEPTOR字段。 最后，这些新的拦截器的核心处理逻辑都会被放入 Bootstrap ClassLoader 中
    if (!prepareJREInstrumentation(pluginFinder, classesTypeMap)) {
        return agentBuilder;
    }

    if (!prepareJREInstrumentationV2(pluginFinder, classesTypeMap)) {
        return agentBuilder;
    }

    for (String highPriorityClass : HIGH_PRIORITY_CLASSES) {
        loadHighPriorityClass(classesTypeMap, highPriorityClass);
    }
    for (String highPriorityClass : ByteBuddyCoreClasses.CLASSES) {
        loadHighPriorityClass(classesTypeMap, highPriorityClass);
    }

    /**
     * Prepare to open edge of necessary classes.
     */
    for (String generatedClass : classesTypeMap.keySet()) {
        edgeClasses.add(generatedClass);
    }

    /**
     * Inject the classes into bootstrap class loader by using Unsafe Strategy.
     * ByteBuddy adapts the sun.misc.Unsafe and jdk.internal.misc.Unsafe automatically.
     */
    /**
     * 把一些类注入到Boostrap类加载器中 为了解决Bootstrap类加载器不能访问App类加载器中的内容的问题
     * */
    ClassInjector.UsingUnsafe.Factory factory = ClassInjector.UsingUnsafe.Factory.resolve(instrumentation);
    factory.make(null, null).injectRaw(classesTypeMap);
    agentBuilder = agentBuilder.with(new AgentBuilder.InjectionStrategy.UsingUnsafe.OfFactory(factory));

    return agentBuilder;
}
```

### BootstrapInstrumentBoost#prepareJREInstrumentation

```java
private static boolean prepareJREInstrumentation(PluginFinder pluginFinder,
    Map<String, byte[]> classesTypeMap) throws PluginException {
    TypePool typePool = TypePool.Default.of(BootstrapInstrumentBoost.class.getClassLoader());
    // 所有要对JDK核心类库生效的插件
    List<AbstractClassEnhancePluginDefine> bootstrapClassMatchDefines = pluginFinder.getBootstrapClassMatchDefine();
    for (AbstractClassEnhancePluginDefine define : bootstrapClassMatchDefines) {
        // 是否定义实例方法拦截点
        if (Objects.nonNull(define.getInstanceMethodsInterceptPoints())) {
            for (InstanceMethodsInterceptPoint point : define.getInstanceMethodsInterceptPoints()) {
                if (point.isOverrideArgs()) {
                    generateDelegator(
                        classesTypeMap, typePool, INSTANCE_METHOD_WITH_OVERRIDE_ARGS_DELEGATE_TEMPLATE, point
                            .getMethodsInterceptor());
                } else {
                    generateDelegator(
                        classesTypeMap, typePool, INSTANCE_METHOD_DELEGATE_TEMPLATE, point.getMethodsInterceptor());
                }
            }
        }
        // 是否定义构造器拦截点
        if (Objects.nonNull(define.getConstructorsInterceptPoints())) {
            for (ConstructorInterceptPoint point : define.getConstructorsInterceptPoints()) {
                generateDelegator(
                    classesTypeMap, typePool, CONSTRUCTOR_DELEGATE_TEMPLATE, point.getConstructorInterceptor());
            }
        }
        // 是否定义静态方法拦截点
        if (Objects.nonNull(define.getStaticMethodsInterceptPoints())) {
            for (StaticMethodsInterceptPoint point : define.getStaticMethodsInterceptPoints()) {
                if (point.isOverrideArgs()) {
                    generateDelegator(
                        classesTypeMap, typePool, STATIC_METHOD_WITH_OVERRIDE_ARGS_DELEGATE_TEMPLATE, point
                            .getMethodsInterceptor());
                } else {
                    generateDelegator(
                        classesTypeMap, typePool, STATIC_METHOD_DELEGATE_TEMPLATE, point.getMethodsInterceptor());
                }
            }
        }
    }
    return bootstrapClassMatchDefines.size() > 0;
}
```

### 总结

- 在之前`PluginFinder`对象初始化时就会将加载的所有插件做分类，要对JDK核心类库生效的插件都放入到`bootstrapClassMatchDefine`集合中，然后调用`getBootstrapClassMatchDefine()`就是拿到所有要对JDK核心类库生效的插件
- 循环所有要对JDK核心类库生效的插件，分别判断是否定义实例方法拦截点、是否定义构造器拦截点、是否定义静态方法拦截点

## 下面我们来进入实例方法的增强，并不重写原方法为例来分析详细的流程

```java
private static String INSTANCE_METHOD_DELEGATE_TEMPLATE = "org.apache.skywalking.apm.agent.core.plugin.bootstrap.template.InstanceMethodInterTemplate";

generateDelegator(
    classesTypeMap, typePool, INSTANCE_METHOD_DELEGATE_TEMPLATE, point.getMethodsInterceptor());
```

- 这里会调用`generateDelegator`方法生成一个代理器
- 其中的参数`INSTANCE_METHOD_DELEGATE_TEMPLATE`是一个模版类名来传入
- 模版名为`org.apache.skywalking.apm.agent.core.plugin.bootstrap.template.InstanceMethodInterTemplate`,这个是模板不是作为实际的类和对象来调用的

### InstanceMethodInterTemplate模板

```java
/**
 * --------CLASS TEMPLATE---------
 * <p>Author, Wu Sheng </p>
 * <p>Comment, don't change this unless you are 100% sure the agent core mechanism for bootstrap class
 * instrumentation.</p>
 * <p>Date, 24th July 2019</p>
 * -------------------------------
 * <p>
 * This class wouldn't be loaded in real env. This is a class template for dynamic class generation.
 * 
 * 这个类是不会被加载的,这是一个类模板用于动态类生成
 */
public class InstanceMethodInterTemplate {
    /**
     * This field is never set in the template, but has value in the runtime.
     */
    private static String TARGET_INTERCEPTOR;

    private static InstanceMethodsAroundInterceptor INTERCEPTOR;
    private static IBootstrapLog LOGGER;

    /**
     * Intercept the target instance method.
     *
     * @param obj          target class instance.
     * @param allArguments all method arguments
     * @param method       method description.
     * @param zuper        the origin call ref.
     * @return the return value of target instance method.
     * @throws Exception only throw exception because of zuper.call() or unexpected exception in sky-walking ( This is a
     *                   bug, if anything triggers this condition ).
     */
    @RuntimeType
    public static Object intercept(@This Object obj, @AllArguments Object[] allArguments, @SuperCall Callable<?> zuper,
        @Origin Method method) throws Throwable {
        EnhancedInstance targetObject = (EnhancedInstance) obj;

        prepare();

        MethodInterceptResult result = new MethodInterceptResult();
        try {
            if (INTERCEPTOR != null) {
                INTERCEPTOR.beforeMethod(targetObject, method, allArguments, method.getParameterTypes(), result);
            }
        } catch (Throwable t) {
            if (LOGGER != null) {
                LOGGER.error(t, "class[{}] before method[{}] intercept failure", obj.getClass(), method.getName());
            }
        }

        Object ret = null;
        try {
            if (!result.isContinue()) {
                ret = result._ret();
            } else {
                ret = zuper.call();
            }
        } catch (Throwable t) {
            try {
                if (INTERCEPTOR != null) {
                    INTERCEPTOR.handleMethodException(targetObject, method, allArguments, method.getParameterTypes(), t);
                }
            } catch (Throwable t2) {
                if (LOGGER != null) {
                    LOGGER.error(t2, "class[{}] handle method[{}] exception failure", obj.getClass(), method.getName());
                }
            }
            throw t;
        } finally {
            try {
                if (INTERCEPTOR != null) {
                    ret = INTERCEPTOR.afterMethod(targetObject, method, allArguments, method.getParameterTypes(), ret);
                }
            } catch (Throwable t) {
                if (LOGGER != null) {
                    LOGGER.error(t, "class[{}] after method[{}] intercept failure", obj.getClass(), method.getName());
                }
            }
        }

        return ret;
    }

    /**
     * Prepare the context. Link to the agent core in AppClassLoader.
     * - 让BootstrapClassLoader 和 AgentClassloader能够相通
     *   - 获取到ILog生成日志对象
     *   - 获取到插件自定义的拦截器增强类实例
     * - 替代非JDK核心类库插件运行逻辑里的interceptor = InterceptorInstanceLoader.load(instanceMethodsAroundInterceptorClassName, classLoader);  
     */
    private static void prepare() {
        if (INTERCEPTOR == null) {
            ClassLoader loader = BootstrapInterRuntimeAssist.getAgentClassLoader();

            if (loader != null) {
                IBootstrapLog logger = BootstrapInterRuntimeAssist.getLogger(loader, TARGET_INTERCEPTOR);
                if (logger != null) {
                    LOGGER = logger;

                    INTERCEPTOR = BootstrapInterRuntimeAssist.createInterceptor(loader, TARGET_INTERCEPTOR, LOGGER);
                }
            } else {
                LOGGER.error("Runtime ClassLoader not found when create {}." + TARGET_INTERCEPTOR);
            }
        }
    }
}
```

能看出这个模板类的`intercept()`方法和实例方法中非jdk类库增强的`intercept()`方法里面的逻辑都大致差不多

下面来详细分析`generateDelegator`方法

### generateDelegator

```java
/**
 * Generate the delegator class based on given template class. This is preparation stage level code generation.
 * 根据给定的模板类生成代理器类,这是准备阶段级别的代码生成
 * <p>
 * One key step to avoid class confliction between AppClassLoader and BootstrapClassLoader
 * 避免AppClassLoader和BootstrapClassLoader之间的类冲突的一个关键步骤
 *
 * @param classesTypeMap    hosts injected binary of generated class 。要注入到Bootstrap类加载器中的类和字节码的映射
 *                                                                     key:全类名 value:字节码
 * @param typePool          to generate new class  。加载BootstrapInstrumentBoost的ClassLoader的类型池
 * @param templateClassName represents the class as template in this generation process. The templates are
 *                          pre-defined in SkyWalking agent core。 要进行增强的模板，里面就是环绕增强逻辑的模板
 *                        
 * @param methodsInterceptor 要进行增强逻辑的拦截增强类                         
 */
private static void generateDelegator(Map<String, byte[]> classesTypeMap, TypePool typePool,
    String templateClassName, String methodsInterceptor) {
    //要进行具体增强逻辑的拦截增强类名 + _internal
    String internalInterceptorName = internalDelegate(methodsInterceptor);
    try {
        //某个类加载器 已经加载了10个类，但这个类加载器的classpath下有400个类，
        //typePool.describe可以获取到这个类加载器的classpath下还没有加载类的描述信息
        TypeDescription templateTypeDescription = typePool.describe(templateClassName).resolve();
        //把模板通过ByteBuddy编译成字节码
        DynamicType.Unloaded interceptorType = new ByteBuddy().redefine(templateTypeDescription, ClassFileLocator.ForClassLoader
            .of(BootstrapInstrumentBoost.class.getClassLoader()))
                                                              .name(internalInterceptorName)
                                                              .field(named("TARGET_INTERCEPTOR"))
                                                              .value(methodsInterceptor)
                                                              .make();

        classesTypeMap.put(internalInterceptorName, interceptorType.getBytes());

        InstrumentDebuggingClass.INSTANCE.log(interceptorType);
    } catch (Exception e) {
        throw new PluginException("Generate Dynamic plugin failure", e);
    }
}
```

- 此方法是将模板类交给ByteBuddy去编译成字节码，改了新的类名，并将TARGET_INTERCEPTOR属性赋值为插件拦截器全类名，然后就放入到classesTypeMap中
- 此Map是要注入到Bootstrap类加载器中的类和字节码的映射，key:全类名 value:字节码

接下来回到`BootstrapInstrumentBoost.inject(pluginFinder, instrumentation, agentBuilder, edgeClasses)`方法，继续分析剩下的部分

### ClassInjector.UsingUnsafe.Factory.resolve(instrumentation)

```java
/**
 * 把一些必要的类注入到Boostrap类加载器中 为了解决Bootstrap类加载器不能访问App类加载器中的内容的问题
 * */
ClassInjector.UsingUnsafe.Factory factory = ClassInjector.UsingUnsafe.Factory.resolve(instrumentation);
factory.make(null, null).injectRaw(classesTypeMap);
agentBuilder = agentBuilder.with(new AgentBuilder.InjectionStrategy.UsingUnsafe.OfFactory(factory));
```

将之前生成模版的方法中，类和字节码的映射的Map`instrumentation`,注入到`Bootstrap ClassLoader`,此步骤是使用模版进行字节码增强的前提

## JDK类库方法的增强过程

想让我们回到`ClassEnhancePluginDefine#enhanceInstance`，再看一下实例方法的在进行增强是的判断逻辑

```java
if (existedConstructorInterceptPoint) {
    //获取所有构造方法的切点
    for (ConstructorInterceptPoint constructorInterceptPoint : constructorInterceptPoints) {
        //要增加的类是Bootstrap类加载器加载的
        if (isBootstrapInstrumentation()) {
            newClassBuilder = newClassBuilder.constructor(constructorInterceptPoint.getConstructorMatcher())
                                             .intercept(SuperMethodCall.INSTANCE.andThen(MethodDelegation.withDefaultConfiguration()
                                                                                                         .to(BootstrapInstrumentBoost
                                                                                                             .forInternalDelegateClass(constructorInterceptPoint
                                                                                                                 .getConstructorInterceptor()))));
        } else {
            newClassBuilder = newClassBuilder.constructor(constructorInterceptPoint.getConstructorMatcher())
                                             .intercept(SuperMethodCall.INSTANCE.andThen(MethodDelegation.withDefaultConfiguration()
                                                                                                         .to(new ConstructorInter(constructorInterceptPoint
                                                                                                             .getConstructorInterceptor(), classLoader))));
        }
    }
}

/**
 * 3. enhance instance methods
 */
if (existedMethodsInterceptPoints) {
    //获取所有实例方法的切点
    for (InstanceMethodsInterceptPoint instanceMethodsInterceptPoint : instanceMethodsInterceptPoints) {
        String interceptor = instanceMethodsInterceptPoint.getMethodsInterceptor();
        if (StringUtil.isEmpty(interceptor)) {
            throw new EnhanceException("no InstanceMethodsAroundInterceptor define to enhance class " + enhanceOriginClassName);
        }
        ElementMatcher.Junction<MethodDescription> junction = not(isStatic()).and(instanceMethodsInterceptPoint.getMethodsMatcher());
        if (instanceMethodsInterceptPoint instanceof DeclaredInstanceMethodsInterceptPoint) {
            //拦截到的方法必须是当前类上的 注解匹配到的方法有可能不是当前类上的
            junction = junction.and(ElementMatchers.<MethodDescription>isDeclaredBy(typeDescription));
        }
        if (instanceMethodsInterceptPoint.isOverrideArgs()) {
            //要增加的类是Bootstrap类加载器加载的
            if (isBootstrapInstrumentation()) {
                newClassBuilder = newClassBuilder.method(junction)
                                                 .intercept(MethodDelegation.withDefaultConfiguration()
                                                                            .withBinders(Morph.Binder.install(OverrideCallable.class))
                                                                            .to(BootstrapInstrumentBoost.forInternalDelegateClass(interceptor)));
            } else {
                newClassBuilder = newClassBuilder.method(junction)
                                                 .intercept(MethodDelegation.withDefaultConfiguration()
                                                                            .withBinders(Morph.Binder.install(OverrideCallable.class))
                                                                            .to(new InstMethodsInterWithOverrideArgs(interceptor, classLoader)));
            }
        } else {
            //要增加的类是Bootstrap类加载器加载的
            if (isBootstrapInstrumentation()) {
                newClassBuilder = newClassBuilder.method(junction)
                                                 .intercept(MethodDelegation.withDefaultConfiguration()
                                                                            .to(BootstrapInstrumentBoost.forInternalDelegateClass(interceptor)));
            } else {
                newClassBuilder = newClassBuilder.method(junction)
                                                 .intercept(MethodDelegation.withDefaultConfiguration()
                                                                            .to(new InstMethodsInter(interceptor, classLoader)));
            }
        }
    }
}
```

能看到，如果是要增强的类是JDK类库中的，都是调用到`BootstrapInstrumentBoost.forInternalDelegateClass`的方法

### BootstrapInstrumentBoost.forInternalDelegateClass

```java
public static Class forInternalDelegateClass(String methodsInterceptor) {
    try {
        return Class.forName(internalDelegate(methodsInterceptor));
    } catch (ClassNotFoundException e) {
        throw new PluginException(e.getMessage(), e);
    }
}

public static String internalDelegate(String methodsInterceptor) {
    return methodsInterceptor + "_internal";
}
```

通过Class.forName()加载插件拦截器全类名+`_internal`的类，这个类在Agent启动流程根据模板类生成并注入到Bootstrap ClassLoader中，所以这里是能加载到，再看一下模版`InstanceMethodInterTemplate`

```java
/**
 * --------CLASS TEMPLATE---------
 * <p>Author, Wu Sheng </p>
 * <p>Comment, don't change this unless you are 100% sure the agent core mechanism for bootstrap class
 * instrumentation.</p>
 * <p>Date, 24th July 2019</p>
 * -------------------------------
 * <p>
 * This class wouldn't be loaded in real env. This is a class template for dynamic class generation.
 * 
 * 这个类是不会被加载的,这是一个类模板用于动态类生成
 */
public class InstanceMethodInterTemplate {
    /**
     * This field is never set in the template, but has value in the runtime.
     */
    private static String TARGET_INTERCEPTOR;

    private static InstanceMethodsAroundInterceptor INTERCEPTOR;
    private static IBootstrapLog LOGGER;

    /**
     * Intercept the target instance method.
     *
     * @param obj          target class instance.
     * @param allArguments all method arguments
     * @param method       method description.
     * @param zuper        the origin call ref.
     * @return the return value of target instance method.
     * @throws Exception only throw exception because of zuper.call() or unexpected exception in sky-walking ( This is a
     *                   bug, if anything triggers this condition ).
     */
    @RuntimeType
    public static Object intercept(@This Object obj, @AllArguments Object[] allArguments, @SuperCall Callable<?> zuper,
        @Origin Method method) throws Throwable {
        EnhancedInstance targetObject = (EnhancedInstance) obj;

        prepare();

        MethodInterceptResult result = new MethodInterceptResult();
        try {
            if (INTERCEPTOR != null) {
                INTERCEPTOR.beforeMethod(targetObject, method, allArguments, method.getParameterTypes(), result);
            }
        } catch (Throwable t) {
            if (LOGGER != null) {
                LOGGER.error(t, "class[{}] before method[{}] intercept failure", obj.getClass(), method.getName());
            }
        }

        Object ret = null;
        try {
            if (!result.isContinue()) {
                ret = result._ret();
            } else {
                ret = zuper.call();
            }
        } catch (Throwable t) {
            try {
                if (INTERCEPTOR != null) {
                    INTERCEPTOR.handleMethodException(targetObject, method, allArguments, method.getParameterTypes(), t);
                }
            } catch (Throwable t2) {
                if (LOGGER != null) {
                    LOGGER.error(t2, "class[{}] handle method[{}] exception failure", obj.getClass(), method.getName());
                }
            }
            throw t;
        } finally {
            try {
                if (INTERCEPTOR != null) {
                    ret = INTERCEPTOR.afterMethod(targetObject, method, allArguments, method.getParameterTypes(), ret);
                }
            } catch (Throwable t) {
                if (LOGGER != null) {
                    LOGGER.error(t, "class[{}] after method[{}] intercept failure", obj.getClass(), method.getName());
                }
            }
        }

        return ret;
    }

    /**
     * Prepare the context. Link to the agent core in AppClassLoader.
     * - 让BootstrapClassLoader 和 AgentClassloader能够相通
     *   - 获取到ILog生成日志对象
     *   - 获取到插件自定义的拦截器增强类实例
     * - 替代非JDK核心类库插件运行逻辑里的interceptor = InterceptorInstanceLoader.load(instanceMethodsAroundInterceptorClassName, classLoader);  
     */
    private static void prepare() {
        if (INTERCEPTOR == null) {
            ClassLoader loader = BootstrapInterRuntimeAssist.getAgentClassLoader();

            if (loader != null) {
                IBootstrapLog logger = BootstrapInterRuntimeAssist.getLogger(loader, TARGET_INTERCEPTOR);
                if (logger != null) {
                    LOGGER = logger;

                    INTERCEPTOR = BootstrapInterRuntimeAssist.createInterceptor(loader, TARGET_INTERCEPTOR, LOGGER);
                }
            } else {
                LOGGER.error("Runtime ClassLoader not found when create {}." + TARGET_INTERCEPTOR);
            }
        }
    }
}
```

- JDK类库的类做增强会交给模板`InstanceMethodInterTemplate`生成的类来处理，实际是模板中的`TARGET_INTERCEPTOR`赋值为插件拦截器全类名
- 和实例方法插桩的`InstMethodsInter`的`intercept()`方法相比这里多调用了一个`prepare()`方法
- `prepare()`方法是让`BootstrapClassLoader`能够和`AgentClassLoader`相同的关键

### prepare()

```java
/**
 * Prepare the context. Link to the agent core in AppClassLoader.
 * - 让BootstrapClassLoader 和 AgentClassloader能够相通
 *   - 获取到ILog生成日志对象
 *   - 获取到插件自定义的拦截器增强类实例
 * - 替代非JDK核心类库插件运行逻辑里的interceptor = InterceptorInstanceLoader.load(instanceMethodsAroundInterceptorClassName, classLoader);  
 */
private static void prepare() {
    if (INTERCEPTOR == null) {
        ClassLoader loader = BootstrapInterRuntimeAssist.getAgentClassLoader();

        if (loader != null) {
            IBootstrapLog logger = BootstrapInterRuntimeAssist.getLogger(loader, TARGET_INTERCEPTOR);
            if (logger != null) {
                LOGGER = logger;

                INTERCEPTOR = BootstrapInterRuntimeAssist.createInterceptor(loader, TARGET_INTERCEPTOR, LOGGER);
            }
        } else {
            LOGGER.error("Runtime ClassLoader not found when create {}." + TARGET_INTERCEPTOR);
        }
    }
}
```

### BootstrapInterRuntimeAssist

```java
public class BootstrapInterRuntimeAssist {
    private static final String AGENT_CLASSLOADER_DEFAULT = "org.apache.skywalking.apm.agent.core.plugin.loader.AgentClassLoader";
    private static final String DEFAULT_AGENT_CLASSLOADER_INSTANCE = "DEFAULT_LOADER";
    private static final String LOG_MANAGER_CLASS = "org.apache.skywalking.apm.agent.core.plugin.bootstrap.BootstrapPluginLogBridge";
    private static final String LOG_MANAGER_GET_LOGGER_METHOD = "getLogger";
    private static final PrintStream OUT = System.out;

    public static ClassLoader getAgentClassLoader() {
        try {
            ClassLoader loader = Thread.currentThread().getContextClassLoader();
            if (loader == null) {
                return null;
            }
            Class<?> agentClassLoaderClass = Class.forName(AGENT_CLASSLOADER_DEFAULT, true, loader);
            Field defaultLoaderField = agentClassLoaderClass.getDeclaredField(DEFAULT_AGENT_CLASSLOADER_INSTANCE);
            defaultLoaderField.setAccessible(true);
            ClassLoader defaultAgentClassLoader = (ClassLoader) defaultLoaderField.get(null);

            return defaultAgentClassLoader;
        } catch (Exception e) {
            e.printStackTrace(OUT);
            return null;
        }
    }

    public static IBootstrapLog getLogger(ClassLoader defaultAgentClassLoader, String interceptor) {
        try {
            Class<?> logManagerClass = Class.forName(LOG_MANAGER_CLASS, true, defaultAgentClassLoader);
            Method getLogger = logManagerClass.getMethod(LOG_MANAGER_GET_LOGGER_METHOD, String.class);
            return (IBootstrapLog) getLogger.invoke(null, interceptor + "_internal");
        } catch (Exception e) {
            e.printStackTrace(OUT);
            return null;
        }
    }

    public static <T> T createInterceptor(ClassLoader defaultAgentClassLoader, String className, IBootstrapLog log) {
        try {
            Class<?> interceptor = Class.forName(className, true, defaultAgentClassLoader);
            return (T) interceptor.newInstance();
        } catch (Exception e) {
            log.error(e, "Interceptor[{}] not found", className);
        }
        return null;
    }
}
```

### prepare()总结

- 获取到`AgentClassLoader`
- 用`AgentClassLoader`加载桥接器`BootstrapPluginLogBridge`类，然后调用`getLogger`方法传入`TARGET_INTERCEPTOR+_internal`得到这个传入的实际类名的`BootstrapPluginLogBridge`的对象
- 将得到的`BootstrapPluginLogBridge`赋给模板类的成员属性`LOGGER`
- 用`AgentClassLoader`加载插件自定义的拦截器实例

### 为什么要用prepare()来特意的利用桥接来绕一下呢

因为`InstanceMethodInterTemplate`生成的类是由`BootstrapClassLoader`去加载的，而日志对象和插件自定义的拦截器都是通过`AgentClassLoader`去加载的，`prepare()`方法的作用就是将`BootstrapClassLoader`和`AgentClassLoader`能够相同
![](/img/technologySharing/skywalkiing/AgentClassLoader继承BootstrapClassLoader.png)

举例说明:

- 如果`BootstrapClassLoader`加载的由`InstanceMethodInterTemplate`生成的类是`org.apache.skywalking.xxx.HttpClientInterceptor_internal`，`AgentClassLoader`加载了日志用到的`ILog`和插件拦截器`HttpClientIntercepotr`
- `AgentClassLoader`的顶层父类加载器为`BootstrapClassLoader`，根据双亲委派模型，从下往上加载是可以拿到的，但是从上往下加载是拿不到的,`BootstrapClassLoader`中不能拿到`ILog`和`HttpClientIntercepotr`，所以需要通过`prepare()`方法打通`BootstrapClassLoader`和`AgentClassLoader`

### 总结

- 准备工作，使用对应的Template模板来生成实际的拦截增强，实际类名为xxx_internal
- prepare()方法 
   - 将`BootstrapClassLoader`和`AgentClassLoader`能够相通
   - 获取到日志对象ILog
   - 实例化插件定义的拦截器，用来代替非JDK类库增强中的`InterceptorInstanceLoader.load(instanceMethodsAroundInterceptorClassName, classLoader)`
- 后续的增强逻辑和非JDK类库的流程相同
