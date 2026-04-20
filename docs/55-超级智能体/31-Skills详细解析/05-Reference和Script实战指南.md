---
slug: /super-agent/skills/reference-script
description: "从实战角度深入讲解Agent Skills中Reference和Script两个可选组件的设计思路、典型用法、编写技巧，以及它们与MCP工具的本质区别"
keywords: ["Reference", "Script", "技能参考文档", "技能脚本", "Skills实战", "Script与MCP区别"]
---

import VipInline from '@site/src/components/VipInline';

# Reference和Script实战指南

前面几篇我们从整体到局部，已经把Agent Skills的核心框架讲清楚了。但在实际使用中，很多人遇到的困惑集中在两个问题上：

1. **Reference和直接把内容写在Instruction里有什么区别？什么情况下该拆出来？**
2. **Script能做的事情，MCP也能做，到底该用哪个？**

这一篇我们就从实战出发，把这两个组件的使用场景、编写方法和最佳实践讲透。

```plantuml title="什么时候用 Instruction、Reference、Script、MCP" width="100%" align="left"
@startuml
skinparam backgroundColor transparent
skinparam shadowing false
skinparam dpi 160
skinparam defaultFontColor #1E293B
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

rectangle "待封装的能力点\n<size:12>先判断它属于哪一类职责</size>" as need #EFF6FF

package "四种放置位置" as board #F8FAFC {
  rectangle "Instruction\n<size:12>什么时候用</size>\n核心流程\n使用边界\n输出规则与步骤" as instruction #DBEAFE
  rectangle "Reference\n<size:12>什么时候用</size>\n大块知识\n按需查阅\n不是每次执行都读" as reference #DCFCE7
  rectangle "Script\n<size:12>什么时候用</size>\n本地确定性执行\n计算 / 转换 / 过滤\n返回结构化结果" as script #FEF3C7
  rectangle "MCP\n<size:12>什么时候用</size>\n共享外部能力\n跨 Skill / 跨项目复用\n连接数据库、搜索、服务" as mcp #FEE2E2
}

need -[hidden]down-> instruction
instruction -[hidden]right-> reference
instruction -[hidden]down-> script
reference -[hidden]down-> mcp
script -[hidden]right-> mcp

note bottom of board
  它们不是互斥关系，而是按职责分层配合。
  一个完整 Skill 往往会同时包含其中两种或三种能力。
end note
@enduml
```

## Reference：智能体的"按需查阅资料库"

### 什么时候该用Reference

最简单的判断标准：**如果某些信息不是每次执行都用得上，但某些情况下又必须要有，就该放reference。**

具体来说，适合放reference的内容有这几类：

| 内容类型 | 具体举例 | 为什么适合放reference |
|---------|---------|---------------------|
| 详细的规范文档 | 编码风格指南、API接口规范 | 内容量大，不是每个步骤都需要 |
| 结构化的映射表 | 错误码对照表、状态机转换表 | 查询时才用，平时不需要加载 |
| 完整的示例模板 | 输出报告模板、代码模板 | 只在生成输出时参考 |
| 外部知识补充 | 第三方框架使用说明、行业术语解释 | 辅助性信息，非核心执行逻辑 |

相反，**不适合放reference的内容**：

- 技能的核心执行步骤（这是Instruction的职责）
- 只有一两句话的简短说明（直接写在Instruction里就行）
- 频繁变动的配置信息（reference更适合相对稳定的文档）

### Reference的文件组织

reference目录下的文件组织没有强制规定，但有一些实践中比较好用的模式：

**模式一：按职能分文件**

```
references/
├── style-guide.md          # 编码风格规范
├── error-code-mapping.md   # 错误码映射
├── output-template.md      # 输出格式模板
└── faq.md                  # 常见问题和处理方式
```

**模式二：按语言或场景分文件**

```
references/
├── java-conventions.md     # Java相关规范
├── python-conventions.md   # Python相关规范
├── go-conventions.md       # Go相关规范
└── general-principles.md   # 通用原则
```

:::info 组织原则
核心思路就是**一个文件解决一类问题**。不要把所有参考资料塞到一个巨大的文件里，也不要拆得太碎导致文件数量爆炸。5-10个reference文件是比较合理的范围。
:::

### 在Instruction中怎么引用Reference

在SKILL.md的Instruction里，需要明确告诉智能体什么时候、去读哪个reference。有两种常见的写法：

**写法一：在步骤中直接指定**

```markdown
## Review steps
1. Read the target source file
2. Check naming conventions against references/style-guide.md
3. Verify error handling against references/error-patterns.md
4. Generate report using the format in references/output-template.md
```

**写法二：按条件触发**

```markdown
## Reference usage
- When reviewing Java code: read references/java-conventions.md
- When reviewing Python code: read references/python-conventions.md
- When encountering unfamiliar error codes: consult references/error-code-mapping.md
```

第二种写法更灵活——智能体不是每次都读所有reference，而是根据实际情况选择性读取。

### Reference编写的实用建议

**建议一：给reference加上清晰的标题和结构**

别写成一大坨纯文本。用Markdown的标题层次组织好，智能体在查阅时能更快定位到需要的部分。

```markdown
# Error Code Mapping

## HTTP 4xx Errors
| Code | Meaning | Recommended Action |
|------|---------|-------------------|
| 400 | Bad Request | Check request body format |
| 401 | Unauthorized | Verify authentication token |
| 403 | Forbidden | Check user permissions |
| 404 | Not Found | Verify resource path |

## HTTP 5xx Errors
| Code | Meaning | Recommended Action |
|------|---------|-------------------|
| 500 | Internal Server Error | Check server logs for stack trace |
| 502 | Bad Gateway | Check upstream service health |
| 503 | Service Unavailable | Check if service is overloaded |
```

**建议二：控制单个文件的大小**

一般建议单个reference文件不超过500行。如果内容确实很多，要么拆成多个文件，要么考虑用script来做检索过滤（这个后面会讲）。

**建议三：包含"怎么用"的简要说明**

在reference文件的开头加一两句话，说明这个文件包含什么、适用于什么场景。方便智能体快速判断是否需要继续读下去。

<VipInline />
