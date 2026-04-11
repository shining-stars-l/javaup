---
slug: /super-agent/skills/codex-install
description: "以UI UX Pro Max技能为例，手把手演示如何在Codex中安装、配置和使用Agent Skills，涵盖CLI安装、项目级/全局安装、目录结构解读和日常管理的完整流程"
keywords: ["Codex", "Skills安装", "UI UX Pro Max", "技能管理", "uipro-cli", "Agent Skills使用"]
---

# 使用Codex安装和管理Skills

前面几篇我们从原理层面把Agent Skills讲透了，这一篇进入实操环节——以一个真实的开源Skill为例，演示如何在Codex中完成安装和管理。

我们选用的案例是 **UI UX Pro Max**，这是目前社区里比较受欢迎的一个设计类Skill，非常适合用来演示完整的安装流程。

## UI UX Pro Max 是什么

UI UX Pro Max 是一个专注于前端界面设计的Agent Skill，它把专业的UI/UX设计知识封装成了智能体可调用的能力模块。

**它能帮你做什么：**

- **配色方案推荐**：根据产品定位和品牌调性，推荐合适的主色、辅助色、中性色组合
- **组件设计建议**：针对按钮、表单、卡片等常见组件，给出符合设计规范的样式建议
- **布局优化指导**：分析页面结构，提供栅格布局、间距、对齐等方面的改进意见
- **响应式适配方案**：为不同屏幕尺寸提供自适应设计思路
- **设计系统对接**：可以参照Tailwind、Ant Design、Material Design等主流设计系统的规范

**它的核心价值：**

对于没有专业设计背景的开发者来说，UI UX Pro Max 相当于给你配了一个"随叫随到的设计顾问"。你在写前端代码的时候，随时可以让它帮你审视界面、给出优化建议，省去了反复找设计师沟通的来回。

:::info 为什么选这个Skill做演示
1. 它是开源的，有完整的GitHub仓库可以查看源码
2. 提供了官方的CLI安装工具，流程标准化程度高
3. 它的目录结构是典型的Skill规范，适合用来理解Skill的组成
:::

## 官方资源

- **官网地址**：[https://ui-ux-pro-max-skill.nextlevelbuilder.io](https://ui-ux-pro-max-skill.nextlevelbuilder.io)
- **GitHub地址**：[https://github.com/nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)

![UI UX Pro Max 官网](/img/super-agent/skills/UI-UX-Pro-Max.png)

## 安装步骤

UI UX Pro Max 提供了一个名为 `uipro-cli` 的命令行工具，可以一键完成安装。整个流程非常简单。

### 第一步：安装CLI工具

首先需要全局安装 `uipro-cli` 命令行工具：

```shell
npm install -g uipro-cli
```

安装完成后，可以运行 `uipro --help` 确认安装成功。

![UI UX Pro Max 官网](/img/super-agent/skills/uipro--help.png)

### 第二步：进入项目目录

切换到你想要安装Skill的项目根目录：

```shell
cd /path/to/your/project
```

### 第三步：执行安装命令

运行初始化命令，指定目标AI工具为Codex：

```shell
uipro init --ai codex
```

这条命令会在当前项目目录下创建 `.codex/skills/ui-ux-pro-max/` 目录，并下载Skill的完整文件。

![UI UX Pro Max 官网](/img/super-agent/skills/uiproinit--aicodex.png)

### 第四步（可选）：全局安装

如果你希望这个Skill在所有项目中都可用，可以使用 `--global` 参数进行全局安装：

```shell
uipro init --ai codex --global
```

全局安装会将Skill放置到 `~/.codex/skills/` 目录下，对当前用户的所有项目生效。

:::note 项目级安装 vs 全局安装
- **项目级安装**：Skill只在当前项目生效，适合项目有特定设计规范的场景
- **全局安装**：Skill对所有项目生效，适合通用型的工具类Skill
:::

## 安装后的目录结构

安装完成后，我们来看一下实际生成的目录结构：

<img src="/img/super-agent/skills/ui-ux-pro-max结构.png" alt="结构" width="35%" />

```
.codex/
└── skills/
    └── ui-ux-pro-max/
        ├── SKILL.md           # 核心入口文件
        ├── data/              # 设计知识库数据
        │   ├── colors.csv     # 配色方案数据
        │   ├── typography.csv # 字体排版数据
        │   ├── icons.csv      # 图标规范数据
        │   ├── styles.csv     # 样式规范数据
        │   └── stacks/        # 各技术栈的适配文件
        │       ├── react.csv
        │       ├── vue.csv
        │       └── ...
        └── scripts/           # 辅助脚本
            ├── core.py        # 核心处理逻辑
            ├── design_system.py
            └── search.py      # 知识库检索脚本
```

**结构解读：**

| 目录/文件 | 作用说明 |
|----------|---------|
| `SKILL.md` | Skill的入口文件，包含元数据和执行指令 |
| `data/` | 相当于references目录，存放设计规范的结构化数据 |
| `data/*.csv` | 各类设计知识的数据文件，脚本会从中检索 |
| `data/stacks/` | 针对不同前端技术栈的适配配置 |
| `scripts/` | Python脚本，负责从data目录检索信息并返回给智能体 |

你会发现，这个Skill的结构完美对应了我们前几篇讲的内容：
- **SKILL.md** 是入口，包含Frontmatter和Instruction
- **data/** 就是reference的角色，存放参考数据
- **scripts/** 负责从大量数据中精准检索，避免智能体直接读取所有CSV文件

## 验证安装是否成功

安装完成后，启动Codex，在对话中尝试调用这个Skill：

```
帮我设计一个电商产品详情页的配色方案，要求现代简约风格
```

如果Skill安装成功，Codex会自动识别到这是一个UI设计相关的任务，激活UI UX Pro Max技能，然后给出专业的配色建议。

<img src="/img/super-agent/skills/激活UIUXProMax技能.png" alt="结构" width="100%" />

## 其他常用命令

`uipro-cli` 还提供了一些日常管理命令：

### 查看可用版本

```shell
uipro versions
```

### 更新到最新版本

```shell
uipro update
```

### 离线安装（使用本地缓存）

```shell
uipro init --offline
```

### 卸载Skill

```shell
# 自动检测平台并卸载
uipro uninstall

# 指定平台卸载
uipro uninstall --ai codex

# 从全局安装位置卸载
uipro uninstall --global
```

## 手动安装方式

如果你不想使用CLI工具，也可以手动安装：

1. 克隆GitHub仓库到本地
2. 将 `ui-ux-pro-max` 目录复制到项目的 `.codex/skills/` 目录下
3. 重启Codex即可生效

手动安装适合需要对Skill进行定制化修改的场景。

## 本篇小结

这一篇我们以UI UX Pro Max为例，完整走了一遍Skill的安装流程：

1. **了解Skill的能力定位** — 知道它能帮你解决什么问题
2. **安装CLI工具** — 使用npm全局安装uipro-cli
3. **执行安装命令** — 可选项目级或全局安装
4. **查看目录结构** — 理解Skill的文件组织方式
5. **验证安装效果** — 在Codex中实际调用测试
