---
slug: /ai-programming/claude-code/claude-code-install-and-usage
title: "ClaudeCode保姆级超详细安装和使用"
sidebar_label: "ClaudeCode保姆级超详细安装和使用"
pagination_label: "ClaudeCode保姆级超详细安装和使用"
description: "从环境检查、Git与Node.js准备，到Claude Code原生安装、账号与兼容API配置、CC Switch，再到第一次完整交付、权限控制、排错与卸载，带你把Claude Code真正用起来。"
keywords: ["Claude Code", "Claude Code安装", "Claude Code教程", "CC Switch", "Anthropic API", "AI编程"]
---

# ClaudeCode保姆级超详细安装和使用

第一次接触 Claude Code，小伙伴通常会卡在三个地方：终端里该输入哪条命令、登录方式和 API 有什么区别、装好后怎样确认它真的在正确的项目里工作。软件本身不难，难点在于把环境、权限、模型入口和项目现场接起来。

这篇文章按一次真实上手的顺序来写。我会从空白电脑开始，完成环境检查、Claude Code 安装、官方账号和兼容 API 两条认证路线、CC Switch 配置，最后用一个“社区活动物资预约看板”跑完调查、实现、测试和 Git 审核。Windows 和 macOS 我都会写，命令尽量给出可以直接复制的版本。

:::info 先看完成标准
读完后，你至少应该能做到：

- 在 Windows 或 macOS 终端里执行 `claude --version` 和 `claude doctor`；
- 说清楚 Git、Node.js、Claude Code、CC Switch 各自负责什么；
- 根据隐私和计费需求选择官方账号或兼容 API；
- 在一个明确的项目目录里，让 Claude 先调查，再按验收条件修改代码；
- 使用 git status、git diff 和测试结果检查每一次改动；
- 遇到命令找不到、登录循环、401、429、模型名错误时，按层次定位原因。
:::

:::warning 版本和服务说明
Claude Code、Node.js 以及第三方模型服务都在持续更新。本文使用官方当前文档里的安装路线，但不锁定某个小版本号，也不承诺任何第三方服务的免费额度、可用地区或长期稳定性。下载时优先看产品官网，页面名称变化时找同名入口即可。
:::

## 先来决定选择哪种方式

### Claude Code 由哪些部分组成

可以把整套工具看成四个各司其职的部分：

| 部分 | 作用 | 是否必须 | 常见误解 |
| --- | --- | --- | --- |
| Git | 记录文件变化、创建分支、回退和协作 | 强烈建议 | 以为 Claude Code 会替你保存所有历史 |
| Node.js | 运行 JavaScript 工具，也可用于 npm 安装路线 | 原生安装路线可选，npm 路线需要 | 以为装了 Node 就等于装好了 Claude Code |
| Claude Code | 读取项目、调用模型、执行工具、修改文件 | 必须 | 以为它只是一个聊天窗口 |
| CC Switch | 管理兼容 API 的供应商和环境切换 | 第三方路线需要 | 以为它本身提供模型或额度 |

Claude Code 的核心是 CLI。它会在当前项目目录里读取文件、调用模型和执行工具，所以启动前先确认终端所在目录。

### 官方账号和兼容 API 怎么选

我建议如果有官方账号的话，先用官方账号登录，确认项目目录、权限和基本对话都正常，再考虑切换供应商。这样排错时少一个变量。

| 路线 | 需要准备 | 优点 | 需要留意 |
| --- | --- | --- | --- |
| Anthropic 官方账号 | Claude Pro、Max、Team、Enterprise 或 Console 等可用账号 | 官方文档最完整，登录和模型映射更直接 | 套餐、地区和用量限制以账号页面为准 |
| 兼容 API | 第三方平台账号、API Key、Base URL、模型标识 | 可以统一管理多个供应商，按平台规则计费 | 提示词和代码会经过第三方，稳定性、隐私和计费要自己确认 |
| 企业云供应商 | Amazon Bedrock、Google Cloud、Microsoft Foundry 等配置 | 适合组织已有云账单和访问控制的环境 | 需要云端权限、区域和网络配置 |

所谓“跳过 Claude 账号”，实际是让 Claude Code 直接使用环境变量或兼容网关。认证没有消失，只是从浏览器账号登录换成了 Key 或企业网关。把这个区别弄清楚，后面遇到登录提示就不会反复重装。

## 开始安装前的环境准备

### 系统和硬件要求

官方当前支持的主要平台包括：macOS 13 及以上；Windows 10 1809 及以上或 Windows Server 2019 及以上；Ubuntu 20.04、Debian 10 及以上，以及官方列出的其他 Linux 发行版；x64 或 ARM64 处理器、至少 4 GB 内存；可以访问所选模型服务的网络；Bash、Zsh、PowerShell 或 CMD 其中一种 Shell。

公司代理、校园网、VPN 或安全软件可能只拦截部分域名。能打开普通网页，不代表 claude.ai 和模型供应商域名都能通。

### Windows 检查命令

打开 PowerShell：

~~~powershell
$PSVersionTable.PSVersion
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsArchitecture
where.exe git
where.exe node
~~~

`where.exe` 没有输出，通常表示命令还没安装或安装目录没有进 PATH。装好后要重新打开终端再检查。

如果准备使用 Git Bash，也可以执行：

~~~bash
uname -a
git --version
~~~

### macOS 检查命令

~~~bash
sw_vers
uname -m
command -v git || true
command -v node || true
echo "$SHELL"
~~~

arm64 通常表示 Apple 芯片，x86_64 通常表示 Intel 芯片。下载 Homebrew 或其他工具时按这个架构选择。

### 准备一个干净的练习项目

第一次别直接在真实业务仓库里直接就用。先新建一个目录，既能练习，也方便随时删除。

Windows PowerShell：

~~~powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\claude-playground\event-supply-board" -Force
Set-Location "$env:USERPROFILE\claude-playground\event-supply-board"
git init
~~~

macOS 或 Linux：

~~~bash
mkdir -p ~/claude-playground/event-supply-board
cd ~/claude-playground/event-supply-board
git init
~~~

这个练习项目模拟社区活动的物资预约：管理员录入物资，志愿者预约数量，系统显示剩余库存并拒绝超量预约。它足够小，方便观察 Claude 怎样调查目录、拆需求、写代码和运行验证。

### 接入已有项目前要先记录

进入项目后先执行下面两条命令：

~~~bash
git status --short
git branch --show-current
~~~

再按项目实际情况运行一条基本命令，例如 npm install、npm test 或 Java 项目的 ./mvnw test。先跑基线，是为了区分项目原本的问题和这次改动引入的问题。如果仓库里已经有未提交文件，记录下来并告诉 Claude 保留它们。

## 先把环境前提装好：Git 和 Node.js

### Git：给每次改动留档

Claude Code 可以执行 Git 命令，但它不会替你决定哪些改动应该提交。Git 是后续检查和回退的底线。

### Windows 安装 Git

1. 打开 [Git for Windows 官方下载页](https://git-scm.com/download/win)。
2. 下载与你的系统架构匹配的安装包，通常是 64 位版本。
3. 双击安装包，路径、默认编辑器等选项第一次可以保持默认。
4. 完成后关闭旧的 PowerShell 和 CMD，再重新打开。
5. 执行 `git --version`。看到版本号就说明命令已经进入 PATH。任意文件夹右键出现“Open Git Bash here”也能说明 Git Bash 已安装。

### macOS 安装 Git

先执行 `git --version`。如果系统弹出安装 Command Line Tools 的提示，按提示完成即可。已经使用 Homebrew 的小伙伴可以执行：

~~~bash
brew update
brew install git
git --version
~~~

如果提示 brew: command not found，先从 [Homebrew 官方网站](https://brew.sh/) 获取当前安装命令。安装脚本会根据芯片架构给出 PATH 配置提示。

<img src="/img/ai-programming/claudecode/git下载页面.png" alt="git下载页面" width="100%" />

<img src="/img/ai-programming/claudecode/git命令.png" alt="git命令" width="50%" />

### Node.js：按安装路线决定是否需要

官方原生安装方式已经自带 Claude Code 运行所需的二进制。Node.js 主要用于 npm 安装、升级，或你的项目本身需要 Node.js。

### Windows 安装 Node.js

1. 打开 [Node.js 官方下载页](https://nodejs.org/en/download)。
2. 选择当前 LTS 版本。
3. 下载 Windows Installer（.msi），按向导完成。
4. Tools for Native Modules 会额外安装 Python 和 Visual Studio Build Tools，只有项目明确需要原生模块编译时才勾选。
5. 关闭旧终端，重新打开 PowerShell，执行 `node --version` 和 `npm --version`。

### macOS 安装 Node.js

~~~bash
brew install node
node --version
npm --version
~~~

如果需要在多个项目间切换 Node.js 大版本，再使用版本管理工具。第一次安装不必同时维护多个版本。

:::warning 不要用 sudo npm install -g
npm 全局目录权限有问题时，优先修正 Node.js 安装方式或 npm prefix。整段命令加 sudo 会让一部分文件属于 root，后续升级和卸载容易出现权限冲突。
:::

<img src="/img/ai-programming/claudecode/nodejs下载页面.png" alt="nodejs下载页面" width="100%" />

## 安装 Claude Code：优先原生安装

官方下载地址：[https://code.claude.com/docs/en/setup](https://code.claude.com/docs/en/setup)

### macOS、Linux 和 WSL

~~~bash
curl -fsSL https://claude.ai/install.sh | bash
~~~

安装结束后关闭当前终端并重新打开，进入项目执行 `claude --version`。

### Windows PowerShell

~~~powershell
irm https://claude.ai/install.ps1 | iex
~~~

完成后关闭 PowerShell，再开一个新窗口执行 `claude --version`。不要求以管理员身份运行。

### Windows CMD

如果提示符类似 C:\\Users\\你的用户名>，没有前面的 PS，就是 CMD：

~~~bat
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
~~~

PowerShell 和 CMD 的命令不能混用。PowerShell 报 && 无效，或者 CMD 报 irm 找不到，通常就是终端类型弄错了。

Git for Windows 在原生 Windows 上不是安装硬性前提。装好后 Claude Code 可以使用 Git Bash 相关能力；没有 Git for Windows 时，会使用 PowerShell 工具执行 Shell 命令。

<img src="/img/ai-programming/claudecode/claudecode下载地址.png" alt="claudecode下载地址" width="100%" />

### npm 备用安装路线

团队统一通过 npm 管理工具时，可以使用：

~~~bash
npm install -g @anthropic-ai/claude-code
claude --version
~~~

当前 npm 包要求 Node.js 22 或更高版本。更新 npm 安装时使用 npm install -g @anthropic-ai/claude-code@latest。不要用 npm update -g 代替，它会遵循原先的 semver 范围，可能不会移动到最新版本。

### 安装后做两项检查

~~~bash
claude --version
claude doctor
~~~

`claude doctor` 是只读诊断，会报告安装状态、配置文件格式错误和更新检查结果。它不等于登录测试，所以后面仍要启动一次会话。

<img src="/img/ai-programming/claudecode/claudecode命令.png" alt="claudecode命令" width="100%" />

## 第一次登录：官方账号路线

进入练习项目后启动 claude。首次启动通常会打开浏览器，按页面完成登录和授权，再回到终端。官方文档列出的可用账号类型包括 Claude Pro、Max、Team、Enterprise、Claude Console，以及部分企业云供应商。免费 Claude.ai 账号是否包含 Claude Code，要以当前套餐说明为准。

在会话里可用 /login 重新登录或切换账号，用 /exit 退出。

登录成功后先发一个只读问题：

~~~text
请只检查当前目录，不要修改文件。告诉我当前项目路径、Git状态、可见文件以及你认为的下一步风险。
~~~

如果返回了与练习项目无关的路径，先退出，回到正确目录再启动。路径错了，后面的权限和模型再正确也没有意义。

:::info 截图提示：浏览器授权与首次会话
这里建议补两张截图：浏览器授权完成页、终端里显示当前模型和工作目录的 Claude Code 会话页。授权截图不要包含邮箱、组织名和登录令牌。
:::

## 第二次登录：兼容 API 和 CC Switch

### 先弄清请求链路

第三方路线大致是：Claude Code → CC Switch 或环境变量 → 兼容网关 → 模型供应商 → 返回结果。CC Switch 负责切换配置，模型请求和计费仍由供应商处理。

<img src="/img/ai-programming/claudecode/claudecode-api-provider-chain.png" alt="Claude Code 通过 CC Switch 或环境变量连接兼容 API 网关与模型供应商的请求链路图" width="100%" />

### 获取供应商配置

通常需要四项信息：API Key、Base URL、精确的模型标识、计费与数据保留规则。模型名多一个后缀、Base URL 多一层 /v1 或少一层路径，都可能导致 404。

:::warning 第三方Key的隐私边界
提示词、代码片段、工具调用和错误日志可能经过第三方平台。公司私有代码、客户数据、生产密钥和个人隐私不要直接贴进去，先看服务条款和组织规定。免费、低价或不限量政策都可能调整，使用前以当前控制台为准。
:::

### 安装 CC Switch

从 [CC Switch 官方项目或发布页](https://github.com/farion1231/cc-switch/releases) 获取当前版本，按操作系统下载安装包。不要从不明网盘下载修改版。

Windows 按安装向导完成；macOS 可能需要把应用拖进“应用程序”，首次打开若被拦截，到“系统设置 → 隐私与安全性”查看允许按钮。菜单和文件名会随发行版本变化。

<img src="/img/ai-programming/claudecode/ccswitch下载地址.png" alt="ccswitch下载地址" width="100%" />

### 在 CC Switch 里添加供应商

按钮可能叫“供应商”“配置”“Profiles”或“Providers”，信息项基本一致：

1. 打开配置管理页面，新建配置；
2. 起一个能看懂的名字，例如“团队测试网关”；
3. 填入供应商 Base URL；
4. 粘贴 API Key，检查首尾空格和换行；
5. 填入供应商文档中的精确模型标识；
6. 保存并点击“启用”“应用”或“切换”；
7. 有“测试连接”按钮就先测试，再发一次真实的只读请求。

如果软件让你选择 Anthropic 兼容模式，按供应商文档选择。不要把 OpenAI Chat Completions 字段原样填到 Anthropic Messages 配置里。

<img src="/img/ai-programming/claudecode/ccswitch配置-1.png" alt="ccswitch配置" width="100%" />

<img src="/img/ai-programming/claudecode/ccswitch配置-2.png" alt="ccswitch配置" width="100%" />

<img src="/img/ai-programming/claudecode/ccswitch配置-3.png" alt="ccswitch配置" width="100%" />

<img src="/img/ai-programming/claudecode/ccswitch配置-4.png" alt="ccswitch配置" width="100%" />

### 验证 CC Switch 是否生效

完全退出已有 Claude Code 会话，再重新打开。环境变量和代理配置经常只在进程启动时读取。发送低风险问题：

~~~text
只读取当前目录，告诉我当前使用的模型和项目路径，不要创建、删除或修改文件。
~~~

供应商有用量控制台时，查看请求是否出现。不要只因为 CC Switch 窗口显示“已启用”就认定请求走了目标供应商。

常见环境变量的含义：

| 变量 | 作用 | 典型错误 |
| --- | --- | --- |
| ANTHROPIC_API_KEY | 提供 Anthropic 兼容 Key | Key 不完整、Shell 未重新启动 |
| ANTHROPIC_AUTH_TOKEN | 某些网关使用的认证令牌 | Header 与平台要求不匹配 |
| ANTHROPIC_BASE_URL | 指定兼容 API 根地址 | 多写或少写 /v1 导致 404 |
| ANTHROPIC_MODEL | 指定默认模型标识 | 大小写或区域后缀错误 |

不要同时在 CC Switch、系统环境变量和 Shell 启动文件里设置三套互相冲突的值。排错时先保留一套来源。

<img src="/img/ai-programming/claudecode/claudecode界面.png" alt="claudecode界面" width="100%" />

## 第一次完整实战：社区活动物资预约看板

这一节走完一次完整交付链，重点是让每一步都能被检查和回退。

### 需求四件套：目标、现状、边界、验收

~~~text
我想做一个“社区活动物资预约看板”，给活动管理员和志愿者使用。

目标：展示物资名称、总库存、已预约数量和剩余数量；志愿者输入姓名并预约数量；数量不能为负数或超过剩余库存；刷新后数据仍保存在浏览器本地。

现状：请先检查当前目录；优先采用已有技术栈；这是演示项目，不接入真实账号和支付。

边界：先不引入数据库、登录系统或第三方组件库；不要删除已有文件；不要修改锁文件，除非说明原因；删除、批量重命名和外部网络请求先询问。

验收：空姓名和负数会被拒绝；超库存预约不会写入；合法预约后剩余库存立即更新；刷新页面后记录还在；至少有一组自动化测试或手工验证步骤。
~~~

### 第一步只调查，不改文件

~~~text
请检查当前目录、Git状态、已有文件和可用脚本。
这一步只读，不要创建或修改文件。
请输出：项目是否为空、技术栈和启动命令、最小实现方案、仍需要我确认的选择。
~~~

如果 Claude 直接写文件，立即停止请求，提醒它这一步只做调查。能停下来听指令，比生成一堆代码更重要。

### 第二步让它先给计划

~~~text
请根据刚才的调查结果给出一个不超过6步的实现计划。
每一步写明要改哪些文件、如何验证以及风险。
先不要执行，等我回复“开始”后再动手。
~~~

看到“重写全部项目”“升级所有依赖”“删除旧页面”之类的大动作时，先缩小范围。第一次交付要让改动可控。

### 第三步小步实现

~~~text
开始执行计划第1到第4步。
每完成一个独立步骤，告诉我修改了哪些文件和运行了什么命令。
保留现有未提交改动，不要执行删除文件、重置Git或覆盖环境配置的命令。
如果测试或构建失败，先停下来说明错误，不要跳过测试。
~~~

### 第四步检查功能和差异

~~~bash
git status --short
git diff --stat
git diff
~~~

重点看：有没有改到需求之外的配置文件；校验是否真的阻止负数和超库存；本地存储有没有写入敏感信息；错误提示是否能让普通用户看懂；测试是否覆盖边界。

### 第五步运行验证

~~~text
请先列出准备运行的测试、构建和静态检查命令，确认不会删除或覆盖数据后再执行。
完成后按“命令、结果、失败原因、是否与本次改动有关”汇总。
~~~

没有自动化测试时，让 Claude 写手工验收清单并走一遍：空姓名、负数、超过库存、恰好等于库存、连续预约、刷新页面、清空浏览器存储。

<img src="/img/ai-programming/claudecode/claudecode-terminal-development-loop.png" alt="从打开项目到提交或回退的 Claude Code 终端开发闭环图" width="100%" />

### 第六步提交前做人工决定

确认 diff 和测试后再提交：

~~~bash
git add -A
git commit -m "feat: add event supply reservation board"
~~~

如果还没看完 diff，不要让 Claude 直接执行 git add -A。真实项目里可能同时有别人的改动、调试日志和本地配置。

## 日常使用中最有用的命令

### Shell 命令和会话命令

| 类型 | 命令 | 用途 |
| --- | --- | --- |
| Shell | claude | 启动交互会话 |
| Shell | claude --version | 查看版本 |
| Shell | claude doctor | 只读诊断 |
| Shell | claude --help | 查看当前参数 |
| Shell | claude -p "问题" | 一次性查询后退出，具体行为以版本为准 |
| Shell | claude -c | 继续当前目录最近会话 |
| Shell | claude -r | 恢复历史会话 |
| 会话 | /help | 查看当前版本命令 |
| 会话 | /login | 登录或切换账号 |
| 会话 | /clear | 清空当前上下文 |
| 会话 | /exit | 退出会话 |
| 会话 | /usage | 查看账号和用量（账号支持时显示） |
| 会话 | /compact | 压缩较长上下文（版本支持时使用） |

命令会随版本增加或调整，所以先在自己的版本里执行 /help。网上复制旧命令前也要先确认。

### 一个好用的提示词骨架

~~~text
目标：我想让社区活动预约表支持按日期筛选。
现状：数据在 src/data.ts，页面入口是 src/App.tsx。
边界：先不改后端接口，不升级依赖，不删除现有筛选。
验收：今天、明天、无日期三种数据都正确显示，并补充测试。
流程：先调查，再给计划；我确认后再修改，最后汇报 diff 和测试结果。
~~~

### 上下文变长时处理

先让 Claude 总结当前结论和未完成事项，再把已确认边界写进项目允许的文档；需要时使用 /compact 或开启新会话。新会话第一句话重新说明当前目录、目标和验收条件。真正重要的规则应落在团队允许审查的项目文件里，不要把所有历史对话当成永久记忆。

## 安全边界：权限、密钥和工作目录

### 三条底线

1. API Key 不进仓库、源码、README、截图、提交信息和聊天记录；
2. 工作目录要小，第一次只打开练习项目或具体仓库；
3. 删除文件、重置 Git、覆盖环境变量、上传数据、安装陌生依赖都先看到命令再决定。

### 用环境变量保存密钥

PowerShell：

~~~powershell
$env:ANTHROPIC_API_KEY = "在这里粘贴Key"
$env:ANTHROPIC_BASE_URL = "https://api.example.com"
claude
~~~

macOS/Linux：

~~~bash
export ANTHROPIC_API_KEY='在这里粘贴Key'
export ANTHROPIC_BASE_URL='https://api.example.com'
claude
~~~

用完清除：PowerShell 执行 Remove-Item Env:ANTHROPIC_API_KEY 和 Remove-Item Env:ANTHROPIC_BASE_URL；macOS/Linux 执行 unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL。

项目需要长期使用时，把本地配置放在 .env，并在 .gitignore 中加入：

~~~gitignore
.env
.env.*
!.env.example
~~~

.env.example 只写变量名和示例域名，不写真实 Key。

### 危险命令先解释

~~~text
请先解释这条命令会影响哪些文件、是否可回退、是否需要联网或管理员权限。
在我回复“确认执行”之前，不要运行它。
~~~

特别关注 rm -rf、Remove-Item -Recurse -Force、git reset --hard、批量迁移、发布和上传命令。自动批准不能替你做这个决定。

## 常见问题：按三层顺序排查

<img src="/img/ai-programming/claudecode/claudecode-troubleshooting-tree.png" alt="Claude Code 命令层、认证层与工具层三层故障排查树" width="100%" />

### `claude` 找不到命令

macOS/Linux 执行 `command -v claude` 和 `echo "$PATH"`；Windows PowerShell 执行 `Get-Command claude` 和 `$env:Path -split ';'`。先关掉旧终端重试，再回看安装脚本最后的 PATH 提示。不要连续安装 npm、原生安装和旧版启动器，多个来源会造成实际运行版本不明。

### PowerShell 提示脚本执行被禁止

不要直接把策略改成全局不受限。确认执行的是官方命令，并阅读错误中的作用域。企业电脑可能由组织策略统一控制，这时使用官方 CMD 安装命令或找管理员。

### macOS 提示权限或 PATH 问题

~~~bash
echo "$SHELL"
echo "$PATH"
source ~/.zshrc
claude --version
~~~

按安装器给出的路径写入对应 Shell 配置，别把网上复制的多段 PATH 全部塞进去。

### 登录后反复要求登录

官方账号路线在会话里执行 /login；Key 路线检查变量是否在启动 Claude Code 的同一终端进程、Base URL 和模型名是否来自供应商当前文档。先清除一条路线的配置，单独验证另一条。

### 401、403、404和429

- **401/403**：检查 Key 是否完整、是否过期、是否有余额和模型权限；
- **404**：检查 Base URL、/v1 路径和模型标识，不要因为 401 反复重装；
- **429**：检查速率、并发和余额，减少并行会话和超长上下文，查看供应商控制台。

### CC Switch 启用但请求仍走旧配置

关闭 Claude Code 和相关终端后重新打开；检查系统环境变量是否覆盖 CC Switch 设置。临时只保留一种配置来源，确认后再增加自动切换。

## 更新、卸载和清理

### 更新

原生安装通常后台更新，也可以执行 claude update。npm 安装使用 npm install -g @anthropic-ai/claude-code@latest；Homebrew、WinGet、apt、dnf、apk 按各自包管理器更新。更新后执行 claude --version 和 claude doctor。

### 卸载

按安装来源卸载。原生安装（macOS/Linux/WSL）：

~~~bash
rm -f ~/.local/bin/claude
rm -rf ~/.local/share/claude
~~~

npm：

~~~bash
npm uninstall -g @anthropic-ai/claude-code
~~~

Homebrew 和 WinGet：

~~~bash
brew uninstall --cask claude-code
winget uninstall Anthropic.ClaudeCode
~~~

Windows 原生安装文件位置以当前官方文档为准，不要把 macOS 删除命令直接粘过去。

### 是否删除配置文件

用户目录下的 .claude 和 .claude.json 可能包含设置、会话历史、权限和外部工具配置。删除前先备份：

~~~bash
mv ~/.claude ~/.claude.backup-$(date +%Y%m%d)
mv ~/.claude.json ~/.claude.json.backup-$(date +%Y%m%d)
~~~

项目目录里的 .claude、.mcp.json 可能是团队配置，先看 Git 状态和内容再决定。

## 最终验收清单

- [ ] git --version 能返回版本；
- [ ] npm 路线下 node --version 和 npm --version 正常；
- [ ] claude --version 能返回 Claude Code 版本；
- [ ] claude doctor 没有未处理的关键错误；
- [ ] 当前终端进入目标项目目录；
- [ ] 官方账号或兼容 API 只选择一条配置来源并完成验证；
- [ ] 练习任务先调查、后计划、再修改；
- [ ] 修改前后都看过 git status 和 git diff；
- [ ] 至少跑过一条测试、构建或完整手工验收；
- [ ] Key 不在源码、.env.example、截图和 Git 提交里；
- [ ] 破坏性命令、上传和批量修改都经过人工确认。

## 我自己的使用顺序

我会把 Claude Code 当成一个需要被交代现场的协作者：先把目录、现状和限制说清楚，再让它调查；先看计划，再允许修改；最后把测试和 diff 走一遍。官方账号适合熟悉工具，兼容 API 适合在明确知道数据会经过谁、费用怎么算之后再接入。CC Switch 能让切换配置更方便，但它不会替你判断哪家服务值得信任。

安装成功只是起点。真正稳定的体验来自三个习惯：每次进入正确目录、每次任务写清验收条件、每次改动都留下可检查的 Git 记录。
