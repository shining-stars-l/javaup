---
slug: /super-agent/spring-ai-detail/core-architecture
description: "深入剖析Spring AI的核心架构设计：ChatModel与ChatClient的关系、Prompt和Message体系、ChatResponse解析，以及Options参数配置的完整指南"
keywords: ["Spring AI架构", "ChatModel", "ChatClient", "Prompt", "ChatResponse", "Message", "ChatOptions"]
---

import VipInline from '@site/src/components/VipInline';

# Spring AI核心架构解析

用Spring AI写代码很简单，几行就能跑起来。但如果你想用好它，或者遇到问题能快速定位，就得搞清楚底层的架构设计。

这篇文章会带你深入Spring AI的核心组件，理解它们之间的关系和协作方式。

## 整体架构鸟瞰

先从宏观视角看看Spring AI的分层设计：

```plantuml title="Spring AI 核心架构总览" width="100%" align="center"
@startuml
skinparam backgroundColor #F8FBFD
skinparam roundcorner 18
skinparam shadowing false
skinparam defaultFontName Microsoft YaHei
skinparam defaultFontSize 14
skinparam defaultTextAlignment center
skinparam linetype ortho
skinparam dpi 160
skinparam ArrowColor #0F766E
skinparam ArrowThickness 1.4
skinparam ArrowFontColor #164E63
skinparam ArrowFontSize 13
skinparam HyperlinkColor #0891B2
skinparam packageStyle rectangle
skinparam componentStyle rectangle

skinparam note {
  BackgroundColor #ECFEFF
  BorderColor #67E8F9
  FontColor #155E75
}

skinparam package {
  BackgroundColor #FFFFFF
  BorderColor #7DD3FC
  FontColor #164E63
}

skinparam rectangle {
  BackgroundColor #FFFFFF
  BorderColor #38BDF8
  FontColor #0F172A
}

skinparam component {
  BackgroundColor #FFFFFF
  BorderColor #38BDF8
  FontColor #0F172A
}

skinparam interface {
  BackgroundColor #F0FDFF
  BorderColor #0891B2
  FontColor #164E63
}

skinparam class {
  BackgroundColor #FFFFFF
  BorderColor #0891B2
  ArrowColor #0F766E
  FontColor #164E63
  HeaderBackgroundColor #ECFEFF
}

skinparam object {
  BackgroundColor #FFFFFF
  BorderColor #0891B2
  FontColor #164E63
}

skinparam actor {
  BackgroundColor #ECFDF5
  BorderColor #0F766E
  FontColor #134E4A
}

skinparam participant {
  BackgroundColor #F0FDFF
  BorderColor #0891B2
  FontColor #164E63
}

skinparam sequence {
  LifeLineBorderColor #7DD3FC
  LifeLineBackgroundColor #F8FBFD
  ParticipantBorderColor #0891B2
  ParticipantBackgroundColor #F0FDFF
  ParticipantFontColor #164E63
  ActorBorderColor #0F766E
  ActorBackgroundColor #ECFDF5
  ActorFontColor #134E4A
  ArrowColor #0F766E
  ArrowFontColor #164E63
  BoxBorderColor #A5F3FC
  BoxBackgroundColor #F8FEFF
  BoxFontColor #164E63
  GroupBorderColor #38BDF8
  GroupBackgroundColor #ECFEFF
  GroupHeaderBackgroundColor #CFFAFE
  GroupHeaderFontColor #155E75
  DividerBorderColor #67E8F9
  DividerBackgroundColor #F0FDFF
  DividerFontColor #155E75
}

skinparam activity {
  BackgroundColor #FFFFFF
  BorderColor #0891B2
  FontColor #164E63
  StartColor #0F766E
  EndColor #0F766E
  BarColor #0891B2
  DiamondBackgroundColor #ECFEFF
  DiamondBorderColor #38BDF8
  DiamondFontColor #155E75
}

package "应用层" {
  [业务代码]
}

package "客户端层" {
  [ChatClient] as CC
  note right of CC : 高级封装\n流式API
}

package "模型抽象层" {
  [ChatModel接口] as CM
  [StreamingChatModel] as SCM
}

package "实现层" {
  [DashScopeChatModel]
  [OpenAiChatModel]
  [OllamaChatModel]
}

package "数据传输对象" {
  [Prompt] as P
  [Message] as M
  [ChatResponse] as CR
  [ChatOptions] as CO
}

[业务代码] --> CC
CC --> CM
CM --> [DashScopeChatModel]
CM --> [OpenAiChatModel]
CM --> [OllamaChatModel]
CM ..> P : 输入
CM ..> CR : 输出
P --> M : 包含
P --> CO : 配置

CM --|> SCM : 继承
@enduml
```

Spring AI采用了经典的分层架构，核心思想是**面向接口编程**。你的业务代码只需要和ChatClient或ChatModel打交道，完全不用关心底层对接的是哪家模型。

:::info 核心设计思想
Spring AI 的核心是**面向接口编程**。`ChatModel` 是统一的模型抽象接口，`ChatClient` 是更高级的封装入口，业务代码与具体的模型实现完全解耦——换模型只需要换依赖，代码基本不用改。
:::

## ChatModel：模型统一抽象

ChatModel是Spring AI最核心的接口，它定义了与对话模型交互的标准方式。

### 接口设计

来看看它的接口定义：

```java
public interface ChatModel extends Model<Prompt, ChatResponse>, StreamingChatModel {
    
    // 最简单的调用方式：传入字符串，返回字符串
    default String call(String message) {
        Prompt prompt = new Prompt(new UserMessage(message));
        Generation generation = call(prompt).getResult();
        return (generation != null) ? generation.getOutput().getText() : "";
    }
    
    // 传入多条消息
    default String call(Message... messages) {
        Prompt prompt = new Prompt(Arrays.asList(messages));
        Generation generation = call(prompt).getResult();
        return (generation != null) ? generation.getOutput().getText() : "";
    }
    
    // 核心方法：传入Prompt，返回完整响应
    @Override
    ChatResponse call(Prompt prompt);
    
    // 流式调用
    default Flux<ChatResponse> stream(Prompt prompt) {
        throw new UnsupportedOperationException("streaming is not supported");
    }
}
```

注意到它继承了两个接口：

- **Model\<Prompt, ChatResponse\>**：定义了基本的call方法
- **StreamingChatModel**：定义了stream方法，支持流式输出

### 为什么这样设计？

这种设计带来的好处是**解耦**。假设今天用阿里云的通义千问，明天要换成OpenAI的GPT-4，你只需要换一个依赖包，业务代码一行不改：

```java
// 业务代码完全不关心用的是哪个模型
@Service
public class ProductService {
    
    private final ChatModel chatModel;  // 只依赖接口
    
    public String generateDescription(String productName) {
        return chatModel.call("为商品'" + productName + "'写一段吸引人的描述");
    }
}
```

## ChatClient：更友好的门面

ChatModel虽然功能完整，但用起来稍显繁琐。Spring AI又封装了一个ChatClient，提供了更流畅的API。

### ChatClient vs ChatModel

打个比方：ChatModel像是JDBC，功能强大但用起来啰嗦；ChatClient像是Spring Data JPA，简洁优雅，大多数场景用它就够了。

:::tip ChatClient vs ChatModel
日常开发中优先使用 `ChatClient`，它提供了更简洁的链式 API，内置了对 Advisor、默认参数的支持。只有当你需要精细控制底层请求（比如自定义 `Prompt` 构建），才有必要直接使用 `ChatModel`。
:::

<VipInline />
