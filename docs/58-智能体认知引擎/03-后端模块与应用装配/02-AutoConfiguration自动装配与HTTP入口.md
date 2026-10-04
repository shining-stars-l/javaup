---
slug: /agent-up-memory/backend-architecture/auto-configuration-and-http-entrypoints
description: 按 Spring Boot 自动配置顺序讲解六个后端模块怎样注册接口实现，以及身份认证、MCP、模型、演化和召回入口怎样拿到这些 Bean。
keywords: [AutoConfiguration, AutoConfiguration.imports, ConditionalOnBean, ConditionalOnMissingBean, api, internal, 身份认证, MCP, 记忆召回]
---

import VipInline from '@site/src/components/VipInline';

# AutoConfiguration自动装配与HTTP入口

## 模块为什么能被 Spring Boot 找到

每个业务模块都有一份同名注册文件：

```text
src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

例如 `memory-recall` 的文件只有一行：

```text
org.javaup.memoryrecall.internal.MemoryRecallAutoConfiguration
```

Spring Boot 读取依赖 jar 里的这些文件，把类名当成自动配置候选。候选类本身在 `internal` 包里，外部代码不用直接依赖它；它创建出来的对象以 `api` 包接口类型返回。也就是说，模块之间交换的是 `MemoryRecall`、`ProjectGovernance`、`SystemMemoryGeneration` 这些接口契约，JDBC 实现留在各自模块里。

根目录的 `AGENTS.md` 也把这条约定写得很直白：后端模块通过各自的 `api` 包协作，`internal` 只供本模块使用，`bootstrap` 负责应用装配和对外入口。这个规则由 `bootstrap/src/test/java/org/javaup/bootstrap/ModuleArchitectureTest.java` 的 ArchUnit 测试守着：`api` 不能依赖任何 `internal`，其他模块也不能跨模块引用对方的 `internal`，bootstrap 更不能把领域包搬进来自己实现。

![AutoConfiguration.imports 的发现与 Bean 注册过程](/img/agent-up-memory/讲解/03-后端模块与应用装配/03-自动配置发现与注册.drawio.png)

<VipInline />