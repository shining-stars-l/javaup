---
slug: /tech-sharing/skywalking-source/skywalking-part-2
---

# Skywalking流程分析_2

## 读取配置

`SnifferConfigInitializer.initializeCoreConfig(agentArgs)`这个方法就是读取配置文件，`agent.config`的文件就是在此方法中读取的

```java
public static void initializeCoreConfig(String agentOptions) {
    //开始进行加载配置信息 优先级(数字越小优先级越大) 1:启动命令的age
    nt参数  2:系统环境变量 3:agent.config的配置
    AGENT_SETTINGS = new Properties();
    //读取配置文件
    try (final InputStreamReader configFileStream = loadConfig()) {
        AGENT_SETTINGS.load(configFileStream);
        for (String key : AGENT_SETTINGS.stringPropertyNames()) {
            String value = (String) AGENT_SETTINGS.get(key);
            //配置项占位符替换
            AGENT_SETTINGS.put(key, PropertyPlaceholderHelper.INSTANCE.replacePlaceholders(value, AGENT_SETTINGS));
        }

    } catch (Exception e) {
        LOGGER.error(e, "Failed to read the config file, skywalking is going to run in default config.");
    }

    try {
        //如果配置环境变量则进行替换
        overrideConfigBySystemProp();
    } catch (Exception e) {
        LOGGER.error(e, "Failed to read the system properties.");
    }

    agentOptions = StringUtil.trim(agentOptions, ',');
    if (!StringUtil.isEmpty(agentOptions)) {
        try {
            agentOptions = agentOptions.trim();
            LOGGER.info("Agent options is {}.", agentOptions);
            //用agent的配置文件进行替换
            overrideConfigByAgentOptions(agentOptions);
        } catch (Exception e) {
            LOGGER.error(e, "Failed to parse the agent options, val is {}.", agentOptions);
        }
    }
    //将配置信息映射到Config类中
    initializeConfig(Config.class);
    // reconfigure logger after config initialization
    //根据配置信息配置日志
    configureLogger();
    LOGGER = LogManager.getLogger(SnifferConfigInitializer.class);

    setAgentVersion();

    // 检查名称和地址是否进行设置
    if (StringUtil.isEmpty(Config.Agent.SERVICE_NAME)) {
        throw new ExceptionInInitializerError("`agent.service_name` is missing.");
    } else {
        if (StringUtil.isNotEmpty(Config.Agent.NAMESPACE) || StringUtil.isNotEmpty(Config.Agent.CLUSTER)) {
            Config.Agent.SERVICE_NAME = StringUtil.join(
                SERVICE_NAME_PART_CONNECTOR,
                Config.Agent.SERVICE_NAME,
                Config.Agent.NAMESPACE,
                Config.Agent.CLUSTER
            );
        }
    }
    if (StringUtil.isEmpty(Config.Collector.BACKEND_SERVICE)) {
        throw new ExceptionInInitializerError("`collector.backend_service` is missing.");
    }
    if (Config.Plugin.PEER_MAX_LENGTH <= 3) {
        LOGGER.warn(
            "PEER_MAX_LENGTH configuration:{} error, the default value of 200 will be used.",
            Config.Plugin.PEER_MAX_LENGTH
        );
        Config.Plugin.PEER_MAX_LENGTH = 200;
    }
    //初始化完成标识符
    IS_INIT_COMPLETED = true;
}
```

## 总结

- 按照优先级将配置读取到`AGENT_SETTINGS`中
- 将`AGENT_SETTINGS`加载到`Config`类中
- `IS_INIT_COMPLETED`初始化完成标识符设置为true

## 加载插件以及初始化自定义AgentClassLoader类加载器

`pluginFinder = new PluginFinder(new PluginBootstrap().loadPlugins());`
首先分析`new PluginBootstrap().loadPlugins()`这个方法非常的重要，进行自定义AgentClassLoader类加载器的初始化

### new PluginBootstrap().loadPlugins()

```java
public List<AbstractClassEnhancePluginDefine> loadPlugins() throws AgentPackageNotFoundException {
    //自定义AgentClassLoader类加载器
    AgentClassLoader.initDefaultLoader();
    //获取所有的skywalking-plugin.def的文件
    PluginResourcesResolver resolver = new PluginResourcesResolver();
    List<URL> resources = resolver.getResources();

    if (resources == null || resources.size() == 0) {
        LOGGER.info("no plugin files (skywalking-plugin.def) found, continue to start application.");
        return new ArrayList<AbstractClassEnhancePluginDefine>();
    }
    
    for (URL pluginUrl : resources) {
        try {
            //读取skywalking-plugin.def中的指定插件配置
            PluginCfg.INSTANCE.load(pluginUrl.openStream());
        } catch (Throwable t) {
            LOGGER.error(t, "plugin file [{}] init failure.", pluginUrl);
        }
    }

    List<PluginDefine> pluginClassList = PluginCfg.INSTANCE.getPluginClassList();

    List<AbstractClassEnhancePluginDefine> plugins = new ArrayList<AbstractClassEnhancePluginDefine>();
    for (PluginDefine pluginDefine : pluginClassList) {
        try {
            LOGGER.debug("loading plugin class {}.", pluginDefine.getDefineClass());
            //类加载器加载plugin的插件
            AbstractClassEnhancePluginDefine plugin = (AbstractClassEnhancePluginDefine) Class.forName(pluginDefine.getDefineClass(), true, AgentClassLoader
                .getDefault()).newInstance();
            plugins.add(plugin);
        } catch (Throwable t) {
            LOGGER.error(t, "load plugin [{}] failure.", pluginDefine.getDefineClass());
        }
    }
    //加载基于xml定义的插件
    plugins.addAll(DynamicPluginLoader.INSTANCE.load(AgentClassLoader.getDefault()));

    return plugins;

}
```

### 自定义AgentClassLoader类加载器

**AgentClassLoader.initDefaultLoader()**

```java
public class AgentClassLoader extends ClassLoader {
  static {
      /*
       * Try to solve the classloader dead lock. See https://github.com/apache/skywalking/pull/2016
       * 
       * 注册并行能力并发类加载器
       */
      registerAsParallelCapable();
  }
  /**
   * 初始化AgentClassLoader类加载器
   * */
  public static void initDefaultLoader() throws AgentPackageNotFoundException {
      if (DEFAULT_LOADER == null) {
          synchronized (AgentClassLoader.class) {
              if (DEFAULT_LOADER == null) {
                  DEFAULT_LOADER = new AgentClassLoader(PluginBootstrap.class.getClassLoader());
              }
          }
      }
  }

  public AgentClassLoader(ClassLoader parent) throws AgentPackageNotFoundException {
      super(parent);
      //jar包所在的目录
      File agentDictionary = AgentPackagePath.getPath();
      classpath = new LinkedList<>();
      //加载plugins, activations目录下的插件
      //public static List<String> MOUNT = Arrays.asList("plugins", "activations");
      Config.Plugin.MOUNT.forEach(mountFolder -> classpath.add(new File(agentDictionary, mountFolder)));
  }
//省略
}
```

### 总结

-  `registerAsParallelCapable()`是为了解决ClassLoader死锁问题,并开启类加载器的并行加载模式。 
   - jdk1.7之前，类加载器在加载类是串行加载的，加载完上一个再加载下一个，效率低下
   - JDK1.7之后，提供了类加载器并行能力，就是把锁的粒度变小，之前ClassLoader加载类的时候加锁的时候是用自身作为锁的，现在优化成为锁在具体的某一个类上，而不是锁在整个类加载器
-  `AgentClassLoader`重写了`findClass、findResource、findResources`方法,将从`plugins, activations目录`读取到的插件集合`classpath`进行加载 

```java
@Override
protected Class<?> findClass(String name) throws ClassNotFoundException {
    List<Jar> allJars = getAllJars();
    String path = name.replace('.', '/').concat(".class");
    for (Jar jar : allJars) {
        JarEntry entry = jar.jarFile.getJarEntry(path);
        if (entry == null) {
            continue;
        }
        try {
            URL classFileUrl = new URL("jar:file:" + jar.sourceFile.getAbsolutePath() + "!/" + path);
            byte[] data;
            try (final BufferedInputStream is = new BufferedInputStream(
                classFileUrl.openStream()); final ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                int ch;
                while ((ch = is.read()) != -1) {
                    baos.write(ch);
                }
                data = baos.toByteArray();
            }
            //读取带有PluginConfig注解的配置
            return processLoadedClass(defineClass(name, data, 0, data.length));
        } catch (IOException e) {
            LOGGER.error(e, "find class fail.");
        }
    }
    throw new ClassNotFoundException("Can't find " + name);
}

@Override
protected URL findResource(String name) {
    List<Jar> allJars = getAllJars();
    for (Jar jar : allJars) {
        JarEntry entry = jar.jarFile.getJarEntry(name);
        if (entry != null) {
            try {
                return new URL("jar:file:" + jar.sourceFile.getAbsolutePath() + "!/" + name);
            } catch (MalformedURLException ignored) {
            }
        }
    }
    return null;
}

@Override
protected Enumeration<URL> findResources(String name) throws IOException {
    List<URL> allResources = new LinkedList<>();
    List<Jar> allJars = getAllJars();
    for (Jar jar : allJars) {
        JarEntry entry = jar.jarFile.getJarEntry(name);
        if (entry != null) {
            allResources.add(new URL("jar:file:" + jar.sourceFile.getAbsolutePath() + "!/" + name));
        }
    }

    final Iterator<URL> iterator = allResources.iterator();
    return new Enumeration<URL>() {
        @Override
        public boolean hasMoreElements() {
            return iterator.hasNext();
        }

        @Override
        public URL nextElement() {
            return iterator.next();
        }
    };
}

private Class<?> processLoadedClass(Class<?> loadedClass) {
    final PluginConfig pluginConfig = loadedClass.getAnnotation(PluginConfig.class);
    if (pluginConfig != null) {
        // Set up the plugin config when loaded by class loader at the first time.
        // Agent class loader just loaded limited classes in the plugin jar(s), so the cost of this
        // isAssignableFrom would be also very limited.
        SnifferConfigInitializer.initializeConfig(pluginConfig.root());
    }

    return loadedClass;
}

private List<Jar> getAllJars() {
    if (allJars == null) {
        jarScanLock.lock();
        try {
            if (allJars == null) {
                allJars = doGetJars();
            }
        } finally {
            jarScanLock.unlock();
        }
    }

    return allJars;
}

private LinkedList<Jar> doGetJars() {
    LinkedList<Jar> jars = new LinkedList<>();
    //classpath就是刚才加载出来的插件集合
    for (File path : classpath) {
        if (path.exists() && path.isDirectory()) {
            String[] jarFileNames = path.list((dir, name) -> name.endsWith(".jar"));
            for (String fileName : jarFileNames) {
                try {
                    File file = new File(path, fileName);
                    Jar jar = new Jar(new JarFile(file), file);
                    jars.add(jar);
                    LOGGER.info("{} loaded.", file.toString());
                } catch (IOException e) {
                    LOGGER.error(e, "{} jar file can't be resolved", fileName);
                }
            }
        }
    }
    return jars;
}

@RequiredArgsConstructor
private static class Jar {
    private final JarFile jarFile;
    private final File sourceFile;
}
```

## 获取所有的skywalking-plugin.def的文件

### List resources = resolver.getResources()

```java
public List<URL> getResources() {
    List<URL> cfgUrlPaths = new ArrayList<URL>();
    Enumeration<URL> urls;
    try {
        urls = AgentClassLoader.getDefault().getResources("skywalking-plugin.def");

        while (urls.hasMoreElements()) {
            URL pluginUrl = urls.nextElement();
            cfgUrlPaths.add(pluginUrl);
            LOGGER.info("find skywalking plugin define in {}", pluginUrl);
        }

        return cfgUrlPaths;
    } catch (IOException e) {
        LOGGER.error("read resources failure.", e);
    }
    return null;
}
```

使用AgentClassLoader类加载器获取到plugins, activations目录下的所有skywalking-plugin.def的插件

## 读取skywalking-plugin.def转换成PluginDefine

### PluginCfg.INSTANCE.load(pluginUrl.openStream())

```java
void load(InputStream input) throws IOException {
    try {
        BufferedReader reader = new BufferedReader(new InputStreamReader(input));
        String pluginDefine;
        while ((pluginDefine = reader.readLine()) != null) {
            try {
                if (pluginDefine.trim().length() == 0 || pluginDefine.startsWith("#")) {
                    continue;
                }
                //将一个个插件转成PluginDefine
                PluginDefine plugin = PluginDefine.build(pluginDefine);
                pluginClassList.add(plugin);
            } catch (IllegalPluginDefineException e) {
                LOGGER.error(e, "Failed to format plugin({}) define.", pluginDefine);
            }
        }
        //排除配置文件中不需要启用的插件
        pluginClassList = pluginSelector.select(pluginClassList);
    } finally {
        input.close();
    }
}
```

还记得最开始的方法`pluginFinder = new PluginFinder(new PluginBootstrap().loadPlugins());`吗？`AgentClassLoader累加器的初始化、插件的加载生成`都是在`ew PluginBootstrap().loadPlugins()`执行的

下面分析`pluginFinder = new PluginFinder`

### pluginFinder = new PluginFinder

```java
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

/**
 * 将插件进行分类
 *  命名插件、间接匹配插件、jdk类库插件
 * */
public PluginFinder(List<AbstractClassEnhancePluginDefine> plugins) {
    for (AbstractClassEnhancePluginDefine plugin : plugins) {
        ClassMatch match = plugin.enhanceClass();

        if (match == null) {
            continue;
        }

        if (match instanceof NameMatch) {
            NameMatch nameMatch = (NameMatch) match;
            LinkedList<AbstractClassEnhancePluginDefine> pluginDefines = nameMatchDefine.get(nameMatch.getClassName());
            if (pluginDefines == null) {
                pluginDefines = new LinkedList<AbstractClassEnhancePluginDefine>();
                nameMatchDefine.put(nameMatch.getClassName(), pluginDefines);
            }
            pluginDefines.add(plugin);
        } else {
            signatureMatchDefine.add(plugin);
        }

        if (plugin.isBootstrapInstrumentation()) {
            bootstrapClassMatchDefine.add(plugin);
        }
    }
}
```

## 总结

- `PluginBootstrap`实例化所有插件 
   - `PluginResourcesResolver`加载`skywalking-plugin.def`的文件
   - `PluginCfg`封装`PluginDefine`
   - `DynamicPluginLoader`加载基于xml配置的插件
- `PluginFinder`分类插件 
   - `NameMatch`,命名插件
   - `IndirectMatch`,间接匹配插件
   - JDK类库插件

以上就是将读取配置文件、自定义类加载器、加载插件的流程分析完毕
