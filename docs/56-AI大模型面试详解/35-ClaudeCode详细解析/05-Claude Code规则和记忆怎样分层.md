---
slug: /ai-interview/claude-code/rules-and-memory
title: "Claude Code规则和记忆怎样分层"
sidebar_label: "Claude Code规则和记忆怎样分层"
pagination_label: "Claude Code规则和记忆怎样分层"
description: "从跨会话知识治理出发，讲清CLAUDE.md、CLAUDE.local.md、.claude/rules、Auto Memory、Subagent Memory和任务状态文件分别保存什么、怎样加载、如何审查与清理。"
keywords: ["Claude Code记忆", "CLAUDE.md", "Auto Memory", "MEMORY.md", ".claude/rules", "Subagent Memory", "跨会话记忆"]
---

# Claude Code规则和记忆怎样分层

新开一个 Claude Code 会话，它仍然知道项目使用 Maven Wrapper，知道消息消费者测试要启动 Testcontainers，也知道你上次纠正过“金额比较必须使用币种精度”。看起来像模型记住了历史，实际起作用的是应用层保存和重新加载的文件。

LLM 每次调用只处理本轮输入。跨会话知识要先写到模型外部，再由 Claude Code 在新会话启动或任务相关时读回来。

项目规则、Agent 工作经验、当前任务断点和可复用流程经常被混称为“记忆”。它们的生命周期不同，应该放在不同位置。

## 先按信息用途做选择

| 信息 | 建议位置 | 原因 |
| --- | --- | --- |
| 每次会话都要遵守的项目约定 | `CLAUDE.md` | 启动时就需要 |
| 个人在所有项目里的通用偏好 | `~/.claude/CLAUDE.md` | 只属于当前用户 |
| 当前项目的个人配置 | `CLAUDE.local.md` | 不适合提交给团队 |
| 只影响某类文件的规则 | `.claude/rules/` + `paths` | 命中文件时再加载 |
| Claude 工作中发现的可复用经验 | Auto Memory | 允许跨会话积累 |
| 某个专用Subagent的经验 | Subagent Memory | 和角色绑定，范围更窄 |
| 当前任务进度、失败用例、下一步 | Plan、Issue、Handoff | 生命周期只覆盖当前任务 |
| 多步骤操作流程 | Skill | 任务相关时按需加载 |
| 必须强制执行的安全限制 | 权限、Hook、Sandbox、CI | Markdown 规则无法保证执行 |

这个表能解决大部分选型问题。信息放错位置会产生两种后果：高频加载的文件越来越胖，或者应该持久化的状态只留在聊天里。

![Claude Code知识分层图](/img/ai-interview/claudecode/rules-memory-layers.png)

## `CLAUDE.md`保存团队明确写下的规则

`CLAUDE.md` 适合放代码里不容易直接推断、每次会话又需要知道的内容，例如：

- 项目的构建、测试和格式化命令；
- 特定目录的职责与禁改范围；
- 接口返回、异常、日志和事务约定；
- 团队已经确认的架构取舍；
- Claude 曾经重复犯过的项目特有错误。

我会用一个问题判断某条内容是否值得留下：删掉以后，Claude 下次是不是很容易再次做错？答案明确为“会”，这条规则才有常驻价值。

下面是一段更容易执行的项目规则：

```markdown
## 验证要求

- 修改 `billing-service` 后，运行：
  `./mvnw -pl billing-service -am test`。
- 汇报时写出实际命令和失败数量，不能只说“测试已通过”。

## 迁移文件

- `db/migration` 中已经发布的版本禁止修改。
- 新增迁移文件使用 `VyyyyMMddHHmm__description.sql`。
- 涉及索引和锁表风险时，先给出执行影响，再等待确认。
```

“保持测试完整”“注意数据库风险”太宽，模型很难判断做到什么程度。明确目录、命令和等待条件后，执行与验收都会更稳定。

### `CLAUDE.md`有哪些作用范围

官方当前文档给出的常用层级如下：

| 范围 | 位置 | 适合内容 |
| --- | --- | --- |
| 组织级 | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md` 等托管位置 | 统一安全、合规与组织规范 |
| 用户级 | `~/.claude/CLAUDE.md` | 个人跨项目偏好 |
| 项目级 | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` | 团队共享的项目规则 |
| 本地级 | `./CLAUDE.local.md` | 当前项目的个人设置 |
| 子目录级 | 子目录中的 `CLAUDE.md` 和 `CLAUDE.local.md` | 模块局部规则 |

Claude Code 会把启动路径上发现的规则拼接进上下文，范围较大的内容先进入，离当前工作目录更近的内容后进入。子目录规则不会在启动时全部加载，Claude 读取对应目录文件时才会补进来。

这些文件属于上下文指令，覆盖关系没有 CSS 级联规则那么确定。内容冲突时，模型仍可能选错。团队要定期检查重复和冲突，不能依赖“后加载一定覆盖前面”。

![ClaudeCode的Context命令](/img/ai-interview/claudecode/ClaudeCode的Context命令.png)

### 文件越长，规则越容易被稀释

官方建议每份 `CLAUDE.md` 目标控制在 200 行以内。超长文件会增加固定上下文，也会降低规则遵守稳定性。

内容开始膨胀时，可以这样处理：

- 代码里能直接读出的目录结构和依赖列表删掉；
- 只影响某类文件的内容移到 path-scoped Rules；
- 多步骤操作移到 Skill；
- 背景资料放正式文档，在规则里只留入口；
- 过期约定直接删除，不保留历史陈列。

`@path/to/file` 引用能改善维护结构，但被引用内容仍会在启动时展开进上下文。它不会减少 Token。

## `.claude/rules/`处理局部规则

假设仓库同时有 Java 服务、前端页面和 Terraform。前端可访问性规则只在修改 `*.tsx` 时有用，后端任务没必要每轮携带。

可以创建 `.claude/rules/frontend-accessibility.md`：

```markdown
---
paths:
  - "web/src/**/*.{ts,tsx}"
  - "web/tests/**/*.spec.ts"
---

# 前端可访问性规则

- 可点击元素必须支持键盘操作。
- 表单错误信息要通过 `aria-describedby` 关联到输入框。
- 新增弹窗优先复用项目已有的 `AccessibleDialog`。
```

带 `paths` 的规则在 Claude 处理匹配文件时加载。它解决了“规则长期有效，但只在局部任务里需要”的问题。

没有 `paths` 的 Rules 会像项目规则一样在启动时加载。Rules 拆成多个文件只是提高维护性，是否节省上下文取决于有没有设置路径范围。

## Auto Memory记录Claude工作中学到的经验

Auto Memory 由 Claude 在工作过程中维护。适合记录构建命令、调试经验、代码风格偏好和反复出现的项目模式。

它默认按 Git 仓库建立目录：

```text
~/.claude/projects/<project>/memory/
├── MEMORY.md
├── build-and-test.md
├── debugging.md
└── api-conventions.md
```

同一仓库的不同 Worktree 和子目录共享这份 Auto Memory。默认存储是机器本地的，不会自动同步到其他电脑或云环境。

会话启动时，Claude Code 只加载 `MEMORY.md` 的前 200 行或前 25KB，哪个先到就停止。Topic files 不会全量启动加载，需要时再读取。因此 `MEMORY.md` 更适合作为短索引，详细背景放到单独文件。

```markdown
# Memory Index

- [本地集成测试](build-and-test.md)：账单集成测试需要Docker和本地Redis。
- [消息幂等排查](debugging.md)：重复入账先查eventId唯一索引和消费重试记录。
- [金额接口约定](api-conventions.md)：对外金额使用字符串加币种，禁止传浮点数。
```

![ClaudeCode的Context命令](/img/ai-interview/claudecode/ClaudeCode的Memory命令.png)

## 哪些经验值得写入长期记忆

我会先问四个问题：

1. 下次做同类任务会用到吗？
2. 这条信息在源码和正式文档里能直接查到吗？
3. 它是用户确认的事实，还是 Agent 自己的猜测？
4. 过期后怎样被发现？

适合留下的例子：

- 某个集成测试必须依赖本地模拟服务，README 没有写；
- 用户明确要求所有性能报告同时给出 P95 和 P99；
- 某类消息重复消费曾由错误重试配置引起，排查入口固定；
- 一个架构决定背后的理由无法从当前代码推断。

不适合留下的例子：

- 某个类现在有 328 行；
- 本轮测试打印的完整错误栈；
- 当前分支修改了哪些文件；
- Git 历史里已经记录的提交；
- Agent 根据一次对话猜出的用户偏好；
- “下周前不要改结算模块”这种没有绝对日期的临时话。

短期任务信息写入长期记忆，会在后续会话里持续制造噪声。当前断点应该进入任务文件或 handoff。

## 一条可维护的Memory应该怎样写

只写“消费者必须手动提交Offset”会让 Agent 机械执行。更有用的记录需要事实、原因、适用范围和复核提示。

```markdown
---
modified: 2026-08-06T10:30:00+08:00
---

# 对账消息的Offset提交方式

结算对账消费者使用手动提交Offset，处理成功并写入对账流水后再提交。

原因：2026-07-18出现过一次重平衡，自动提交导致失败消息没有重新消费。

适用范围：只针对`settlement-reconcile`消费组。通知类消费者仍沿用项目默认配置。

使用前核对：检查当前消费者配置和运维手册，确认消费组没有迁移到新的重试框架。
```

当前官方文档说明，从 Claude Code v2.1.214 起，带 YAML front matter 的 Memory 文件在 Claude 写入时会记录 `modified` 时间。时间戳能帮助判断新旧，仍不能证明内容当前有效。

## 读取旧Memory以后要先核对

Memory 提供的是历史线索。文件路径、模块位置、版本参数和上线窗口都会变化。

假设记录写着“价格同步任务在 `pricing-job`”。新会话应先搜索当前仓库，确认类与模块仍存在，再开始修改。更稳的信任顺序是：

```text
本轮用户明确指令
  > 当前工作区与正式文档
  > 已验证的历史决策记录
  > 旧Memory中的路径和实现细节
```

用户长期偏好可以优先采用，仍要服从本轮新要求。项目冻结日期和临时边界必须看绝对时间，过期就更新或删除。

## Subagent Memory解决角色经验

专用 Subagent 可以配置自己的 Memory。官方当前支持 `user`、`project`、`local` 三种范围：

```text
~/.claude/agent-memory/<agent-name>/
.claude/agent-memory/<agent-name>/
.claude/agent-memory-local/<agent-name>/
```

例如一个长期负责 API 兼容审查的 Subagent，可以沉淀这个仓库常见的破坏性变更、版本策略和历史例外。下次审查时，它能从角色经验开始，而不需要主会话携带所有历史。

Subagent Memory 与主会话 Auto Memory 是不同目录。Agent Teams 的 shared task list 和 mailbox 解决本次协作，不等同于共享长期记忆。

![主会话Memory与Subagent Memory边界图](/img/ai-interview/claudecode/memory-boundaries.png)

## 什么时候才需要数据库和向量检索

几十条经验用 Markdown 索引通常已经够用。它容易审查、删除和版本管理，也没有额外服务。

下面这些需求出现后，再考虑 SQLite、全文检索、BM25 或向量库：

- 要保存和回查大量会话过程；
- 多台机器和多种 Agent 需要共享历史；
- 记忆规模已经无法靠短索引定位；
- 需要权限隔离、审计、保留周期和集中清理；
- 查询大量工单、Wiki 和运行记录，关键词检索不够。

系统一旦引入向量库，还要处理切片、Embedding、混合检索、过期删除、访问控制和错误召回。记忆数量很少时，这些成本往往大于收益。

## 建一套轻量记忆治理流程

团队可以从四步开始：

1. **写入前筛选**：确认长期价值、来源和适用范围；
2. **读取后核对**：路径、版本和状态回到当前仓库验证；
3. **定期清理**：删除过期条目，合并重复主题；
4. **保留审计**：项目共享规则与Memory通过 Git Review。

每个月增加几十条记忆，却从不删除，系统迟早会拿旧前提指导新任务。Memory 的质量取决于淘汰机制，记录数量并不能代表效果。

:::tip 面试回答可以这样组织
Claude Code的跨会话记忆由外部文件和加载规则完成。`CLAUDE.md`保存人写的稳定指令，带`paths`的Rules保存局部规则，Auto Memory保存Claude工作中积累的经验，当前任务断点放Plan或Handoff。会话启动只加载`MEMORY.md`前200行或25KB，详细Topic files按需读取。旧Memory只能作为线索，实施前还要回到当前代码和文档核对。必须强制执行的限制要交给权限、Hook、Sandbox或CI。
:::

## 参考资料

- [Claude Code 官方文档：How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Claude Code 官方文档：Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code 官方文档：Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Claude Code 官方文档：Hooks reference](https://code.claude.com/docs/en/hooks)
