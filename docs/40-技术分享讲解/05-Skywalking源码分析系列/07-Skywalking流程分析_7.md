---
slug: /tech-sharing/skywalking-source/skywalking-part-7
---

# Skywalking流程分析_7

## 前言

**this.enhance**

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

在上文中我们分析的静态方法的增强是如何做的，接下来我们来分析构造和实例方法

### ClassEnhancePluginDefine.enhanceInstance(typeDescription, newClassBuilder, classLoader, context)

```java
protected DynamicType.Builder<?> enhanceInstance(TypeDescription typeDescription,
    DynamicType.Builder<?> newClassBuilder, ClassLoader classLoader,
    EnhanceContext context) throws PluginException {
    //查找构造方法的切点
    ConstructorInterceptPoint[] constructorInterceptPoints = getConstructorsInterceptPoints();
    //查找实例方法的切点
    InstanceMethodsInterceptPoint[] instanceMethodsInterceptPoints = getInstanceMethodsInterceptPoints();
    String enhanceOriginClassName = typeDescription.getTypeName();
    boolean existedConstructorInterceptPoint = false;
    if (constructorInterceptPoints != null && constructorInterceptPoints.length > 0) {
        existedConstructorInterceptPoint = true;
    }
    boolean existedMethodsInterceptPoints = false;
    if (instanceMethodsInterceptPoints != null && instanceMethodsInterceptPoints.length > 0) {
        existedMethodsInterceptPoints = true;
    }

    /**
     * nothing need to be enhanced in class instance, maybe need enhance static methods.
     * 没有要增强的那么直接返回
     */
    if (!existedConstructorInterceptPoint && !existedMethodsInterceptPoints) {
        return newClassBuilder;
    }

    /**
     * Manipulate class source code.<br/>
     *
     * new class need:<br/>
     * 1.Add field, name {@link #CONTEXT_ATTR_NAME}.
     * 2.Add a field accessor for this field.
     *
     * And make sure the source codes manipulation only occurs once.
     * 
     */
    // 如果被拦截的类没有实现EnhancedInstance接口
    if (!typeDescription.isAssignableTo(EnhancedInstance.class)) {
        if (!context.isObjectExtended()) {
            //给要增强的类添加_$EnhancedClassField_ws字段，
            //并实现了EnhancedInstance接口的set/get方法，来获取这个字段
            //新增这个字段的作用是可以放置自己的数据，然后通过这两个set/get方法来存放和拿取
            newClassBuilder = newClassBuilder.defineField(
                CONTEXT_ATTR_NAME, Object.class, ACC_PRIVATE | ACC_VOLATILE)
                                             .implement(EnhancedInstance.class)
                                             .intercept(FieldAccessor.ofField(CONTEXT_ATTR_NAME));
            // 将记录状态EnhanceContext标识符设置为已新增新的字段或者实现新的接口                                 
            context.extendObjectCompleted();
        }
    }

    /**
     * 2. enhance constructors
     * 构造器增强逻辑
     */
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
     * 实例方法增强逻辑
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

    return newClassBuilder;
}
```

### 总结

- 给要增强的类添加`_$EnhancedClassField_ws`字段，并实现了`EnhancedInstance`接口的set/get方法，来获取这个字段。新增这个字段的作用是可以放置自己的数据，然后通过这两个set/get方法来存放和拿取
- 执行构造器增强逻辑
- 执行实例方法增强逻辑

下面我们来逐步分析构造器增强和实例方法增强

## 构造器增强

非JDK的类库是被`ConstructorInter`所增强的

```java
newClassBuilder = newClassBuilder.constructor(constructorInterceptPoint.getConstructorMatcher())
                     .intercept(SuperMethodCall.INSTANCE.andThen(MethodDelegation.withDefaultConfiguration()
                                                         .to(new ConstructorInter(constructorInterceptPoint
                                                             .getConstructorInterceptor(), classLoader))));
```

### ConstructorInter

```java
public class ConstructorInter {
    private static final ILog LOGGER = LogManager.getLogger(ConstructorInter.class);

    private InstanceConstructorInterceptor interceptor;

    /**
     * @param constructorInterceptorClassName class full name.
     */
    public ConstructorInter(String constructorInterceptorClassName, ClassLoader classLoader) throws PluginException {
        try {
            // 实例化自定义的拦截器
            //对于同一份字节码，如果由不同的类加载器进行加载，那么加载出来的两个实例不相同
            interceptor = InterceptorInstanceLoader.load(constructorInterceptorClassName, classLoader);
        } catch (Throwable t) {
            throw new PluginException("Can't create InstanceConstructorInterceptorV2.", t);
        }
    }

    /**
     * Intercept the target constructor.
     *
     * @param obj          target class instance.
     * @param allArguments all constructor arguments
     */
    @RuntimeType
    public void intercept(@This Object obj, @AllArguments Object[] allArguments) {
        try {
            //这里向上转型为EnhancedInstance的原因是为了使用之前新添加的_$EnhancedClassField_ws字段
            //使用setSkyWalkingDynamicField/getSkyWalkingDynamicField方法来存放和获取自己的数据
            EnhancedInstance targetObject = (EnhancedInstance) obj;
            //在原来的构造方法执行完后，再执行
            interceptor.onConstruct(targetObject, allArguments);
        } catch (Throwable t) {
            LOGGER.error("ConstructorInter failure.", t);
        }

    }
}
```

### ConstructorInter逻辑总结

- 构造方法中实例化自定义的拦截器
- 在原先的构造方法执行完，再执行`interceptor.onConstruct(targetObject, allArguments)`

以`kafka`为例

```java
public class KafkaProducerInstrumentation extends AbstractKafkaInstrumentation {

    public static final String ENHANCE_CLASS = "org.apache.kafka.clients.producer.KafkaProducer";
    public static final String CONSTRUCTOR_INTERCEPTOR_CLASS = "org.apache.skywalking.apm.plugin.kafka.ProducerConstructorInterceptor";
    public static final String CONSTRUCTOR_INTERCEPTOR_FLAG = "org.apache.kafka.clients.producer.ProducerConfig";

    @Override
    public ConstructorInterceptPoint[] getConstructorsInterceptPoints() {
        return new ConstructorInterceptPoint[] {
            new ConstructorInterceptPoint() {
                @Override
                public ElementMatcher<MethodDescription> getConstructorMatcher() {
                    return takesArgumentWithType(0, CONSTRUCTOR_INTERCEPTOR_FLAG);
                }

                @Override
                public String getConstructorInterceptor() {
                    return CONSTRUCTOR_INTERCEPTOR_CLASS;
                }
            }
        };
    }

    @Override
    protected ClassMatch enhanceClass() {
        return byName(ENHANCE_CLASS);
    }
}
```

- 这里拦截的是`org.apache.kafka.clients.producer.KafkaProducer`类的构造方法
- 拦截具体的构造方法是第一个参数类型为`org.apache.kafka.clients.producer.ProducerConfig`
- 拦截的执行类是`org.apache.skywalking.apm.plugin.kafka.ProducerConstructorInterceptor`

```java
public class ProducerConstructorInterceptor implements InstanceConstructorInterceptor {

    @Override
    public void onConstruct(EnhancedInstance objInst, Object[] allArguments) {
        ProducerConfig config = (ProducerConfig) allArguments[0];
        objInst.setSkyWalkingDynamicField(StringUtil.join(';', config.getList("bootstrap.servers")
                                                                     .toArray(new String[0])));
    }
}
```

**注意**

能看到这里使用`_$EnhancedClassField_ws`字段来保存一些数据方便后续使用，这也是为什么要执行这段逻辑，设置此字段的原因

```java
if (!typeDescription.isAssignableTo(EnhancedInstance.class)) {
  if (!context.isObjectExtended()) {
      //给要增强的类添加_$EnhancedClassField_ws字段，
      //并实现了EnhancedInstance接口的set/get方法，来获取这个字段
      //新增这个字段的作用是可以放置自己的数据，然后通过这两个set/get方法来存放和拿取
      newClassBuilder = newClassBuilder.defineField(
          CONTEXT_ATTR_NAME, Object.class, ACC_PRIVATE | ACC_VOLATILE)
                                       .implement(EnhancedInstance.class)
                                       .intercept(FieldAccessor.ofField(CONTEXT_ATTR_NAME));
      context.extendObjectCompleted();
  }
}
```

### 实例方法增强

首先看这段逻辑

```java
ElementMatcher.Junction<MethodDescription> junction = not(isStatic()).and(instanceMethodsInterceptPoint.getMethodsMatcher());
if (instanceMethodsInterceptPoint instanceof DeclaredInstanceMethodsInterceptPoint) {
    //拦截到的方法必须是当前类上的 注解匹配到的方法有可能不是当前类上的
    junction = junction.and(ElementMatchers.<MethodDescription>isDeclaredBy(typeDescription));
}
```

- 比如说，要对Student.add()方法增强，那么直接指定类名即可，但如果想对所有Controller的SpringMVC控制层的方法进行增强，那么就要使用注解。
- 但有可能通过注解匹配到的方法不是当前类上的，所以判断如果拦截点为`DeclaredInstanceMethodsInterceptPoint`会新增匹配条件：获取到的方法必须是当前类上的
非JDK的类库是被`ConstructorInter`所增强的

我们依旧先分析不是JDK类库的类

### 不修改原方法的参数

```java
newClassBuilder = newClassBuilder.method(junction)
                                .intercept(MethodDelegation.withDefaultConfiguration()
                                .to(new InstMethodsInter(interceptor, classLoader)));
```

具体逻辑在`InstMethodsInter`中

### InstMethodsInter

```java
public class InstMethodsInter {
    private static final ILog LOGGER = LogManager.getLogger(InstMethodsInter.class);

    /**
     * An {@link InstanceMethodsAroundInterceptor} This name should only stay in {@link String}, the real {@link Class}
     * type will trigger classloader failure. If you want to know more, please check on books about Classloader or
     * Classloader appointment mechanism.
     */
    private InstanceMethodsAroundInterceptor interceptor;

    /**
     * @param instanceMethodsAroundInterceptorClassName class full name.
     */
    public InstMethodsInter(String instanceMethodsAroundInterceptorClassName, ClassLoader classLoader) {
        try {
            //使用自定义加载器加载拦截器
            interceptor = InterceptorInstanceLoader.load(instanceMethodsAroundInterceptorClassName, classLoader);
        } catch (Throwable t) {
            throw new PluginException("Can't create InstanceMethodsAroundInterceptor.", t);
        }
    }

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
    public Object intercept(@This Object obj, @AllArguments Object[] allArguments, @SuperCall Callable<?> zuper,
        @Origin Method method) throws Throwable {
        EnhancedInstance targetObject = (EnhancedInstance) obj;

        MethodInterceptResult result = new MethodInterceptResult();
        try {
            //前置增强
            interceptor.beforeMethod(targetObject, method, allArguments, method.getParameterTypes(), result);
        } catch (Throwable t) {
            LOGGER.error(t, "class[{}] before method[{}] intercept failure", obj.getClass(), method.getName());
        }

        Object ret = null;
        try {
            if (!result.isContinue()) {
                ret = result._ret();
            } else {
                //执行原有方法
                ret = zuper.call();
            }
        } catch (Throwable t) {
            try {
                //异常增强
                interceptor.handleMethodException(targetObject, method, allArguments, method.getParameterTypes(), t);
            } catch (Throwable t2) {
                LOGGER.error(t2, "class[{}] handle method[{}] exception failure", obj.getClass(), method.getName());
            }
            throw t;
        } finally {
            try {
                //后置增强
                ret = interceptor.afterMethod(targetObject, method, allArguments, method.getParameterTypes(), ret);
            } catch (Throwable t) {
                LOGGER.error(t, "class[{}] after method[{}] intercept failure", obj.getClass(), method.getName());
            }
        }
        return ret;
    }
}
```

### 修改原方法的参数

```java
newClassBuilder = newClassBuilder.method(junction)
                  .intercept(MethodDelegation.withDefaultConfiguration()
                                 .withBinders(Morph.Binder.install(OverrideCallable.class))
                                 .to(new InstMethodsInterWithOverrideArgs(interceptor, classLoader)));
```

具体逻辑在`InstMethodsInterWithOverrideArgs`中

### InstMethodsInterWithOverrideArgs

```java
public class InstMethodsInterWithOverrideArgs {
    private static final ILog LOGGER = LogManager.getLogger(InstMethodsInterWithOverrideArgs.class);

    /**
     * An {@link InstanceMethodsAroundInterceptor} This name should only stay in {@link String}, the real {@link Class}
     * type will trigger classloader failure. If you want to know more, please check on books about Classloader or
     * Classloader appointment mechanism.
     */
    private InstanceMethodsAroundInterceptor interceptor;

    /**
     * @param instanceMethodsAroundInterceptorClassName class full name.
     */
    public InstMethodsInterWithOverrideArgs(String instanceMethodsAroundInterceptorClassName, ClassLoader classLoader) {
        try {
            interceptor = InterceptorInstanceLoader.load(instanceMethodsAroundInterceptorClassName, classLoader);
        } catch (Throwable t) {
            throw new PluginException("Can't create InstanceMethodsAroundInterceptor.", t);
        }
    }

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
    public Object intercept(@This Object obj, @AllArguments Object[] allArguments, @Origin Method method,
        @Morph OverrideCallable zuper) throws Throwable {
        EnhancedInstance targetObject = (EnhancedInstance) obj;

        MethodInterceptResult result = new MethodInterceptResult();
        try {
            interceptor.beforeMethod(targetObject, method, allArguments, method.getParameterTypes(), result);
        } catch (Throwable t) {
            LOGGER.error(t, "class[{}] before method[{}] intercept failure", obj.getClass(), method.getName());
        }

        Object ret = null;
        try {
            if (!result.isContinue()) {
                ret = result._ret();
            } else {
                ret = zuper.call(allArguments);
            }
        } catch (Throwable t) {
            try {
                interceptor.handleMethodException(targetObject, method, allArguments, method.getParameterTypes(), t);
            } catch (Throwable t2) {
                LOGGER.error(t2, "class[{}] handle method[{}] exception failure", obj.getClass(), method.getName());
            }
            throw t;
        } finally {
            try {
                ret = interceptor.afterMethod(targetObject, method, allArguments, method.getParameterTypes(), ret);
            } catch (Throwable t) {
                LOGGER.error(t, "class[{}] after method[{}] intercept failure", obj.getClass(), method.getName());
            }
        }
        return ret;
    }
}
```

可以看到实例方法的增强逻辑和静态方法的大致相同

这里面有个问题，**为什么用**`**zuper.call()**`**执行原方法的调用，不能替换成**`**method.invoke(clazz.newInstance())**`**吗？**

这里需要借助一个Java实时反编译工具friday，看看项目执行SkyWalking Agent之后反编译的结构

原始类：

```java
@RestController
@RequestMapping("/api/hello")
public class UserController {

    @GetMapping
    public String sayHello() {
        return "hello";
    }

}
```

增强后：

```java
@RestController
@RequestMapping(value={"/test"})
public class TestController
implements EnhancedInstance {
    private volatile Object _$EnhancedClassField_ws;
    public static volatile /* synthetic */ InstMethodsInter delegate$mvblfc0;
    public static volatile /* synthetic */ InstMethodsInter delegate$hfbkh30;
    public static volatile /* synthetic */ ConstructorInter delegate$gr07501;
    private static final /* synthetic */ Method cachedValue$kkbY4FHP$ldstch2;
    public static volatile /* synthetic */ InstMethodsInter delegate$lvp69q1;
    public static volatile /* synthetic */ InstMethodsInter delegate$mpv7fs0;
    public static volatile /* synthetic */ ConstructorInter delegate$v0q1e31;
    private static final /* synthetic */ Method cachedValue$Hx3zGNqH$ldstch2;

    public TestController() {
        this(null);
        delegate$v0q1e31.intercept((Object)this, new Object[0]);
    }

    private /* synthetic */ TestController(auxiliary.YsFzTfDy ysFzTfDy) {
    }

    @RequestMapping
    public String test() {
        return (String)delegate$lvp69q1.intercept((Object)this, new Object[0], (Callable)new auxiliary.pEJy33Ip(this), cachedValue$Hx3zGNqH$ldstch2);
    }

    private /* synthetic */ String test$original$70VVkKcL() {
        return "sucess";
    }

    static {
        ClassLoader.getSystemClassLoader().loadClass("org.apache.skywalking.apm.dependencies.net.bytebuddy.dynamic.Nexus").getMethod("initialize", Class.class, Integer.TYPE).invoke(null, TestController.class, 544534948);
        cachedValue$Hx3zGNqH$ldstch2 = TestController.class.getMethod("test", new Class[0]);
    }

    final /* synthetic */ String test$original$70VVkKcL$accessor$Hx3zGNqH() {
        return this.test$original$70VVkKcL();
    }
}
```

然后还要再看一下SkyWalkingAgent.premain()

```java
public static void premain(String agentArgs, Instrumentation instrumentation) throws PluginException {
    final PluginFinder pluginFinder;
    //省略...
                //指定byteBuddy要拦截的类
    agentBuilder.type(pluginFinder.buildMatch())
                //指定字节码增强的工具
                .transform(new Transformer(pluginFinder))
                //redefine和retransformation的区别在于是否保留修改前的内容
                .with(AgentBuilder.RedefinitionStrategy.RETRANSFORMATION)
                .with(new RedefinitionListener())
                .with(new Listener())
                //将agent安装到instrumentation
                .installOn(instrumentation);
    //省略...            
}
```

- `redefine`和`retransform`的区别在于是否保留修改前的内容，从反编译的内容可以看到test()方法的内容已经被修改掉了，原方法被重命名为test$original$+随机字符串
- 新的test()方法中调用了InstMethodsInter的intercept()方法，最后传入的intercept()的method参数是被修改后的test()方法，不再指向原生的test()方法，如果在InstMethodsInter使用method.invoke(clazz.newInstance())就相当于自己调自己，就会死递归下去

### 总结

- 构造方法 
   - 是JDK类库的类
   - 不是JDK类库的类 
      - 在原有的构造方法执行完后，在执行`onContruct`进行增强
- 实例方法 
   - 和静态方法相同

以上就是构造方法和实例方法增强逻辑。

在我们执行增强逻辑前，我们先看下插件拦截类的加载过程

- 静态方法增强前的加载

```java
//clazz 要修改的字节码的原生类
StaticMethodsAroundInterceptor interceptor = InterceptorInstanceLoader.load(staticMethodsAroundInterceptorClassName, clazz
            .getClassLoader());
```

- 构造/实例方法前的加载

```java
//当前拦截到的类的类加载器
interceptor = InterceptorInstanceLoader.load(instanceMethodsAroundInterceptorClassName, classLoader);
```

这个加载的方法很重要，它是将插件拦截类和业务执行类的类加载器进行融合的关键，也是skywalking的精髓所在，下篇文章我们来详细的分析下。
