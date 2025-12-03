---
slug: /tech-sharing/skywalking-source/skywalking-part-8
---

# Skywalking流程分析_8

## 前言

在之前的文章中我们将，静态方法、构造方法、实例方法的增强逻辑都分析完毕，但在增强前，对于拦截类的加载是至关重要的，下面我们就来详细的分析

## 增强插件的加载

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

### 问题

可以看到静态方法增强可以直接通过`clazz.getClassLoader()`获取类加载器，而实例方法增强需要从上层方法传递`ClassLoader`，这是为什么？

- 静态方法增强直接通过clazz.getClassLoader()获取类加载器是因为静态方法直接绑定了类
- 构造/实例方法增强需要从上层传递ClassLoader有两个原因 
   - 一份字节码可能被多个ClassLoader加载，这样加载出来的每个实例都不相等，所以必须要绑定好ClassLoader
   - 加载插件拦截器可能会出现无法加载的情况，如果把加载过程放到了`intercept`中，会和加载失败的异常和业务异常会混淆在一起，如果放到`ConstructorInter`的构造方法中进行加载，就会把异常分割开

这个问题解决了，下面来详细加载的过程

### InterceptorInstanceLoader

```java
public class InterceptorInstanceLoader {

    private static ConcurrentHashMap<String, Object> INSTANCE_CACHE = new ConcurrentHashMap<String, Object>();
    private static ReentrantLock INSTANCE_LOAD_LOCK = new ReentrantLock();
    /**
     * key -> 当前插件要拦截的这个目标类的类加载器
     * value -> AgentClassLoader类加载器 作用：能加载当前插件，也能加载要拦截的这个目标类
     * */
    private static Map<ClassLoader, ClassLoader> EXTEND_PLUGIN_CLASSLOADERS = new HashMap<ClassLoader, ClassLoader>();

    /**
     * Load an instance of interceptor, and keep it singleton. Create {@link AgentClassLoader} for each
     * targetClassLoader, as an extend classloader. It can load interceptor classes from plugins, activations folders.
     *
     * @param className         the interceptor class, which is expected to be found
     * @param targetClassLoader the class loader for current application context
     * @param <T>               expected type
     * @return the type reference.
     */
    public static <T> T load(
            //要进行增强逻辑的增强类
            String className,
            //当前拦截到的类的类加载器
            ClassLoader targetClassLoader) throws IllegalAccessException, InstantiationException, ClassNotFoundException, AgentPackageNotFoundException {
        if (targetClassLoader == null) {
            targetClassLoader = InterceptorInstanceLoader.class.getClassLoader();
        }
        //举例说明这个key值
        //com.test.MyTest_OF_com.test.classloader.MyTestClassLoader@123
        String instanceKey = className + "_OF_" + targetClassLoader.getClass()
                                                                   .getName() + "@" + Integer.toHexString(targetClassLoader
            .hashCode());
        // className所代表的拦截器的实例 对于同一个classloader而言相同的类只加载一次                                                           
        Object inst = INSTANCE_CACHE.get(instanceKey);
        if (inst == null) {
            INSTANCE_LOAD_LOCK.lock();
            ClassLoader pluginLoader;
            try {
                pluginLoader = EXTEND_PLUGIN_CLASSLOADERS.get(targetClassLoader);
                if (pluginLoader == null) {
                    /**
                     * <===========!!!重点!!!==========>
                     * 这里用AgentClassLoader并把targetClassLoader传入的原因是
                     * 要进行增强逻辑的增强类是由AgentClassLoader进行加载的，而要增强的目标类不知道是哪个类加载器。
                     * 但是增强类的逻辑是要在目标类中进行切入的，这就要求增强类和目标类的类加载器必须是同一个才行。
                     * 所以这里利用了类加载器的双亲委派机制来进行加载，将目标类的类加载器作为AgentClassLoader的父类加载器
                     * */
                    pluginLoader = new AgentClassLoader(targetClassLoader);
                    EXTEND_PLUGIN_CLASSLOADERS.put(targetClassLoader, pluginLoader);
                }
            } finally {
                INSTANCE_LOAD_LOCK.unlock();
            }
            // 通过pluginLoader来实例化拦截器对象
            inst = Class.forName(className, true, pluginLoader).newInstance();
            if (inst != null) {
                INSTANCE_CACHE.put(instanceKey, inst);
            }
        }

        return (T) inst;
    }
}
```

### 总结

- 对于每个插件的增强类都初始化了`AgentClassLoader`来加载增强类
- 将当前拦截到的类的类加载器传入`AgentClassLoader`，作为其父的类加载器

#### 问题1：为什么将当前拦截到的类的类加载器传入**`AgentClassLoader`**，作为其父的类加载器

将`targetClassLoader`作为`agentClassLoader`的父类加载器，这样通过双亲委派模型模型，`targetClassLoader可以加载应用系统中的类`

以阿里数据源druid举例：假设应用系统中数据源`DruidDataSourceStatManager`的类是由AppClassLoader加载的

`PoolingAddDruidDataSourceInterceptor`要修改`DruidDataSourceStatManager`的字节码，两个类需要能交互，前提就是`PoolingAddDruidDataSourceInterceptor`能通过某种方式访问到`DruidDataSourceStatManager`

![](/img/technologySharing/skywalkiing/类加载.png)
让`AgentClassLoader`的父类加载器指向加载druid的`AppClassLoader`，当`PoolingAddDruidDataSourceInterceptor`去操作`DruidDataSourceStatManager`类时，通过双亲委派机制，`AgentClassLoader`的父类加载器`AppClassLoader`能加载到`DruidDataSourceStatManager`


**问题2：为什么每个插件的增强类都要初始化一个`AgentClassLoader`来加载增强类，不能共用一个吗**


如果只实例化一个`AgentClassLoader`实例，由于应用系统中的类不存在于`AgentClassLoader`的classpath下，那此时AgentClassLoader加载不到应用系统中的类。

比如说第一个业务类是由`BootStrapClassLoader`加载的，第二个业务类是由`AppClassLoader`加载的，根据双亲委派机制那么第二个业务类增强就会有问题，因为在一个业务类增强时`AgentClassLoader`的父的类加载器已经是`BootStrapClassLoader`了，是加载不到`AppClassLoader`的内容的

以上关于非JDK类库的静态方法、构造方法、实例方法都已经分析完毕，后面的文章会详细分析JDK类库中的类是如何被增强拦截的
