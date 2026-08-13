---
slug: /ai-programming/codex/deepseek-integration
title: "Codex接入DeepSeek的两种方式：官方配置与CC Switch"
sidebar_label: "Codex接入DeepSeek的两种方式：官方配置与CC Switch"
pagination_label: "Codex接入DeepSeek的两种方式：官方配置与CC Switch"
description: "把DeepSeek官方接入Codex的文档整理成可直接照做的步骤，覆盖一键脚本和手动改config.toml两条官方路线，再用CC Switch图形化管理供应商，实现DeepSeek与ChatGPT官方之间一键切换，并说明两种方式的取舍。"
keywords: ["Codex", "DeepSeek", "CC Switch", "Codex接入DeepSeek", "Responses API", "Chat Completions", "model_providers", "config.toml", "AI编程", "供应商切换"]
---

# Codex接入DeepSeek的两种方式：官方配置与CC Switch

Codex 是 OpenAI 推出的 AI 编程助手，跟模型通信走的是 Responses API，DeepSeek API 原生支持这个格式，所以让 Codex 用上 DeepSeek 并不费劲。

Codex 现在有三种客户端形态：Codex CLI、ChatGPT 桌面端、VS Code 里的 Codex 插件（Codex IDE extension）。它们共用同一份配置文件，配一次三个地方都能用。

DeepSeek 官方文档给了两条路线：一键脚本和手动改配置文件。我把官方两条路线都讲清楚，再补一条官方文档没提、但实际很好用的路：用 CC Switch 图形化管理供应商，想在 DeepSeek 和 ChatGPT 官方之间来回切的时候会舒服很多。

两个地址先记下来，后面反复用到：

- 官方文档：[接入 Codex](https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/codex)
- API Key 获取：[DeepSeek Platform 的 API Keys 页面](https://platform.deepseek.com/api_keys)

## 方式一：DeepSeek 官方配置，脚本和手动二选一

### 一键脚本，官方推荐

前提是机器上装好 Codex CLI 或 ChatGPT 桌面端，而且至少运行过一次，保证 `~/.codex` 目录已经存在。

macOS / Linux 在终端执行：

```bash
bash <(curl -fsSL https://cdn.deepseek.com/api-docs/codex-deepseek-setup.sh)
```

Windows 在 PowerShell 执行：

```powershell
irm https://cdn.deepseek.com/api-docs/codex-deepseek-setup-en.ps1 | iex
```

运行后按菜单选模型，脚本里包含 `deepseek-v4-flash` 和 `deepseek-v4-pro` 两个模型。第一次跑会提示输入 API Key（以 `sk-` 开头，去 DeepSeek Platform 的 API Keys 页面拿）。

> **【截图占位】** DeepSeek 官方文档「接入 Codex」页面一键脚本部分，这里放官网截图

脚本背后做了四件事，我列出来，方便小伙伴知道它动了哪些文件：

1. **备份现有配置**：把 `~/.codex/config.toml` 备份到 `~/.codex/backup-deepseek/`，想还原随时可以。
2. **写入模型目录 `~/.codex/models.json`**：向 Codex 声明 DeepSeek 模型的元数据，比如上下文窗口长度、支持的推理强度档位、工具调用格式。有了它，Codex 能像使用内置模型一样使用 DeepSeek 模型。
3. **修改 `~/.codex/config.toml`**：只改必要字段，新增 `[model_providers.deepseek]` 配置段。你原有的 MCP 服务器、项目信任级别这些配置全部保留；如果存在和 DeepSeek 配置冲突的字段，脚本会删掉它们，并逐条打印删除原因。
4. **校验**：写入前先检查 `config.toml` 和 `models.json` 的语法，不合法就直接中止，一个文件都不改。

以后再跑这个脚本，可以在菜单里切换模型，或者选菜单第 3 项恢复到安装前的默认配置。

### 手动编辑配置文件

手动方式分两步，相当于把一键脚本做的事自己再做一遍，适合想弄清楚原理的小伙伴。

第一步，创建模型目录文件 `~/.codex/models.json`，内容与一键脚本写入的一致，声明 `deepseek-v4-flash` 和 `deepseek-v4-pro` 两个模型的元数据。完整内容比较长，直接照官方文档里的 models.json 复制就行。

第二步，编辑 `~/.codex/config.toml`（不存在就新建），写入以下内容。`experimental_bearer_token` 换成你自己的 API Key：

```toml
model = "deepseek-v4-flash"
model_provider = "deepseek"
preferred_auth_method = "apikey"
forced_login_method = "api"
model_reasoning_effort = "high"
model_catalog_json = "~/.codex/models.json"

[model_providers.deepseek]
name = "deepseek"
base_url = "https://api.deepseek.com/"
wire_api = "responses"
experimental_bearer_token = "<你的 DeepSeek API Key>"
```

### config.toml 字段说明

这些字段各管什么，整理成了一张表：

| 字段 | 作用 |
| --- | --- |
| `model` | 默认使用的模型 |
| `model_provider` | 使用的模型提供方，对应下方 `[model_providers.<id>]` 配置段的 id |
| `preferred_auth_method`、`forced_login_method` | 使用 API Key 认证，跳过 ChatGPT 账号登录 |
| `model_reasoning_effort` | 推理强度，值越高模型思考越深入，回答质量越高，耗时也越长 |
| `model_catalog_json` | 自定义模型目录文件（models.json）的路径，Codex 从这里读模型元数据 |
| `[model_providers.deepseek]` 的 `name` | 模型提供方的显示名称 |
| `[model_providers.deepseek]` 的 `base_url` | DeepSeek API 的接口地址 |
| `[model_providers.deepseek]` 的 `wire_api` | 与模型通信使用的协议，`"responses"` 表示走 Responses API |
| `[model_providers.deepseek]` 的 `experimental_bearer_token` | 你的 API Key，明文写在配置文件里 |

:::danger API Key 别提交到仓库

`experimental_bearer_token` 是明文写在 `config.toml` 里的，`~/.codex/auth.json` 也一样敏感。提交代码前看清楚 `git status`，别把这两个文件带进仓库，也别把 Key 贴进聊天记录或截图。

:::

## 方式二：CC Switch 图形化切换

### CC Switch 是干什么的

官方两条路线都是靠改文件，配好以后 DeepSeek 就固定下来了。想切回 ChatGPT 官方订阅，或者同时折腾好几个供应商，就得反复手改 `config.toml`，麻烦，还容易改错。

CC Switch 正好解决这件事。它是一个开源的桌面工具（GitHub 仓库 farion1231/cc-switch，12 万多 star），用 Tauri 2 做的，Windows、macOS、Linux 都有。它把供应商做成一张张卡片，点一下「启用」就完成切换，内置 50 多个供应商预设，DeepSeek 就在里面。除了 Codex，它还能管 Claude Code、Claude Desktop、Gemini CLI、OpenCode、OpenClaw、Hermes 这些工具，一套界面统一管理。

下载只认两个官方渠道：官网 [ccswitch.io](https://ccswitch.io) 和 [GitHub Releases](https://github.com/farion1231/cc-switch/releases)。别的收费下载站都是假的。

### 安装 CC Switch

macOS 用 Homebrew 最省事：

```bash
brew install --cask cc-switch
```

Windows 去 Releases 页面下载 `CC-Switch-v{版本号}-Windows.msi`；macOS 也可以直接下载 DMG。macOS 版本经过 Apple 签名公证，装完直接打开就行。

另外提醒一句：CC Switch 管理的是你机器上的 CLI 工具，所以先把 Codex 装好（`brew install codex` 或 `npm install -g @openai/codex`），再让 CC Switch 接管配置。

### 添加 DeepSeek 供应商

1. 打开 CC Switch，在应用切换器里切到 **Codex** 面板
2. 点右上角的 + 打开添加供应商面板
3. 预设下拉框选 **DeepSeek**，名称和端点会自动填好
4. 填你的 DeepSeek API Key
5. 点「添加」

> **【截图占位】** CC Switch 添加供应商面板选择 DeepSeek 预设的界面，这里放 CC Switch 官网或实际使用截图

首次启动 CC Switch 时，它会把现有 CLI 配置导入成默认供应商，接管之前不会弄丢你原来的配置。

### 「需要本地路由映射」在干什么

这里有个细节值得说清楚。Codex 原生只认 Responses API 这一种协议，而 CC Switch 里的 DeepSeek 预设走的是 Chat Completions 协议，两边对不上。所以选择 DeepSeek 这类预设时，「需要本地路由映射」开关和模型映射表会自动配好，不用手动动。

开启以后，CC Switch 的本地代理会把 Codex 发出的 Responses 请求转成 Chat Completions 再发给 DeepSeek，收到响应（流式 SSE、推理内容、工具调用）再转回 Responses 格式给 Codex。所以有两个前提别漏掉：

- 本地路由服务要保持开启
- Codex 接管（应用接管）要打开

:::info 注意

转换发生在 CC Switch 的本地代理上，使用期间本地路由要保持运行。哪天请求报错说格式不对，先检查这两个开关。

:::

模型映射表也值得看一眼。模型 ID 这一列要填上游真实模型名，比如 `deepseek-v4-flash`；显示名称和上下文窗口可填可不填。这个表会生成 Codex 的 `model_catalog_json`，改完要重启 Codex，`/model` 命令才能列出新模型。这点和官方脚本写 `models.json` 是殊途同归，都是为了把模型名塞进 Codex 的模型目录。

思考能力这块，CC Switch 会按供应商的名称、端点、模型名自动识别 reasoning 接口。DeepSeek 属于支持思考等级的供应商，在 Codex 里调 low / high 推理强度是真正生效的。有些供应商只支持思考开关，调等级没用，这个差异心里有数就行。

### 切换、切回与托盘

在供应商卡片上点「启用」，CC Switch 就把配置写进 `~/.codex/auth.json` 和 `~/.codex/config.toml`。注意 Codex 跟 Claude Code 不一样，没有热切换，切换后要关掉终端重新打开才生效。

:::warning 切完记得重启终端

Codex 切换供应商后必须重启终端，新配置才会加载。发现模型还是旧的，先检查有没有重启。

:::

想切回 ChatGPT 官方，添加「OpenAI 官方」预设并启用，然后按 Codex 的登录流程重新登一次就行。多个供应商来回切的时候，用系统托盘更快：右键托盘图标，进 Codex 子菜单直接点目标供应商。

CC Switch 的设计挺克制，就算卸载了它，Codex 该怎么用还怎么用，不会跟着坏掉。

## 配完怎么确认生效

- **Codex CLI**：进项目目录执行 `codex`，启动信息里显示 `model: deepseek-v4-flash`（或你选的模型）就对了
- **ChatGPT 桌面端**：Mac 上模型选择器显示「自定义」即为生效；Windows 可能显示「自定义」或「DeepSeek-V4-Flash」，显示「自定义」时实际用的就是你选的 DeepSeek 模型
- **VS Code 的 Codex 插件**：跟 Codex CLI 共用一份配置，装好插件直接用

> **【截图占位】** Codex CLI 启动信息显示 model: deepseek-v4-flash，这里放终端截图

## 切换后历史会话不见了？别慌

切到 DeepSeek 后之前的会话记录不见了，是正常现象，会话没有丢。Codex 按登录方式分组存放会话：ChatGPT 官方订阅产生的会话和第三方 API（比如 DeepSeek）产生的会话分属两组，界面只显示与当前配置匹配的那一组。

恢复原配置（官方脚本菜单第 3 项，或 CC Switch 切回 OpenAI 官方）就能重新看到之前的会话，这时 DeepSeek 的会话会被隐藏。切换后记得重启 ChatGPT 客户端。

## 两种方式怎么选

- 只想把 Codex 固定用 DeepSeek，不折腾：官方一键脚本最快，几分钟搞定，还自带备份目录
- 想在 DeepSeek 和 ChatGPT 官方之间来回切，或同时管好几个供应商：CC Switch，图形化切换省心
- 想弄清楚配置文件里每个字段的含义，方便自己排查问题：手动方式走一遍，看完字段说明表就明白了

两种方式最终改的都是同一份 `~/.codex/config.toml`，中间可以混着来，比如先用官方脚本配好 DeepSeek，再用 CC Switch 导入接管。不过混用前建议先备份一次配置文件，出问题也容易找回来。
