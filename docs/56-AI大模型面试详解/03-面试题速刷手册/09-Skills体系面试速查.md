---
slug: /ai-interview/quick-review/skills-system
title: "Skills体系面试速查：Skills面试、能力模块、分层加载、SKILL.md、上下文管理详解"
sidebar_label: "Skills体系面试速查"
pagination_label: "Skills体系面试速查"
description: "Skills体系面试速查：覆盖Skills设计动机、目录结构、SKILL.md配置、四层渐进式加载、与MCP的区别等考点。内容进一步围绕Skills面试、能力模块、分层加载、上下文管理、Codex等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目实践建议与技术面试要…"
keywords: ["Skills面试", "能力模块", "分层加载", "SKILL.md", "上下文管理", "Codex", "Agent Skills"]
---

# Skills体系面试速查

:::tip 对应模块
本文对应 [Skills详细解析](/ai-interview/skills/why-need) 模块全部文档的面试考点提炼。Skills是本项目独有的深度内容，了解这套体系在面试中是加分项。
:::

### Q1：为什么需要Skills？它解决了什么问题？

当Agent可用的工具/能力超过20+个时，全部塞进上下文会出两个问题：一是Token消耗巨大（每个工具定义200-500 Token，20个就上万Token），二是模型选择准确率下降（选项太多容易选错）。

Skills的核心思路：**不在上下文里平铺所有能力，而是按需动态加载**。平时只放一个"目录索引"，模型确定需要某个能力后再加载完整定义。

类比图书馆：你不会把所有书都搬到桌上，而是先看目录索引，找到相关的再去取。

📖 [为什么需要Skills](/ai-interview/skills/why-need)

---

### Q2：一个Skill的目录结构是什么样的？

```
my-skill/
├── SKILL.md          # [必需] 元数据 + 执行指令
├── references/       # [可选] 补充文档、知识库
├── scripts/          # [可选] 确定性可执行脚本
└── assets/           # [可选] 静态资源文件
```

**SKILL.md**是核心——前面的Frontmatter（name + description）用于发现，后面的正文是执行指令。

**references/**：大块静态知识，不直接加载到上下文，按需查询。

**scripts/**：确定性的代码逻辑（不走LLM推理），本地执行。跟MCP的区别：Script是本地确定性执行，MCP是远程服务调用。

📖 [Skills目录结构详解](/ai-interview/skills/structure)

---

### Q3：SKILL.md的Frontmatter为什么要控制在30-50 Token？

因为Frontmatter是L1发现层被加载的内容——所有Skill的Frontmatter都会被加载到上下文中做初步匹配。如果你有50个Skill，每个Frontmatter 50 Token，总共也就2500 Token，完全可接受。

但如果每个Frontmatter写成200 Token的长篇描述，50个就是10000 Token，光"目录"就吃掉上下文预算的一大块。

所以Frontmatter要精炼：name（唯一标识）+ description（一句话说清楚做什么、什么时候用）。

📖 [SKILL.md配置详解](/ai-interview/skills/skill-md)

---

### Q4：四层渐进式加载（L1-L4）分别做什么？为什么这么分？

**L1 发现层**：加载所有Skill的Frontmatter（30-50 Token/个）。模型在这一层判断"我需不需要某个Skill"。

**L2 决策层**：确定需要后，加载该Skill完整的Instruction部分（200-1000 Token）。模型在这一层理解"怎么用这个Skill"。

**L3 细节层**：执行过程中需要参考具体文档时，从references/目录按需查询。不是全量加载，是查到相关段落才注入。

**L4 执行层**：调用scripts/中的脚本执行确定性逻辑。结果返回上下文，脚本代码本身不占上下文空间。

分层的好处：Token消耗按需递增。大部分Skill只会停在L1（不需要），少数到L2（需要了解怎么用），真正执行时才到L3/L4。

📖 [四层加载机制详解](/ai-interview/skills/progressive-loading)

---

### Q5：Script跟MCP工具的区别是什么？什么时候用Script？

**Script**：本地执行的确定性代码。不需要网络通信，不依赖外部服务，结果可预测。比如：格式转换、文本处理、数学计算、文件操作。

**MCP工具**：远程服务调用。需要网络通信、依赖外部系统。比如：查天气API、操作数据库、发送消息。

选择标准：逻辑确定且不需要外部数据 → Script；需要实时数据或操作外部系统 → MCP。

一个Skill内部可以同时有Script和MCP工具——Script处理本地逻辑部分，MCP调外部服务部分。

📖 [Reference和Script详解](/ai-interview/skills/reference-script)

---

### Q6：Skills跟MCP、Function Calling三者在架构中各处什么位置？

三者解决不同层面的问题：

**Function Calling**（模型层）：模型的"决策能力"——看到工具列表后决定调哪个。

**MCP**（通信层）：工具方和调用方的"连接标准"——统一对接协议。

**Skills**（上下文层）：能力模块的"容量管理"——工具太多时用分层加载控制Token消耗。

协作流程：Skills的L1索引帮模型快速定位需要的能力 → 选中的Skill可能包含MCP工具定义 → 模型通过Function Calling机制调用该工具 → 通过MCP协议跟远端通信。

📖 [为什么需要Skills](/ai-interview/skills/why-need)

---

### Q7：Codex是什么？怎么管理和安装Skills？

Codex类似包管理器（npm/pip），用于安装和管理Skills包。

安装方式：
- 项目级安装：Skills放在项目目录的`.skills/`下，只对当前项目有效
- 全局安装：放在用户级目录下，所有项目都能用

安装后的目录组织：每个Skill独立一个目录，包含完整的SKILL.md + references/ + scripts/结构。

版本管理：通过Codex可以更新已安装的Skill到新版本，也可以锁定版本避免自动升级。

📖 [Codex安装与管理](/ai-interview/skills/codex-install)