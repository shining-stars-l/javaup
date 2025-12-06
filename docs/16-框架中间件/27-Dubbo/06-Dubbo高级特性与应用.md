---
slug: /framework/dubbo/advanced-features
sidebar_class_name: has-paid-badge
---

import PaidCTA from '@site/src/components/PaidCTA';

# Dubbo高级特性与应用

## Dubbo异步调用

### Consumer端异步调用

Consumer端异步调用是指消费者在调用远程服务时不同步等待结果,可以先去处理其他业务逻辑,在需要结果时再获取。

```mermaid
sequenceDiagram
    participant App as 业务代码
    participant Async as 异步任务
    participant Service as 远程服务
    participant Other as 其他业务
    
    App->>Async: 提交异步调用任务
    App->>Other: 继续处理其他业务
    
    Async->>Service: 发起远程调用
    Service->>Service: 执行业务逻辑
    
    Other->>App: 其他业务完成
    
    Service->>Async: 返回调用结果
    
    App->>Async: 获取调用结果
    Async->>App: 返回执行结果
```

**实现方式 - CompletableFuture**:

服务接口保持同步定义:

<PaidCTA />