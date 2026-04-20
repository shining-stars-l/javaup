---
slug: /super-agent/function-call/tool-callback-source-analysis
description: "深入Spring AI源码，探索ToolCallback接口设计、FunctionToolCallback与MethodToolCallback的实现差异，理解工具调用的底层执行机制"
keywords: ["ToolCallback", "FunctionToolCallback", "MethodToolCallback", "Spring AI源码", "反射调用", "函数式接口"]
---

import VipInline from '@site/src/components/VipInline';

# ToolCallback源码解析

上一节我们知道了Spring AI提供两种定义工具的方式：`@Tool`注解和`Function` Bean。那你有没有好奇过：这两种方式在底层有什么区别？Spring AI拿到你的工具定义后，内部是怎么调用的？

这一节我们就来扒一扒源码，搞清楚这些问题。

## ToolCallback：工具的统一抽象

不管你用哪种方式定义工具，Spring AI最终都会把它转换成一个叫`ToolCallback`的东西。这是Spring AI对"可调用工具"的统一抽象。

:::info ToolCallback 核心接口
`ToolCallback` 接口的两个核心方法：
- `getToolDefinition()`：提供工具的"说明书"，让模型知道有这个工具可用
- `call()`：真正干活的方法，接收 JSON 格式的参数，返回执行结果

不管工具是怎么定义的，只要实现了这个接口，Spring AI 就能调用它。
:::

先来看看这个接口长什么样：

```java
public interface ToolCallback {
    
    /**
     * 获取工具定义，包含名称、描述、参数规范等信息
     * 模型会根据这些信息来决定什么时候调用这个工具
     */
    ToolDefinition getToolDefinition();
    
    /**
     * 获取工具的元数据，比如是否需要用户确认、返回值是否直接给用户等
     */
    default ToolMetadata getToolMetadata() {
        return ToolMetadata.builder().build();
    }
    
    /**
     * 执行工具调用
     * @param toolInput 模型传过来的参数，JSON格式
     * @return 执行结果，会被发回给模型
     */
    String call(String toolInput);
    
    /**
     * 带上下文的执行方法，可以传递额外信息
     */
    default String call(String toolInput, @Nullable ToolContext toolContext) {
        if (toolContext != null && !toolContext.getContext().isEmpty()) {
            throw new UnsupportedOperationException("不支持工具上下文");
        }
        return call(toolInput);
    }
}
```

看完接口定义，几个关键点就清楚了：

1. `getToolDefinition()` — 提供工具的"说明书"，让模型知道有这个工具可用
2. `call()` — 真正干活的方法，接收JSON格式的参数，返回执行结果

不管工具是怎么定义的，只要实现了这个接口，Spring AI就能调用它。

<VipInline />
