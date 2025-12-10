---
slug: /framework/spring/autoconfigure-before
---
# AutoConfigureBefore 注解完全指南
在数据中台的实战项目中，存在着动态数据源的组件。

而此组件在加载动态数据源的自动装配类上，会有 `@AutoConfigureBefore` 注解

```java
@EnableConfigurationProperties(value = AgilityDataSourceProperty.class)
@AutoConfigureBefore(name = "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration")
public class AgilityDataSourceAutoConfig
```

这个 `@AutoConfigureBefore` 的作用是什么？如果没有的话，动态数据源会正常加载吗？本章节就来好好的剖析一番！

## 一、为什么需要"排序"自动配置

Spring Boot 的自动配置会根据类路径、Bean 条件等动态生效。当多个自动配置对同一 Bean 或同一子系统有"先后依赖"或"默认值-覆盖值"关系时，确定加载顺序就至关重要。

`@AutoConfigureBefore` 的核心价值在于：**在不破坏自动配置"按需生效"理念的前提下，提供"相对顺序"的声明能力，避免配置被覆盖或条件判断失效。**

## 二、@AutoConfigureBefore 是什么

### 2.1 定义与作用

- **作用**：声明"当前自动配置类应该在指定的一个或多个自动配置类之前被处理"
- **粒度**：只影响"自动配置类之间"的相对顺序，不影响普通的 `@Configuration` 配置类，也不直接改变 Bean 的初始化顺序
- **适用范围**：仅对"自动配置机制"参与排序的类生效（即被 Spring Boot 当作 **AutoConfiguration** 的类）

### 2.2 核心特性

通过在自动配置类上使用 `@AutoConfigureBefore`，可以明确指定该配置类应在其他指定的配置类之前加载。这样，有助于确保某些配置优先应用，避免因加载顺序问题导致的配置覆盖或冲突。

## 三、工作原理（排序如何实现）

Spring Boot 在启动时使用导入选择器加载候选自动配置：
- **Boot 2.x**：使用 `META-INF/spring.factories`
- **Boot 3.x**：使用 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`

随后通过自动配置排序器整合顺序，排序依据（优先级从高到低）：

1. `@AutoConfigureOrder`（或 `Ordered` 接口）
2. `@AutoConfigureBefore` / `@AutoConfigureAfter` 的图排序（解决相对先后关系）
3. 其余候选按默认顺序

⚠️ **注意**：如果出现环状依赖（A 要在 B 前，B 又要在 A 前），排序器会尝试解析；若无法解析，可能报错或导致顺序不确定，应避免。

## 四、两种声明方式

### 4.1 按类型（强依赖类存在）

```java
@AutoConfigureBefore(DataSourceAutoConfiguration.class)
public class MyAutoConfiguration { }
```

### 4.2 按名称（弱依赖，避免类路径硬依赖）

```java
@AutoConfigureBefore(name = "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration")
public class MyAutoConfiguration { }
```

**建议**：当你不希望引入目标自动配置所在模块的编译期依赖时，优先使用 `name` 形式，降低耦合。

## 五、与其他注解的对比

### 5.1 三种注解对比

| 注解                      | 作用                                   | 使用场景                       |
| ------------------------- | -------------------------------------- | ------------------------------ |
| `@AutoConfigureBefore(X)` | 声明"我在 X 之前"                      | 有明确相对关系时，需要提前生效 |
| `@AutoConfigureAfter(X)`  | 声明"我在 X 之后"                      | 需要在某配置之后补充增强       |
| `@AutoConfigureOrder(N)`  | 使用数值整体排序（数值越小优先级越高） | 多方都需要统一优先级时         |

### 5.2 选择建议

- 有明确相对关系时用 Before/After 更直观、可读性更好
- 多方都需要统一优先级时，用 `@AutoConfigureOrder` 作为兜底规则
- 避免滥用过多的 Before/After，容易形成复杂依赖关系网

## 六、生效前提与适用范围（关键！）

### 6.1 仅对"自动配置"生效

- **SpringBoot 2.x**：类需通过 `META-INF/spring.factories` 中的 `EnableAutoConfiguration` 条目暴露
- **SpringBoot 3.x**：类需列在 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`

### 6.2 重要限制

❌ **对普通 `@Configuration` 类不生效**
❌ **仅影响"自动配置类之间"的相对顺序，不保证具体 Bean 的初始化顺序**

✅ Bean 初始化顺序可通过 `@DependsOn`、`@Order`（适用于某些组件类型）、或合理的条件装配来控制。

## 七、实战案例

### 案例一：自定义数据源连接池优先配置

**场景**：在 Spring Boot 官方的 `DataSourceAutoConfiguration` 之前，先注册自定义的数据源属性处理器，为连接池设置公司统一的默认参数。

#### 1. 自定义自动配置类

```java
package com.company.autoconfigure;

import com.zaxxer.hikari.HikariConfig;
import org.springframework.boot.autoconfigure.AutoConfigureBefore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 在官方数据源自动配置之前，提供公司级别的连接池默认配置
 */
@Configuration
@ConditionalOnClass({HikariConfig.class})
@AutoConfigureBefore(DataSourceAutoConfiguration.class)  // 关键：在官方配置之前
public class CompanyDataSourceDefaultsAutoConfiguration {

    public CompanyDataSourceDefaultsAutoConfiguration() {
        System.out.println("✅ [自动配置] 公司数据源默认配置已加载（在官方DataSourceAutoConfiguration之前）");
    }

    /**
     * 提供一个自定义的连接池默认配置 Bean
     * 如果用户没有自定义，这个默认值会被后续的官方配置使用
     */
    @Bean
    @ConditionalOnMissingBean(name = "hikariDefaults")
    @ConfigurationProperties(prefix = "company.datasource.hikari")
    public HikariConfig companyHikariDefaults() {
        HikariConfig config = new HikariConfig();
        // 公司统一的默认值
        config.setMinimumIdle(5);
        config.setMaximumPoolSize(20);
        config.setConnectionTimeout(30000);
        config.setIdleTimeout(600000);
        config.setMaxLifetime(1800000);
        config.setConnectionTestQuery("SELECT 1");
        System.out.println("  ↳ 公司默认连接池参数已设置：最大连接数=20, 最小空闲=5");
        return config;
    }
}
```

#### 2. 注册自动配置

**Boot 2.x 方式** - 创建 `META-INF/spring.factories`：
```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
com.company.autoconfigure.CompanyDataSourceDefaultsAutoConfiguration
```

**Boot 3.x 方式** - 创建 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`：
```
com.company.autoconfigure.CompanyDataSourceDefaultsAutoConfiguration
```

#### 3. 错误示例对比

```java
/**
 * ❌ 错误示例：没有使用 @AutoConfigureBefore
 * 这个配置可能在 DataSourceAutoConfiguration 之后加载
 * 导致默认值无法被官方配置采用
 */
@Configuration
@ConditionalOnClass(DataSource.class)
// 缺少 @AutoConfigureBefore(DataSourceAutoConfiguration.class)
public class WrongOrderAutoConfiguration {
    
    public WrongOrderAutoConfiguration() {
        System.out.println("⚠️  [自动配置] 错误示例配置已加载（顺序不确定！）");
    }
    
    // 可能因为加载顺序问题，这里的配置无法生效或被覆盖
}
```

#### 4. 启动日志对比

**使用 @AutoConfigureBefore 后的启动日志**：
```
✅ [自动配置] 公司数据源默认配置已加载（在官方DataSourceAutoConfiguration之前）
  ↳ 公司默认连接池参数已设置：最大连接数=20, 最小空闲=5
  
2025-10-10 10:30:15.123  INFO 12345 --- [main] o.s.b.a.j.DataSourceAutoConfiguration    : 
  Applying custom HikariConfig defaults...
  
✓ 数据源配置完成，使用公司统一默认参数
```

### 案例二：自定义缓存配置优先于 Redis 自动配置

**场景**：在 Spring Boot 的 `RedisAutoConfiguration` 之前，先设置 Redis 客户端的默认序列化策略。

#### 1. 自定义 Redis 配置预处理

```java
package com.company.autoconfigure;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator;
import org.springframework.boot.autoconfigure.AutoConfigureBefore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;

/**
 * 在 Redis 自动配置之前，提供统一的序列化策略
 */
@Configuration
@ConditionalOnClass({RedisConnectionFactory.class})
@AutoConfigureBefore(RedisAutoConfiguration.class)  // 在官方 Redis 配置之前
public class CompanyRedisSerializerAutoConfiguration {

    public CompanyRedisSerializerAutoConfiguration() {
        System.out.println("✅ [自动配置] 公司Redis序列化策略配置已加载（优先于RedisAutoConfiguration）");
    }

    /**
     * 提供统一的 JSON 序列化器
     */
    @Bean("companyRedisSerializer")
    public RedisSerializer<Object> companyRedisSerializer() {
        // 使用 Jackson2 进行序列化
        Jackson2JsonRedisSerializer<Object> serializer = 
            new Jackson2JsonRedisSerializer<>(Object.class);
        
        ObjectMapper mapper = new ObjectMapper();
        mapper.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        mapper.activateDefaultTyping(
            LaissezFaireSubTypeValidator.instance,
            ObjectMapper.DefaultTyping.NON_FINAL
        );
        
        serializer.setObjectMapper(mapper);
        System.out.println("  ↳ 公司统一Redis序列化器已创建：Jackson2JsonRedisSerializer");
        return serializer;
    }
}
```

#### 2. 应用配置文件

```yaml
# application.yml
spring:
  redis:
    host: localhost
    port: 6379
    database: 0
    timeout: 3000ms

# 可选：公司自定义配置
company:
  redis:
    serializer:
      enabled: true
      type: json
```

#### 3. 预期输出

```
✅ [自动配置] 公司Redis序列化策略配置已加载（优先于RedisAutoConfiguration）
  ↳ 公司统一Redis序列化器已创建：Jackson2JsonRedisSerializer

2025-10-10 10:31:20.456  INFO 12346 --- [main] o.s.b.a.d.r.RedisAutoConfiguration       : 
  Redis auto-configuration started
  Using custom serializer: companyRedisSerializer
```

### 案例三：使用 name 方式避免类依赖

**场景**：自动配置需要在某个第三方库的自动配置之前加载，但不想强依赖那个库。

```java
package com.company.autoconfigure;

import org.springframework.boot.autoconfigure.AutoConfigureBefore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 使用 name 方式，避免对 DruidDataSourceAutoConfiguration 的编译期依赖
 * 即使 Druid 不在类路径中，这个配置类也能正常编译
 */
@Configuration
@AutoConfigureBefore(name = {
    "com.alibaba.druid.spring.boot.autoconfigure.DruidDataSourceAutoConfigure",
    "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration"
})
public class FlexibleDataSourceAutoConfiguration {
    
    public FlexibleDataSourceAutoConfiguration() {
        System.out.println("✅ [自动配置] 灵活的数据源配置已加载");
        System.out.println("  ↳ 使用 name 方式声明顺序，无需编译期依赖");
    }
    
    @Bean
    @ConditionalOnClass(name = "com.alibaba.druid.pool.DruidDataSource")
    public Object druidCustomizer() {
        System.out.println("  ↳ 检测到 Druid，应用自定义配置");
        // 返回 Druid 的自定义配置
        return new Object() {
            @Override
            public String toString() {
                return "DruidCustomizer";
            }
        };
    }
}
```

## 八、调试与验证顺序

### 8.1 启动参数/配置开启调试

在 `application.properties` 中设置：
```properties
debug=true
logging.level.org.springframework.boot.autoconfigure=DEBUG
```

或启动时添加 `--debug` 参数。

### 8.2 查看条件评估报告

启动后会在控制台看到：

```
============================
CONDITIONS EVALUATION REPORT
============================

Positive matches:
-----------------

   CompanySecurityBaseAutoConfiguration matched:
      - @ConditionalOnClass found required class (OnClassCondition)

   CompanyAuditAutoConfiguration matched:
      - @ConditionalOnBean (types: CompanySecurityBaseAutoConfiguration.SecurityProperties) 
        found bean 'companySecurityProperties' (OnBeanCondition)
      - loaded in order: after CompanySecurityBaseAutoConfiguration, 
        before WebMvcAutoConfiguration

   CompanyWebEnhanceAutoConfiguration matched:
      - @ConditionalOnBean (types: CompanyAuditAutoConfiguration.AuditInterceptor) 
        found bean 'auditInterceptor' (OnBeanCondition)
      - loaded in order: after CompanyAuditAutoConfiguration, 
        after WebMvcAutoConfiguration
```

### 8.3 单元测试验证

```java
package com.company;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@TestPropertySource(properties = {"debug=true"})
public class AutoConfigurationOrderTest {
    
    @Test
    public void testConfigurationOrder() {
        System.out.println("\n========== 自动配置顺序测试 ==========");
        System.out.println("查看控制台输出，验证配置类的加载顺序");
        System.out.println("预期顺序：");
        System.out.println("  1️⃣ CompanySecurityBaseAutoConfiguration");
        System.out.println("  2️⃣ CompanyAuditAutoConfiguration");  
        System.out.println("  3️⃣ WebMvcAutoConfiguration");
        System.out.println("  4️⃣ CompanyWebEnhanceAutoConfiguration");
    }
}
```

## 九、常见使用场景总结

### 场景 1：在官方自动配置之前放入"覆盖默认值"的自定义默认

例如在 `DataSourceAutoConfiguration` 之前注册某些数据源属性或连接池策略，使官方配置基于你的默认再继续。

### 场景 2：在某个自动配置之后补充增强

虽然这是 `@AutoConfigureAfter` 的场景，但经常与 `@AutoConfigureBefore` 搭配定义"前后护栏"。

### 场景 3：基于可选依赖的顺序控制

使用 `name` 方式对不一定在类路径中的自动配置声明相对顺序。

## 十、最佳实践

### 10.1 优先用"条件装配"保证幂等与可覆盖性

- 用 `@ConditionalOnMissingBean` 暴露可覆盖的默认 Bean
- 用 `@ConditionalOnProperty` 控制开关，避免误注入
- 用 `@ConditionalOnClass` 确保依赖存在时才生效

### 10.2 能不用顺序就不用

多数问题可靠条件装配、Bean 定义的层次化设计解决。只有当确实需要影响相对顺序时再使用 `@AutoConfigureBefore/After`。

### 10.3 降低耦合

- 尽可能使用 `name` 方式声明顺序，避免硬依赖对方 class
- 将"扩展点"设计为小而聚焦的自动配置类，避免一个超大配置类做太多事

### 10.4 防止环状依赖

避免互相 Before/After 形成环；若无法消除，考虑用 `@AutoConfigureOrder` 提供全局数值顺序兜底。

### 10.5 与用户配置的关系

把"用户可轻易覆盖"的能力当作一等公民：你的自动配置给出"合理默认"，但永远允许用户在业务应用中自定义替换。

## 十一、常见误区

### 误区 1：误以为能改变 Bean 初始化顺序

`@AutoConfigureBefore` 只是调整"自动配置类的处理顺序"，并不直接保证某个 Bean 先创建。需要配合 `@DependsOn`、`@Order` 或合适的条件来确保特定 Bean 的初始化关系。

### 误区 2：给普通 @Configuration 加注解期待生效

❌ **不会生效**。只有参与自动配置导入的类才会被排序器处理。

### 误区 3：过度依赖顺序取代条件

复杂顺序关系可读性差、易脆弱。优先考虑"条件 + 可覆盖"的方式。

## 十二、快速参考小抄

| 需求                  | 使用方式                                                     |
| --------------------- | ------------------------------------------------------------ |
| 我的配置先于 X 生效   | `@AutoConfigureBefore(X.class)`                              |
| 我的配置在 X 之后补充 | `@AutoConfigureAfter(X.class)`                               |
| 给整体更高/更低优先级 | `@AutoConfigureOrder(数字)`（数字越小优先级越高）            |
| 不想引入对方类依赖    | `@AutoConfigureBefore(name = "完整限定类名")`                |
| 确保生效              | Boot 2.x：`spring.factories`；Boot 3.x：`AutoConfiguration.imports` |

## 十三、总结

`@AutoConfigureBefore` 是 Spring Boot 自动配置顺序控制的重要工具，核心要点：

✅ **作用明确**：声明自动配置类的相对加载顺序，让你的默认或前置初始化先一步发生

✅ **适用范围**：仅影响自动配置类之间的排序，不直接控制 Bean 初始化顺序

✅ **灵活搭配**：与 `@AutoConfigureAfter`、`@AutoConfigureOrder` 组合使用最灵活

✅ **条件装配**：合理搭配"条件装配"是长期可维护的关键

✅ **版本兼容**：Boot 2.x 与 3.x 在"发现自动配置"的清单文件位置不同，但注解本身的语义和用法保持一致

⚠️ **重要提醒**：`@AutoConfigureBefore` 只对 Spring Boot 的自动配置类生效，对普通的 `@Configuration` 注解类不生效！

通过合理使用 `@AutoConfigureBefore`，开发者可以精确控制自动配置类的加载顺序，确保应用配置按照预期生效，避免因加载顺序问题导致的配置冲突或覆盖。
