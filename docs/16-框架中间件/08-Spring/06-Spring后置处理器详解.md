---
slug: /framework/spring/post-processor
sidebar_class_name: has-paid-badge
---
import PaidCTA from '@site/src/components/PaidCTA';

# Spring后置处理器详解

## 后置处理器概述

在Spring框架中，后置处理器（Post Processor）是一种**扩展机制**，允许开发者在Bean创建和容器初始化的不同阶段介入，对Bean定义或Bean实例进行自定义处理。

Spring提供了三个核心后置处理器接口，它们在容器生命周期的不同阶段发挥作用：

```mermaid
graph TB
    subgraph Spring后置处理器体系
        A[BeanDefinitionRegistryPostProcessor<br/>Bean定义注册后置处理器] 
        B[BeanFactoryPostProcessor<br/>Bean工厂后置处理器]
        C[BeanPostProcessor<br/>Bean后置处理器]
    end
    
    A -->|继承| B
    B -.->|作用时机不同| C
    
    style A fill:#e74c3c,stroke:#c0392b,color:#fff,rx:10,ry:10
    style B fill:#3498db,stroke:#2980b9,color:#fff,rx:10,ry:10
    style C fill:#2ecc71,stroke:#27ae60,color:#fff,rx:10,ry:10
```

### 三者的核心区别

<PaidCTA />