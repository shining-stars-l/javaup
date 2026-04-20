---
slug: /super-agent/spring-ai-detail/advisor-mechanism
description: "全面解析Spring AI的Advisor拦截器机制：从AOP设计思想到责任链模式，深入分析内置Advisor源码，手把手教你自定义Advisor实现日志、鉴权等功能"
keywords: ["Advisor", "拦截器", "责任链模式", "AOP", "SimpleLoggerAdvisor", "SafeGuardAdvisor", "自定义Advisor"]
---

import VipInline from '@site/src/components/VipInline';

# Advisor拦截器机制揭秘

在前面的章节中，我们多次用到了Advisor，比如SimpleLoggerAdvisor用来打印日志。但Advisor到底是什么？能做什么？怎么自己写一个？

这篇文章来彻底搞清楚Spring AI的Advisor机制。

## Advisor的设计思想

如果你熟悉Spring AOP，那理解Advisor会非常轻松——它们的设计思想如出一辙。

**Advisor就是AI请求/响应的拦截器**，可以在请求发送前和响应返回后做一些增强处理。

```plantuml title="Advisor 责任链处理模型" width="75%" align="left"
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

rectangle "请求处理流程" as Flow #F8FEFF {
  rectangle "用户请求" as Req #ECFDF5
  rectangle "前置处理" as ReqLabel #F8FEFF;line:F8FEFF
  
  rectangle "Advisor Chain" as Chain #F0FDFF {
    rectangle "Advisor 1" as A1 #ECFEFF
    rectangle "Advisor 2" as A2 #ECFEFF
    rectangle "Advisor N" as AN #ECFEFF

    A1 -[hidden]right- A2
    A2 -[hidden]right- AN
  }
  
  rectangle "ChatModel调用" as Model #EFF6FF
  rectangle "返回响应" as Resp #F0FDF4

  Req -[hidden]right- Chain
  ReqLabel -[hidden]right- Req
  ReqLabel -[hidden]down- Chain
  Chain -[hidden]right- Model
  Model -[hidden]right- Resp
}

Req --> A1
A1 --> A2 : 前置处理
A2 --> AN : 前置处理
AN --> Model : 执行调用
Model --> AN : 后置处理
AN --> A2 : 后置处理
A2 --> A1 : 后置处理
A1 --> Resp : 返回结果
@enduml
```

典型的责任链模式（Chain of Responsibility），每个Advisor都有机会：
- 在请求发送给大模型**之前**，修改或增强请求内容
- 在大模型返回响应**之后**，处理或转换响应内容

:::info Advisor 的应用场景
| 场景 | 说明 |
|-----|------|
| 日志记录 | 记录每次请求和响应，便于调试和审计 |
| 对话记忆 | 自动维护多轮对话的上下文 |
| 内容审核 | 过滤敏感词、检查输入输出 |
| 性能监控 | 统计响应时间、token消耗 |
| 限流熔断 | 控制调用频率、失败重试 |
| 权限校验 | 检查用户是否有调用权限 |
| 内容增强 | 自动注入额外上下文信息 |
:::

<VipInline />
