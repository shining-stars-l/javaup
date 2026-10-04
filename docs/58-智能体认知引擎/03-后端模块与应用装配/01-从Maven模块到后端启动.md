---
slug: /agent-up-memory/backend-architecture/maven-modules-and-startup
description: 沿 Maven 聚合、bootstrap 入口、数据源、Flyway 和健康检查，讲清智能体认知引擎后端是怎样启动的。
keywords: [Agent Up Memory, 后端模块, Maven, Spring Boot, bootstrap, Flyway, 健康检查]
---

import VipInline from '@site/src/components/VipInline';

# 从Maven模块到后端启动

## 先找到真正运行的模块

我第一次看这个仓库时，会先把根目录的 `pom.xml` 和 `bootstrap/pom.xml` 放在一起看。根 POM 是聚合工程，列出七个 Java 模块；真正有 `main()`、HTTP 服务和可执行 jar 的是 `bootstrap`。`automatic-memory-adapters` 是客户端适配器目录，不在这份 Maven reactor 的 `<modules>` 中。本节只看后端。

根 POM 的模块声明如下，它定义了 Maven reactor 的聚合范围；实际构建会按依赖拓扑排序，**不能把这段列表当成 Spring Bean 的实例化顺序**：

```xml
<modules>
    <module>identity-access</module>
    <module>workspace-governance</module>
    <module>memory-evolution</module>
    <module>memory-recall</module>
    <module>model-runtime</module>
    <module>security-audit</module>
    <module>bootstrap</module>
</modules>
```

这七块各负责一件事：`identity-access` 管登录、令牌和用户，`workspace-governance` 管项目和记忆库，`model-runtime` 管模型配置与调用，`memory-evolution` 管采集及分层整理，`memory-recall` 管索引与召回，`security-audit` 管审计，`bootstrap` 负责把它们装进一个进程。模块之间的具体业务细节，后续各功能目录会接着讲；这里先看它们怎样接通。

`bootstrap/pom.xml` 明确依赖六个业务模块，也引入 Web、JDBC、Flyway 和 PostgreSQL 驱动。`spring-boot-maven-plugin` 的 `mainClass` 指向 `org.javaup.bootstrap.AgentUpMemoryApplication`。因此打包出来的运行入口是 `bootstrap`，并没有七个各自启动的后端服务。

![Maven 模块依赖与运行边界](/img/agent-up-memory/讲解/03-后端模块与应用装配/01-Maven模块与运行边界.drawio.png)

<VipInline />