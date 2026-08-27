---
slug: /ai-programming/skills/matt-pocock-skills-usage
description: "面向本项目的 Matt Pocock Skills 调用指南，说明何时显式调用 skill、何时依赖自动匹配，以及如何遵守先看方案、明确授权后再修改的协作边界。"
keywords: ["Matt Pocock Skills", "Agent Skills", "grill-with-docs", "tdd", "wayfinder", "diagnosing-bugs", "handoff", "AI 编程"]
title: "Matt Pocock Skills 调用说明"
sidebar_label: "Matt Pocock Skills 调用说明"
pagination_label: "Matt Pocock Skills 调用说明"
---

# Matt Pocock Skills 调用说明

## 如何使用

这份说明用于当前项目后续使用 Matt Pocock 的 skills。它关注一件事：什么时候由我主动点名调用，什么时候可以让 AI 按任务自动匹配，以及怎样避免 skill 越过“先看方案、明确授权后再修改”的边界。

Matt Pocock Skills 的地址：[mattpocock/skills](https://github.com/mattpocock/skills)

> 当前项目已经安装 17 个 skill：原先选定的 12 个，加上 `codebase-design`、`code-review`、`to-spec`、`to-tickets` 和 `shadcn`。`implement` 目前没有安装，实施阶段使用 `$tdd`、手动实现和 `code-review`。

## 先记住这四句话

1. 普通功能修改，先用 `$grill-with-docs`，不要直接让 AI 开始写代码。
2. 方案批准后，再用 `$tdd` 做测试优先的实现。
3. 复杂故障，用 `$diagnosing-bugs`；跨会话换人，用 `$handoff`。
4. 自动匹配是辅助，不是保证。需要某种工作方式时，直接在提示中点名 skill。

在 Codex 中，可以输入 `$skill-name` 显式点名；也可从 Skills 选择器中选择。显式调用时，Codex 会读取该 skill 的完整规则。

## 当前安装集合与调用方式

### 必须主动调用的 skill

这些 skill 的设计目标就是由用户启动。仅仅说“实现一个登录功能”不会可靠地自动进入它们。

| Skill | 何时用 | 会做什么 | 注意事项 |
| --- | --- | --- | --- |
| `$setup-matt-pocock-skills` | 一个项目第一次启用这套流程时 | 配置 Issue Tracker、领域文档位置、triage 约定 | 会写入 `docs/agents/`，并可能更新 `AGENTS.md` 或 `CLAUDE.md`；先确认配置草案再执行。 |
| `$grill-with-docs` | 仓库内的新功能、改造、设计讨论 | 通过多轮提问澄清需求，并结合领域模型沉淀术语/ADR | 默认会维护文档。若这次只想讨论，明确写“不要创建或修改文件”。 |
| `$wayfinder` | 项目很大、路线和关键决策尚不清楚 | 在 Issue Tracker 中建立决策地图，逐项消除未知 | 它规划决策，不负责直接开发；普通小功能不要用。 |
| `$grill-me` | 不在代码仓库中讨论想法、计划或写作方向 | 做无状态的深度访谈 | 不会维护项目的 `CONTEXT.md` 或 ADR。 |
| `$handoff` | 要换会话、换 agent、换工作目录，或需要把上下文交接出去 | 生成精简、脱敏的交接摘要 | 摘要在操作系统临时目录；它不等于项目计划。 |

### AI 可以自动匹配的 skill

这类 skill 默认允许 Codex 在任务描述吻合时加载，但不保证每次都选中。若它对本次工作不可替代，仍然应显式点名。

| Skill | 常见触发信号 | 最稳妥的用法 |
| --- | --- | --- |
| `domain-modeling` | 术语歧义、业务概念边界、共同语言、ADR | 在 `$grill-with-docs` 中通常会被带起；单独梳理领域术语时可用 `$domain-modeling`。 |
| `tdd` | 测试优先、red-green-refactor、希望新增行为有测试保护 | 方案批准后直接写 `$tdd`，不要假设“实现功能”会自动测试优先。 |
| `diagnosing-bugs` | 报错、失败、性能慢、偶发问题、排查/诊断 | 故障复杂时直接点名；它要求先建立能捕获问题的反馈回路。 |
| `research` | 核实 API、框架、政策或第三方能力 | 直接点名并限定问题、可信来源和输出位置；它会写一份带引用的 Markdown 调研结果。 |
| `wizard` | 人工后台操作、API 密钥、CI Secret、迁移/切换 | 必须明确授权后使用。它可以生成脚本来写 `.env` 或 GitHub Secret。 |
| `grilling` | 压力测试一个决策或方案 | 一般由 `$grill-with-docs` 和 `$grill-me` 内部使用，不必平时单独调用。 |
| `writing-for-agents` | 修改 Skill、`AGENTS.md`、`CLAUDE.md` 或写给 agent 看的规则 | 需要稳定维护协作规则时，直接写 `$writing-for-agents`。 |
| `shadcn` | shadcn/ui 组件、组件注册表、preset、样式和组合方式 | 前端项目存在 `components.json`，或任务明确涉及 shadcn/ui 时自动匹配；它会读取项目配置并使用 shadcn CLI 查询/安装组件。 |

## 当前已安装的其他 skill

| Skill | 作用 | 建议何时显式调用 |
| --- | --- | --- |
| `codebase-design` | 用 module、interface、seam、depth、locality 等共同语言设计模块边界 | 新项目的关键模块设计、已有项目的接口/职责重构。 |
| `code-review` | 分开核对“是否符合规范”和“是否满足原始方案” | 每个有意义的改动完成后，例如 `$code-review main`。 |
| `$to-spec` | 将已讨论清楚的结论整理成规格 | 大型项目从规划转入开发前；它会写/发布规格，先明确输出位置和授权范围。 |
| `$to-tickets` | 把规格拆成有阻塞关系的垂直任务 | 规格确认后、准备跨多个会话或多个阶段实施时使用；发布前先确认任务粒度和依赖。 |

## 常用场景与提示词模板

### 1. 新项目或新功能：先澄清，暂不改代码

```text
$grill-with-docs

我要做……。
先读取现有项目并澄清目标、范围、关键流程、模块边界、风险和测试方式。
现在只给我方案；不要创建或修改文件、不要提交 Git、不要发布或调用外部系统。
```

如果项目确实巨大，而且现阶段连路线都不清楚：

```text
$wayfinder

我要从 0 到 1 规划……。
请先只建立决策地图：确认目标、未知问题、依赖和决策顺序。
不要进入功能实现，也不要创建外部 Issue；如需落地记录，先向我确认位置。
```

`wayfinder` 与 `handoff` 不相同：前者保存长期项目的决策路线，后者只携带当前会话已经得出的上下文。

### 2. 修改已有项目：先评估影响范围

```text
$grill-with-docs

我需要把……改成……。
先基于源码给出：当前行为、涉及模块和数据、兼容风险、测试 seam、改造方案与验收标准。
不要改代码；等我确认方案后再继续。
```

如果方案涉及模块职责、接口或测试边界本身，再补充：

```text
$codebase-design

针对上面的方案，比较可选模块边界和接口形状，说明每种方案的 seam、局部性和测试影响。
先出设计结论，不修改代码。
```

### 3. 规划定稿与任务拆分

当 `grill-with-docs` 或 `wayfinder` 已经把关键决策厘清后，可以先将结论定稿为规格，再拆成执行任务：

```text
$to-spec

请把当前已经确认的讨论整理成正式规格。
包括问题、目标行为、用户故事、实现决策、测试决策和明确的范围外内容。
先展示准备写入或发布的位置；不要修改业务代码，也不要提交 Git。
```

如果规格包含多个阶段或相互依赖的工作：

```text
$to-tickets

请根据已经确认的规格拆分垂直任务。
每张任务都要有独立的交付行为、验收条件和 Blocked by 关系。
先让我确认任务粒度与依赖；未经确认不要发布外部 Issue 或修改业务代码。
```

`to-spec` 负责回答“最终要做什么”，`to-tickets` 负责回答“应该分几步、按什么顺序做”。当前没有安装 `implement`，所以每张任务确认后仍由你决定是否进入 `$tdd` 和实际修改。

### 4. 方案批准后：测试优先实现

```text
$tdd

上面的方案已确认，现在可以修改代码实现……。
先为用户可见行为写失败测试，再做最小实现；只改本次方案涉及的文件。
不要自动提交 Git；完成后列出改动、测试结果和剩余风险。
```

如果已经安装 `code-review`，实施完成后再单独发：

```text
$code-review main

请审查从 main 到当前 HEAD 的改动：分别检查项目规范与已确认方案，不修改代码。
```

### 5. 复杂故障：先只读诊断

```text
$diagnosing-bugs

排查……。
第一阶段只读取日志、配置、调用链和现有测试，先给出能够稳定复现该问题的方案。
未经我明确授权，不要改代码、添加临时埋点、访问生产环境或执行外部操作。
```

获得授权后，再让它建立复现回路、补回归测试并修复。

### 6. 调研外部事实

```text
$research

调研……。
优先读取官方文档、源码或第一方 API；把每项结论关联到来源。
先告诉我准备写到哪个文件，或者只在聊天中报告；不要修改业务代码。
```

### 7. 转交或续办

```text
$handoff

下一次会话要继续处理……。
请输出当前已确认的结论、未决问题、相关文件/Issue 和建议调用的 skill。
不要复制已有规格、ADR 或日志内容；敏感信息必须脱敏。
```

### 8. 必须由人完成的后台配置

```text
$wizard

为……生成一次性人工操作向导。
先列出每一步、需要收集的值、写入位置和不可逆动作，等我确认后才生成脚本。
不要自行打开后台、写入密钥、修改 `.env` 或 GitHub Secret。
```

## 建议写入项目 `AGENTS.md` 的总边界

安装 skill 之后，建议保留以下规则。它的优先级高于任何 skill 内部的默认写入或提交倾向。

```markdown
## 协作授权边界

涉及代码、配置、文档、Issue、密钥、提交、发布或外部系统的写操作，
必须先完成只读调查并给出方案，获得用户明确授权后才能执行。

未授权时，只允许读取、分析、提出选项和报告风险；不得创建或修改文件、
执行 Git commit/push、创建外部 Issue、写入密钥或访问生产环境。
```

可以通过 `$writing-for-agents` 将这段规则与项目实际目录、测试命令和团队惯例合并，避免重复或与现有规则冲突。

## 一个实用的判断顺序

```text
需求还不清楚？       → $grill-with-docs
项目太大、路线未知？  → $wayfinder
外部事实待核实？      → $research
术语/领域边界有歧义？ → domain-modeling
规划已经确认？        → $to-spec
规格需要拆成多张任务？ → $to-tickets
方案已批准要开发？    → $tdd
报错或性能问题？      → $diagnosing-bugs
前端要使用 shadcn/ui？ → shadcn
准备换会话？          → $handoff
需要人工后台操作？    → $wizard
改 Skill/AGENTS？     → $writing-for-agents
```

不要在同一条提示中同时启动多个“必须主动调用”的编排 skill。先选一个入口：普通功能用 `$grill-with-docs`，巨大且模糊的长期事项用 `$wayfinder`，无仓库的讨论用 `$grill-me`。它们需要的模型级 skill 会在流程中按需加载。

## 参考

- [OpenAI Docs：Build skills](https://learn.chatgpt.com/docs/build-skills#how-chatgpt-and-codex-use-skills)
- [mattpocock/skills](https://github.com/mattpocock/skills)
- [shadcn Skills](https://ui.shadcn.com/docs/skills)
