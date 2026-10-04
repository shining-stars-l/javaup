---
slug: /ai-programming/claude-code/hooks-automation
title: "Claude Code Hooks如何守住自动化边界"
sidebar_label: "Claude Code Hooks如何守住自动化边界"
pagination_label: "Claude Code Hooks如何守住自动化边界"
description: "从Claude Code生命周期切入，讲清Hooks的事件、matcher、handler、stdin JSON、退出码和结构化输出，并用接口契约检查、生产命令拦截与Stop质量门禁三个新场景演示工程落地。"
keywords: ["Claude Code Hooks", "PreToolUse", "PostToolUse", "Stop Hook", "生命周期钩子", "安全拦截", "自动化工作流"]
---

# Claude Code Hooks如何守住自动化边界

有些要求写进提示词就够了，例如“解释尽量带代码位置”。有些动作漏一次就可能出问题，例如改完 OpenAPI 没跑兼容检查、准备执行生产部署命令、没有验证证据就结束任务。

Claude Code Hooks 把这类动作挂到固定生命周期节点。事件发生并命中条件后，Claude Code 自动运行指定脚本、HTTP 请求、MCP 工具或模型判断。执行时机由运行时控制，不依赖模型在长会话里还记不记得。

## 一个Hook是怎样命中的

以“禁止直接执行生产 Kubernetes 变更”为例，完整判定经过四步：

1. Claude 准备调用 Bash；
2. `PreToolUse` 事件触发；
3. matcher 确认工具名是 Bash；
4. handler 读取 stdin 中的命令，发现生产操作后拒绝。

```text
模型提出工具调用
  ↓
生命周期事件触发
  ↓
matcher筛选事件
  ↓
handler读取事件JSON
  ↓
返回结果或退出码
  ↓
Claude Code合并决策并继续、询问或阻断
```

![Hook事件判定链路图](/img/ai-interview/claudecode/hook-event-decision.png)

## Hooks和自然语言规则怎样分工

| 需求 | 更适合的机制 | 原因 |
| --- | --- | --- |
| 说明项目架构和编码习惯 | `CLAUDE.md` | 需要模型理解并灵活应用 |
| 一套接口审查步骤 | Skill | 特定任务按需加载 |
| 修改契约文件后运行检查 | `PostToolUse` Hook | 时机固定，动作明确 |
| 工具执行前拦生产写操作 | `PreToolUse` Hook或权限规则 | 需要在副作用发生前处理 |
| 主 Agent 结束前检查证据 | `Stop` Hook | 每轮停止前触发 |
| 阻止读取密钥目录 | `permissions.deny` | 客户端强制限制更直接 |

Hooks 很适合自动化卡点，仍不能替代权限和隔离。安全要求能用 deny 规则表达时，优先让权限系统执行；Hook 更适合需要读取事件参数、运行自定义判断的场景。

## 配置放在哪里

常见设置位置有三类：

| 文件 | 范围 | 典型内容 |
| --- | --- | --- |
| `~/.claude/settings.json` | 当前用户所有项目 | 个人通知、通用审计 |
| `.claude/settings.json` | 当前项目，可提交Git | 团队共享的校验和安全规则 |
| `.claude/settings.local.json` | 当前项目，仅本机 | 本地服务地址、个人工具路径 |

插件、托管设置、Skill 和 Subagent Front Matter 也能提供 Hooks。不同来源的 Hook 会合并，同一事件下的匹配 handler 可能同时运行。

项目级 Hook 来自仓库内容，首次使用要关注工作区信任。脚本拥有当前进程可以访问的文件和环境，Review 强度应该和构建脚本、CI 脚本一样。

## 一个最小配置有三层

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/check-api-contract.sh",
            "args": []
          }
        ]
      }
    ]
  }
}
```

- `PostToolUse` 是生命周期事件；
- `matcher` 只选择 Edit 和 Write；
- 内层 `hooks` 是执行动作的 handler。

设置了 `args` 后，Claude Code 使用 exec form 直接启动命令，不让 Shell 再拆分路径。脚本路径含空格或特殊字符时更稳。需要管道、重定向和 `&&` 等 Shell 能力时，才使用不带 `args` 的 shell form。

## matcher怎样写才不会误伤

当前官方规则可以概括成三类：

- `"*"`、空字符串或省略：匹配该事件的所有发生；
- 只含普通名称字符时：按精确名称或 `|`、`,` 分隔列表匹配；
- 包含正则特殊字符时：作为 JavaScript 正则表达式匹配。

工具事件通常按 `tool_name` 匹配：

```json
"matcher": "Bash"
```

```json
"matcher": "Edit|Write"
```

```json
"matcher": "mcp__observability__.*"
```

matcher 要尽量收窄。每次工具调用都触发一个耗时脚本，会让 Agent Loop 明显变慢。

某些事件不支持 matcher，例如 `Stop`、`TaskCreated` 和 `TaskCompleted` 会在每次对应事件上触发。配置前要查当前 Hook Reference，不能默认所有事件都能用同一套筛选方式。

## 五类Handler要怎么选择

| 类型 | 工作方式 | 适合场景 |
| --- | --- | --- |
| `command` | 执行本机命令或脚本 | 校验、格式化、日志、安全判断 |
| `http` | 把事件JSON POST到服务端 | 集中审计、远程策略、通知服务 |
| `mcp_tool` | 调用已连接MCP Server的工具 | 复用现有平台能力 |
| `prompt` | 让模型做一次单轮判断 | 输入已经足够的语义检查 |
| `agent` | 启动可读文件和搜索的Subagent判断 | 需要多步验证的质量门禁 |

规则能够写成确定脚本时，`command` 最容易测试和审计。`prompt` 与 `agent` 会使用模型，存在额外 Token、延迟和判断波动；`agent` Handler 当前仍属于实验能力。

HTTP Hook 的非 2xx、连接失败和超时属于非阻断错误，流程会继续。需要拒绝工具调用时，服务端应返回 2xx，并在 JSON Body 中给出合法的 deny 决策。

## Hook拿到什么输入

Command Hook 从 stdin 读取 JSON，HTTP Hook 从 POST Body 读取同一类数据。常见公共字段包括：

| 字段 | 含义 |
| --- | --- |
| `session_id` | 当前会话标识 |
| `transcript_path` | 会话记录路径，写入可能略有延迟 |
| `cwd` | Hook触发时的工作目录 |
| `permission_mode` | 当前权限模式 |
| `hook_event_name` | 事件名称 |
| `tool_name` | 工具事件中的工具名 |
| `tool_input` | 工具参数 |

准备执行模块测试时，`PreToolUse` 可能收到：

```json
{
  "session_id": "session-123",
  "cwd": "/workspace/mall-service",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "./mvnw -pl billing-service test"
  }
}
```

脚本应该用 JSON 解析器读取字段，别用字符串切割硬猜格式：

```bash
#!/usr/bin/env bash
set -euo pipefail

input="$(cat)"
tool_name="$(jq -r '.tool_name // empty' <<<"$input")"
command="$(jq -r '.tool_input.command // empty' <<<"$input")"
```

## 退出码和stdout怎样影响流程

退出码会直接决定 Hook 报告成功、阻断流程还是只记录一条非阻断错误。

### `exit 0`

表示 Hook 自身执行成功。Claude Code 会尝试解析 stdout 中的结构化 JSON。需要返回 JSON 时，stdout 只能放一个 JSON 对象；调试信息写到日志文件。

### `exit 2`

表示阻断错误。Claude Code 忽略 stdout，把 stderr 作为错误原因。具体效果取决于事件：

- `PreToolUse`：阻止工具执行；
- `PermissionRequest`：拒绝权限；
- `UserPromptSubmit`：拒绝本次Prompt处理；
- `Stop`：阻止停止，让会话继续；
- `PreCompact`：阻止压缩；
- `PostToolUse`：工具已经成功执行，只能把反馈交给 Claude，无法撤销副作用。

### 其他非零退出码

对大多数事件属于非阻断错误，流程继续。Unix 脚本常用的 `exit 1` 在这里通常拦不住工具调用。策略型 Hook 要明确使用 `exit 2` 或 `exit 0` 加合法 JSON。

![Hook输入输出与退出码判定图](/img/ai-interview/claudecode/hook-exit-codes.png)

## 常用生命周期事件怎样选择

| 事件 | 触发点 | 常见用途 |
| --- | --- | --- |
| `SessionStart` | 会话启动或恢复 | 注入环境、加载动态上下文 |
| `UserPromptSubmit` | 用户消息交给Claude之前 | 审计Prompt、补上下文 |
| `PreToolUse` | 工具执行之前 | 风险拦截、参数检查 |
| `PermissionRequest` | 需要权限判断时 | 审计、窄范围批准或拒绝 |
| `PostToolUse` | 工具成功以后 | 校验、格式化、记录 |
| `PostToolUseFailure` | 工具失败以后 | 错误归档、补充诊断 |
| `PostToolBatch` | 一批并行工具调用结束后 | 聚合检查、阻止下一轮模型调用 |
| `Notification` | Claude Code发出通知时 | 桌面提醒、消息推送 |
| `Stop` | Claude准备结束本轮时 | 完成条件与证据门禁 |
| `PreCompact` / `PostCompact` | 压缩前后 | 备份状态、审计压缩 |
| `SubagentStart` / `SubagentStop` | 子代理开始和结束 | 注入角色上下文、验证结果 |
| `TaskCreated` / `TaskCompleted` | 任务创建和完成 | 任务命名、完成证据检查 |

`PreToolUse`、`PostToolUse` 和 `PermissionRequest` 经常混淆。判断方法很简单：是否需要在执行前拦截，是否只做执行后收尾，还是权限弹窗出现时才介入。

![Claude Code Hooks生命周期地图](/img/ai-interview/claudecode/hooks-lifecycle.png)

## 示例一：修改OpenAPI后自动跑兼容检查

这个 Hook 发生在文件修改成功以后。它只检查契约文件，普通 Java 改动不会触发实际校验。

`.claude/hooks/check-api-contract.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

input="$(cat)"
file="$(jq -r '.tool_input.file_path // empty' <<<"$input")"

case "$file" in
  */openapi.yaml|*/openapi.yml)
    if ! ./scripts/check-openapi-compat.sh "$file"; then
      echo "OpenAPI兼容检查失败，请先处理报告中的破坏性变更。" >&2
      exit 2
    fi
    ;;
esac

exit 0
```

配置：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/check-api-contract.sh",
            "args": []
          }
        ]
      }
    ]
  }
}
```

脚本失败时使用 `exit 2`，Claude 能看到 stderr 并继续修正。文件修改已经发生，Hook 不能回滚。需要禁止契约修改的场景应该在 `PreToolUse` 或权限层处理。

## 示例二：拦截生产Kubernetes命令

`.claude/hooks/block-production-command.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

input="$(cat)"
tool_name="$(jq -r '.tool_name // empty' <<<"$input")"
command="$(jq -r '.tool_input.command // empty' <<<"$input")"

if [[ "$tool_name" != "Bash" ]]; then
  exit 0
fi

if [[ "$command" == *"--context=prod"* ]] || \
   [[ "$command" == *"--namespace=production"* ]] || \
   { [[ "$command" == *"helm upgrade"* ]] && [[ "$command" == *"production"* ]]; }; then
  echo "已阻止生产集群变更。请走发布平台并等待人工审批。" >&2
  exit 2
fi

exit 0
```

配置到 `PreToolUse`：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-production-command.sh",
            "args": []
          }
        ]
      }
    ]
  }
}
```

示例展示的是执行前拦截。真实生产安全不能只依赖关键词黑名单，还要配合独立凭据、网络边界、集群RBAC、发布审批与审计。

## 示例三：结束前检查是否有验证证据

`Stop` Hook 可以让模型检查本轮是否提供了测试或验证结果。语义判断较复杂时，可以使用 Prompt Handler：

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "检查本轮是否修改了代码。如果修改过，是否给出了实际验证命令及结果；若缺少证据，返回阻止停止的决定，并明确还要补什么。事件输入：$ARGUMENTS"
          }
        ]
      }
    ]
  }
}
```

Stop 只是“本轮准备结束”，并不自动等于完整任务已经完成。质量门禁还要防止循环：如果 Hook 一直要求继续，Claude 可能反复补充却无法满足模糊条件。Prompt 要写出可检查的完成标准，并设置合理超时。

## 多个Hook命中时不要依赖执行顺序

匹配到的 Hooks 会并行运行。一个安全 Hook 拒绝工具调用，旁边的日志 Hook 仍可能执行；多个 Hook 同时修改工具输入，最后结果还可能与完成顺序有关。

因此：

- 会写文件、发请求的 Hook 自己判断是否该执行；
- 不假设另一个 Hook 会先拒绝；
- 不让多个 Hook 修改同一个输入字段；
- Handler 尽量保持幂等；
- 日志带上 session、事件和工具标识，方便排查。

## 怎样调试一个没有生效的Hook

1. 运行 `/hooks`，确认事件、matcher、handler和来源；
2. 检查 JSON 文件位置和语法；
3. 用保存的事件 JSON 手工执行脚本；
4. 检查脚本是否可执行，依赖是否在 `PATH`；
5. 把调试输出写日志，避免污染 stdout JSON；
6. 确认事件是否真的发生，例如非交互模式未必出现权限弹窗；
7. 检查返回码，策略阻断不要误用 `exit 1`；
8. HTTP Hook 需要返回 2xx 加合法决策，单独返回 403 只会被当成非阻断错误。

![ClaudeCode的Context命令](/img/ai-interview/claudecode/ClaudeCode的hooks命令.png)

## 面试回答要怎样落到工程边界上

:::tip 面试回答可以这样组织
Claude Code Hooks是在生命周期节点自动执行的扩展机制。事件触发后先经过matcher，再把JSON输入交给command、http、mcp_tool、prompt或agent handler。`PreToolUse`适合副作用前拦截，`PostToolUse`适合执行后校验，`Stop`适合完成证据门禁。Command Hook通常用`exit 0`配合结构化stdout，或用`exit 2`加stderr阻断；`exit 1`对大多数事件只算非阻断错误。多个匹配Hook会并行运行，所以脚本要幂等，不能依赖执行顺序。高风险边界仍要结合权限、Sandbox、基础设施权限和CI。
:::

## 参考资料

- [Claude Code 官方文档：Hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code 官方文档：Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide)
- [Claude Code 官方文档：Permissions](https://code.claude.com/docs/en/permissions)
- [Claude Code 官方文档：Extend Claude with skills](https://code.claude.com/docs/en/skills)
