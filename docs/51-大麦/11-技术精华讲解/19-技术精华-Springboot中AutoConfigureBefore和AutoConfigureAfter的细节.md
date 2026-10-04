---
slug: /damai/tech-highlights/springboot-autoconfigure-order
description: "围绕《Springboot中AutoConfigureBefore和AutoConfigureAfter的细节》，重点讲解spring.factories、AutoConfigureBefore、AutoConfigureAfter、自动装配顺序与参数匹配规则等技术实现与源码细节。内容进一步围绕配置类加载顺序、Aut…"
keywords: ["AutoConfigureBefore", "AutoConfigureAfter", "spring.factories", "自动装配顺序", "配置类加载顺序", "AutoConfiguration", "参数匹配规则", "装配依赖关系"]
---

# Springboot中AutoConfigureBefore和AutoConfigureAfter的细节

import VipInline from '@site/src/components/VipInline';

## 正常利用springboot的自动装配


**ConfB**

```java
@Configuration(proxyBeanMethods=false)
public class ConfB {
    
    public ConfB(){
        System.out.println("ConfB构造方式执行...");
    }
}
```



### 不加spring.factories


**项目包结构**

<img src="/img/damai/技术精华/项目包结构.png" alt="表关系" width="40%" />


此时resources中没有spring.factories



**执行结果**



```plain
2026-02-24 13:44:49.809  INFO 33820 --- [           main] test.MyStarterApplication                : No active profile set, falling back to default profiles: default
2026-02-24 13:44:50.294  INFO 33820 --- [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat initialized with port(s): 8080 (http)
2026-02-24 13:44:50.300  INFO 33820 --- [           main] o.apache.catalina.core.StandardService   : Starting service [Tomcat]
2026-02-24 13:44:50.300  INFO 33820 --- [           main] org.apache.catalina.core.StandardEngine  : Starting Servlet engine: [Apache Tomcat/9.0.46]
2026-02-24 13:44:50.354  INFO 33820 --- [           main] o.a.c.c.C.[Tomcat].[localhost].[/]       : Initializing Spring embedded WebApplicationContext
2026-02-24 13:44:50.354  INFO 33820 --- [           main] w.s.c.ServletWebServerApplicationContext : Root WebApplicationContext: initialization completed in 518 ms
2026-02-24 13:44:50.456  INFO 33820 --- [           main] o.s.s.concurrent.ThreadPoolTaskExecutor  : Initializing ExecutorService 'applicationTaskExecutor'
2026-02-24 13:44:50.954  INFO 33820 --- [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat started on port(s): 8080 (http) with context path ''
2026-02-24 13:44:51.004  INFO 33820 --- [           main] test.MyStarterApplication                : Started MyStarterApplication in 1.422 seconds (JVM running for 2.013)
```


没看到 `ConfB` 构造方法执行，因为执行类 `MyStarterApplication` 在test包下，test 和 conf 包是并列关系，所以启动时是扫描不到 conf 包下的内容的，又因为没有 spring.factories 所以没有加载到 `ConfB` 是正常情况。下面加 spring.factories

<VipInline />