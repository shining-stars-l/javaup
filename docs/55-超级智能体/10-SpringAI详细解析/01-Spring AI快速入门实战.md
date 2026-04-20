---
slug: /super-agent/spring-ai-detail/quick-start
description: "从零开始搭建Spring AI项目，手把手教你完成第一次与大模型的对话，涵盖依赖配置、ChatClient使用、流式响应及日志调试全流程"
keywords: ["Spring AI", "ChatClient", "DeepSeek", "大模型对话", "流式输出", "Flux", "AI开发入门"]
---

import VipInline from '@site/src/components/VipInline';

# Spring AI快速入门实战

很多人第一次接触大模型开发，脑子里都会冒出一个问题：在Java项目里怎么跟AI对话？是不是要自己拼HTTP请求、解析JSON、处理各种异常？

其实完全不用这么麻烦。Spring官方团队专门搞了一套叫Spring AI的框架，目的就是让Java开发者能像调用普通Service一样调用大模型。今天咱们就从零开始，跑通第一个AI对话程序。

## 为什么选择Spring AI

在动手之前，先聊聊为什么要用Spring AI，而不是自己撸HTTP请求。

你可能想过用HttpClient直接调API：

```java
// 自己拼接HTTP请求调大模型，看着就累
HttpClient client = HttpClient.newHttpClient();
String requestBody = """
    {
        "model": "qwen-plus",
        "messages": [{"role": "user", "content": "你好"}]
    }
    """;
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/chat"))
    .header("Authorization", "Bearer " + apiKey)
    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
    .build();
// 还要处理响应解析、异常、重试...
```

这种写法有几个问题：

- **代码量大**：每次调用都要组装请求体、设置Header、解析响应
- **没有复用性**：换个模型厂商，代码几乎要重写
- **功能受限**：流式输出、对话记忆、工具调用这些高级功能实现起来很痛苦

Spring AI就是来解决这些问题的。它把各种大模型的API差异屏蔽掉了，你只需要面向统一的接口编程，底层对接的是OpenAI还是DeepSeek，代码基本不用改。

## 环境准备

在开始写代码之前，确保你的开发环境满足以下条件：

:::info 环境要求
- JDK 17及以上版本（Spring AI要求的最低版本）
- Maven或Gradle构建工具
- 一个大模型的API Key
:::

**获取API Key的方式**：[参考硅基流动章节中apiKey的设置](/super-agent/llm-intro-qoder/dev-environment)

### 示例中项目地址

- 项目地址：[https://github.com/java-up-up/super-agent](https://github.com/java-up-up/super-agent)
- 项目模块：`ai-example-spring-ai`

<VipInline />