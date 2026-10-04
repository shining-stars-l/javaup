---
slug: /ai-programming/claude-code/skills-runtime
title: "Claude Code Skills如何把流程变成能力"
sidebar_label: "Claude Code Skills如何把流程变成能力"
pagination_label: "Claude Code Skills如何把流程变成能力"
description: "从一个Java接口兼容性审查Skill的设计过程出发，讲清Claude Code Skills的目录结构、发现与加载、Front Matter、参数替换、动态上下文、Supporting Files、安全边界和Subagent执行方式。"
keywords: ["Claude Code Skills", "SKILL.md", "Agent Skills", "渐进式加载", "动态上下文", "Supporting Files", "Skill安全"]
---

# Claude Code Skills如何把流程变成能力

团队每次改公开 API 都要做一遍兼容性审查：对比 DTO 字段、检查 OpenAPI、搜索旧调用方、核对错误码、运行契约测试。把这套步骤复制到每次对话里很麻烦，塞进 `CLAUDE.md` 又会让所有任务承担无关上下文。

Skill 很适合承载这种流程。平时 Claude 只需要知道项目里有“接口兼容性审查”这项能力，真正用到时再加载完整步骤和参考资料。

## 哪些内容值得做成Skill

一段内容同时具备下面几个特点时，我会考虑做成 Skill：

- 经常重复使用；
- 有明确触发场景；
- 执行步骤相对稳定；
- 内容较长，不需要每轮常驻；
- 需要脚本、模板或参考资料配合；
- 最终产物可以明确验收。

代码审查、接口兼容检查、故障排查、数据库变更评估、文档发布和 UI 验收都符合这类特征。

每轮都要遵守的编码规范继续放 `CLAUDE.md`；只影响路径的规则放 `.claude/rules/`；必须固定触发的动作交给 Hooks。

![Claude Code扩展机制职责图](/img/ai-interview/claudecode/skills-extension-roles.png)

## 一个Skill的最小结构

Claude Code 的标准文件系统 Skill 以目录为单位，入口固定为 `SKILL.md`：

```text
.claude/skills/
└── api-compatibility-check/
    ├── SKILL.md
    ├── references/
    │   ├── compatibility-rules.md
    │   └── report-format.md
    └── scripts/
        └── collect-api-diff.sh
```

`SKILL.md` 包含 YAML Front Matter 和 Markdown 正文。Front Matter 描述什么时候使用、可以调用哪些工具、是否允许自动触发；正文写执行顺序、边界和输出要求。

```markdown
---
name: api-compatibility-check
description: 检查Java服务公开API的向后兼容性。用户要求修改Controller、DTO、OpenAPI或公开错误码时使用。
allowed-tools: Read, Grep, Glob, Bash(git diff *)
---

检查本次API改动：

1. 阅读当前diff，确认Controller、请求/响应DTO和OpenAPI变更。
2. 搜索被删除或改名字段的仓库内调用方。
3. 按[兼容规则](references/compatibility-rules.md)判断破坏性变更。
4. 运行项目已有的契约测试，不创建新的发布动作。
5. 按[报告格式](references/report-format.md)输出证据和风险。
```

正文重点写动作和判断条件，背景知识移到 Supporting Files。官方建议 `SKILL.md` 控制在 500 行以内，长参考资料按需读取。

## Claude Code怎样发现Skills

常用位置包括：

| 范围 | 路径 | 用途 |
| --- | --- | --- |
| 个人 | `~/.claude/skills/<name>/SKILL.md` | 所有本地项目复用 |
| 项目 | `.claude/skills/<name>/SKILL.md` | 与仓库和团队共享 |
| 组织 | 托管配置提供的位置 | 统一下发 |
| 插件 | `<plugin>/skills/<name>/SKILL.md` | 跟随插件分发 |

项目子目录也可以有嵌套 `.claude/skills/`。Claude 读取或修改对应子目录文件后，那里的 Skills 才会进入可用列表。Monorepo 中某个包有独立发布流程时，这种局部 Skill 很有价值。

如果只是为了分类，不要滥用嵌套目录。Skill 名称冲突、加载时机和调用名称都会增加理解成本。

Claude Code 已经把 Custom Commands 合并到 Skills 体系。旧的 `.claude/commands/deploy.md` 仍然可以工作，新能力更适合使用 `.claude/skills/<name>/SKILL.md`，因为它能携带脚本、参考资料和更完整的 Front Matter。

![ClaudeCode的Context命令](/img/ai-interview/claudecode/ClaudeCode的Skills命令.png)

## 渐进式加载怎样节省上下文

Skill 的加载可以理解成三层：

1. **发现层**：会话知道名称和 description，用来判断是否相关；
2. **指令层**：Skill 被调用后，`SKILL.md` 正文进入上下文；
3. **资源层**：references、templates 和 scripts 在正文要求时读取或执行。

这套加载方式让低频长材料不必在启动时全部进入窗口。需要注意，Skill 正文一旦加载，会在本次会话后续轮次继续占用上下文。正文仍要简洁，Supporting Files 也要明确“什么时候读”。

![Skill三层渐进加载图](/img/ai-interview/claudecode/skills-progressive-load.png)

## Front Matter哪些字段最实用

当前 Claude Code 支持的字段很多，日常 Skill 先掌握下面这些：

| 字段 | 作用 | 使用建议 |
| --- | --- | --- |
| `name` | 展示名称 | 命令名通常仍由目录名决定 |
| `description` | 告诉Claude什么时候使用 | 写清触发场景和任务边界 |
| `allowed-tools` | 本轮调用可免确认的工具 | 只放必要的精确范围 |
| `disallowed-tools` | Skill活动期间移除的工具 | 高风险或后台流程可用 |
| `disable-model-invocation` | 禁止Claude自动调用 | 部署、提交、外部发送等有副作用流程 |
| `user-invocable` | 是否显示给用户手动调用 | 纯背景知识可设为false |
| `context: fork` | 在独立Subagent上下文中运行 | 长调研、审查和大量读取 |
| `agent` | 指定fork时使用的Subagent | 需要特定工具和角色时配置 |
| `paths` | 限制自动激活的文件范围 | 模块或文件类型专用Skill |
| `model`、`effort` | 覆盖本轮模型与推理强度 | 成本或任务难度确有需要时使用 |

字段越多，维护和排查越复杂。一个简单 Skill 常常只需要 description、正文和少量工具权限。

### 有副作用的Skill应只允许手动调用

下面这类流程不适合让模型自行判断时机：

```yaml
---
name: publish-release-notes
description: 生成并发布版本说明到团队公告系统
disable-model-invocation: true
---
```

生成草稿可以自动，真正发布会改变外部状态。设置手动调用以后，用户明确执行 `/publish-release-notes` 才会开始。

## 参数替换怎样让Skill可复用

Skill 可以接收调用参数：

```markdown
---
name: inspect-api-change
description: 检查指定服务和目标版本之间的API兼容性
disable-model-invocation: true
---

检查服务 `$0` 从基线 `$1` 到当前分支的API变化。

报告写入位置：`$2`
```

调用示例：

```text
/inspect-api-change billing-service origin/main docs/api-change-report.md
```

`$0`、`$1`、`$2` 分别替换三个位置参数，`$ARGUMENTS` 可以取得完整参数字符串。参数缺失时要在正文里要求停止并提示用法，避免把字面量 `$2` 当成真实路径。

## Dynamic Context为什么要限制为只读采集

Skill 支持在正文发送给模型前执行命令，并把输出内联进去：

```markdown
当前改动文件：

!`git diff --name-only origin/main...HEAD`
```

模型看到的是命令输出，预处理过程发生在 Agent Loop 之前。它适合采集稳定、只读、低风险的材料：

- `git status --short`；
- `git diff --name-only`；
- 项目自带的只读报告脚本；
- 已经授权的 PR 信息查询。

修改文件、提交代码、删除资源和调用生产接口不应该放在动态上下文里。预处理动作发生得早，也不适合让用户在中间确认每一步。

第三方 Skill 安装前要检查动态命令和 `scripts/`。允许一个 Skill 执行预处理脚本，相当于信任它在本机运行代码。

## Supporting Files如何拆分

我会让 `SKILL.md` 只保留路线图：

- 什么时候触发；
- 按什么顺序执行；
- 哪些边界必须遵守；
- 哪些失败要停止；
- 输出怎样验收；
- 需要细节时读哪个文件。

详细兼容规则放 `references/compatibility-rules.md`，报告模板放 `templates/report.md`，确定性采集放 `scripts/collect-api-diff.sh`。

引用说明要具体：

```markdown
- 发现DTO字段删除或类型变化时，读取
  [兼容规则](references/compatibility-rules.md)第2节。
- 确认存在破坏性变更后，使用
  [报告模板](templates/report.md)生成审查结果。
```

只写“更多信息见 references”会让 Claude 不知道什么时候该读哪一份。

## Skill和Subagent怎样配合

长审查会读很多文件，主会话只关心结果时，可以配置：

```yaml
---
name: api-compatibility-check
description: 对公开API变更做只读兼容性审查
context: fork
agent: Explore
background: false
allowed-tools: Read, Grep, Glob, Bash(git diff *)
---
```

Skill 提供“怎么做”，Subagent 提供独立上下文和工具边界。审查过程留在子窗口，主会话拿到报告与证据。

需要主会话持续参与决策的流程不适合 fork。例如接口字段每改一步都要产品确认，此时 inline 执行更方便。

## 安全审查要看哪些地方

安装第三方 Skill 前，至少检查：

1. Front Matter 是否申请了过宽的工具；
2. 是否允许自动调用有副作用流程；
3. Dynamic Context 里是否存在下载、执行和写入命令；
4. `scripts/` 是否读取凭据或用户目录；
5. 是否调用外部 API 并发送仓库内容；
6. 引用的 MCP Server 是否可信；
7. 模板是否包含 Prompt Injection 风险。

企业环境可以通过插件与托管配置统一分发已审查能力。个人项目也不要看到热门 Skill 就直接运行，先读正文和脚本。

## Skill触发不准要怎样排查

触发问题通常落在 description、调用权限和目录位置上，可以先按表现分成两类检查。

### 从来不触发

description 可能只写了功能，没有写触发语境。把“检查 API”改成“用户修改 Controller、DTO、OpenAPI 或询问向后兼容风险时使用”。

### 频繁误触发

description 太宽，或者 Skill 承担了所有代码审查。收窄到公开接口变更，并用 `paths` 限定模块。

### 调用后上下文迅速变大

检查正文是否过长，是否一次读取所有 references，动态命令是否返回全量 diff 或日志。

### 脚本在不同机器失败

把依赖、操作系统和前置命令写清楚。脚本优先复用仓库已有工具，不要假定全局安装了特殊命令。

## 面试时怎样讲出工程深度

只说“Skill 是一个 Markdown 文件”就太简单了。更完整的回答应该覆盖加载、执行和治理：

:::tip 面试回答可以这样组织
Claude Code Skill是一套按需加载的任务能力。启动时主要暴露名称和description，命中后才把SKILL.md正文放进上下文，长参考资料和脚本继续放在Supporting Files中按需使用。Front Matter可以控制工具、调用方、路径、模型和是否在Subagent上下文执行。动态上下文适合只读采集，不应承担有副作用动作。第三方Skill需要审查正文、脚本和权限，因为安装它等于把一套可执行流程交给Agent。
:::

## 参考资料

- [Claude Code 官方文档：Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Claude Code 官方文档：Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Agent Skills开放规范](https://agentskills.io/)
- [Claude Code 官方文档：How Claude remembers your project](https://code.claude.com/docs/en/memory)
