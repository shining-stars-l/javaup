---
slug: /tech-sharing/skywalking-source/skywalking-part-3
---

# Skywalking流程分析_3

前文将`SkyWalkingAgent.premain`中的：

- `SnifferConfigInitializer.initializeCoreConfig(agentArgs)`
- `pluginFinder = new PluginFinder(new PluginBootstrap().loadPlugins())`这两个方法分析完毕，下面继续分析premain方法其余部分

## 创建byteBuddy

```java
final ByteBuddy byteBuddy = new ByteBuddy().with(TypeValidation.of(Config.Agent.IS_OPEN_DEBUGGING_CLASS));
```

## 设置哪里类进行忽略

```java
AgentBuilder agentBuilder = new AgentBuilder.Default(byteBuddy).ignore(
      nameStartsWith("net.bytebuddy.")
          .or(nameStartsWith("org.slf4j."))
          .or(nameStartsWith("org.groovy."))
          .or(nameContains("javassist"))
          .or(nameContains(".asm."))
          .or(nameContains(".reflectasm."))
          .or(nameStartsWith("sun.reflect"))
          .or(allSkyWalkingAgentExcludeToolkit())
          .or(ElementMatchers.isSynthetic()));
```

## 把一些必要的类注入到BootstrapClassLoader中

```java
agentBuilder = BootstrapInstrumentBoost.inject(pluginFinder, instrumentation, agentBuilder, edgeClasses);
```

这里先不做详细的分析，先分析不是由BootstrapClassLoader加载的类，然后回过头来分析这个，否则不好理解

## 启动服务

```java
//将BootService的这些服务依次进行启动
ServiceManager.INSTANCE.boot();
```

```java
public void boot() {
    //通过spi加载实现了BootService接口的服务
    bootedServices = loadAllServices();
    //将BootService的这些服务依次进行启动
    prepare();
    startup();
    onComplete();
}
```

所谓的服务就是实现了org.apache.skywalking.apm.agent.core.boot.BootService接口的实现类，可以看到此接口定义了一系列的生命周期的操作

```java
public interface BootService {
    //准备
    void prepare() throws Throwable;
    //启动
    void boot() throws Throwable;
    //启动完成
    void onComplete() throws Throwable;
    //关闭
    void shutdown() throws Throwable;

    /**
     * {@code BootService}s with higher priorities will be started earlier, and shut down later than those {@code BootService}s with lower priorities.
     *
     * @return the priority of this {@code BootService}.
     */
    default int priority() {
        return 0;
    }
}
```

### spi加载实现BootService接口的服务

```java
private Map<Class, BootService> loadAllServices() {
    Map<Class, BootService> bootedServices = new LinkedHashMap<>();
    List<BootService> allServices = new LinkedList<>();
    //通过spi机制加载实现了BootService接口的服务
    load(allServices);
    for (final BootService bootService : allServices) {
        Class<? extends BootService> bootServiceClass = bootService.getClass();
        //判断有没有默认实现
        boolean isDefaultImplementor = bootServiceClass.isAnnotationPresent(DefaultImplementor.class);
        if (isDefaultImplementor) {
            //如果有默认实现，则放入进去
            if (!bootedServices.containsKey(bootServiceClass)) {
                bootedServices.put(bootServiceClass, bootService);
            } else {
                //ignore the default service
            }
        } else {
            //判断是不是覆盖实现
            OverrideImplementor overrideImplementor = bootServiceClass.getAnnotation(OverrideImplementor.class);
            //既没有@DefaultImplementor，也没有@OverrideImplementor
            if (overrideImplementor == null) {
                if (!bootedServices.containsKey(bootServiceClass)) {
                    bootedServices.put(bootServiceClass, bootService);
                } else {
                    throw new ServiceConflictException("Duplicate service define for :" + bootServiceClass);
                }
            } else {
                //没有@DefaultImplementor，但是有@OverrideImplementor，就是覆盖默认实现
                Class<? extends BootService> targetService = overrideImplementor.value();
                //当前 覆盖实现 要覆盖的 默认实现 已经被加载进来 
                if (bootedServices.containsKey(targetService)) {
                    //被覆盖的默认实现上必须要有@DefaultImplementor才能够使用 被覆盖实现
                    boolean presentDefault = bootedServices.get(targetService)
                                                           .getClass()
                                                           .isAnnotationPresent(DefaultImplementor.class);
                    if (presentDefault) {
                        bootedServices.put(targetService, bootService);
                    } else {
                        throw new ServiceConflictException(
                            "Service " + bootServiceClass + " overrides conflict, " + "exist more than one service want to override :" + targetService);
                    }
                } else {
                    //当前 覆盖实现 要覆盖的 默认实现 还没有被加载进来，这时就把这个 覆盖实现 当做是其服务的 默认实现
                    bootedServices.put(targetService, bootService);
                }
            }
        }

    }
    return bootedServices;
}
```

通过spi机制加载实现了BootService接口的服务

```java
void load(List<BootService> allServices) {
    for (final BootService bootService : ServiceLoader.load(BootService.class, AgentClassLoader.getDefault())) {
        allServices.add(bootService);
    }
}
```

既然是spi加载，那么需要看下spi的文件,在`META-INF.services`下的`org.apache.skywalking.apm.agent.core.boot.BootService`文件

```
org.apache.skywalking.apm.agent.core.remote.TraceSegmentServiceClient
org.apache.skywalking.apm.agent.core.context.ContextManager
org.apache.skywalking.apm.agent.core.sampling.SamplingService
org.apache.skywalking.apm.agent.core.remote.GRPCChannelManager
org.apache.skywalking.apm.agent.core.jvm.JVMMetricsSender
org.apache.skywalking.apm.agent.core.jvm.JVMService
org.apache.skywalking.apm.agent.core.remote.ServiceManagementClient
org.apache.skywalking.apm.agent.core.context.ContextManagerExtendService
org.apache.skywalking.apm.agent.core.commands.CommandService
org.apache.skywalking.apm.agent.core.commands.CommandExecutorService
org.apache.skywalking.apm.agent.core.profile.ProfileTaskChannelService
org.apache.skywalking.apm.agent.core.profile.ProfileSnapshotSender
org.apache.skywalking.apm.agent.core.profile.ProfileTaskExecutionService
org.apache.skywalking.apm.agent.core.meter.MeterService
org.apache.skywalking.apm.agent.core.meter.MeterSender
org.apache.skywalking.apm.agent.core.context.status.StatusCheckService
org.apache.skywalking.apm.agent.core.remote.LogReportServiceClient
org.apache.skywalking.apm.agent.core.conf.dynamic.ConfigurationDiscoveryService
org.apache.skywalking.apm.agent.core.remote.EventReportServiceClient
org.apache.skywalking.apm.agent.core.ServiceInstanceGenerator
```

### 服务结构

- 上面的代码在加载时分成了默认实现和覆盖实现。结构是默认实现（DefaultTest）实现Test接口（ServiceTest），覆盖实现（OverrideTest）继承默认实现
- 接口和默认实现合并，默认实现标注`@DefaultImplementor`，覆盖实现继承默认实现并标注`@OverrideImplementor(value=默认实现.class)`

以日志报告服务举例

```java
//这是默认实现
@DefaultImplementor
public class LogReportServiceClient implements BootService
```

```java
//覆盖实现
@OverrideImplementor(LogReportServiceClient.class)
public class KafkaLogReporterServiceClient extends LogReportServiceClient
```

通过spi加载了实现BootService接口的服务，然后放到了`bootedServices`中，下面就是在`prepare、startup、onComplete`方法中依次的调用这些服务

```java
public void shutdown() {
    bootedServices.values().stream().sorted(Comparator.comparingInt(BootService::priority).reversed()).forEach(service -> {
        try {
            service.shutdown();
        } catch (Throwable e) {
            LOGGER.error(e, "ServiceManager try to shutdown [{}] fail.", service.getClass().getName());
        }
    });
}

private void prepare() {
    bootedServices.values().stream().sorted(Comparator.comparingInt(BootService::priority)).forEach(service -> {
        try {
            service.prepare();
        } catch (Throwable e) {
            LOGGER.error(e, "ServiceManager try to pre-start [{}] fail.", service.getClass().getName());
        }
    });
}

private void startup() {
    bootedServices.values().stream().sorted(Comparator.comparingInt(BootService::priority)).forEach(service -> {
        try {
            service.boot();
        } catch (Throwable e) {
            LOGGER.error(e, "ServiceManager try to start [{}] fail.", service.getClass().getName());
        }
    });
}

private void onComplete() {
    for (BootService service : bootedServices.values()) {
        try {
            service.onComplete();
        } catch (Throwable e) {
            LOGGER.error(e, "Service [{}] AfterBoot process fails.", service.getClass().getName());
        }
    }
}
```

### 总结

服务结构：

- 服务要实现BootService接口
- 服务如果只有一种实现，直接创建一个类即可
- 如果有多种实现 
   - 默认实现使用@DefaultImplementor
   - 覆盖实现使用@OverrideImplementor
加载过程：
- SPI加载所有实现BootService接口的服务
- 根据服务实现模式进行加载 
   - 两个注解都没有的服务直接加入服务
   - @DefaultImplementor修饰的服务直接加入集合
   - @OverrideImplementor
      - value指向的服务有@DefaultImplementor，则覆盖
      - value指向的服务没有@DefaultImplementor，则报错

后文介绍的是插件的具体结构和如何识别不同版本而是使用不同插件的技巧
