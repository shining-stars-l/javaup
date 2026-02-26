---
slug: /damai-ai/interview/SpringAIAndLangChain4j
description: "Spring AI与LangChain4j对比分析，从框架抽象、生态集成、工具调用与向量检索支持等维度说明两者在Java AI工程中的适配差异。"
keywords: ["Spring AI", "LangChain4j", "框架对比", "生态集成", "抽象层能力", "工具调用", "向量检索支持", "Java AI工程"]
---

import VipInline from '@site/src/components/VipInline';

# Spring AI 和 LangChain4j 两者的区别

> > 大麦AI项目使用的是Spring AI，这里聊聊它跟LangChain4j到底有啥不一样
>

## 先说结论
如果你是Spring开发者，用Spring AI准没错，上手快、配置少、生态好。如果你不想被Spring绑定，或者项目比较特殊，LangChain4j也是个好选择。

---

## 一、这俩玩意儿是干啥的？
简单说，Spring AI和LangChain4j都是帮Java开发者接入大模型的框架。就像你用MyBatis操作数据库一样，这俩框架帮你操作AI模型。

但它们的"气质"完全不一样：

+ **Spring AI**：Spring官方出品，走的是"约定大于配置"的老路子，搞Spring那套的同学闭着眼睛都能上手
+ **LangChain4j**：从Python的LangChain移植过来的，更灵活但也更"原始"一点，啥都要自己配

### 背景故事
**Spring AI** 是Spring官方在2023年底开始搞的项目，2024年5月发布1.0正式版。说白了就是Spring看到Python那边LangChain火得一塌糊涂，Java这边也得有个像样的AI框架，不然Java开发者都跑去写Python了。

**LangChain4j** 则是社区项目，由Dmytro Liubarskyi在2023年发起，目标是把Python LangChain的理念搬到Java。它不绑定任何框架，Quarkus、Micronaut、纯Java都能用。

<VipInline />
