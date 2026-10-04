---
slug: /damai-ai/assistant/function-adaptive
title: "Function深度适配：函数深度适配、条件检索、节目详情查询、票档查询、订单生成详解"
sidebar_label: "Function深度适配"
pagination_label: "Function深度适配"
description: "Function深度适配实战，覆盖节目检索、详情查询、票档查询与订单生成等多函数协同调用，完善复杂购票场景的自动执行链路。内容进一步围绕函数深度适配、条件检索、节目详情查询、多函数编排、参数归一化等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目实践建议与技术面试要…"
keywords: ["函数深度适配", "条件检索", "节目详情查询", "票档查询", "订单生成", "多函数编排", "参数归一化", "异常兜底"]
---

# Function深度适配

import VipInline from '@site/src/components/VipInline';

上一章节实现了推荐节目演唱会的功能后，此章节实现其余的功能

## 根据条件查询节目
org.javaup.ai.ai.function.AiProgram

```java
@Tool(description = "根据条件查询节目")
public List<ProgramSearchVo> selectProgramList(@ToolParam(description = "查询的条件", required = true) ProgramSearchFunctionDto programSearchFunctionDto){
    return programCall.search(programSearchFunctionDto);
}
```

参数

```java
@Data
public class ProgramSearchFunctionDto {

    @ToolParam(required = false, description = "节目演出城市")
    private String cityName;

    @ToolParam(required = false, description = "节目艺人或者节目明星")
    private String actor;

    @ToolParam(required = false, description = "节目演出时间")
    private Date showTime;
}
```


<VipInline />
