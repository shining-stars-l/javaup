---
slug: /super-agent/skills/codex-install
description: "以UI UX Pro Max技能为例，手把手演示如何在Codex中安装、配置和使用Agent Skills，涵盖CLI安装、项目级/全局安装、目录结构解读和日常管理的完整流程"
keywords: ["Codex", "Skills安装", "UI UX Pro Max", "技能管理", "uipro-cli", "Agent Skills使用"]
---

import VipInline from '@site/src/components/VipInline';

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

<VipInline />
