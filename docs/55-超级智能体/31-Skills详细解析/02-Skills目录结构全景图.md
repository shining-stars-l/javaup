---
slug: /super-agent/skills/structure
description: "从工程设计视角拆解Agent Skills的目录结构，理解每个组件存在的意义，以及这套结构为什么能让智能体高效工作"
keywords: ["Skills目录结构", "SKILL.md", "Reference", "Script", "技能模块设计", "智能体工程化"]
---

import VipInline from '@site/src/components/VipInline';

# Skills目录结构全景图

上一篇我们聊到，Agent Skills本质上是一种"按需取用的能力模块"。那这个模块在物理层面到底长什么样呢？

答案可能会让你有点意外——**它就是一个文件夹**。

没有复杂的配置中心，没有什么注册发现服务，也不需要额外的运行时框架。一个Skill就是一个符合约定结构的目录，放到指定位置，智能体就能识别和使用它。

为什么要用这么"朴素"的方式？原因其实也很简单了：

- **零依赖**：不需要安装任何额外的工具链，任何编辑器都能创建和修改
- **版本友好**：文件夹天然适合Git管理，团队协作和版本追踪毫无阻碍
- **可移植性强**：复制粘贴就能把一个技能从项目A搬到项目B
- **透明可审计**：所有内容都是纯文本，打开就能看到技能里写了什么

:::info 设计哲学
Agent Skills选择文件夹作为载体，背后的理念是：**让能力管理回归到最简单的形式，降低使用门槛，同时保持最大的灵活性。**
:::

## 一个完整Skill长什么样

直接上结构，一个典型的Skill目录是这样的：

```plantuml title="Agent Skill 标准目录结构" width="100%" align="left"
@startuml
skinparam backgroundColor transparent
skinparam shadowing false
skinparam dpi 160
skinparam linetype ortho
skinparam defaultFontColor #1E293B
skinparam ArrowColor #2563EB
skinparam ArrowThickness 1.3
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

package "my-skill/ 技能根目录" as root #EFF6FF {
  rectangle "SKILL.md\n<size:11>唯一必选</size>\n<size:11>入口、元数据、Instruction</size>" as skillmd #DBEAFE

  package "references/ 可选" as refs #F0FDF4 {
    rectangle "api-spec.md\n<size:11>接口规范</size>" as ref1 #FFFFFF
    rectangle "examples.md\n<size:11>使用示例</size>" as ref2 #FFFFFF
  }

  package "scripts/ 可选" as scripts #FFFBEB {
    rectangle "validate.py\n<size:11>数据校验</size>" as s1 #FFFFFF
    rectangle "transform.sh\n<size:11>格式转换</size>" as s2 #FFFFFF
  }

  package "assets/ 可选" as assets #F8FAFC {
    rectangle "diagram.png\n<size:11>说明图片</size>" as a1 #FFFFFF
  }
}

skillmd -down-> refs : 需要时查阅
skillmd -down-> scripts : 按指令调用
skillmd -down-> assets : 引用静态资源

note left of skillmd
  <b>唯一入口</b>
  智能体先从这里认识这个 Skill
end note
@enduml
```

用一句话概括每个部分：

| 组件 | 是否必选 | 一句话说明 |
|------|---------|-----------|
| **SKILL.md** | 必选 | 技能的身份证+操作手册，是整个Skill的灵魂 |
| **references/** | 可选 | 补充性的参考资料库，需要时才打开翻阅 |
| **scripts/** | 可选 | 确定性执行的脚本工具箱，关键步骤靠代码保底 |
| **assets/** | 可选 | 图片、配置模板等静态资源文件 |

接下来我们逐个拆开看。

<VipInline />
