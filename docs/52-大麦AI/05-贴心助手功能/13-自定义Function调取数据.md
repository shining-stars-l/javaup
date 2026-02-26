---
slug: /damai-ai/assistant/custom-function-data
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



在方法上添加了 @Tool 注解，就标记成了 Function，能够让ai识别到。



除了在方法上添加 @Tool 注解外，还有使用 @ToolParam 注解，来标记方法的参数

```java
@Data
public class ProgramRecommendFunctionDto {

    @ToolParam(required = false, description = "节目演出地点")
    private String areaName;

    @ToolParam(required = false, description = "节目类型")
    private String programCategory;
}
```



当用户和ai进行对话时，ai就可以提取用户对话的内容，填充到对应的参数上

## 推荐节目演唱会功能的实现
在大麦项目中，项目启动时，会把节目的数据从数据库中查询再存储到ElasticSearch中。所以在大麦ai项目中，可以直接从ElasticSearch中查询推荐的演唱会节目

项目中集成了 Easy-Es 来操作 ElasticSearch，Easy-Es 的操作和 MybatisPlus 很像，操作起来很方便

```java
@Component
public class AiProgram {

    @Autowired
    private ProgramCall programCall;
    
    @Tool(description = "根据地区或者类型查询推荐的节目")
    public List<ProgramSearchVo> selectProgramRecommendList(@ToolParam(description = "查询的条件", required = true) ProgramRecommendFunctionDto programRecommendFunctionDto){
        return programCall.recommendList(programRecommendFunctionDto);
    }

}
```

```java
@Component
public class ProgramCall {

    @Autowired
    private ProgramMapper programMapper;
    
    public List<ProgramSearchVo> recommendList(ProgramRecommendFunctionDto programRecommendFunctionDto){
        LambdaEsQueryWrapper<ProgramSearchVo> wrapper = EsWrappers.lambdaQuery(ProgramSearchVo.class)
                .eq(StringUtil.isNotEmpty(programRecommendFunctionDto.getAreaName()), ProgramSearchVo::getAreaName, programRecommendFunctionDto.getAreaName())
                .eq(StringUtil.isNotEmpty(programRecommendFunctionDto.getProgramCategory()), ProgramSearchVo::getParentProgramCategoryName, programRecommendFunctionDto.getProgramCategory());
        return programMapper.selectList(wrapper);
    }
}
```

根据城市和节目类型从 ElasticSearch 中查询



定义好了AiProgram后，要把它交给ChatClient，这样 ai 可以实现 Function Calling 的功能，去调用 selectProgramRecommendList 方法了

```java
@Bean
public ChatClient assistantChatClient(DeepSeekChatModel model, ChatMemory chatMemory, AiProgram aiProgram) {
    return ChatClient
            .builder(model)
            .defaultSystem(DaMaiConstant.DA_MAI_SYSTEM_PROMPT)
            .defaultAdvisors(
                    new SimpleLoggerAdvisor(),
                    MessageChatMemoryAdvisor.builder(chatMemory).order(MESSAGE_CHAT_MEMORY_ADVISOR_ORDER).build()
            )
            .defaultTools(aiProgram)
            .build();
}
```

能看到直接调用 .defaultTools(aiProgram) 方法就可以了



到这里就完成了 Function Calling 的功能了，可以总结使用 SpringAI 来执行 ai 的功能真的很方便！


<VipInline />