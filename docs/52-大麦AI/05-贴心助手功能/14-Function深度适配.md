---
slug: /damai-ai/assistant/function-adaptive
description: "Function深度适配实战，覆盖节目检索、详情查询、票档查询与订单生成等多函数协同调用，完善复杂购票场景的自动执行链路。"
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
