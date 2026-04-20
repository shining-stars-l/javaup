---
slug: /super-agent/prompt/rag-prompt-engineering
description: "RAG场景的提示词有独特的挑战：限定知识来源、处理信息冲突、要求引用标注、防止提示词注入。掌握这些专门技巧，打造可靠的知识库问答系统"
keywords: ["RAG", "检索增强生成", "知识库问答", "提示词注入", "引用标注", "信息冲突", "兜底策略", "澄清机制"]
---

import VipInline from '@site/src/components/VipInline';

# RAG场景提示词工程实战

**RAG**（Retrieval-Augmented Generation，检索增强生成）是一种让大模型"查资料再回答"的技术。

普通的大模型问答，AI 完全依赖自己训练时学到的知识。这有两个问题：
1. 知识可能过时——训练数据有截止日期
2. 可能不了解你的专属内容——比如你公司的产品文档、内部政策

RAG 的解决方案是：
1. 用户提问时，先从知识库中检索相关文档片段
2. 把这些文档片段和用户问题一起发给大模型
3. 让大模型基于这些"参考资料"来回答

这样，AI 的回答就有了"出处"，而且可以包含最新的、专属的知识。

但 RAG 场景的提示词设计，比普通对话复杂得多。因为你要处理一些特殊问题：
- 怎么让 AI 只用给定的资料，不自己编
- 检索到的多份资料有冲突怎么办
- 怎么让 AI 标注引用，让用户知道答案来源
- 资料里没有相关信息时怎么处理
- 怎么防止恶意用户在资料里植入攻击指令

这一章就专门聊这些问题。
```plantuml title="RAG 问答从检索到安全回答的关键链路" width="40%" align="left"
@startuml

title RAG 问答从检索到安全回答的关键链路

skinparam backgroundColor transparent
skinparam shadowing false
skinparam dpi 180
skinparam DefaultTextAlignment center
skinparam ArrowColor #2F6F7E
skinparam ArrowThickness 1.2
skinparam ActivityBorderThickness 1
skinparam roundCorner 18

skinparam activity {
  BackgroundColor #F8FBFD
  BorderColor #8FB7C2
  FontColor #153B44
  StartColor #2497C9
  EndColor #22A06B
  BarColor #2F6F7E
  DiamondBackgroundColor #FFF4D8
  DiamondBorderColor #D7A23D
  DiamondFontColor #7A5610
}

skinparam partition {
  BackgroundColor #FFFFFF
  BorderColor #D9E7EB
  FontColor #153B44
}

start

partition "检索准备" #EAF6FF {
  :接收用户问题;
  :检索相关资料并附上编号、时间、来源;
}

partition "安全与完整性检查" #F2FAFF {
  :把资料只当作事实来源;\n不当作指令来源;

  if (发现提示词注入内容?) then (是)
    :忽略恶意指令;\n仅保留可验证事实;
  endif

  if (资料是否足够回答?) then (否)
    :先澄清缺失信息\n或触发兜底回复;
    stop
  endif
}

partition "证据裁决" #F4FFF7 {
  if (资料之间有冲突?) then (有)
    :按更新时间、具体性、权威性排序;
  endif

  :只保留有依据的结论;
}

partition "回答生成" #FFF8EF {
  :生成带引用的答案;

  if (某部分缺少依据?) then (是)
    :明确说明“资料中没有相关信息”;
  endif

  :输出给用户;
}

stop
@enduml
```

## 限定知识来源：最重要的规则

:::danger RAG 最核心的规则
RAG 场景最核心的规则就一条：**只用给定的参考资料回答，不要自己编**。

光有规则还不够，还要有"惩罚"机制——告诉 AI 违反这个规则的后果：
```
警告：如果你的回答包含参考资料中没有的信息，会被视为错误回答。宁可说"不知道"，也不要编造。
```
:::

<VipInline />