---
slug: /super-agent/skills/skill-md
description: "深入拆解SKILL.md文件的两大核心组成——Frontmatter元数据和Instruction指令正文，结合实战案例讲解编写技巧和常见误区"
keywords: ["SKILL.md", "Frontmatter", "Instruction", "技能元数据", "技能指令", "Skills编写规范"]
---

import VipInline from '@site/src/components/VipInline';

# SKILL.md核心配置深度剖析

上一篇我们看了整个Skill的目录结构，知道了SKILL.md是唯一的必选文件。但"必选"这两个字背后的分量远不止于此——**一个Skill好不好用，90%取决于SKILL.md写得怎么样**。

你可以把references、scripts想象成一个战士的装备和武器，而SKILL.md就是这个战士的大脑和经验。武器再好，如果脑子不清楚什么时候用什么武器、该用什么战术，战斗力一样上不去。

所以这一篇，我们把SKILL.md掰开揉碎，从结构到写法到踩坑经验，全面覆盖地来梳理一下。

## SKILL.md的两层结构

一个SKILL.md文件，从上到下分成两个截然不同的区域：

```plantuml title="SKILL.md 的两层结构" width="65%" align="left"
@startuml
skinparam backgroundColor transparent
skinparam shadowing false
skinparam dpi 160
skinparam defaultFontColor #1E293B
skinparam packageStyle rectangle
skinparam packageBorderColor #CBD5E1
skinparam packageBackgroundColor #F8FAFC
skinparam rectangleBorderColor #94A3B8
skinparam rectangleBackgroundColor #FFFFFF
skinparam rectangleFontColor #1E293B
skinparam noteBorderColor #CBD5E1
skinparam noteBackgroundColor #F8FAFC
skinparam noteFontColor #1E293B
skinparam RoundCorner 18

package "SKILL.md 文件" as file #EFF6FF {
  rectangle "---\nFrontmatter 元数据\nname + description\n---" as fm #FEF3C7
  rectangle "Instruction 指令正文\n\n完整的执行指导\n包含使用时机、操作步骤、\n行为约束、组件调度" as inst #DBEAFE
}

fm -[hidden]down-> inst
note right of fm
  始终被扫描
  <b>Token 消耗极低</b>
end note
note right of inst
  匹配后才加载
  <b>按需消耗 Token</b>
end note
@enduml
```

这两层之间的分界线就是三个短横线`---`。上面是门面，下面是内功。我们分别来讲。

<VipInline />
