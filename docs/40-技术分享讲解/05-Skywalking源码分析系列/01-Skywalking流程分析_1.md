---
slug: /tech-sharing/skywalking-source/skywalking-part-1
---


# Skywalking流程分析_1

`skywalking`作为目前最常用的APM监控，其重要性不可言喻，本人也是针对公司业务做了很多定制化的改造，其内部的原理设计很是巧妙，尤其是自定义agentClassLoader类加载的部分更是值得去借鉴这种思想。本系列将`skywalking`内部原理进行剖析，让大家更加容易体会启动的精髓

## 版本

- 8.14.0

## 特点

- 使用javaagent静态启动的方式
- 使用bytebuddy的框架，入口是permain()方法
- 在类加载时可以对字节码进行随意的修改，只要符合规范即可
- 将插件自定义了类加载器进行了完美的隔离

## 入口

在`apm-sniffer/apm-agent模块`下，pom的配置

```xml
<properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <premain.class>org.apache.skywalking.apm.agent.SkyWalkingAgent</premain.class>
    <!-- 省略... -->
</properties>
<plugin>
    <artifactId>maven-shade-plugin</artifactId>
    <executions>
        <execution>
            <phase>package</phase>
            <goals>
                <goal>shade</goal>
            </goals>
            <configuration>
                <shadedArtifactAttached>false</shadedArtifactAttached>
                <createDependencyReducedPom>true</createDependencyReducedPom>
                <createSourcesJar>true</createSourcesJar>
                <shadeSourcesContent>true</shadeSourcesContent>
                <transformers>
                    <transformer implementation="org.apache.maven.plugins.shade.resource.ManifestResourceTransformer">
                        <manifestEntries>
                            <Premain-Class>${premain.class}</Premain-Class>
                            <Can-Redefine-Classes>${can.redefine.classes}</Can-Redefine-Classes>
                            <Can-Retransform-Classes>${can.retransform.classes}</Can-Retransform-Classes>
                        </manifestEntries>
                    </transformer>
                </transformers>
                <!-- 省略... -->
            </configuration>
        </execution>
    </executions>
</plugin>
```

在这里指定了`org.apache.skywalking.apm.agent.SkyWalkingAgent`的入口，下面就是重要的`premain`方法

## SkyWalkingAgent.premain

```java
public class SkyWalkingAgent {
private static ILog LOGGER = LogManager.getLogger(SkyWalkingAgent.class);

/**
 * Main entrance. Use byte-buddy transform to enhance all classes, which define in plugins.
 */
public static void premain(String agentArgs, Instrumentation instrumentation) throws PluginException {
    final PluginFinder pluginFinder;
    try {
        //读取配置文件和核心jar
        SnifferConfigInitializer.initializeCoreConfig(agentArgs);
    } catch (Exception e) {
        // try to resolve a new logger, and use the new logger to write the error log here
        LogManager.getLogger(SkyWalkingAgent.class)
                  .error(e, "SkyWalking agent initialized failure. Shutting down.");
        return;
    } finally {
        // refresh logger again after initialization finishes
        LOGGER = LogManager.getLogger(SkyWalkingAgent.class);
    }

    if (!Config.Agent.ENABLE) {
        LOGGER.warn("SkyWalking agent is disabled.");
        return;
    }

    try {
        //读取插件和加载插件
        pluginFinder = new PluginFinder(new PluginBootstrap().loadPlugins());
    } catch (AgentPackageNotFoundException ape) {
        LOGGER.error(ape, "Locate agent.jar failure. Shutting down.");
        return;
    } catch (Exception e) {
        LOGGER.error(e, "SkyWalking agent initialized failure. Shutting down.");
        return;
    }
    //创建byteBuddy
    final ByteBuddy byteBuddy = new ByteBuddy().with(TypeValidation.of(Config.Agent.IS_OPEN_DEBUGGING_CLASS));

    //哪些类进行忽略
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

    JDK9ModuleExporter.EdgeClasses edgeClasses = new JDK9ModuleExporter.EdgeClasses();
    try {
        /*
        * 里面有个重点逻辑 把一些类注入到Boostrap类加载器中 为了解决Bootstrap类加载器不能访问App类加载器中的内容的问题
        * */
        agentBuilder = BootstrapInstrumentBoost.inject(pluginFinder, instrumentation, agentBuilder, edgeClasses);
    } catch (Exception e) {
        LOGGER.error(e, "SkyWalking agent inject bootstrap instrumentation failure. Shutting down.");
        return;
    }
    /**
     * 绕开jdk模块化问题
     * */
    try {
        agentBuilder = JDK9ModuleExporter.openReadEdge(instrumentation, agentBuilder, edgeClasses);
    } catch (Exception e) {
        LOGGER.error(e, "SkyWalking agent open read edge in JDK 9+ failure. Shutting down.");
        return;
    }
    //根据配置是否将修改后的字节码保存到磁盘/内存
    if (Config.Agent.IS_CACHE_ENHANCED_CLASS) {
        try {
            agentBuilder = agentBuilder.with(new CacheableTransformerDecorator(Config.Agent.CLASS_CACHE_MODE));
            LOGGER.info("SkyWalking agent class cache [{}] activated.", Config.Agent.CLASS_CACHE_MODE);
        } catch (Exception e) {
            LOGGER.error(e, "SkyWalking agent can't active class cache.");
        }
    }

    agentBuilder.type(pluginFinder.buildMatch())//指定byteBuddy要拦截的类
                .transform(new Transformer(pluginFinder))//指定字节码增强的工具
                .with(AgentBuilder.RedefinitionStrategy.RETRANSFORMATION)//redefine和retransformation的区别在于是否保留修改前的内容
                .with(new RedefinitionListener())
                .with(new Listener())
                .installOn(instrumentation);//将agent安装到instrumentation

    PluginFinder.pluginInitCompleted();

    try {
        //启动服务
        //将BootService的这些服务依次进行启动
        ServiceManager.INSTANCE.boot();
    } catch (Exception e) {
        LOGGER.error(e, "Skywalking agent boot failure.");
    }
    //将BootService的这些服务依次进行关闭
    Runtime.getRuntime()
           .addShutdownHook(new Thread(ServiceManager.INSTANCE::shutdown, "skywalking service shutdown thread"));
}
```

## premain的大致流程为

- 读取配置文件
- 加载插件
- 创建byteBuddy
- 做一些额外的准备工作
- 启动服务
- 关闭服务钩子

在以后得系列中我们会来逐步分析每个阶段的流程
