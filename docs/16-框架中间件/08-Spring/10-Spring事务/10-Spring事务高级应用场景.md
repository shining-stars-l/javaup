---
slug: /framework/spring/transaction-advanced
---

import PaidCTA from '@site/src/components/PaidCTA';

# Spring事务高级应用场景

## 多线程环境下的事务处理

### 问题背景

Spring的@Transactional事务管理使用ThreadLocal机制存储事务上下文,每个线程都有独立的事务上下文副本。在多线程环境下,新线程无法访问主线程的事务上下文,导致事务失效。

```mermaid
graph TB
    A[主线程开启事务] --> B[ThreadLocal存储事务上下文]
    B --> C[主线程数据库操作]
    
    D[创建新线程] --> E[新线程尝试访问事务上下文]
    E --> F[ThreadLocal隔离]
    F --> G[新线程无事务上下文]
    G --> H[事务失效]
    
    style B fill:#90EE90,rx:10,ry:10
    style F fill:#FF6B6B,rx:10,ry:10
    style H fill:#FF6B6B,rx:10,ry:10
```

### 声明式事务在多线程下失效

```java
@Service
public class OrderService {
    
    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private StockRepository stockRepository;
    
    /**
     * 多线程场景下事务失效示例
     */
    @Transactional(rollbackFor = Exception.class)
    public void createOrderWithMultiThread(OrderRequest request) {
        // 主线程: 创建订单
        Order order = new Order();
        order.setUserId(request.getUserId());
        order.setAmount(request.getAmount());
        orderRepository.save(order);
        
        // 新线程: 扣减库存
        new Thread(() -> {
            // ❌ 新线程中没有事务上下文
            // 即使主线程回滚,库存扣减操作也不会回滚!
            stockRepository.decreaseStock(
                request.getProductId(), 
                request.getQuantity()
            );
        }).start();
        
        // 模拟异常
        if (request.getAmount() > 10000) {
            throw new BusinessException("金额超限");
        }
        // 主线程回滚,但新线程的库存扣减已执行且不会回滚
    }
}
```

**执行结果分析:**

```mermaid
graph LR
    A[主线程开始] --> B[创建订单]
    B --> C[启动新线程]
    C --> D[主线程抛异常]
    D --> E[主线程回滚订单]
    
    F[新线程执行] --> G[扣减库存成功]
    
    E -.订单回滚.-> H[订单不存在]
    G -.库存已扣减.-> I[数据不一致!]
    
    style E fill:#FF6B6B,rx:10,ry:10
    style G fill:#90EE90,rx:10,ry:10
    style I fill:#FF6B6B,rx:10,ry:10
```

### 解决方案: 编程式事务

在新线程中使用编程式事务,手动管理事务生命周期:

<PaidCTA />