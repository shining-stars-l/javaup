---
slug: /damai-ai/assistant/custom-function-data
title: "自定义Function调取数据：业务数据查询、参数映射、结果回填、节目推荐、工具封装详解"
sidebar_label: "自定义Function调取数据"
pagination_label: "自定义Function调取数据"
description: "自定义Function取数实践，讲解将节目与演唱会查询能力封装为可调用工具，并完成参数映射、结果回填与会话响应整合。内容进一步围绕业务数据查询、节目推荐、工具封装、Function Calling集成、服务编排等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目实践建…"
keywords: ["自定义Function", "业务数据查询", "参数映射", "结果回填", "节目推荐", "工具封装", "Function Calling集成", "服务编排"]
---

# 自定义Function调取数据

import VipInline from '@site/src/components/VipInline';

在上一章节知道了 Function Calling 的作用后，就要开始具体的实现了，首先要实现推荐节目演唱会功能。

org.javaup.ai.ai.function.AiProgram

```java
@Component
public class AiProgram {

    
    @Tool(description = "根据地区或者类型查询推荐的节目")
    public List<ProgramSearchVo> selectProgramRecommendList(@ToolParam(description = "查询的条件", required = true) ProgramRecommendFunctionDto programRecommendFunctionDto){
        
    }

}
```



在方法上添加了 @Tool 注解，能够让ai识别到。

<VipInline />
