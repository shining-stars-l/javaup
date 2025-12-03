---
slug: /tech-sharing/skywalking-source/skywalking-part-5
---

# Skywalking流程分析_5

## SkyWalkingAgent.Transformer#transform

此方法就是进行字节码增强的过程

```java
private static class Transformer implements AgentBuilder.Transformer {
    private PluginFinder pluginFinder;

    Transformer(PluginFinder pluginFinder) {
        this.pluginFinder = pluginFinder;
    }

    @Override
    public DynamicType.Builder<?> transform(
                                    //当前拦截到的类的字节码
                                    final DynamicType.Builder<?> builder,
                                    //可以理解成class 包括类的描述信息                                
                                    final TypeDescription typeDescription,
                                    //当前拦截到的类的类加载器
                                    final ClassLoader classLoader,
                                    final JavaModule javaModule,
                                    final ProtectionDomain protectionDomain) {
        //如果当前拦截的类的类加载器是URLClassLoader类型，则进行收集
        LoadedLibraryCollector.registerURLClassLoader(classLoader);
        //找到对此类匹配的所有插件
        List<AbstractClassEnhancePluginDefine> pluginDefines = pluginFinder.find(typeDescription);
        if (pluginDefines.size() > 0) {
            DynamicType.Builder<?> newBuilder = builder;
            //增强上下文
            EnhanceContext context = new EnhanceContext();
            for (AbstractClassEnhancePluginDefine define : pluginDefines) {
                //调用每个插件的define()方法去做字节码增强
                DynamicType.Builder<?> possibleNewBuilder = define.define(
                    typeDescription, newBuilder, classLoader, context);
                if (possibleNewBuilder != null) {
                    newBuilder = possibleNewBuilder;
                }
            }
            if (context.isEnhanced()) {
                LOGGER.debug("Finish the prepare stage for {}.", typeDescription.getName());
            }
            //被所有匹配的插件修改完后最终字节码
            return newBuilder;
        }

        LOGGER.debug("Matched class {}, but ignore by finding mechanism.", typeDescription.getTypeName());
        //原始字节码
        return builder;
    }
}
```

##总结：

- 找到对此类匹配的所有插件
- 如果找到有匹配上的插件，调用每个插件的define()方法去做字节码增强，然后增强后的字节码
- 如果没有找到匹配的插件，则返回原始字节码

### 找到对此类匹配的所有插件

**pluginFinder.find(typeDescription)**

```java
public class PluginFinder {
    
    /**
     * Map的泛型为<String,List>的原因是对于同一个类，可能会有多个插件都要对这个类进行字节码增加
     * 
     * key -> 目标类
     * value -> 所有可以对这个目标类生效的插件
     * */
    private final Map<String, LinkedList<AbstractClassEnhancePluginDefine>> nameMatchDefine = new HashMap<String, LinkedList<AbstractClassEnhancePluginDefine>>();
    private final List<AbstractClassEnhancePluginDefine> signatureMatchDefine = new ArrayList<AbstractClassEnhancePluginDefine>();
    private final List<AbstractClassEnhancePluginDefine> bootstrapClassMatchDefine = new ArrayList<AbstractClassEnhancePluginDefine>();
    private static boolean IS_PLUGIN_INIT_COMPLETED = false;

    
    
    /***
     * 得到对指定类型生效的所有匹配插件，包括命名查找、间接匹配查找
     */
    public List<AbstractClassEnhancePluginDefine> find(TypeDescription typeDescription) {
        List<AbstractClassEnhancePluginDefine> matchedPlugins = new LinkedList<AbstractClassEnhancePluginDefine>();
        String typeName = typeDescription.getTypeName();
        if (nameMatchDefine.containsKey(typeName)) {
            matchedPlugins.addAll(nameMatchDefine.get(typeName));
        }

        for (AbstractClassEnhancePluginDefine pluginDefine : signatureMatchDefine) {
            IndirectMatch match = (IndirectMatch) pluginDefine.enhanceClass();
            if (match.isMatch(typeDescription)) {
                matchedPlugins.add(pluginDefine);
            }
        }

        return matchedPlugins;
    }

}
```

### EnhanceContext context = new EnhanceContext()

此类的作用是用作是否增强的标识

```java
/**
 * The <code>EnhanceContext</code> represents the context or status for processing a class.
 * <p>
 * Based on this context, the plugin core {@link ClassEnhancePluginDefine} knows how to process the specific steps for
 * every particular plugin.
 * 
 * 此类的作用是记录当前被拦截的类是否被修改了字节码和是否新增了新的字段或接口
 */
public class EnhanceContext {
    private boolean isEnhanced = false;
    /**
     * The object has already been enhanced or extended. e.g. added the new field, or implemented the new interface
     */
    private boolean objectExtended = false;

    public boolean isEnhanced() {
        return isEnhanced;
    }

    public void initializationStageCompleted() {
        isEnhanced = true;
    }

    public boolean isObjectExtended() {
        return objectExtended;
    }

    public void extendObjectCompleted() {
        objectExtended = true;
    }
}
```

### 字节码增强

**define.define(typeDescription, newBuilder, classLoader, context)**

这里调用的其实就调用了插件的顶级接口`AbstractClassEnhancePluginDefine`的方法

```java
public DynamicType.Builder<?> define(TypeDescription typeDescription, DynamicType.Builder<?> builder,
    ClassLoader classLoader, EnhanceContext context) throws PluginException {
    // 当前的插件的全类名
    String interceptorDefineClassName = this.getClass().getName();
    // 当前要被增加的类全类名
    String transformClassName = typeDescription.getTypeName();
    if (StringUtil.isEmpty(transformClassName)) {
        LOGGER.warn("classname of being intercepted is not defined by {}.", interceptorDefineClassName);
        return null;
    }

    LOGGER.debug("prepare to enhance class {} by {}.", transformClassName, interceptorDefineClassName);
    WitnessFinder finder = WitnessFinder.INSTANCE;
    /**
     * find witness classes for enhance class
     */
    //版本查找
    //通过类识别
    String[] witnessClasses = witnessClasses();
    if (witnessClasses != null) {
        for (String witnessClass : witnessClasses) {
            //判断类加载器中存不存在这个标识类
            if (!finder.exist(witnessClass, classLoader)) {
                LOGGER.warn("enhance class {} by plugin {} is not activated. Witness class {} does not exist.", transformClassName, interceptorDefineClassName, witnessClass);
                return null;
            }
        }
    }
    //通过方法识别(和通过类识别的逻辑相同)
    List<WitnessMethod> witnessMethods = witnessMethods();
    if (!CollectionUtil.isEmpty(witnessMethods)) {
        for (WitnessMethod witnessMethod : witnessMethods) {
            if (!finder.exist(witnessMethod, classLoader)) {
                LOGGER.warn("enhance class {} by plugin {} is not activated. Witness method {} does not exist.", transformClassName, interceptorDefineClassName, witnessMethod);
                return null;
            }
        }
    }

    /**
     * find origin class source code for interceptor
     * 进行真正的字节码增强修改
     */
    DynamicType.Builder<?> newClassBuilder = this.enhance(typeDescription, builder, classLoader, context);
    //将isEnhanced的标识位设置为true
    context.initializationStageCompleted();
    LOGGER.debug("enhance class {} by {} completely.", transformClassName, interceptorDefineClassName);

    return newClassBuilder;
}
```

### 总结

- witnessClasses()和witnessMethods()检查插件是否生效，在之前的文章详细分析过
- enhance方法进行字节码增强
- 将EnhanceContext标识设置为已增强

### 版本识别的具体判断插件是否生效

witnessClasses()和witnessMethods()返回的类和方法都是要调用`finder.exist`来判断当前应用是否存在

```java
public enum WitnessFinder {
    INSTANCE;
    /**
     * TypePool为类加载器的所有能加载的类型
     * */
    private final Map<ClassLoader, TypePool> poolMap = new HashMap<ClassLoader, TypePool>();

    /**
     * @param classLoader for finding the witnessClass
     * @return true, if the given witnessClass exists, through the given classLoader.
     */
    public boolean exist(String witnessClass, ClassLoader classLoader) {
        return getResolution(witnessClass, classLoader)
                .isResolved();
    }

    private TypePool.Resolution getResolution(String witnessClass, ClassLoader classLoader) {
        ClassLoader mappingKey = classLoader == null ? NullClassLoader.INSTANCE : classLoader;
        if (!poolMap.containsKey(mappingKey)) {
            synchronized (poolMap) {
                if (!poolMap.containsKey(mappingKey)) {
                    TypePool classTypePool = classLoader == null ? TypePool.Default.ofBootLoader() : TypePool.Default.of(classLoader);
                    poolMap.put(mappingKey, classTypePool);
                }
            }
        }
        TypePool typePool = poolMap.get(mappingKey);
        //从这个类型池中查找这个类存不存在
        return typePool.describe(witnessClass);
    }

    public boolean exist(WitnessMethod witnessMethod, ClassLoader classLoader) {
        //方法所在的类是否在这个ClassLoader中
        TypePool.Resolution resolution = getResolution(witnessMethod.getDeclaringClassName(), classLoader);
        if (!resolution.isResolved()) {
            return false;
        }
        //判断该方法是否存在
        return !resolution.resolve()
                .getDeclaredMethods()
                .filter(witnessMethod.getElementMatcher())
                .isEmpty();
    }

}

final class NullClassLoader extends ClassLoader {
    static NullClassLoader INSTANCE = new NullClassLoader();
}
```

- `witnessClass()`,会基于传入的classLoader构造TypePool来判断witnessClass是否存在，TypePool最终会存储到Map中
- `witnessMethod()`,先判断此方法所在的类是否在这个ClassLoader中，也就是先执行`witnessClass()`，再判断该方法是否存在

### 真正的字节码增强

**this.enhance(typeDescription, builder, classLoader, context)**

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

下一篇会详细介绍真正字节码增强的流程
