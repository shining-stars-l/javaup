---
slug: /java/jvm/zgc-collector
sidebar_class_name: has-paid-badge
---

import PaidCTA from '@site/src/components/PaidCTA';

# ZGC低延迟垃圾收集器

## 前言

ZGC(Z Garbage Collector)是Oracle在JDK 11中引入的一款革命性的低延迟垃圾收集器,它的设计目标是将GC停顿时间控制在**10毫秒以内**,甚至可以达到**亚毫秒级别**,而且这个停顿时间不会随着堆大小的增加而增加。

ZGC代表了垃圾回收技术的最新发展方向,特别适合需要超大内存且对延迟极度敏感的应用场景。本文将深入探讨ZGC的核心特性、工作原理和使用场景。

:::tip 版本说明
- JDK 11-14: ZGC处于实验阶段
- JDK 15: ZGC正式可用(Production Ready)
- JDK 21: 引入分代ZGC,停顿时间缩短到1ms以内
- JDK 24: 删除非分代ZGC
:::

## ZGC的六大核心特性

### 1. 超低停顿时间

ZGC的首要设计目标是实现极低的停顿时间:

```mermaid
graph LR
    A[传统GC] --> B[停顿时间<br/>100ms-1s+<br/>与堆大小相关]
    C[G1] --> D[停顿时间<br/>10-200ms<br/>可预测但仍较长]
    E[ZGC] --> F[停顿时间<br/>&lt;10ms<br/>与堆大小无关]
    
    style B fill:#FFD4D4,stroke:#C87C7C,stroke-width:2px,rx:10,ry:10
    style D fill:#FFE4B5,stroke:#D4A574,stroke-width:2px,rx:10,ry:10
    style F fill:#D4F1D4,stroke:#7CB87C,stroke-width:2px,rx:10,ry:10
```

**关键点:**
- 目标停顿时间 &lt; 10ms
- JDK 21分代ZGC可达到 &lt; 1ms
- 停顿时间不随堆大小增加而增长

### 2. 高吞吐量

ZGC是并发垃圾收集器,大部分工作与应用线程并发执行:

```mermaid
sequenceDiagram
    participant App as 应用线程
    participant ZGC as ZGC线程
    
    Note over App,ZGC: 仅在极短时间内STW
    
    App->>App: 运行中...
    ZGC->>ZGC: 并发标记
    
    Note over App: 短暂停顿(~1ms)
    App->>App: STW
    ZGC->>ZGC: 初始标记
    
    App->>App: 继续运行
    ZGC->>ZGC: 并发标记
    
    App->>App: 持续运行
    ZGC->>ZGC: 并发重定位
    
    App->>App: 持续运行
    ZGC->>ZGC: 并发引用处理
    
    Note over App,ZGC: 应用线程几乎不受影响
```

**优势:**
- 应用线程停顿极短,CPU利用率高
- 适合对吞吐量有要求的场景

### 3. 完全兼容性

ZGC与现有Java应用程序完全兼容:

```java
// 无需修改任何代码
public class ExistingApplication {
    
    public static void main(String[] args) {
        // 原有代码完全不变
        ApplicationContext context = new ApplicationContext();
        Server server = new Server(8080);
        server.start();
    }
    
    // 只需在JVM启动参数中指定ZGC
    // java -XX:+UseZGC -Xmx16g Application
}
```

**特点:**
- 无需修改应用代码
- 无需调整对象分配策略
- 平滑迁移,风险低

### 4. 超大堆支持

ZGC可以处理从8MB到16TB的堆内存:

```mermaid
graph TB
    A[堆大小范围] --> B[最小: 8MB]
    A --> C[最大: 16TB]
    
    D[传统GC] --> E[堆越大<br/>停顿越长]
    F[ZGC] --> G[堆大小<br/>不影响停顿]
    
    style A fill:#9370DB,stroke:#6B4DB3,stroke-width:2px,rx:10,ry:10
    style E fill:#FFD4D4,stroke:#C87C7C,stroke-width:2px,rx:10,ry:10
    style G fill:#D4F1D4,stroke:#7CB87C,stroke-width:2px,rx:10,ry:10
```

**适用场景:**

```java
// 超大内存缓存系统
public class MassiveCacheSystem {
    
    // 使用10TB堆内存
    // ZGC依然能保持<10ms的停顿
    private Map&lt;String, CacheEntry&gt; cache;
    
    public void initialize() {
        // 初始化超大缓存
        cache = new ConcurrentHashMap&lt;&gt;(100_000_000);
        
        // 加载数十亿条数据到内存
        loadBillionsOfEntries();
    }
}
```

### 5. 全堆回收(非分代)

ZGC最初采用全堆回收策略,不区分年轻代和老年代:

```mermaid
graph TB
    subgraph 传统分代GC
    A1[堆] --> B1[新生代<br/>频繁GC]
    A1 --> C1[老年代<br/>较少GC]
    end
    
    subgraph ZGC_非分代
    A2[堆] --> B2[全堆统一管理<br/>增量回收]
    end
    
    style B1 fill:#4A90E2,stroke:#2E5C8A,stroke-width:2px,rx:10,ry:10
    style C1 fill:#E94B3C,stroke:#B8341F,stroke-width:2px,rx:10,ry:10
    style B2 fill:#9370DB,stroke:#6B4DB3,stroke-width:2px,rx:10,ry:10
```

:::info JDK 21更新
JDK 21引入了[分代ZGC](https://openjdk.org/jeps/439),进一步优化性能。JDK 24中[删除了非分代ZGC](https://openjdk.org/jeps/490)。
:::

**启用分代ZGC(JDK 21+):**

```bash
java -XX:+UseZGC -XX:+ZGenerational -Xmx16g Application
```

### 6. 设计简洁

ZGC设计相对简洁,代码库较小,易于维护和扩展:

- 核心代码集中,逻辑清晰
- 更容易进行性能优化
- 缺陷修复周期短

## ZGC核心技术原理

ZGC能够实现如此低的停顿时间,主要依赖两项核心技术:

### 1. 染色指针(Colored Pointers)

ZGC使用64位指针的部分位来存储元数据:

```mermaid
graph LR
    A[64位指针] --> B[0-43位<br/>对象地址<br/>支持16TB]
    A --> C[44-47位<br/>元数据标记位]
    A --> D[48-63位<br/>未使用]
    
    C --> E[Marked0/Marked1<br/>标记位]
    C --> F[Remapped<br/>重定位位]
    C --> G[Finalizable<br/>终结位]
    
    style A fill:#9370DB,stroke:#6B4DB3,stroke-width:2px,rx:10,ry:10
    style B fill:#4A90E2,stroke:#2E5C8A,stroke-width:2px,rx:10,ry:10
    style C fill:#E94B3C,stroke:#B8341F,stroke-width:2px,rx:10,ry:10
    style D fill:#E8E8E8,stroke:#999,stroke-width:2px,rx:10,ry:10
```

**染色指针的优势:**

```java
// 概念示例(简化)
public class ColoredPointer {
    
    // 传统方式:需要额外的标记位图
    class TraditionalGC {
        Object obj;
        boolean marked;  // 需要额外存储
    }
    
    // ZGC方式:标记信息编码在指针中
    class ZGCPointer {
        long pointer;  // 地址+标记信息
        
        // 提取地址
        long getAddress() {
            return pointer &amp; 0x0000FFFFFFFFFFFFL;
        }
        
        // 检查标记
        boolean isMarked() {
            return (pointer &amp; MARKED_MASK) != 0;
        }
        
        // 设置标记
        void setMarked() {
            pointer |= MARKED_MASK;
        }
    }
}
```

**优势总结:**
- 无需额外的标记位图,节省内存
- 通过位运算快速判断对象状态
- 支持多种并发标记视图

### 2. 读屏障(Load Barrier)

ZGC使用读屏障技术实现并发的对象移动:

```mermaid
sequenceDiagram
    participant App as 应用线程
    participant Barrier as 读屏障
    participant ZGC as ZGC线程
    
    App->>Barrier: 读取对象引用
    Barrier->>Barrier: 检查对象状态
    
    alt 对象未重定位
        Barrier->>App: 返回原地址
    else 对象已重定位
        Barrier->>Barrier: 查找新地址
        Barrier->>Barrier: 更新引用
        Barrier->>App: 返回新地址
    end
    
    Note over App,ZGC: 应用线程继续执行<br/>无需等待
    
    ZGC->>ZGC: 并发重定位其他对象
```

**工作原理示例:**

```java
// 读屏障伪代码
public class LoadBarrier {
    
    Object readField(Object obj, String fieldName) {
        // 1. 读取字段值(可能是旧地址)
        Object value = obj.getField(fieldName);
        
        // 2. 读屏障检查
        if (needsBarrier(value)) {
            // 检查对象是否已被重定位
            if (isRelocated(value)) {
                // 获取新地址
                Object newAddress = getForwardingAddress(value);
                
                // 更新字段为新地址
                obj.setField(fieldName, newAddress);
                
                return newAddress;
            }
        }
        
        return value;
    }
}
```

**读屏障的关键作用:**

- **并发移动**: GC可以在应用运行时移动对象
- **自愈性**: 应用线程自动修复过时的引用
- **低开销**: 只在对象访问时触发,成本可控

### 3. 技术协同工作

染色指针和读屏障配合实现并发回收:

```mermaid
graph TB
    A[GC开始] --> B[ZGC标记存活对象<br/>使用染色指针]
    B --> C[ZGC并发移动对象<br/>到新地址]
    
    D[应用线程访问对象] --> E{读屏障检查<br/>染色指针}
    E -->|对象未移动| F[直接返回]
    E -->|对象已移动| G[查找新地址<br/>更新引用]
    
    C -.并发进行.-> D
    
    style B fill:#4A90E2,stroke:#2E5C8A,stroke-width:2px,rx:10,ry:10
    style C fill:#50C878,stroke:#2E7D4E,stroke-width:2px,rx:10,ry:10
    style E fill:#9370DB,stroke:#6B4DB3,stroke-width:2px,rx:10,ry:10
```

## ZGC工作流程

ZGC的垃圾回收过程高度并发化:

```mermaid
graph TB
    A[暂停标记开始<br/>STW ~1ms] --> B[并发标记<br/>Concurrent]
    B --> C[暂停标记结束<br/>STW ~1ms]
    C --> D[并发预备重分配<br/>Concurrent]
    D --> E[暂停重分配开始<br/>STW ~1ms]
    E --> F[并发重分配<br/>Concurrent]
    F --> G[并发重映射<br/>Concurrent]
    
    style A fill:#E94B3C,stroke:#B8341F,stroke-width:2px,rx:10,ry:10
    style B fill:#50C878,stroke:#2E7D4E,stroke-width:2px,rx:10,ry:10
    style C fill:#E94B3C,stroke:#B8341F,stroke-width:2px,rx:10,ry:10
    style D fill:#50C878,stroke:#2E7D4E,stroke-width:2px,rx:10,ry:10
    style E fill:#E94B3C,stroke:#B8341F,stroke-width:2px,rx:10,ry:10
    style F fill:#50C878,stroke:#2E7D4E,stroke-width:2px,rx:10,ry:10
    style G fill:#50C878,stroke:#2E7D4E,stroke-width:2px,rx:10,ry:10
```

### 各阶段详解

**1. 暂停标记开始(Pause Mark Start):**

<PaidCTA />