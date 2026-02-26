---
slug: /damai-ai/mcp/log
---

# AI智能运维分析 - MCP的分布式日志检索功能

import VipInline from '@site/src/components/VipInline';

## 前提准备
### 大麦项目上报日志到ELK中
此日志数据需要从大麦项目上报，所以需要启动大麦项目，并每个服务中的log4j2.xml中的上报功能开启（默认给注释了）

<!-- 这是一张图片，ocr 内容为：4 DAMAI-BASE-DATA-SERVICE/.../LOG4J2.XML [ 项目 每个服务的LOG4J2.XML都要处理 8 [CONFIGURATION STATUS="WARN" MONITORINTERVAL="600"] DAMAL-SERVER APPENDERS] DAMAI-ADMI -ROILINGFILE NANE三'ROLLINGFILEERTORI FSLENANE号' S(LO6-HONE)/LO95/5(EROJECT.NAHE.S/FILE,NAHE/-ERTOF,L DAMAL-BASE-DATA-SERVICE [POLICIES] [/ POLICIES ] 57 ===最多保留文件数 58 [DEFAULTROLLOVERSTRATEQY MAX='30'/] RESOURCES [/ ROLLINGFILE ] M.APPLIRATION.YML APPLICATION-IOCAL.YML APPLICATION-PRO (SOCKET:NAME="LOGSTASH" HOST="127.0.9.1" PORT="5047" PROTOCOL="TCP") LOG4/2.XML [THRESHOLDFILTER LEVEL="INFO" /] S/SOCKETS HTPPENDERS LOGGERS DAA (过滤掉SPRING和MYBATIS的一些无用的DEBUG信息) NAME='ORG.SPRINGFRAMEWORK' LEVEL='INFO' ADDITIVITY='TRUE' /] [LOGGER NAME='ORG.MYBATIS' LEVEL='INFO' ADDITIVITY='TRUE' /] 注释放开 72 ==配置日志的根节点 DAMAI-PAY-SERVICE 73 [ROOT LEVEL='INFO' ] HDAMAI-PROGRAM-SERVICE 74 [APPENDER-REF REF='CONSOLE' /] 75 [APPENDER-REF REF='ROLLINGFILE' /] [APPENDER-REF REF='ROLLINGFILEERROR' /] [APPENDER-REF REF='LOGSTASH' /] POM.XML ROOT [/ LOGGERS ] DAMAI-SPRING-CLOUD-FRAMEWORK [/ CONFIGURATION ] DAMAI-THREAD-POOL-FRAMEWORK LOGS -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768028620670-8f437611-ebf2-4cb4-b913-b85a2324b2cd.png)

### 搭建ELK
需要搭建 ElasticSearch、Logstash、Kibana，这三个一起就叫做 ELK，因为 Logstash 在配置启动时的索引必须要配置，这样就没办法让这个索引实现可配置化了，**<span style={{color:'#DF2A3F'}}>所以需要小伙伴自己来搭建ELK了</span>**。

搭建教程地址：

[如何安装项目需要的中间件环境 | JavaUp 技术&实战](https://javaup.chat/damai/getting-started/install-dependencies)

### 访问ELK
搭建好ELK后，启动大麦项目的服务，就可以将日志上报给ELK了，接着进入Kibana中，来创建日志视图进行查看日志

**选择左侧菜单 Management 下的 Stack Management**

<!-- 这是一张图片，ocr 内容为：内容等 例如: ELASTIC 查找应用, DISCOVER 主页 HOME 欢迎归来 运行时间 USER EXPERIENCE SECURITY 仪表板 十 告警 结果 安全 OBSERVABILITY 分析 ENTERPRISE SEARCH 时间线 预防,收集,检测和响应威胁,以对整 通过专用UI 整合您的日志,指标,应用 使用一组优化的API和工具打造搜索体 使用一套强大的分析工具和应用程序浏 案例 个基础架构提供统一的保护. 程序跟踪和系统可用性. 览,可视化和分析您的数据. 验. 浏览 INTELLIGENCE 管理 通过添加集成开始使用 MANAGEMENT 开发工具 要开始使用您的数据,请使用我们众多采集选项中的一个选项.从应用或服务收集 数据,或上传文件.如果未准备好使用自己的数据,请添加示例数据集. 集成 FLEET 添加集成 试用样例数据 上传文件 OSQUERY 堆栈监测 STACK MANAGEMENT 管理 开发工具 STACK MANAGEMENT 添加集成 -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768029158657-20e12b1a-21b9-451b-be09-a8a92048b2ed.png)

**选择 数据视图，创建数据视图**

<!-- 这是一张图片，ocr 内容为：查找应用, ELASTIC 内容等.例如: DISCOVER 默 数据视图 STACK MANAGEMENT 拍取快照并还原 汇总/打包作业 转换 远程集群 您在 ELASTICSEARCH 中有数据. 现在,创建数据视图. 告警和洞见 规则和连接器 数据视图标识您要浏览的ELASTICSEARCH数据.您可以将数据视 案例 11 图指向一个或多个数据流,索引和索引别名(例如昨天的日志 REPORTING 数据),或包含日志数据的所有索引. MACHINE LEARNING 创建数据视图 安全@ 用户 角色 希望了解详情?阅读文档 API密钥 KIBANA 数据视图 已保存对象 标签 搜索会话 工作区 高级设置 STACK 许可管理 -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768029289630-8f94e0cc-7890-44da-9275-8e605fb0e02b.png)

**名称输入 damai-logs，索引模式输入 damai-logs-*，然后点击 保存数据视图到Kibana**

<!-- 这是一张图片，ocr 内容为：ELASTIC 查找应用, DISCOVER 数据视图 STACK MANAGEMENT 拍取快照并还原 创建数据视图 您的索引模式匹配2个源. 汇总/打包作业 转换 名称 DAMAL-LOGS-2026.01.09 系引 远程集群 DAMAI-LOG5 DAMAI-LOGS-2026.01.10 系引 告警和润见 索引模式 规则和连接器 每页行数:10 DAMAL-IOGS-* 案例 晚入是一个或多个数些遭已经的装引展式,使用显号(竹)匹配多个字符,天允许使用空感和宇特/.7.",",1. REPORTING MACHINE LEARNING 时间磁字段 安全 选择用于全与时无筛运的时间最字段, 用户 显示高级设工 角色 API密钥 KIBANA 数据视图 已保存对象 标签 按索会话 工作区 高级设置 STACK 0 许可管理 保存数据视图到 KIBANA X 关闭 -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768029335725-176871bd-d5eb-407a-8578-a18810355dea.png)

**点击 Analytics 下的 Discover，就可以查看日志信息了**

<!-- 这是一张图片，ocr 内容为：查找应用,内容等.例如:DISCOVER ELASTIC /光 默 数据视图 DAMAI-LOGS STACK MANAGEMENT HOME DAMAI-LOGS ANALYTICS 索引模式: 时间字段: DISCOVER PTIMESTAMP DAMAI-LOGS- DASHBC DISCOVER 脚本字段(0)字段筛选(0)关系(0) 字段(131) CANVAS MAPS 搜索 MACHINE LEARNING VISUALIZE LIBRARY 可聚合 格式 可搜索 名称个 类型 @TIMESTAMP S DATE ENTERPRISE SEARCH TEXT @VERSION 概览 内容 @VERSION.KEYWORD KEYWORD ELASTICSEARCH ID ID APP SEARCH INDEX INDEX WORKPLACE SEARCH OBSERVABILITY -SOURCE -SOURCE 概览 TEXT ENV 告警 案例 KEYWORD ENV.KEYWORD -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768029423688-6603e7ac-410e-4192-bcc0-8a89c95daac0.png)

## 启动项目
### 先启动 damai-mcp-log-service 模块
<!-- 这是一张图片，ocr 内容为：DAMAI-MCP-LOG-SERVICE/...../APPLICATION. 项目 13 SPRING.AI.MCP.SERVER: DAMAI-AI/APPLICATIONS/JAVA/IDEA WORK MY/GITEE/DAMAI-AI ZZ #SSE消息端点路径 .IDEA 23 SSE-MESSAGE-ENDPOINT: /MCP/MESSAGE .VSCODE 24 DAMAI-CORE-SERVICE 25 #.EASY-ES 配置.-连接.ELASTICSEARCH DAMAI-MCP-SERVER 26 EASY-ES: DAMAI-MCP-LOG-SERVICE [DAMAI-MCP-SERVER(1)] 27 ENABLE:TRUE 配置好ES的地址和账号 SRC 28 #.B连接地址,根据实际情况修改 MAIN 29 ADDRESS:127.0.0.1:9200 JAVA 30 #如果ES有认证,配置用户名密码 O RESOURCES 31 USERNAME:ELASTIC LAPPLICATION.YAML 32 PASSWORD:ELASTIC TARGET #全局索引前缀(可选) 33 -GITIGNORE 34 GLOBAL-CONFIG: POM.XML #不使用全局前缀,因为索引名已经是DAMAI-LOGS- 35 DAMAI-MCP-METRICS-SERVICE 36 PROCESS-INDEX-MODE:MANUAL TARGET 37 GITIGNORE #日志配置 38 POM.XML 39 LOGGING: LOGS LEVEL: 40 SQL 41 INFO ROOT: TARGET 42 ORGJAVAUPMCP:INFO VUE 43 ORG.DROMARA.EASYES: INFO -GITIGNORE 44 LICENSE -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768030550693-2a2c5792-2cad-426c-a2dc-405f21dcfa96.png)

<!-- 这是一张图片，ocr 内容为：项目 DAMAIMCPLOGAPPLICATION.JAVA QODER PACKAGE DAMAI-AI/APPLICATIONS/JAVA/IDEA_WORK_MY/GITEE/DAMAI-AI ORGJAVAUPMCP; TOGGLE HIGHLIGHT OF ALL OCCURRENCES 七鄂F3 IDEA 显示上下文操作 IMPORT VSCODE 粘贴 DAMAI-CORE-SERVICE 水水/ DAMAI-MCP-SERVER 复制/粘贴特殊 PROGRAM.大麦-AI智能服务项目.添加阿星不是 DAMAI-MCP-LOG-SERVICE [DAMAI-MCP-SERVER(1)] 列选择模式 介绍8 *@DESCRIPTION:这是一个独立运行的MCP.SERVER SRC 转到 @AUTHOR:阿星不是程序员 10 *-0 MAIN 折叠 11 水水 JAVA 分析 121 @SPRINGBOOTAPPLICATION   阿星不是程序员 ORG.JAVAUP.MCP @ESMAPPERSCAN("ORG.JAVAUP.MCP.MAPPER") 13 重命名.. CONFIG 介F6 14 PUBLIC CLASS DAMAIMCPLOGAPPLICATION ENTITY 重构 15 生成. M PUBLIC STATIC VOID MAIN(STRING[] ARGS) 16 编译并重新加载修改后的文件 19 DAMAIMCPLOGAPPLICATION 20 RUN MAVEN RESOURCES DEBUG MAVEN TARGET GITIGNORE OPEN TERMINAL AT THE CURRENT MAVEN MODULE PATH POM.XML 公介R 运行 DAMAIMCPLOGAPP....MAIN() DAMAI-MCP-METRICS-SERVICE 调试 DAMAIMCPLOGAPP....MAIN() 合D TARGET 更多运行/调试 .GITIGNORE 打开于 POM.XML 本地历史记录 LOGS SQL GIT TARGET 与剪贴板比较 图表 -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768029698801-efc23ec5-8b40-4718-a509-e0034e53da93.png)

### 再启动 damai-core-service 模块
1. 把 阿里百炼 和 deepseek 的key配置到配置文件中
2. 把配置文件中的这段注释放开，（注意：不要放开damai-metrics这行，因为这是另一个mcp功能）

<!-- 这是一张图片，ocr 内容为：项目 APPLICATION.YAML 8 SPRING: SRC 28 AI: MAIN 39 OPENAI: JAVA MODEL:QWEN-MAX-LATEST 44 ORG.JAVAUP.AI 45 EMBEDDING: ADVISOR 46 OPTIONS: AI 47 MODEL:TEXT-EMBEDDING-V3 COMMON 48 DIMENSIONS:1024 CONFIG 49 DEEPSEEK: CONSTANTS 50 BASE-URL:HTTPS://API.DEEPSEEK.COM COTROLLER -API-KEY: ${DEEPSEEK的KEY} 51 DTO CHAT: 52 ENTITY 53 OPTIONS: ENUMS 54 MODEL:DEEPSEEK-CHAT ES.MAPPER 55 MCP: MAPPER 56 CLIENT: MYBATISPLUS 57 SSE! SERVICE 58 CONNECTIONS: TEST 59 DAMAI-LOG: UTILS URL:HTTP://LOCALHOST:8085 60 VO DAMAI-METRICS: DAMAIAICOREAPPLICATION URL:HTTP://LOCALHOST:8086 RESOURCES 63 EASY-ES DATUM #默认为TRUE,若为FALSE则认为不启用本框架 64 META-INF.SPRING 65 ENABLE: TRUE APPLICATION.YAML 99 #ES的连接地址,必须含端口 LOG4J2.XML ADDRESS:: 127.0.0.1:9200 67 {MCP-SERVERS.JSON -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768029918637-15aa229d-7fea-4637-a644-1a78b086e9c2.png)

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

### 和 AI 进行沟通，实现日志检索
具体的对话内容可以在此文档下方的 **6. AI对话调用功能示例** 章节中看到

# 项目功能实现
## 1. 项目架构概述
本项目采用 **Spring AI + MCP（Model Context Protocol）** 架构，实现AI智能运维分析功能。核心模块包括：

| 模块 | 说明 |
| --- | --- |
| damai-core-service | AI核心服务，提供智能对话能力 |
| damai-mcp-log-service | MCP日志查询服务，提供日志查询工具 |


### 1.1 架构示意图
```plain
┌─────────────────────────────────────────────────────────────────┐
│                        前端应用                                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP请求
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   damai-core-service (AI核心服务)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   ChatClient    │  │  ToolCallback   │  │   Advisors      │  │
│  │   (DeepSeek)    │  │   Provider      │  │   (记忆/历史)   │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘  │
│           │                    │                                 │
│           └─────────┬──────────┘                                 │
│                     │ MCP SSE 协议                               │
└─────────────────────┼───────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│               damai-mcp-log-service (MCP日志服务)               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  LogQueryMcpTool                         │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │    │
│  │  │ 服务列表   │ │ 关键词搜索 │ │ 链路追踪   │           │    │
│  │  └────────────┘ └────────────┘ └────────────┘           │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │    │
│  │  │ 最新日志   │ │ 错误日志   │ │ 日志统计   │           │    │
│  │  └────────────┘ └────────────┘ └────────────┘           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Easy-ES
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Elasticsearch                               │
│                   (damai-logs-* 索引)                           │
└─────────────────────────────────────────────────────────────────┘
```

## 2. MCP调用方式说明
MCP（Model Context Protocol）支持两种调用方式，根据不同场景选择合适的传输协议：

### 2.1 STDIO方式（本地调用）
**原理：** 通过标准输入/输出（stdin/stdout）直接通信，MCP Server作为子进程运行。

**特点：**

+ 简单直接，无需网络配置
+ MCP Server与AI服务在同一进程/机器上
+ 适合开发调试、单机部署场景

**配置示例：**

```yaml
spring:
  ai:
    mcp:
      client:
        stdio:
          servers-configuration: classpath:mcp-servers.json
```

```json
// mcp-servers.json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-filesystem", "/path/to/dir"]
    }
  }
}
```

### 2.2 SSE方式（远程调用）
**原理：** 通过HTTP + Server-Sent Events协议通信，MCP Server作为独立服务运行。

**特点：**

+ 支持跨网络调用，MCP Server可部署在远程服务器
+ 服务独立运行，便于扩展和管理
+ 适合生产环境、分布式部署场景

**配置示例：**

```yaml
spring:
  ai:
    mcp:
      client:
        sse:
          connections:
            damai-log:
              url: http://localhost:8085
```

### 2.3 本项目采用的方式
**本项目采用 SSE 远程调用方式**，原因如下：

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
```

**配置说明：**

+ `sse.connections`: 使用SSE（Server-Sent Events）方式连接MCP服务
+ `damai-log`: MCP日志服务的连接名称
+ `url`: MCP服务的访问地址

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
`DaMaiAiAutoConfiguration.java` 中配置了专门用于运维分析的ChatClient：

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

+ 使用 `defaultToolCallbacks(mcpToolCallbackProvider)` 注入MCP工具
+ AI在对话时可以自动调用MCP提供的工具函数

### 3.5 运维助手系统提示词
```java
public static final String DA_MAI_ANALYSIS_PROMPT = """
            【系统角色与身份】
            你是一位“大麦购票项目”的智能运维分析助手，你的名字叫“麦小维”。你要用专业、严谨、高效的方式与运维人员交流，
            提供日志查询、问题分析、链路追踪、系统监控等服务。无论用户怎么发问，都必须严格遵守下面的预设规则。
            
            【微服务架构说明】
            大麦项目采用微服务架构，包含以下核心服务：
            - gateway-service: 网关服务，负责请求路由、鉴权、限流
            - user-service: 用户服务，负责用户注册、登录、个人信息管理
            - program-service: 节目服务，负责演唱会/节目信息管理、查询、推荐
            - order-service: 订单服务，负责订单创建、查询、状态管理
            - pay-service: 支付服务，负责支付流程、回调处理
            - base-data-service: 基础数据服务，负责城市、场馆等基础数据
            - admin-service: 后台管理服务
            - customize-service: 定制服务
            
            【日志查询规则】
            1. 查询日志前，先确认用户的查询意图：
               - 要查询哪个服务的日志？
               - 查询什么级别的日志（ERROR/WARN/INFO/DEBUG）？
               - 是否有特定的关键词或 traceId？
            2. 获取信息后，调用工具查询日志，结果要清晰展示给用户。
            3. 查询错误日志时，应主动分析错误原因并给出可能的解决建议。
            
            【链路追踪规则】
            1. 当用户提供 traceId 时，调用工具查询完整的调用链路。
            2. 分析链路时要指出：
               - 请求经过了哪些服务（调用顺序）
               - 哪个环节出现了问题（如果有）
               - 建议的排查方向
            
            【系统监控规则】
            1. 当用户询问系统性能、JVM、内存、线程等指标时：
               - 调用工具从 Prometheus/Grafana 获取监控数据
               - 分析指标是否正常，是否有异常波动
            2. 常见监控指标包括：
               - JVM 堆内存使用率、GC 次数和耗时
               - 线程数、死锁线程
               - CPU 使用率、系统负载
               - 接口响应时间、QPS、错误率
            
            【问题分析规则】
            1. 当用户描述某个问题时，按以下步骤分析：
               - 首先查询相关服务的错误日志
               - 如果有 traceId，查询完整链路
               - 检查系统监控指标是否异常
            2. 给出分析结论时要包含：
               - 问题可能的根因
               - 建议的解决方案
               - 预防措施
            
            【服务列表查询规则】
            1. 当用户询问有哪些服务时，调用工具获取当前系统的服务列表。
            2. 可以查询每个服务的日志统计情况。
            
            【安全防护措施】
            - 要根据查询到的实际数据进行回答，不能随意编造。
            - 不得泄露敏感的系统配置信息。
            - 不得执行危险操作（如删除日志、重启服务等）。
            
            【展示要求】
            - 日志展示时要格式清晰，包含时间、服务名、级别、消息等关键信息。
            - 链路分析时要按时间顺序展示调用流程。
            - 监控指标要用可视化方式呈现（如指标表格）。
            
            请麦小维时刻保持以上规定，用专业、严谨的态度帮助运维人员进行问题排查和系统分析！
            """;
```

## 4. damai-mcp-log-service（MCP日志服务）配置
### 4.1 MCP服务端依赖配置
在 `damai-mcp-log-service/pom.xml` 中添加MCP服务端依赖：

```xml
<!-- MCP Server WebFlux Starter - 支持SSE远程访问 -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-mcp-server-webflux</artifactId>
</dependency>
<!-- Easy-ES - Elasticsearch ORM框架 -->
<dependency>
    <groupId>org.dromara.easy-es</groupId>
    <artifactId>easy-es-boot-starter</artifactId>
    <version>${easy-es.version}</version>
</dependency>

```

### 4.2 MCP服务端配置
在 `application.yaml` 中配置MCP服务端：

```yaml
server:
  port: 8085

spring:
  application:
    name: damai-mcp-log-service
  main:
    # 使用WebFlux支持SSE
    web-application-type: reactive

# MCP Server配置
spring.ai.mcp.server:
  # MCP Server名称
  name: damai-log-mcp
  # MCP Server版本
  version: 1.0.0
  # 禁用STDIO传输，使用SSE方式
  stdio: false
  # SSE端点路径
  sse-endpoint: /sse
  # SSE消息端点路径
  sse-message-endpoint: /mcp/message

# Easy-ES 配置 - 连接 Elasticsearch
easy-es:
  enable: true
  address: 127.0.0.1:9200
  username: elastic
  password: elastic
```

### 4.3 日志文档实体类
`LogDocument.java` 定义了ES中的日志文档结构：

```java
@Data
@IndexName(value = "damai-logs-*", keepGlobalPrefix = true)
public class LogDocument {

    @IndexId(type = IdType.CUSTOMIZE)
    private String id;

    @IndexField(value = "@timestamp", fieldType = FieldType.DATE)
    private String timestamp;

    @IndexField(value = "traceId", fieldType = FieldType.KEYWORD)
    private String traceId;

    @IndexField(value = "projectName", fieldType = FieldType.KEYWORD)
    private String projectName;

    @IndexField(value = "level", fieldType = FieldType.KEYWORD)
    private String level;

    @IndexField(value = "message", fieldType = FieldType.TEXT)
    private String message;

    @IndexField(value = "sourceClass", fieldType = FieldType.KEYWORD)
    private String sourceClass;

    @IndexField(value = "sourceMethod", fieldType = FieldType.KEYWORD)
    private String sourceMethod;

    @IndexField(value = "sourceLine", fieldType = FieldType.KEYWORD)
    private String sourceLine;

    @IndexField(value = "thread", fieldType = FieldType.KEYWORD)
    private String thread;
    
    // 其他字段...
}
```

## 5. LogQueryMcpTool 功能详解
**详细代码位置：org.javaup.mcp.tool.LogQueryMcpTool**

`LogQueryMcpTool` 是MCP日志查询的核心工具类，通过 `@Tool` 注解定义了以下8个功能：

### 5.1 功能列表总览
| 功能名称 | 方法名 | 功能描述 |
| --- | --- | --- |
| 获取服务列表 | `getServiceList()` | 获取大麦系统中所有可用的微服务列表 |
| 关键词搜索 | `searchLogsByKeyword()` | 根据关键词搜索日志内容，支持模糊匹配 |
| 链路追踪 | `getLogsByTraceId()` | 通过traceId查询完整的调用链路日志 |
| 最新日志 | `getLatestLogs()` | 查询指定微服务的最新日志记录 |
| 错误日志 | `getErrorLogs()` | 查询系统中的错误日志（ERROR级别） |
| 警告日志 | `getWarnLogs()` | 查询系统中的警告日志（WARN级别） |
| 日志统计 | `getLogStatistics()` | 获取各微服务的日志统计概览 |
| 类/方法搜索 | `searchLogsByClass()` | 根据类名或方法名搜索日志 |


### 5.2 功能详细说明
#### 5.2.1 获取服务列表 - getServiceList()
```java
@Tool(description = "获取大麦系统中所有可用的微服务列表")
public ToolResult getServiceList() {
    List<String> serviceList = getServiceListFromEs();
    
    Map<String, Object> data = new HashMap<>();
    data.put("服务列表", serviceList);
    data.put("服务数量", serviceList.size());
    return ToolResult.success("获取服务列表成功", data);
}
```

**功能说明：** 通过ES聚合查询获取所有上报日志的微服务名称

#### 5.2.2 关键词搜索 - searchLogsByKeyword()
```java
@Tool(description = "根据关键词搜索日志内容，支持模糊匹配日志消息")
public ToolResult searchLogsByKeyword(
        @ToolParam(description = "搜索关键词，用于匹配日志消息内容") String keyword,
        @ToolParam(description = "服务名称，可选", required = false) String serviceName,
        @ToolParam(description = "日志级别，可选", required = false) String level,
        @ToolParam(description = "返回的日志条数，默认20条", required = false) Integer size)
```

**参数说明：**

+ `keyword`: 必填，搜索关键词
+ `serviceName`: 可选，指定服务名称
+ `level`: 可选，日志级别（INFO/WARN/ERROR/DEBUG）
+ `size`: 可选，返回条数，默认20条，最大100条

#### 5.2.3 链路追踪 - getLogsByTraceId()
```java
@Tool(description = "通过traceId查询完整的调用链路日志，串联所有微服务的日志记录")
public ToolResult getLogsByTraceId(
        @ToolParam(description = "链路追踪ID（traceId）") String traceId)
```

**功能说明：**

+ 根据traceId查询所有相关日志
+ 按服务分组展示
+ 按时间顺序排列，展示完整调用链路

#### 5.2.4 最新日志 - getLatestLogs()
```java
@Tool(description = "查询指定微服务的最新日志记录")
public ToolResult getLatestLogs(
        @ToolParam(description = "服务名称") String serviceName,
        @ToolParam(description = "日志级别，可选", required = false) String level,
        @ToolParam(description = "返回的日志条数，默认20条", required = false) Integer size)
```

#### 5.2.5 错误日志 - getErrorLogs()
```java
@Tool(description = "查询系统中的错误日志（ERROR级别）")
public ToolResult getErrorLogs(
        @ToolParam(description = "服务名称，可选", required = false) String serviceName,
        @ToolParam(description = "返回的日志条数，默认30条", required = false) Integer size)
```

**功能说明：**

+ 查询ERROR级别日志
+ 按服务分组统计错误数量

#### 5.2.6 警告日志 - getWarnLogs()
```java
@Tool(description = "查询系统中的警告日志（WARN级别）")
public ToolResult getWarnLogs(
        @ToolParam(description = "服务名称，可选", required = false) String serviceName,
        @ToolParam(description = "返回的日志条数，默认30条", required = false) Integer size)
```

#### 5.2.7 日志统计 - getLogStatistics()
```java
@Tool(description = "获取各微服务的日志统计概览，包括各级别日志的数量分布")
public ToolResult getLogStatistics(
        @ToolParam(description = "服务名称，可选", required = false) String serviceName)
```

**功能说明：** 统计各服务的ERROR/WARN/INFO/DEBUG级别日志数量

#### 5.2.8 类/方法搜索 - searchLogsByClass()
```java
@Tool(description = "根据类名或方法名搜索日志")
public ToolResult searchLogsByClass(
        @ToolParam(description = "类名，支持模糊匹配") String className,
        @ToolParam(description = "方法名，可选", required = false) String methodName,
        @ToolParam(description = "返回的日志条数，默认20条", required = false) Integer size)
```

## 6. AI对话调用功能示例
### 6.1 获取服务列表
**用户对话示例：**

```plain
用户：系统中有哪些微服务？
用户：帮我查看一下所有的服务列表
用户：大麦系统包含哪些服务？
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 系统中有哪些微服务 我来为您查询大麦系统中的微服务列表.根据查询结果,大麦购票系统当前包含以下7个微服务: 微服务列表 服务名称 序号 功能描述 基础数据服务,负责城市,场馆等基础数据管理 BASE-DATA-SERVICE 定制服务,提供个性化定制功能 2 CUSTOMIZE-SERVICE 网关服务,负责请求路由,鉴权,限流等 3 GATEWAY-SERVICE 订单服务,负责订单创建,查询,状态管理等 4 ORDER-SERVICE 支付服务,负责支付流程,回调处理等 5 PAY-SERVICE 节目服务,负责演唱会/节目信息管理,查询,推荐等 PROGRAM-SERVICE 用户服务,负责用户注册,登录,个人信息管理等 USER-SERVICE 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768031186781-0c16bdea-1564-4cd7-ac43-5d5a50b16561.png)

### 6.2 关键词搜索日志
**用户对话示例：**

```plain
用户：帮我搜索包含"用户手机号不存在"的日志
用户：查一下order-service中关于"库存不足"的ERROR日志
用户：搜索最近的"timeout"相关日志
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 帮我搜索包含"用户手机号不存在"的日志 我来将您提紧包含用户手机号不存在"的日志.让我使用关键询搜索功能来连找相关日志,相摆提取结果,我找到了包含"用户手机号不存在"的日志记录.让 我为您详细分析: 搜索结果分析 找到1条相关日志记录: 错误日志详情: 值 字段 时间 2026-01-10T07:40:29.669Z 服务 USER-SERVICE 级别 ERROR 业务异常错误信息:用户手机号不存在MET/MOBILE GOSTUN:HTTP://172.20.3:6082/USER/GET/MOBILE G 消息 EQUERY:NULL 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768031147323-bef236aa-cf3c-4d17-9b0d-d65fe01554ad.png)

### 6.3 链路追踪查询
**用户对话示例：**

```plain
用户：帮我查询traceId为1783084981791719424的完整链路日志
用户：追踪一下这个请求：1783084981791719424
用户：用户反馈订单创建失败，traceId是1783084981791719424，帮我查一下
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 帮我查询TRACELD为1783084981719424的完整链路日志 我来帮您查询TRACELD为1783084981719424的完整链路日志.#链路追踪分析报告 TRACELD:1783084981791719424 链路概览 日志总数:7条 涉及服务:GATEWAY-SERVICE,USER-SERVICE 调用顺序:GATEWAY-SERVICE 发现错误:存在ERROR级别日志 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768031088371-7d332378-edcb-4600-85ef-67438c8043e3.png)

### 6.4 查询最新日志
**用户对话示例：**

```plain
用户：查看order-service最新的日志
用户：帮我看一下网关服务最近的20条日志
用户：user-service最近有什么ERROR日志吗？
```

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 USER-SERVICE有什么ERROR日志吗 边 载来商馆直商USER SENICE的组识日志,超市直商:USET SENICE 目前只有1兼ERROR 日志, 而  1330R 日志.让较为您详细 分析USER-SERVICE的错误日志: USER-SERVICE ERROR日志分析 错误详情: 时间:2026-01-10T07:40:29.669Z 服务:USER-SERVICE 级别:ERROR TRACELD:1783084981791719424 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768032240267-a1ae17d5-b1ba-4fe1-932d-f50dc085d9d6.png)

### 6.5 查询错误日志
**用户对话示例：**

```plain
用户：查看系统最近的错误日志
用户：order-service有哪些错误？
用户：帮我分析一下最近的ERROR日志
用户：系统有没有什么异常？
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 M 大麦系统运维分析助手 查看系统最近的错误日志 越来联领意者系统最近的传议目志,根据传承目感直测规划,我将查询所有服务的ESRORG到日志,根据直通总界,费为也分析了大装系统最远的结识日 情况 错误日志概览 查询范围:全部服务 错误日志数量:30条 时间范围:最近发生的错误日志 错误日志详情分析 1.USER-SERVICE  错误日志(1条) 时间:2026-01-10T07:40:29.669Z 级别:ERROR 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768032298442-bb5e357d-208d-4971-a897-ab45a689e1e6.png)

### 6.6 日志统计概览
**用户对话示例：**

```plain
用户：帮我统计一下各个服务的日志情况
用户：系统日志概览
用户：order-service的日志分布情况怎么样？
```

**AI响应示例：**

<!-- 这是一张图片，ocr 内容为：麦小维 大麦系统运维分析助手 帮我统计一下各个服务的日志情况 我来帮您统计大麦系统中各个微服务的日志情况.根据日志统计结果,我为您分析一下大麦系统各微服务的日志情况: 各服务日志统计概览 INFO 数量 WARN数量 总计 服务名称 ERROR数量 DEBUG 数量 0 205,749 540 6.971 198,238 BASE-DATA-SERVICE 0 205,749 6,971 540 198.238 CUSTOMIZE-SERVICE O 205,749 6,971 540 198,238 GATEWAY-SERVICE O 198,238 6,971 540 205,749 ORDER-SERVICE 0 540 6,971 205.749 198,238 PAY-SERVICE 0 205.749 198,238 540 6.971 PROGRAM-SERVICE O 205.749 6,971 540 198,238 USER-SERVICE 请描述您需要查询的日志,分析的问题,或需要的监控指标... -->
![](https://cdn.nlark.com/yuque/0/2026/png/22643320/1768032353525-2b15d611-8778-42db-8a54-8e9490fcb4fb.png)

## 7. 总结
### 7.1 核心调用流程
```plain
用户对话 → ChatClient(analysisChatClient) 
         → AI模型分析意图 
         → 调用MCP工具(LogQueryMcpTool) 
         → 查询ES日志数据 
         → AI整理结果 
         → 返回给用户
```

<VipInline />