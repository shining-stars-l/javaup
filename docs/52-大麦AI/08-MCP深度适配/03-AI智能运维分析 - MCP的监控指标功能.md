---
slug: /damai-ai/mcp/metrics
---

import VipInline from '@site/src/components/VipInline';

# AI智能运维分析 - MCP的监控指标功能

## 前提准备
### 搭建 prometheus 和 grafana
大麦AI需要从 prometheus 来获取对应的数据，grafana 是用来可视化显示，所以需要把这这两个搭建好，搭建教程：

[项目集成prometheus和grafana | JavaUp 技术&实战](https://javaup.chat/damai/getting-started/prometheus-grafana)

## 启动项目
### 先启动 damai-mcp-metrics-service 模块
注意下 prometheus 的地址，如果是按照我的教程搭建的，在本地的 docker 启动，就不需改动

<!-- 这是一张图片，ocr 内容为：项目 DAMAI-MCP-METRICS-SERVICE/../APPLICATION.YAML 13 SPRING.AI.MCP.SERVER: DAMAI-AI/APPLICATIONS/JAVA/IDEA_WORK MY/GITEE/DAMAI-AI VERSION:1.0.0 .IDEA #禁用STDIO传输,使用SSE方式(配合WEBFLUX) 18 .VSCODE 19 STDIO: FALSE DAMAI-CORE-SERVICE #SSE端点路径 20 DAMAI-MCP-SERVER SSE-ENDPOINT://SSE 21 DAMAI-MCP-LOG-SERVICE[DAMAI-MCP-SERVER(1)] #SSE消息端点路径 22 DAMAI-MCP-METRICS-SERVICE 23 SSE-MESSAGE-ENDPOINT: /MCP/MESSAGE SRC 24 MAIN #PROMETHEUS配置 25 JAVA 26 PROMETHEUS: RESOURCES 27 URL:HTTP://LOCALHOST:9090 APPLICATIONYAML 28 TARGET #日志配置 29 -GITIGNORE LOGGING: 30 POM.XML 31 LEVEL: TARGET 32 ROOT: INFO .GITIGNORE ORG.JAVAUPMCP:DEBUG 33 POM.XML 34 LOGS SQL DAMAI.SGL TARGET VUE .GITIGNORE -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768045172267-8c1e2607-46e7-40c7-9380-d76bdbad8733.png)

<!-- 这是一张图片，ocr 内容为：项目 DAMAIMCPMETRICSAPPLICATION.JAVA CS6F3 TOGGLE HIGHLIGHT OF ALL OCCURRENCES DAMAI-AI/APPLICATIONS/JAVA/IDEA_WORK MY/GITEE/DAMAI-AI ORGJAVAUPMCP; PACKAGE 显示上下文操作 .IDEA 粘贴 GV IMPORT .VSCODE 复制/粘贴特殊 DAMAI-CORE-SERVICE 列选择模式 介绍8 DAMAI-MCP-SERVER @PROGRAM:大麦-AI智能服务项目.添加阿星不 DAMAI-MCP-LOG-SERVICE [DAMAI-MCP-SERVER(1)] 转到 @DESCRIPTION:大麦监控指标.MCP.SERVER. 回* DAMAI-MCP-METRICS-SERVICE 折叠 :阿星不是程序员 *@AUTHOR: SRC 分析 10 水水( MAIN 重命名... 仑F6 阿星不是程序员 11  PLICATION SPRINGBOOTAPPL JAVA DAMAIMCPMETRICSAPPLICATION 重构 CLASS 12 PUBLIC ORGJAVAUP.MCP 13 CONFIG 生成.. NG 14 PUBLIC STATIC VOID MAIN(STRINGL) ARGS) TOOL 添加内联监视 17 DAMAIMCPMETRICSAPPLICATION 编译并重新加载修改后的文件 18 RESOURCES RUN MAVEN WAPPLICATION.YAML DEBUG MAVEN TARGET .GITIGNORE OPEN TERMINAL AT THE CURRENT MAVEN MODULE PATH POM.XML 八介R 运行'DAMAIMCPMETRIC...MAIN() TARGET 调试'DAMAIMCPMETRIC...MAIN(' .GITIGNORE 更多运行/调试 POM.XML 打开于 LOGS 本地历史记录 SQL DAMAIMCPMETRICSAPPLICATION -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768045260330-3f752518-4360-4458-8626-fc5587008a18.png)

### 再启动 damai-mcp-log-service 模块
此教程在上一节的 AI智能运维分析 - MCP的分布式日志检索功能 章节中，已经详细讲解，这里就不再赘述，当然，如果不使用分布式日志分析功能的话，此 damai-mcp-log-service 模块也可以不启动。

如果不启动 damai-mcp-log-service 模块的话，注意在 damai-core-service 模块的配置中，要将 damai-log 的地址去掉，下面会有讲解

### 再启动 damai-core-service 模块
1. 把 阿里百炼 和 deepseek 的key配置到配置文件中
2. 把配置文件中的这段注释放开，（**注意：如果不启动 damai-mcp-log-service 模块的话，damai-log 这个配置地址要注释掉**

<!-- 这是一张图片，ocr 内容为：项目 APPLICATIONYAML SPRING: DAMAI-AI/APPLICATIONS/JAVA/IDEA WORK MY/GITEE/DAMAI-AI 28 .IDEA DEEPSEEK: 49 .VSCODE DAMAI-CORE-SERVICE 52 CHAT: SRC 53 OPTIONS: MAIN MODEL:DEEPSEEK-CHAT 54 IAVA "#-STDIO.和.SSE.两种模式不能同时使用,使用一种必须把另一种注释掉 55 RESOURCES 56 MCP: DATUM 57 CLIENT: META-INF.SPRING 58 STDIO: APPLICATIONYAML 59 SERVERS-CONFIGURATION:MCP-SERVERS.JSON LOG4J2.XML 60 SSE: MCP-SERVERS.JSON 61 CONNECTIONS: TARGET 62 DAMAI-LOG: .GITIGNORE 63 URL:HTTP://LOCALHOST:8085 POM.XML 64 DAMAI-METRICS DAMAI-MCP-SERVER 65 URL:HTTP://LOCALHOST:8086 DAMAI-MCP-LOG-SERVICE[DAMAI-MCP-SERVER(1)] EASY-ES: 66 DAMAI-MCP-METRICS-SERVICE #默认为TRUE,若为FALSE则认为不启用本框架 67 SRC ENABLE:TRUE 68 MAIN #ES的连接地址,必须含端口 69 ADDRESS:127.0.0.1:9200 70 ORG.JAVAUP.MCP #账号,若无则可省略此行配置 71 -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768045532029-16af00e6-39a0-4a4c-9987-6c3879e3f4db.png)

3. 配置好ES的地址和账号

<!-- 这是一张图片，ocr 内容为：项目 MAPPLICATIONYAMLX DAMAI-METRICS: #.................................................................................................... 61 DAMAI-AI /APPLICATIONS/JAVA/IDEA_WORK MY/GITEE/DAMAI-AI URL:HTTP://LOCALHOST:8086 62 .IDEA 63 EASY-ES: .VSCODE #默认为TRUE,若为FALSE则认为不启用本框架 64 DAMAI-CORE-SERVICE 65 ENABLE:TRUE SRC #ES的连接地址,必须含端口 66 MAIN ADDRESS::127.0.0.1:9200 JAVA #账号,若无则可省略此行配置 68 RESOURCES 69 USERNAME:ELASTIC DATUM #密码,若无则可省略此行配置 70 META-INF.SPRING 71 PASSWORD:ELASTIC APPLICATION.YAML 72 GLOBAL-CONFIG: LOG4J2.XML 73 DB-CONFIG: MCP-SERVERVERS.JSON #索引前缀 74 TARGET 75 INDEX-PREFIX:DAMAI .GITIGNORE 76 MYBATIS-PLUS: POM.XML 77 MAPPER-LOCATIONS:CLASSPATH:MAPPER/*.XML Y DAMAI-MCP-SERVER 78  GLOBAL-CONFIG: LOGS DB-CONFIG: 79 SQL LOGIC-DELETE-FIELD:STATUS 80 TARGET LOGIC-DELETE-VALUE:0 81 VUE LOGIC-NOT-DELETE-VALUE:1 82 .GITIGNORE  CONFIGURATION: 83 LICENSE .LOG-IMPL: ORG.APACHE.IBATIS.LOGGING.STDOUT.STDOUTIMPL 84 MCP日志查询功能说明文档.MD LOCAL-CACHE-SCOPE:STATEMENT 85 POM.XML README.MD -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768030677261-3d56127b-82e0-4e3f-8858-9fbb11da9bab.png)

4. 启动damai-core-service

<!-- 这是一张图片，ocr 内容为：项目 DAMAIAICOREAPPLICATION.JAVA QODER PACKAGE ORG. JAVAUP.AI; .VSCODE TOGGLE HIGHLIGHT OF ALL OCCURRENCES DAMAI-CORE-SERVICE 显示上下文操作 IMPORT ORG.DROMARA.EASYES.SPRING.ANNOT SRC 粘贴 ORG.MYBATIS.SPRING.ANNOTATION.M IMPORT MAIN IMPORT ORG.SPRINGFRAMEWORK.BOOT.SPRING 复制/粘贴特殊 JAVA 9 IMPORT ORG.SPR G.SPRINGFRAMEWORK.BOOT.AUTOCO ORG.JAVAUP.AI 列选择模式 介绍8 78 冰冰/ ADVISOR 转到 APROGRAM:大麦-AI智能服务项目.添加.阿 LAL * 折叠 9 ADESCRIPTION:大麦-AI智能服务项目启动类 COMMON 分析 阿星不是程序员 10 * @AUTHOR: CONFIG 11 水水 重命名... CONSTANTS @ESMAPPERSCAN("ORG.JAVAUP.AI.ES.MAPPER COTROLLER 重构 @MAPPERSCAN("ORG.JAVAUR.AI.MAPPER") DTO 生成.. 14 SPRINGBOOTAPPLICATION ENTITY 必编译并重新加载修改后的文件 15 DAMAIAICOREAPPLICATION PUBLIC CLASS ENUMS RUN MAVEN 16 ES.MAPPER PUBLIC STATIC VOID MAIN(STRING[] DEBUG MAVEN MAPPER 20 MYBATISPLUS OPEN TERMINAL AT THE CURRENT MAVEN MODULE PATH 了 21 SERVICE 人介R 运行'DAMAIAICOREAPP...MAINO 22 TEST 调试'DAMAIAICOREAPP...MAINO 公介D UTILS 更多运行/调试 打开于 DAMAIAICOREAPPLICATION 本地历史记录 RESOURCES DATUM GIT META-INF.SPRING 与剪贴板比较 MAPPLICATION.YAML 图表 LOG4J2.XML DAMAIAICOREAPPLICATION -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768030048106-4454a06f-ac8e-4fb6-8923-52a61209c53f.png)

### 启动前端项目
进入项目中的 vue 目录，执行以下命令启动

```shell
npm run dev
```

浏览器中输入 [http://localhost:5172/](http://localhost:5172/) 访问页面，选择大麦运维助手，即可进行对话

<!-- 这是一张图片，ocr 内容为：大麦AI 具体AI应用 大麦贴心助手 大麦规则助手 大麦运维助手 帮你解决大麦业务相关的问题 日志查询,链路追踪,系统监控 帮你解决大麦规则相关的问题 分析 -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768030287314-5a706638-f8f8-42f2-ab46-766d28724b19.png)

# 项目功能实现
## 1. 项目架构概述
本项目采用 **Spring AI + MCP（Model Context Protocol）** 架构，实现AI智能运维监控分析功能。核心模块包括：

| 模块 | 说明 |
| --- | --- |
| damai-core-service | AI核心服务，提供智能对话能力 |
| damai-mcp-metrics-service | MCP监控指标服务，提供系统监控查询工具 |


### 1.1 架构示意图
```plain
┌─────────────────────────────────────────────────────────────────┐
│                        前端应用                                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP请求
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   damai-core-service (AI核心服务)               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   ChatClient    │  │  ToolCallback   │  │   Advisors      │  │
│  │   (DeepSeek)    │  │   Provider      │  │   (记忆/历史)   │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘  │
│           │                    │                                 │
│           └─────────┬──────────┘                                 │
│                     │ MCP SSE 协议                               │
└─────────────────────┼───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│            damai-mcp-metrics-service (MCP监控服务)              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 MetricsQueryMcpTool                      │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │    │
│  │  │ 服务列表   │ │ JVM内存    │ │ GC指标     │           │    │
│  │  └────────────┘ └────────────┘ └────────────┘           │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │    │
│  │  │ 线程指标   │ │ CPU指标    │ │ 健康概览   │           │    │
│  │  └────────────┘ └────────────┘ └────────────┘           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │ PromQL 查询
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Prometheus                                 │
│               (监控数据存储与查询引擎)                           │
└─────────────────────────────────────────────────────────────────┘
```

<!-- 这是一张图片，ocr 内容为：Q SEARCH OR JUMP TO... A CIND+K 30S LAST 30 MINUTES QULCK FACTS NON-HEAP USED HEAP USED START TIME 3.2 29.91% 37.90% 2026-01-1015:09:56 HOUR `I/O OVERVIEW UTILISATION ERRORS 0.750 OPS/G 0.750 NO DATA NO DATA 0.500 0.250 9:30 19:30 19:45 18:20 0 OPS/S 19:25 19:25 19:30 19:35 19:20 19:35 19:40 19:30 HTTP-MAX CURRENT:6.61 MS JYM MEMORY JVM NON-HEAP JVM PROCESS MEMORY JVM TOTAL JVM HEAP 1.40 GIB 572 MIB 1B 381MIB NO DATA 477MID 191 MIB 0.500 B 0B 0B 19:20 18:35 19:20 18:40 19:45 19:45 19:45 19:40 19:25 19:25 19:30 10:30 19:25 19:30 USED MAX:410 MIB CURRENT:342 MIB USED MAX:257MIB CURRONT:189 MIB COMMITTED  MAX:466 MIB CURRENT:466 MIB COMMITTED MAX:156 MIB CURRONT:156MIB COMMITTED MEX:310 MIB CUMENT:310 MIB OB MAX MAX:512 MIB CURRENT:512 MIB MAX MAX: 512 MIB CURRONT :512 MIB MAX MAX:1024 MIB CURRENT:1024 MIB -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768045779011-20a43d5c-ebf2-4846-a9b2-0f223083430d.png)

## 2. MCP调用方式说明
MCP（Model Context Protocol）支持两种调用方式：

### 2.1 STDIO方式（本地调用）
**原理：** 通过标准输入/输出（stdin/stdout）直接通信，MCP Server作为子进程运行。

**特点：**

+ 简单直接，无需网络配置
+ MCP Server与AI服务在同一进程/机器上
+ 适合开发调试、单机部署场景

### 2.2 SSE方式（远程调用）
**原理：** 通过HTTP + Server-Sent Events协议通信，MCP Server作为独立服务运行。

**特点：**

+ 支持跨网络调用，MCP Server可部署在远程服务器
+ 服务独立运行，便于扩展和管理
+ 适合生产环境、分布式部署场景

### 2.3 本项目采用的方式
**本项目采用 SSE 远程调用方式**：

| 对比项 | STDIO方式 | SSE方式（本项目采用） |
| --- | --- | --- |
| 部署方式 | 子进程 | 独立服务 |
| 网络支持 | 仅本地 | 支持远程 |
| 服务管理 | 依赖主进程 | 独立管理 |
| 扩展性 | 较差 | 易于扩展 |
| 适用场景 | 开发调试 | 生产环境 |


## 3. damai-core-service（AI核心服务）配置
### 3.1 MCP客户端依赖配置
在 `damai-core-service/pom.xml` 中添加MCP客户端依赖：

```xml
<!-- MCP Client - 用于调用外部MCP服务 -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-mcp-client</artifactId>
</dependency>

```

### 3.2 MCP服务连接配置
在 `application.yaml` 中配置MCP服务连接：

```yaml
spring:
  ai:
    mcp:
      client:
        sse:
          connections:
            damai-log:
              url: http://localhost:8085
            damai-metrics:
              url: http://localhost:8086
```

**配置说明：**

+ `sse.connections`: 使用SSE（Server-Sent Events）方式连接MCP服务
+ `damai-metrics`: MCP监控指标服务的连接名称
+ `url`: MCP监控服务的访问地址（端口8086）

### 3.3 MCP客户端配置类
`McpClientConfig.java` 将MCP客户端工具注册到Spring AI：

```java
@Configuration
public class McpClientConfig {

    /**
     * 将MCP客户端的工具注册为ToolCallbackProvider
     * 这样ChatClient就可以使用MCP服务器提供的工具了
     */
    @Bean
    public ToolCallbackProvider mcpToolCallbackProvider(List<McpSyncClient> mcpSyncClients) {
        return new SyncMcpToolCallbackProvider(mcpSyncClients);
    }
}
```

### 3.4 运维分析ChatClient配置
`DaMaiAiAutoConfiguration.java` 中配置了用于运维分析的ChatClient，同时注入日志查询和监控指标工具：

```java
@Bean
public ChatClient analysisChatClient(DeepSeekChatModel model, ChatMemory chatMemory,
                                      ChatTypeHistoryService chatTypeHistoryService,
                                      @Qualifier("titleChatClient")ChatClient titleChatClient,
                                      @Qualifier("mcpToolCallbackProvider") ToolCallbackProvider mcpToolCallbackProvider) {
    return ChatClient
            .builder(model)
            .defaultSystem(DaMaiConstant.DA_MAI_ANALYSIS_PROMPT)
            .defaultAdvisors(
                    new SimpleLoggerAdvisor(),
                    ChatTypeHistoryAdvisor.builder(chatTypeHistoryService).type(ChatType.ANALYSIS.getCode())
                            .order(CHAT_TYPE_HISTORY_ADVISOR_ORDER).build(),
                    ChatTypeTitleAdvisor.builder(chatTypeHistoryService).type(ChatType.ANALYSIS.getCode())
                            .chatClient(titleChatClient).chatMemory(chatMemory).order(CHAT_TITLE_ADVISOR_ORDER).build(),
                    MessageChatMemoryAdvisor.builder(chatMemory).order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER).build()
            )
            // 使用 MCP 工具（日志查询等）
            .defaultToolCallbacks(mcpToolCallbackProvider)
            .build();
}
```

**关键点：**

+ `mcpToolCallbackProvider` 包含了所有MCP服务的工具（日志+监控）
+ AI在对话时可以自动选择并调用合适的MCP工具<!-- 这是一张图片，ocr 内容为： -->
  {/* ![](./screenshots/chatclient-metrics-config.png) */}

### 3.5 运维助手系统提示词（监控相关部分）
```java
【系统监控规则】
1. 当用户询问系统性能、JVM、内存、线程等指标时：
   - 调用工具从 Prometheus/Grafana 获取监控数据
   - 分析指标是否正常，是否有异常波动
2. 常见监控指标包括：
   - JVM 堆内存使用率、GC 次数和耗时
   - 线程数、死锁线程
   - CPU 使用率、系统负载
   - 接口响应时间、QPS、错误率
```

## 4. damai-mcp-metrics-service（MCP监控服务）配置
### 4.1 MCP服务端依赖配置
在 `damai-mcp-metrics-service/pom.xml` 中添加MCP服务端依赖：

```xml
<!-- MCP Server WebFlux Starter - 支持SSE远程访问 -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-mcp-server-webflux</artifactId>
</dependency>
<!-- FastJSON - JSON解析 -->
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>fastjson</artifactId>
    <version>${fastjson.version}</version>
</dependency>

```

### 4.2 MCP服务端配置
在 `application.yaml` 中配置MCP服务端：

```yaml
server:
  port: 8086

spring:
  application:
    name: damai-mcp-metrics-service
  main:
    # 使用WebFlux支持SSE
    web-application-type: reactive

# MCP Server配置
spring.ai.mcp.server:
  # MCP Server名称
  name: damai-metrics-mcp
  # MCP Server版本
  version: 1.0.0
  # 禁用STDIO传输，使用SSE方式
  stdio: false
  # SSE端点路径
  sse-endpoint: /sse
  # SSE消息端点路径
  sse-message-endpoint: /mcp/message

# Prometheus 配置
prometheus:
  url: http://localhost:9090
```

**配置说明：**

+ 端口：8086
+ 使用WebFlux支持SSE传输
+ 通过Prometheus API获取监控数据<!-- 这是一张图片，ocr 内容为： -->
  {/* ![](./screenshots/mcp-metrics-server-config.png) */}

## 5. MetricsQueryMcpTool 功能详解
**代码位置：org.javaup.mcp.tool.MetricsQueryMcpTool**

`MetricsQueryMcpTool` 是MCP监控指标查询的核心工具类，通过 `@Tool` 注解定义了以下7个功能：

### 5.1 功能列表总览
| 功能名称 | 方法名 | 功能描述 |
| --- | --- | --- |
| 获取服务列表 | `getMetricsServiceList()` | 获取所有被Prometheus监控的微服务列表 |
| JVM内存查询 | `getJvmMemory()` | 查询JVM堆内存使用情况（已用/最大/使用率） |
| GC指标查询 | `getGcMetrics()` | 查询GC垃圾回收指标（次数/耗时） |
| 线程指标查询 | `getThreadMetrics()` | 查询线程指标（活跃/峰值/状态分布） |
| CPU指标查询 | `getCpuMetrics()` | 查询CPU使用情况（进程/系统CPU使用率） |
| 服务健康概览 | `getServiceHealthOverview()` | 查询单个服务的综合健康状态 |
| 全局健康状态 | `getAllServicesHealth()` | 查询所有服务的健康状态概览 |


### 5.2 功能详细说明
#### 5.2.1 获取服务列表 - getMetricsServiceList()
```java
@Tool(description = "获取大麦系统中所有被 Prometheus 监控的微服务列表")
public ToolResult getMetricsServiceList()
```

**功能说明：** 通过Prometheus API获取所有上报监控数据的微服务名称

**返回数据：**

+ 服务列表
+ 服务数量

#### 5.2.2 JVM内存查询 - getJvmMemory()
```java
@Tool(description = "查询指定微服务的 JVM 堆内存使用情况，包括已用内存、最大内存、使用率等")
public ToolResult getJvmMemory(
        @ToolParam(description = "服务名称，如：user-service、order-service") String serviceName)
```

**参数说明：**

+ `serviceName`: 必填，服务名称

**返回数据：**

+ 堆内存概览（已使用、已提交、最大值、使用率）
+ 内存池详情（Eden Space、Survivor Space、Old Gen等）

**PromQL查询：**

```plain
jvm_memory_used_bytes{application="服务名",area="heap"}
jvm_memory_max_bytes{application="服务名",area="heap"}
jvm_memory_committed_bytes{application="服务名",area="heap"}
```

#### 5.2.3 GC指标查询 - getGcMetrics()
```java
@Tool(description = "查询指定微服务的 GC（垃圾回收）指标，包括 GC 次数、GC 耗时等")
public ToolResult getGcMetrics(
        @ToolParam(description = "服务名称，如：user-service") String serviceName)
```

**返回数据：**

+ GC类型（Young GC / Old GC）
+ GC次数
+ 总耗时
+ 平均耗时

**PromQL查询：**

```plain
jvm_gc_pause_seconds_count{application="服务名"}
jvm_gc_pause_seconds_sum{application="服务名"}
```

#### 5.2.4 线程指标查询 - getThreadMetrics()
```java
@Tool(description = "查询指定微服务的线程指标，包括活跃线程数、峰值线程数、守护线程数等")
public ToolResult getThreadMetrics(
        @ToolParam(description = "服务名称，如：user-service") String serviceName)
```

**返回数据：**

+ 线程概览（活跃线程数、峰值线程数、守护线程数）
+ 线程状态分布（RUNNABLE、WAITING、TIMED_WAITING、BLOCKED等）

**PromQL查询：**

```plain
jvm_threads_live_threads{application="服务名"}
jvm_threads_peak_threads{application="服务名"}
jvm_threads_daemon_threads{application="服务名"}
jvm_threads_states_threads{application="服务名"}
```

#### 5.2.5 CPU指标查询 - getCpuMetrics()
```java
@Tool(description = "查询指定微服务的 CPU 使用情况，包括进程 CPU 使用率和系统 CPU 使用率")
public ToolResult getCpuMetrics(
        @ToolParam(description = "服务名称，如：user-service") String serviceName)
```

**返回数据：**

+ 进程CPU使用率
+ 系统CPU使用率
+ 可用处理器数

**PromQL查询：**

```plain
process_cpu_usage{application="服务名"}
system_cpu_usage{application="服务名"}
system_cpu_count{application="服务名"}
```

#### 5.2.6 服务健康概览 - getServiceHealthOverview()
```java
@Tool(description = "查询指定微服务的健康概览，包括 JVM内存、CPU、线程、GC 等关键指标的综合展示")
public ToolResult getServiceHealthOverview(
        @ToolParam(description = "服务名称，如：user-service") String serviceName)
```

**返回数据：**

+ JVM内存（堆内存已用/最大/使用率）
+ CPU使用率
+ 活跃线程数
+ GC统计（总次数/总耗时）
+ 健康状态（✅ 正常 / ⚠️ 告警）

**健康状态评估规则：**

+ 内存使用率 > 90%：⚠️ 内存告警
+ 内存使用率 > 80%：⚠️ 内存较高
+ CPU使用率 > 80%：⚠️ CPU较高
+ 其他情况：✅ 正常

#### 5.2.7 全局健康状态 - getAllServicesHealth()
```java
@Tool(description = "查询所有微服务的健康状态概览，快速了解系统整体运行情况")
public ToolResult getAllServicesHealth()
```

**返回数据：**

+ 服务数量
+ 每个服务的健康状态列表（服务名、内存使用率、CPU使用率、线程数、状态）

## 6. AI对话调用功能示例
### 6.1 获取监控服务列表
**用户对话示例：**

```plain
用户：系统中有哪些服务被监控了？
用户：帮我查看一下Prometheus监控的服务列表
用户：大麦系统有哪些服务有监控数据？
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 系统中有哪些服务被监控了? 我来为也查调大表系统中接POMENENS监控的所有效服务列表.根据系统查询结果,大变系统中目的有9个值服务部个德服务部 如下 被监控的微服务列表 序号 服务名称 描述 后台管理服务 1 ADMIN-SERVICE 2 基础数据服务(城市,场馆等) BASE-DATA-SERVICE 3 定制服务 CUSTOMIZE-SERVICE 网关服务(请求路由,鉴权,限流) 4 GATEWAY-SERVICE 5 迁移服务 MIGRATE-SERVICE 订单服务 6 ORDER-SERVICE 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768053521951-557be7fe-fb9c-4e11-8ded-0ed1756e9437.png)

### 6.2 查询JVM内存
**用户对话示例：**

```plain
用户：帮我查看order-service的JVM内存使用情况
用户：user-service的堆内存用了多少？
用户：订单服务的内存使用率是多少？
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 帮我查看ORDER-SERVICE的JVM内存使用情况 我来帮您查看ORDER-SERVICE的JVM内存使用情况.根据查询结果,我来为您分析ORDER-SERVICE的JVM内存使用情况: LORDER-SERVICEJVM内存使用分析 堆内存概览 服务名称:ORDER-SERVICE 已使用内存:252.55MB 最大堆内存:512.00 MB 已提交内存:304.00MB 内存使用率:49.33% 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768053571204-7e73214f-44b8-448c-9465-7307f888a1dc.png)

### 6.3 查询GC指标
**用户对话示例：**

```plain
用户：order-service的GC情况怎么样？
用户：帮我看一下用户服务的垃圾回收次数
用户：支付服务的GC耗时多少？
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 ORDER-SERVICE的GC情况怎么样? 我来帮您查询ORDER-SERVICE的GC(垃圾回收)指标情况.根据查询结果,我来为您分析ORDERVICE的GC情况: ORDER-SERVICE GC指标分析 GC统计概览: 服务名称: :ORDER-SERVICE GC类型:G1垃圾收集器 详细指标: 1.G1 EVACUATION PAUSE(年轻代GC): 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768053616635-97bc6420-634e-4af6-91d0-78410599ff15.png)

### 6.4 查询线程指标
**用户对话示例：**

```plain
用户：order-service的线程数是多少？
用户：帮我看看用户服务的线程状态分布
用户：有没有线程阻塞的情况？
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 ORDER-SERVICE的线程数是多少? 我来帮您查询ORDER-SERVICE的线程指标.让我获取该服务的线程使用情况.根据查询结果,ORDERVICE的线程指标如下; ORDER-SERVICE线程指标概览 线程数量统计 活跃线程数:200 峰值线程数:225 守护线程数:117 线程状态分布 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768053660939-7c683906-12f2-46ce-a5d2-3f90d24cc464.png)

### 6.5 查询CPU指标
**用户对话示例：**

```plain
用户：order-service的CPU使用率是多少？
用户：系统CPU负载高不高？
用户：帮我看一下各服务的CPU使用情况
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 ORDER-SERVICE的CPU使用率是多少? 现来帮您查询ORDER-SERNVICE的CPU使用率.让现先获取相关的监控数据,根据查询结果,ORDER-SENVICE的CPU使用率情况如下: ORDER-SERVICE  CPU 使用率报告 数值 指标 服务名称 ORDER-SERVICE 系统CPU使用率 13.83% 进程CPU使用率 0.08% 可用处理器数 12 分析结论 1 CPU使用率状杰: 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768053699897-b0b89eae-fb02-48dd-86d9-8c2cede05274.png)

### 6.6 查询服务健康概览
**用户对话示例：**

```plain
用户：order-service的运行状态怎么样？
用户：帮我看一下订单服务的健康状况
用户：用户服务有没有什么问题？
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 ORDER-SERVICE的运行状态怎么样? 镜来带总检查ODA-SARVICE的运行状态,首先让我获取该服务的健康被跑信息.我来为您查询ODAR-SERVICE的运行状态.根据链保核定取报品示 ORDER-SERVICE运行状态分析 健康状态概览 服务名称:ORDER-SERVICE 健康状态: 正常 JVM 内存使用情况 堆内存已用:136.45 MB 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768053767500-08595e1d-5da9-4fc6-afb4-86fc89a84ff0.png)

## 8. 总结
### 8.1 核心调用流程
```plain
用户对话 → ChatClient(analysisChatClient) 
         → AI模型分析意图 
         → 调用MCP工具(MetricsQueryMcpTool) 
         → 查询Prometheus监控数据 
         → AI整理结果并给出分析建议 
         → 返回给用户
```


<VipInline />