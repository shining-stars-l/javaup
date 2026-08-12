---
slug: /ai-interview/quick-review/agent-learning-roadmap
title: "万字解析Agent学习路线：后端工程师从大模型基础到生产级智能体"
sidebar_label: "万字解析Agent学习路线"
pagination_label: "万字解析Agent学习路线"
sidebar_class_name: has-recommend-badge
description: "面向 Java、Go 等后端工程师的 AI Agent 系统学习路线，沿真实请求链路讲清大模型接入、Prompt 与上下文工程、RAG、Tool Calling、MCP、Skills、Agent 编排、记忆系统和生产工程化，并给出 30/60/90 天计划、五个实战项目与面试简历表达。"
keywords: [AI Agent 学习路线, Agent 学习路线, Java AI, Spring AI, Prompt 工程, 上下文工程, RAG, Tool Calling, MCP, Skills, Agent 编排, 生产级 AI, AI Agent 面试]
---

# 万字解析Agent学习路线

随着 AI Agent 岗位的兴起，以及对 AI 工具的普及，很多小伙伴都会面临一个问题：AI Agent 到底要怎么学？学到什么程度才算能写进简历？能不能有一个清晰的规划路线？

**这不，它来了！** 我整理出了一份极其详细的资料，让小伙伴可以沿着一条完整主线来学习。

这篇文章不按“第一阶段、第二阶段”那种方式罗列知识点。那样很容易变成背目录，难以把整个脉络串起来。这里换一个角度：**从一个真实 AI 系统需要交付的能力倒推，看看应该补哪些知识、做哪些项目，最后怎样把它讲成面试和简历里有价值的内容。**

如果你只想先看完整知识体系，可以从这篇开始：[AI 大模型面试备战路线](/ai-interview/quick-review/study-roadmap)。如果你更想直接看项目，就先看：[什么是超级 AI 智能体](/super-agent/overview/project-intro)。

:::info 这篇路线适合谁

这篇文章主要面向已经具备 Web、数据库、缓存、消息队列等后端基础，希望转向 **Java AI / Agent 应用开发** 的工程师。阅读时不需要一次学完所有框架，先沿系统链路建立全局认识，再用项目逐段补齐能力即可。

:::

## 后端学 Agent，要注意这七个层面

先看总图。七层能力从模型认知逐步走到生产工程化，每学完一段，都用一个可运行项目留下证据。

| 你要补的能力                | 解决什么问题                 | 学到什么程度算过关                                         |
| --------------------------- | ---------------------------- | ---------------------------------------------------------- |
| 大模型基础认知              | 知道模型能干什么、不能干什么 | 能解释 Token、上下文、Temperature、幻觉、模型选型          |
| 模型接入层                  | 把 LLM 接进后端服务          | 能做非流式、流式、超时、重试、降级、多模型切换             |
| Prompt 和上下文工程         | 让模型稳定按你的业务规则干活 | 能管理系统提示词、结构化输出、上下文预算、Prompt 评估      |
| RAG 知识库                  | 让模型回答私有知识和时效知识 | 能做文档处理、切片、向量化、检索、重排、评估、更新         |
| Tool Calling / MCP / Skills | 让模型从“会说”变成“会做”     | 能把业务接口包装成工具，并做好权限、参数、错误处理         |
| Agent 编排和记忆            | 让系统能处理多步任务         | 能理解 ReAct、Plan-and-Execute、Workflow、Memory、状态流转 |
| 生产级工程化                | 让 Demo 变成能上线的系统     | 能做网关、观测、成本、测试、安全、灰度和故障兜底           |

![后端工程师的 Agent 学习全景：七层能力、五个项目与最终交付目标](/img/ai-interview/agent-learn/backend-agent-learning-map.png)

把 Agent 系统理解成一个“会调用模型的后端平台”。模型只是其中一环，真正决定项目效果的，是模型外面这一整圈工程能力。

:::tip 阅读这张图的方法

上半部分是需要逐步补齐的 **系统能力**，下半部分是用来证明能力的 **项目证据**。学习目标不是“看过七个名词”，而是能把任意一次请求放回完整链路中，解释数据从哪里来、决策在哪里发生、失败后怎样定位。

:::

## 从一个真实请求来看 Agent 系统到底长什么样

我们先把 Agent 系统给拆开来看一下，用户先在页面里输入这样一句话：

>  “帮我总结一下这份项目文档，并告诉我里面涉及哪些技术风险。”

一个成熟点的系统不会直接把这句话扔给模型。它大概率会走完下面这条链路：

1. **接入层先做登录校验、限流、会话校验。**
2. **会话层加载历史上下文，决定要不要带最近几轮对话。**
3. **编排层判断意图：这是文档问答、摘要任务，还是开放式分析。**
4. **上下文层拼装规则、用户问题、文档片段、历史记忆、工具结果。**
5. **RAG 层做文档解析、分片、向量检索、关键词检索、重排序。**
6. **工具层可能调用数据库、搜索服务、文档解析服务或 MCP 工具。**
7. **模型层调用大模型，处理流式响应、超时、重试、结构化输出。**
8. **观测层记录 Token、延迟、检索证据、模型输入输出、工具调用。**
9. **输出层用 SSE 推给前端，最后补引用来源、推荐追问或错误提示。**

![一次 Agent 请求的完整链路：从接入、路由、上下文装配到模型推理和 SSE 响应](/img/ai-interview/agent-learn/agent-request-lifecycle.png)

:::warning 两条不能交给模型越过的边界

- **没有可信证据时短路或澄清**，不要让模型用“听起来合理”的内容补空白。
- **退款、发券、发邮件等高风险写操作必须经过后端鉴权和人工确认**，不能把模型给出的参数当成授权结果。

:::

这条链路里的每一步，都是后端工程要解决的问题。

所以学习 Agent，我会建议按“系统链路”来学：

| 系统位置 | 要学习的能力 | 最后能做什么 |
| --- | --- | --- |
| 模型接入层 | LLM API、Spring AI、流式输出、结构化返回 | 做一个稳定的 AI 对话接口 |
| 上下文层 | Prompt、上下文工程、Token 预算、记忆裁剪 | 让模型拿到该拿的信息 |
| 知识层 | RAG、Embedding、分片、混合检索、重排序 | 做企业私有知识库问答 |
| 工具层 | Function Calling、Tool Calling、MCP、Skills | 让模型能调用外部系统 |
| 执行层 | ReAct、Plan-and-Execute、工作流、状态机 | 让 Agent 能分步骤做事 |
| 工程层 | 网关、限流、熔断、异步、可观测、成本控制 | 把 Demo 拉到生产 |
| 项目层 | 超级智能体、知识路由、图谱、Trace | 把所有知识串成项目证据 |

## 第一步：先让模型调用变得稳定

一开始先不要就搞多 Agent 这种。第一步其实要求很低：直接就把大模型当成一个又慢、又贵、又不稳定的第三方接口来看待就可以，所以你需要先搞懂这些东西：

- Token 是什么，为什么输入越长越贵？
- 上下文窗口是什么，为什么模型会“忘事”？
- Temperature、Top-P、Max Tokens 这些参数会怎么影响输出？
- 流式输出为什么比同步等待体验好？
- 同一个接口怎么切 OpenAI、通义、DeepSeek、Qwen、本地模型？
- 模型超时、限流、返回半截 JSON 时怎么办？

对应的讲解可以按这个顺序看：

- 入门认知：[大模型基础入门](/ai-interview/llm-intro/llm-basics)
- 工作原理：[大模型工作原理剖析](/ai-interview/llm-intro/how-llm-works)
- 核心概念：[Token、上下文窗口、Temperature 等核心概念](/ai-interview/llm-intro/core-concepts)
- 能力边界：[大模型能力边界与破局之道](/ai-interview/llm-intro/limitations-solutions)
- 开发环境：[大模型开发环境搭建实战](/ai-interview/llm-intro/dev-environment)
- Java 接入全景：[Java 调用大模型全景图](/ai-interview/spring-ai-detail/java-llm-landscape)
- Spring AI 入门：[Spring AI 快速入门实战](/ai-interview/spring-ai-detail/quick-start)
- 流式输出：[响应式流式输出详解](/ai-interview/spring-ai-detail/streaming-output)
- API 工程化：[大模型 API 调用的工程化实践](/ai-interview/system-design/llm-api-engineering)

这块学完以后，就要开始做一个小项目了，哪怕简陋点也是没有关系的。

### 项目 1：AI Chat Gateway

#### 最小可交付版本

- 提供 `/chat` 普通接口和 `/chat/stream` SSE 流式接口
- 支持配置切换模型供应商
- 记录每次调用的输入 Token、输出 Token、耗时、模型名
- 给模型调用加超时、重试、降级提示
- 前端能看到打字机效果

#### 可以再进阶一点

- 加一个模型网关层，业务代码不直接依赖具体模型 SDK
- 加 Redis 缓存相似问题结果
- 加限流，防止某个用户刷爆 Token
- 加统一错误码，不要把模型报错原样甩给前端
- 增加模型调用审计表，记录请求来源、模型、耗时、Token、失败原因
- 把模型调用封装成内部 SDK 或 Starter，别让每个业务都重复接一遍

这时候你已经比“我会调 API”的人强一截了。面试官问你怎么做大模型接入，你能聊出线程池、SSE、超时、降级、计费，这就有点开始像后端项目的样子了，棒棒的！

## 第二步：要把 Prompt 当成业务规则，而不只是一段字符串

我发现很多人学 Prompt 的方式，是收藏一堆“万能的提示词模板”。只能说有点用吧，但不多。。。

在真实项目里，Prompt 更像业务规则。它会被产品修改、被运营调整、还要被安全要求约束，还要版本管理。不能硬编码在 Java 字符串里。

你需要掌握的是这些

- **Prompt 的角色、任务、上下文、输出格式怎么拆**
- **Few-shot 什么场景值得加，什么场景只会浪费 Token**
- **CoT、反思、自一致性这些技巧怎么用在工程里**
- **怎么让模型稳定输出 JSON 或结构化对象**
- **用户输入怎么隔离，防 Prompt Injection**
- **Prompt 怎么外置、版本化、灰度和评估**
- **上下文工程怎么把规则、记忆、RAG、工具结果拼在一起**

如果你把这块做得要像样一点，通常会是下面的这个结构

1. **系统提示词负责边界和风格。**
2. **任务提示词负责当前目标。**
3. **用户输入单独包起来，避免和规则混在一起。**
4. **RAG 证据、工具返回、历史记忆按优先级拼装。**
5. **输出格式明确到字段级，最好有 JSON Schema。**
6. **最后再做校验、修复和回退。**

![稳定模型接入与 Prompt 治理：模型网关、规则装配、供应商切换和输出校验](/img/ai-interview/agent-learn/model-prompt-governance.png)

图里的上下两条线需要一起看：上面是一次请求怎样从业务进入模型，下面是版本、Token、延迟、成本和审计怎样贯穿整个调用过程。这样设计以后，业务代码只依赖统一网关和结构化契约，不需要跟某一家模型 SDK 绑死。

推荐阅读

- 入门：[提示词入门与核心概念](/ai-interview/prompt/prompt-intro)
- 设计原则：[提示词设计原则与实战技巧](/ai-interview/prompt/design-principles)
- 结构化框架：[结构化提示词框架与模板](/ai-interview/prompt/structured-framework)
- 高阶策略：[高阶提示词优化策略](/ai-interview/prompt/advanced-strategies)
- Spring AI 实践：[提示词工程实践指南](/ai-interview/spring-ai-detail/prompt-engineering)
- 结构化输出：[结构化输出深度剖析](/ai-interview/spring-ai-detail/structured-output)
- 上下文工程：[上下文工程实战指南](/ai-interview/prompt/context-engineering)
- RAG 场景 Prompt：[RAG 场景提示词工程实战](/ai-interview/prompt/rag-prompt-engineering)

要注意 Prompt 不是越长越好，信息密度才重要。你给模型塞一堆废话，它并不会更聪明，只会更贵、更慢，甚至容易忽略真正有用的信息。

### 项目 2：Prompt 配置中心

#### 你可以先做一个简单版

- 把系统提示词、任务提示词、输出格式模板拆开存储
- 支持变量注入，比如 `{userQuestion}`、`{knowledge}`、`{history}`
- 给每个 Prompt 加版本号
- 保存每次模型调用使用的 Prompt 版本
- 输出 JSON 后做 Jackson 解析和 Bean Validation 校验
- 解析失败时最多重试 2 次，把错误原因反馈给模型修复
- 给 Prompt 配一组固定测试题，做回归评估
- 记录每次命中的 Prompt 版本、模型版本和输入摘要，方便排查坏的情况

#### 如果你想更像生产项目的话

- 接入 Nacos / Apollo 做热更新
- 做 A/B 测试，对比两个 Prompt 的命中率和用户反馈
- 加一组固定评测题，每次改 Prompt 都跑一遍
- 对用户输入加标签包裹，比如 `<user_input>`，降低注入风险
- 不要把长文本直接拼接进模板，尽量做字段化拼装
- 结构化输出失败后，允许有限次数的“格式修复”而不是无限重试

这块学完以后，你在面试时，就不要只说“我会 Prompt 工程”。现在你就可以这样来讲：

> 我们把 Prompt 当成业务规则管理，做了模板外置、变量注入、版本记录和输出校验。模型返回结构化结果后会先过 JSON Schema 和 Bean Validation，失败会进入有限次数的修复闭环。这样 Prompt 调整不用每次发版，也能追踪某次错误回答到底用了哪个版本。

## 第三步：RAG 要按生产真实的流程来学

RAG 可以说是后端转 AI Agent 最该认真，也是最难学的部分了。因为它是一整条的工程链路，里面设计到的功能实在是太多了。

很多 Demo 的 RAG 基本是这个流程：上传文档，切块，向量化，检索，生成。

如果是真实的系统，其实要麻烦得多：

- **PDF 解析出来全是乱行怎么办？**
- **表格、图片、代码块怎么处理？**
- **分片太大，检索不准；分片太小，答案没上下文。**
- **用户问“它怎么配置”，没有历史上下文根本不知道“它”是谁。**
- **向量检索能理解语义，但搜订单号、版本号、函数名很弱。**
- **检索到了 20 段，哪些该喂给模型？**
- **模型没拿到证据时，会不会自己编？**
- **文档更新了，向量库怎么增量同步？**
- **上线以后怎么证明效果变好了？**

这些也只是 RAG 的一部分。

我建议你把 RAG 拆成离线和在线两条链路来看：

| 链路 | 主要工作 | 容易踩的坑 |
| --- | --- | --- |
| 离线链路 | 文档解析、清洗、切片、向量化、索引构建、增量更新 | 垃圾文本入库、标题层级丢失、权限元数据缺失、更新不及时 |
| 在线链路 | 问题改写、意图路由、混合检索、重排序、证据拼装、生成回答 | 召回不准、证据太长、无证据还硬答、日志里看不出错在哪 |

![生产级 RAG 离线与在线双链路：知识构建、混合检索、证据回答、评估和增量更新](/img/ai-interview/agent-learn/production-rag-dual-pipeline.png)

离线链路决定“知识是否被正确保存”，在线链路决定“问题是否找到正确证据”。评估结果还要反向推动解析、分片、检索参数和索引更新，所以生产级 RAG 是持续迭代的闭环，不是一条跑完就不再变化的流水线。

### 1. 先处理清洗好文档

很多 RAG 出现问题时，其实并不是向量库的方面，而是在文档处理是太过于粗糙了

- PDF 解析顺序乱，正文、页眉、页脚混在一起
- 表格丢失，导致关键信息没进知识库
- 图片里的文字没有 OCR
- Markdown 标题层级被打平
- 代码块、配置块被切碎
- 文档版本、部门、权限、发布时间没有记录

### 2. 切片不能按字数一刀切

Chunk 切得太碎，语义断了；切得太大，召回不准，还浪费 Token。更靠谱的做法是 **结合标题层级、段落结构、语义完整性、Overlap、元数据和父子块。**

比如技术文档可以按标题层级切，FAQ 可以按问答对切，合同条款可以按条款编号切，接口文档可以按接口维度切。不要一上来就固定 500 字数直接切，这样很容易把一个完整语义拆散。

### 3. 要知道 Embedding 和向量检索的原理

你倒是不需要手写 HNSW，但至少要知道：

- Embedding 是把文本映射成向量
- 换 Embedding 模型通常要重建索引
- 余弦相似度、点积、L2 距离适用场景不同
- ANN 是用近似换速度
- IVF、HNSW 的核心思路是什么
- 向量库选型要看数据量、过滤能力、运维复杂度和生态支持

### 4. 只做向量检索是不够的

向量检索擅长语义相似，但对订单号、版本号、函数名、政策编号、专有名词就不行了。真实的生产里通常会组合多个功能：

- 向量检索：找语义相关
- BM25 / ES：找关键词精确匹配
- 元数据过滤：控制权限、部门、版本、时间范围
- RRF：融合多路召回结果
- Rerank：对召回结果重新精排
- Query Rewrite：把用户口语化问题改写成适合检索的问题
- Intent Routing：决定问题走知识库、工具、闲聊还是澄清

### 5. RAG 必须有评估和更新机制

上线后肯定会遇到这些问题：用户说搜不到、答案引用错、文档更新了但知识库没更新、同一个问题今天答对明天答错。

所以至少要准备一批评估问题，并且看这些指标：

- 检索层：Hit@K、MRR、Recall、Precision
- 生成层：忠实度、答案相关性、幻觉率
- 业务层：用户采纳率、人工转接率、投诉率

### 学习顺序可以这样

- 先看整体：[RAG 入门与核心原理](/ai-interview/rag/introduction)
- 看架构演进：[RAG 三代进化史与架构选型](/ai-interview/rag/evolution)
- 看文档处理：[文档预处理、读取、清洗与标准化](/ai-interview/rag/preprocessing)
- 看解析工具：[搞懂 Tika 才能做好 RAG 文档解析](/ai-interview/rag/tika-in-action)
- 看分片：[文档切片策略选择](/ai-interview/rag/chunking)
- 看 Spring 实战：[分片代码实战 Spring 系列](/ai-interview/rag/spring-splitter)
- 看向量化：[Embedding 向量化原理与模型选型](/ai-interview/rag/embedding)
- 看索引算法：[向量检索核心算法深度剖析](/ai-interview/rag/vector-search-algorithms)
- 看数据库选型：[向量数据库选型实战指南](/ai-interview/rag/vector-database)
- 看元数据：[元数据的详细解析](/ai-interview/rag/metadata-in-action) 和 [元数据过滤场景](/ai-interview/rag/metadata-filtering)
- 看查询改写：[为什么要问题重写](/ai-interview/rag/query-rewrite)
- 看路由：[查询的路由是必不可少的](/ai-interview/rag/intent-routing)
- 看混合检索：[混合检索的详细剖析](/ai-interview/rag/hybrid-search)
- 看重排序：[重排序的好处是什么](/ai-interview/rag/reranking)
- 看 GraphRAG：[图结构 GraphRAG](/ai-interview/rag/graph-rag)
- 看流水线：[RAG 的组件拼接成流水线](/ai-interview/rag/modular-rag)
- 看幻觉治理：[RAG 系统幻觉治理实战](/ai-interview/rag/hallucination-control)
- 看评估：[RAG 效果评估与量化指标](/ai-interview/rag/evaluation-metrics)
- 看更新：[知识库动态更新工程实践](/ai-interview/rag/knowledge-base-update)
- 看踩坑：[RAG 生产环境踩坑与调优经验](/ai-interview/rag/production-challenges)

RAG 的实战项目不要做得太玩具了。我建议你做“企业文档知识库”这种功能，哪怕只有几份文档，也可以把链路做完整了。

### 项目 3：企业文档知识库

#### 基础版

- 支持上传 PDF / Word / Markdown
- 用 Tika 或其他解析工具转文本
- 支持至少两种分片策略：固定长度分片、按标题层级分片
- 使用 Embedding 模型向量化
- 向量存储可以先用 PGVector
- 用户提问时检索 TopK 文档块
- 回答必须附引用来源
- 无证据时直接提示“资料里没找到”，不要让模型编

#### 增强版

- 加 Elasticsearch 关键词检索
- 向量检索和关键词检索并行，再做 RRF 融合
- 加 Rerank，把最相关的证据排到前面
- 加元数据过滤，比如部门、版本、权限、文档类型
- 加问题改写，处理“刚才那个配置怎么改”这种追问
- 加评估集，用 Hit@K、MRR、答案忠实度去评估效果
- 做增量更新，文档变更后能重新解析和重建索引

#### 想做得更有辨识度，可以参考这两个设计

- [核心架构设计](/super-agent/overview/core-architecture)：三层执行器、前置编排、混合检索、证据预算。
- [图数据库与知识路由](/super-agent/overview/neo4j-knowledge-routing)：用 Neo4j 做文档结构图谱，用 Scope → Topic → Document 做知识路由。

RAG 项目到底能不能讲出深度，其实就是看你有没有处理这些细节。通过这些细节，面试官很快就能判断你到底是不是就跑了个玩具而已。

## 第四步：要让 Agent 既会说还会做

Agent 项目不能只停留在聊天，还要能真正做事。

做事的基础就是 **工具调用**。比如用户问“帮我查一下这个订单为什么没发货”，模型不能只靠猜，它得去调用订单系统、库存系统、物流系统，拿到真实结果后再组织语言。

这里要搞清楚一个知识点：**模型本身不执行工具。**

模型负责判断：

- 要不要调用工具
- 调哪个工具
- 参数怎么填

真正执行工具的是你的后端程序。它拿到模型给出的 tool_call，去调用数据库、接口、搜索服务、文件系统，再把结果返回给模型。

这里有一个很重要的后端涉及的原则：**权限一定不能交给模型判断。**

模型可以决定“我需要查订单”，但能不能查、查哪个租户、查哪些字段、能不能执行退款或发券，必须由后端鉴权来控制。模型传来的参数也不能直接信任，仍然要做参数校验、权限过滤、敏感字段脱敏和审计日志。

推荐阅读：

- 工具调用认知：[认识工具调用机制](/ai-interview/function-call/understand-tool-calling)
- Spring AI 实战：[Spring AI 工具调用实战](/ai-interview/function-call/spring-ai-tool-calling-practice)
- 源码链路：[ToolCallback 源码解析](/ai-interview/function-call/tool-callback-source-analysis)
- 工具设计：[工具设计原则与最佳实践](/ai-interview/function-call/tool-design-best-practices)
- 可靠性：[从结构化输出到可靠的工具调用](/ai-interview/function-call/structured-output-reliability)

工具设计里最容易被忽略的是“给模型看的接口说明”。人类开发者能看懂 `queryData`，模型不一定能选对。工具名、描述、参数名、参数约束、返回格式，都要清楚。

一个模型更容易用好的工具，通常有这些特点：

- 名称具体，比如 `queryOrderDeliveryStatus` 比 `handle` 好
- 描述写人话，告诉模型什么时候该用、什么时候不该用
- 参数尽量少，枚举值尽量精简
- 不暴露内部字段，比如 token、requestId、operatorId
- 返回值结构化，但不要塞一堆无关的字段
- 错误信息要能指导模型下一步，比如“订单号格式错误”比“系统异常”更有用

一个简陋的工具：

```text
tool: handle
description: 处理业务
params: data
```

一个真正能用的工具：

```text
tool: query_order_delivery_status
description: 根据订单号查询订单当前发货状态、物流单号和异常原因。只用于用户询问订单发货、物流、配送异常的场景。
params:
  orderNo: string，必填，订单号，长度 16-32
```

工具越多，就越需要标准化。Function Calling 适合在单个应用里快速接工具，但企业里工具会分散在 HR、财务、CRM、文档、工单等不同系统里，每个团队语言和部署方式还不一样。

MCP 要解决的就是工具标准化接入问题。你可以把 MCP Server 理解成一类能力服务，负责暴露工具、资源和提示；Agent 侧通过 MCP Client 发现并调用这些能力。

继续看：

- MCP 入门：[揭开 MCP 协议的面纱](/ai-interview/mcp/introduction)
- 技术关系：[MCP 与相关技术的关系](/ai-interview/mcp/tech-relationship)
- 通信机制：[深入 MCP 通信机制](/ai-interview/mcp/json-rpc)
- 传输模式：[三种传输模式全面解读](/ai-interview/mcp/transport-modes)
- 服务端：[Spring AI 构建 MCP 服务端实战](/ai-interview/mcp/server-development)
- 客户端：[Spring AI 的 MCP 客户端开发指南](/ai-interview/mcp/client-development)
- 企业实践：[MCP 企业级开发进阶技巧](/ai-interview/mcp/enterprise-practices)

再往后，可以了解 Skills。它和 MCP 不一样：MCP 更像“工具能力怎么按协议接入”，Skills 更像“Agent 在做某类任务时，按需要打开的一份操作手册”。

当 Agent 能力多了，把所有规则都塞进 Prompt 里，那上下文窗口很容易就满了。而 Skills 的思路是渐进加载：先让 Agent 知道有哪些技能，需要时再打开详细说明、参考资料和脚本。

- Skills 入门：[智能体为什么需要技能包](/ai-interview/skills/why-need)
- 目录结构：[Skills 目录结构全景图](/ai-interview/skills/structure)
- 配置文件：[SKILL.md 核心配置深度剖析](/ai-interview/skills/skill-md)
- 渐进加载：[四层渐进式加载机制揭秘](/ai-interview/skills/progressive-loading)
- Reference / Script：[Reference 和 Script 实战指南](/ai-interview/skills/reference-script)
- Codex 管理：[使用 Codex 安装和管理 Skills](/ai-interview/skills/codex-install)

![Tool Calling、MCP 与 Skills 的协作关系：工具选择、能力连接、方法加载和业务执行边界](/img/ai-interview/agent-learn/tool-mcp-skills-collaboration.png)

这三个概念解决的是不同层面的问题：**Tool Calling** 规定模型怎样表达一次工具调用，**MCP** 负责把分散的外部能力标准化接进来，**Skills** 则把完成某类任务的方法、参考资料和脚本按需交给 Agent。无论入口来自哪里，鉴权、参数校验、幂等和审计仍然必须由业务执行层负责。

### 项目 4：工具型 Agent

选择做一个“运维助手”或者“订单助手”都可以的。

#### 基础要求

- 至少注册 3 个工具，比如查询订单、查询物流、查询用户信息
- 工具参数做强校验
- 工具执行前做权限校验，不相信模型传来的租户、用户和权限信息
- 工具执行加超时控制
- 工具失败后返回模型可理解的错误，不要直接抛异常
- 模型根据工具结果生成自然语言回答

#### 进阶要求

- 加一个 MCP Server，把某类工具独立出去
- 接入 MCP Client，启动时自动发现工具
- 对高风险工具加人工确认，比如退款、发券、发邮件
- 记录每次工具调用的参数、耗时、结果、异常
- 限制单轮对话最大工具调用次数，防止 Agent 死循环
- 给写操作做幂等设计，避免模型重复调用造成重复扣款、重复发短信

## 第五步：要让 Agent 可控地完成多步任务

生产环境要的是可完成、可解释、可回滚、可限制。能用确定性流程解决的，就不要交给模型自由发挥。

### 你要掌握几类 Agent 思路

- ReAct：边推理、边行动、边观察结果
- Plan-and-Execute：先规划，再按步骤执行
- Reflection：执行后自查并修正
- Workflow / Graph / Loop：用工作流和图结构控制执行路径
- Multi-Agent：多个 Agent 分工协作
- Human-in-the-Loop：高风险节点让人确认
- Memory：短期记忆、长期记忆、摘要压缩、容量治理

我把每个方式的特点列举出来，帮助大家更好的理解：

| 任务特点 | 更适合的方式 | 原因 |
| --- | --- | --- |
| 流程固定，比如报销审核、工单流转 | Workflow | 路径清楚，稳定性优先 |
| 有少量分支，比如问题分类、知识库路由 | 规则路由 + LLM 辅助判断 | 成本低，可控性强 |
| 信息不完整，需要边查边判断 | ReAct | 每一步都能根据观察结果调整 |
| 任务很长，需要先拆步骤 | Plan-and-Execute | 先规划，再逐步执行 |
| 高风险动作，比如退款、发券、发邮件 | Human-in-the-Loop | 模型不能越过审批 |
| 跨领域协作，比如检索、分析、执行、审核 | Multi-Agent 或多节点 Workflow | 拆职责，但要控制复杂度 |

如果把 Agent 只理解成“一个 while 循环里不断调用模型”，很容易就失控了。更工程化的方式，是把任务拆成一张执行图：

- LLM 节点：负责判断、生成、总结
- Tool 节点：负责查数据、调接口
- Router 节点：负责分流
- Human 节点：负责人工审批
- Memory 节点：负责读写上下文
- Evaluator 节点：负责检查质量

这就是执行引擎和工作流要解决的问题。

### 推荐阅读

- Agent 入门：[走进智能体的世界](/ai-interview/agent/what-is-agent)
- 架构对比：[主流架构深度对比](/ai-interview/agent/architecture-compare)
- 多智能体：[多智能体深度协作](/ai-interview/agent/multi-agent)
- 框架上手：[框架实战快速上手](/ai-interview/agent/framework-quickstart)
- 进阶特性：[Agent 进阶特性与源码探秘](/ai-interview/agent/advanced-features)
- Harness：[Harness 工程化实战](/ai-interview/agent/harness-engineering)
- 工作流：[AI 工作流与执行引擎](/ai-interview/agent/workflow-graph-loop)
- 任务拆分：[复杂任务的分解之道](/ai-interview/agent/task-decomposition)
- 框架取舍：[手搓 Agent 还是用框架](/ai-interview/agent/handcode-vs-framework)
- 规划能力：[如何赋予 Agent 规划能力](/ai-interview/agent/planning-capability)
- 多 Agent 路由：[多 Agent 协作与动态路由](/ai-interview/agent/multi-agent-routing)
- 记忆架构：[Agent 记忆系统架构设计](/ai-interview/agent/memory-architecture)
- 记忆存储：[记忆存储的工程实践](/ai-interview/agent/memory-storage-engineering)
- 记忆压缩：[记忆压缩与容量治理](/ai-interview/agent/memory-compression-governance)

**我个人更推荐后端同学先走“编排型 Agent”。**

也就是：外层用确定性代码控制流程，里面少量环节让模型决策。比如超级智能体项目的设计就很值得借鉴：不是所有问题都扔给 Agent，而是先做会话记忆加载、意图分析、问题改写、知识路由、歧义判断，再决定走知识问答还是开放式 Agent。

记忆系统也要早点理解。短期记忆解决当前会话上下文，长期记忆记录用户偏好和历史摘要，实体记忆保存结构化事实，程序记忆沉淀可复用流程。但记忆不是越多越好，还要考虑摘要压缩、容量治理、隐私和删除机制。

多 Agent 不要过早的用。当一个 Agent 搞不定时，可以拆路由 Agent、检索 Agent、分析 Agent、执行 Agent、审核 Agent，但多 Agent 会带来通信、状态、成本、调试复杂度。很多业务用一个 Workflow 加几个工具节点就够了。

### 项目 5：可控 Agent 执行器

#### 你可以做一个简化版执行器

- 输入用户目标
- 先让模型生成最多 5 步计划
- 每一步只能选择白名单工具
- 每次工具调用后记录 observation
- 如果连续两次失败，停止并返回原因
- 如果要执行写操作，进入人工确认
- 每轮限制最大模型调用次数和工具调用次数
- 执行状态落库，服务重启后能恢复
- 每一步输出 Trace，能看到计划、工具、Observation、最终回答
- 支持暂停、继续和取消，不要只依赖内存里的循环

![可控 Agent 执行闭环：计划、白名单工具、人工确认、观察重规划和状态持久化](/img/ai-interview/agent-learn/controllable-agent-loop.png)

这里的重点不是让它完全自主执行，而是让它在你能控制的范围内完成任务。

#### 你可以在面试里这么讲

> 我的 Agent 没有把全部控制权交给模型。外层执行器负责状态流转、工具白名单、调用次数限制、超时和持久化；模型只负责在有限上下文里做下一步决策。这样既保留了灵活性，也能避免死循环和高风险误操作。

## 第六步：如何从 Demo 到真正的生产级别

AI 应用上线后，最容易翻车的地方其实是边缘防护和工程治理没做好。

### 常见翻车的问题

- 同步调用模型，接口卡 30 秒，线程池被拖死
- 在事务里调用 LLM，数据库连接一直占着
- 没有限流，用户脚本刷接口，Token 账单炸了
- 没有降级，模型供应商一抖动，全站 500
- 没有观测，用户说回答错了，你不知道错在哪一步
- 没有评估集，每次改 Prompt 都靠感觉
- 没有审计，工具调用到底改了什么查不清

### 这部分建议认真看系统设计文档

- 总体架构：[从 Demo 到生产的 AI 应用架构设计](/ai-interview/system-design/ai-app-architecture)
- 大模型网关：[大模型网关的设计与落地](/ai-interview/system-design/llm-gateway)
- API 工程：[大模型 API 调用的工程化实践](/ai-interview/system-design/llm-api-engineering)
- 语音 Agent：[AI 语音 Agent 技术架构解析](/ai-interview/system-design/ai-voice-agent)
- 系统设计速查：[系统设计与工程化面试速查](/ai-interview/quick-review/system-design)

生产级 AI 应用至少要拥有这些能力：

| 问题 | 后端处理方式 |
| --- | --- |
| 响应慢 | SSE / WebFlux / 异步任务 |
| 模型超时 | 超时控制、重试、备用模型、友好降级 |
| 成本不可控 | Token 统计、预算阈值、用户限流、语义缓存 |
| 输出不稳定 | 结构化输出、JSON Schema、校验、有限修复 |
| Agent 死循环 | 模型调用次数限制、工具调用次数限制、状态机中断 |
| RAG 答错 | 检索 Trace、证据评分、引用来源、评估集 |
| 数据泄露 | PII 脱敏、权限过滤、审计日志、私有模型 |
| 集群重复处理 | 分布式锁、租约续期、幂等任务 |

![生产级 Agent 五层治理：可观测性、成本、安全、测试评估、发布运行和故障闭环](/img/ai-interview/agent-learn/production-agent-governance.png)

这五层能力都横跨 Agent 的路由、RAG、工具、模型和输出链路。单独给某个节点加一条日志或一个超时还不够，治理信息要能够按同一个请求 ID 串联，才能在出错时完成发现、定位、隔离、恢复和复盘。

这部分其实是属于传统后端要考虑的问题。之前学的 Redis、MQ、限流、熔断、分布式锁、日志、监控、事务边界，这里就需要用起来了。

### 生产级 Agent 要考虑的 5 个方面

**第一，可观测性。你要知道模型为什么这么答。**

传统接口出问题，看日志、Trace、指标。Agent 更需要这些，因为中间多了模型决策、RAG 召回、工具调用、上下文拼装。至少要记录：

- 用户输入和会话 ID
- 触发的路由和执行节点
- 使用的模型、参数和 Prompt 版本
- RAG 检索结果、分数、引用来源
- 工具调用名称、参数摘要、耗时、结果、异常
- Token 消耗、费用估算、总耗时
- 最终输出和用户反馈

**第二，成本控制。Token 就是钱。**

一个用户问题可能触发意图识别、问题改写、RAG 检索、重排、工具调用、最终生成、输出审核。每一步都可能花钱、花时间。

常见优化手段有：

- 简单任务用小模型
- 高频相似问题走语义缓存
- RAG 片段控制数量和长度
- 工具结果先摘要再喂给模型
- 对话历史做滑动窗口或滚动摘要
- 对高成本能力设置用户、租户、场景配额
- 按模型、业务线、用户统计 Token 和费用

**第三，安全。Agent 能调工具以后，风险会突然变大。**

只聊天时，最多是说错话；能调工具后，可能查错数据、发错消息、改错状态。生产里要有几条原则：

- 高风险操作必须人工确认
- 写操作要幂等
- 工具参数必须校验
- 权限必须在后端判断
- Prompt Injection 要防
- RAG 文档要做权限过滤
- 工具返回的敏感字段要脱敏
- 审计日志要完整

**第四，测试。AI 应用也要回归。**

不要觉得模型输出不稳定就没法测。可以测的东西很多：

- 输出格式是否符合 Schema
- 意图分类是否正确
- 工具是否选对
- RAG 是否命中标准文档
- 低置信度是否拒答
- 越权请求是否拦截
- Prompt Injection 是否失败
- 延迟和成本是否在阈值内

**第五，发布与运行治理。上线不是把接口部署完就结束。**

模型、Prompt、Embedding、切片策略和工具描述任意一项变化，都可能让线上效果发生漂移。发布时要保留模型与 Prompt 版本，先灰度小流量，再观察成功率、延迟、Token 成本、工具失败率和 RAG 评估指标。发现异常时，系统应能回滚配置、切换备用模型、暂停高风险工具，并保留问题请求的完整 Trace 供复盘。

:::danger 生产底线

**模型输出永远只是候选结果。** 权限、金额、租户、幂等、事务和审计必须由确定性的后端逻辑兜底；任何无法追踪、无法中断、无法回滚的 Agent，都不适合直接承担高风险写操作。

:::

## 第七步：学一个完整项目，把知识串联起来

学 AI Agent 最怕碎片化。今天看 Prompt，明天看 RAG，后天看 MCP，每个都懂一点，但不知道它们在一个系统里怎么配合。

所以一定要做一个完整项目。

我开发的超级 AI 智能体项目，就很适合作为主线来学。它不是只展示“调用模型”，而是把很多生产级问题放在一个系统里处理：多层执行器、RAG 前置编排、混合检索、文档处理流水线、会话记忆、Neo4j 图数据库、知识路由、Agent 安全机制、全链路可观测和简历表达。

入口可以按这个顺序看：

- 项目介绍：[项目介绍与核心价值](/super-agent/overview/project-intro)
- 架构设计：[核心架构设计](/super-agent/overview/core-architecture)
- 工程化：[工程化技术概括](/super-agent/overview/engineering-practice)
- 图数据库和知识路由：[图数据库与知识路由](/super-agent/overview/neo4j-knowledge-routing)
- 文档目录：[文档和视频目录](/super-agent/overview/document-video-catalogue)
- 简历参考：[项目简历模板参考](/super-agent/overview/resume-template)

### 这个项目里有几块内容特别适合后端同学重点看

1. **三层执行器体系：不是所有问题都让 Agent 自己解决，而是歧义追问、知识问答、开放式 Agent 分场景处理。**
2. **RAG 前置编排：先做路由、改写、子问题拆分、知识域收缩，再进入检索。**
3. **双通道混合检索：PGVector 做语义，Elasticsearch 做关键词，RRF 融合，可选 Rerank。**
4. **证据预算和无证据短路：上下文窗口有限，证据要裁剪；没证据就别让模型编。**
5. **会话记忆策略：无记忆、滑动窗口、摘要压缩，不同场景不同取舍。**
6. **MCP 和 Skills：一个偏协议，一个偏能力包，都是扩展 Agent 能力边界的办法。**
7. **Neo4j 文档结构图谱：处理章节定位、邻接查询、结构化导航。**
8. **全链路观测：每次回答能看到编排、检索、工具、模型、Token、费用。**
9. **集群安全：Redis 租约、JVM 任务注册、租约续期，防止重复执行。**

## 时间怎么安排

| 学习周期 | 核心目标 | 最终交付物 | 验收重点 |
| :--- | :--- | :--- | :--- |
| **30 天** | 建立 Agent 系统全局认识 | 一套能讲清楚的架构方案与项目话术 | 能沿请求链路解释模型、RAG、工具和工程治理 |
| **60 天** | 做出完整的业务闭环 | 企业知识库 + 订单工具助手 | 能运行、能引用、能追踪工具调用、具备基础评估 |
| **90 天** | 补齐生产级治理 | 网关、评估、成本、审计、灰度与回滚能力 | 能观测、能限流、能降级、能控制高风险操作 |

:::note 时间安排的判断标准

天数只是参考，真正的进度看 **可验证产物**：接口是否跑通、引用能否回溯、失败能否定位、写操作是否受控、项目能否被清楚讲出来。某一阶段没有形成交付物，就先不要急着堆下一个框架。

:::

![30、60、90 天 Agent 学习与交付路线：从能面试、能交付到能上线](/img/ai-interview/agent-learn/agent-learning-30-60-90.png)

### 30 天：目标是能面试、能讲清项目

第 1 周：

- 大模型核心概念
- Spring AI 快速入门
- 流式输出
- Prompt 基础和结构化输出

第 2 周：

- RAG 基础
- 文档切片
- Embedding
- 向量数据库
- 混合检索和重排

第 3 周：

- Tool Calling
- MCP 基础
- Agent 架构
- ReAct / Plan-and-Execute
- 记忆系统

第 4 周：

- 系统设计
- LLM 网关
- RAG 评估
- Super Agent 架构
- 整理项目话术

30 天的时间确实比较紧张，所以目标是能把“一个企业级 Agent 怎么设计”给讲清楚。

### 60 天：目标是做出一个完整项目

前 30 天学核心知识，后 30 天来做项目。

项目建议做“企业知识库 + 订单工具助手”：

- 支持上传文档
- 支持知识库问答
- 支持订单查询工具
- 支持 SSE 流式输出
- 支持引用来源
- 支持工具调用日志
- 支持基础评估集

60 天做完，你就有一个实际能运行的项目了。

### 90 天：把项目完善到生产级别

到了这个阶段更多的是要实现工程化的方面：

- LLM 网关
- 多模型切换
- Prompt 版本管理
- RAG 评估报表
- 语义缓存
- 知识库增量更新
- 高风险工具人工确认
- Trace 和成本统计
- 灰度策略

学习切忌着急。先把 RAG、Tool Calling、MCP、Agent 执行器这些主干能力学清楚，再根据项目暴露的问题补细节。

## 面试怎么讲，简历怎么写

AI 项目不要成这样：

> 熟悉 RAG、Agent、MCP，了解大模型应用开发。

我见过很多小伙伴都是这么写的，这样写，面试官根本不知道你具体做的功能是什么。

可以写成这样：

> 基于 Spring AI 实现企业知识库问答系统，支持文档解析、语义分片、PGVector 向量检索、Elasticsearch 关键词检索、RRF 融合排序和引用溯源；针对无证据场景做短路处理，减少模型幻觉。

或者：

> 设计工具型 Agent 执行器，支持工具白名单、参数校验、超时重试、调用次数限制和执行状态持久化；对高风险工具调用加入人工确认节点，避免模型误操作。

或者：

> 对大模型调用链路做工程化封装，支持 SSE 流式输出、多模型路由、Token 统计、超时降级和结构化输出校验；通过调用日志和 Trace 记录定位 Prompt、检索、工具调用问题。

面试回答也一样。尽量按“问题 → 方案 → 权衡 → 结果”来回答。

**比如面试官问：“你们的 RAG 怎么做的？”**

可以这样说：

> 我们把 RAG 分成离线和在线两条链路。离线侧负责解析、清洗、分片、向量化和索引构建；在线侧先做问题改写，再并行走向量检索和关键词检索，最后用融合排序和重排序筛证据。生成阶段要求模型基于证据回答，没有证据就短路。这样做主要是为了同时解决语义召回、精确匹配和幻觉问题。

你看，这里面的每句话其实都能被追问，也都能展开来回答，这样给面试官的印象才会好。

如果你想对照简历写法，可以看：[Nexus Agent 项目简历模板参考](/super-agent/overview/resume-template)。

## 常见问题

### 要不要学 Python？

可以学一点，但别焦虑。

后端同学学 Python，不是为了特意换语言学习 Agent 项目，而是为了看懂一些 AI 开源项目、评估工具和脚本。比如 RAGAS、LangChain、LlamaIndex 这些生态里有很多 Python 内容。你至少要能看懂示例、改脚本、跑评估。

但主项目完全可以用 Java 做。尤其是企业内部系统，Spring Boot、MySQL、Redis、MQ、ES 这些技术仍然是很常见的。

### Go 后端怎么学？

核心概念其实都一样的。LLM API、RAG、Tool Calling、MCP、Agent 执行器、可观测性，这些不依赖语言。

区别在生态。Java 有 Spring AI、LangChain4j、Spring AI Alibaba；Go 生态成熟度稍弱，但做 API 网关、工具服务、MCP Server、异步任务完全没问题。

我的建议是：如果你主栈是 Go，不要为了学 AI 硬去切换 Java。

### 要不要学微调？

要了解，但不要一开始就学这个。

多数业务场景先用 Prompt + RAG + 工具调用就能解决。微调适合更垂直、更稳定、更高频的任务，比如特定格式的生成、行业术语风格、分类抽取。它并不是万能的。

你可以先看：[大模型训练与微调技术全貌](/ai-interview/llm-intro/training-finetuning-landscape)，知道 LoRA、QLoRA、后训练这些概念什么时候该出现就可以。

### 模型怎么选？

开发阶段先选便宜、好调、中文能力够用的模型。上线前再用更强模型做验证。架构上通过 OpenAI 兼容协议或模型网关隔离供应商，别把业务代码写死在某一家 SDK 上。

可以看：[主流模型选型指南](/ai-interview/llm-intro/model-selection) 和 [大模型网关的设计与落地](/ai-interview/system-design/llm-gateway)。

## 最终学习清单

**第一层：模型基础**

- Token、上下文窗口、采样参数、模型选择
- 能解释模型为什么会幻觉、为什么会遗忘、为什么会不稳定

**第二层：模型接入**

- Spring AI / HTTP SDK
- SSE 流式输出
- 结构化输出
- 超时、重试、降级

**第三层：Prompt 和上下文**

- Prompt 模板化
- Few-shot / CoT / 反思
- 上下文工程
- Token 预算
- Prompt Injection 防护

**第四层：RAG**

- 文档解析
- 分片策略
- Embedding
- 向量数据库
- 混合检索
- Rerank
- 引用和幻觉治理
- 评估与更新

**第五层：工具和协议**

- Function Calling
- Tool Calling
- MCP Server / Client
- Skills 能力包
- 工具安全和审计

**第六层：Agent 执行**

- ReAct
- Plan-and-Execute
- Workflow / Graph / Loop
- 记忆系统
- 多 Agent
- Human-in-the-Loop

**第七层：工程化的设计**

- AI 应用分层架构
- 大模型网关
- 限流熔断
- 成本控制
- 全链路观测
- 数据安全
- 集群并发控制

**第八层：项目的证据**

- AI 对话网关
- 智能简历 / 面试助手
- 企业知识库问答
- 工具型 Agent
- 超级 AI 智能体

学到最后，你应该能做到两个能力：

1. **能交付：** 自己搭建一个比较完善的 AI 应用，能够运行、观测、评估和处理失败场景，而不只是跑通一个小 Demo。

2. **能表达：** 在面试里把每个技术点放回系统链路中讲清楚——它解决什么问题、为什么这样设计、做过哪些权衡、出了问题怎样排查。
