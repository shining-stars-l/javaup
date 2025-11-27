---
slug: /java/jvm/jvm-diagnostic-tools
---

# JVM诊断分析工具实战

在Java应用的开发和运维过程中，性能问题、内存泄漏、线程死锁等故障时有发生。掌握JVM诊断工具的使用方法，能够快速定位问题根源，是每个Java工程师必备的技能。本文将深入讲解JDK自带的命令行工具和可视化工具的实战应用。

## JVM诊断工具全景图

```mermaid
graph TB
    A[JVM诊断工具体系] --> B[命令行工具]
    A --> C[可视化工具]
    A --> D[第三方工具]
    
    B --> B1[jps - 进程查看]
    B --> B2[jstat - 统计监控]
    B --> B3[jinfo - 配置查询]
    B --> B4[jmap - 堆转储]
    B --> B5[jstack - 线程分析]
    
    C --> C1[JConsole - 监控控制台]
    C --> C2[VisualVM - 多合一工具]
    C --> C3[JMC - 飞行记录器]
    
    D --> D1[MAT - 内存分析]
    D --> D2[Arthas - 在线诊断]
    D --> D3[JProfiler - 商业工具]
    
    style A fill:#5C6BC0,stroke:#3949AB,stroke-width:3px,color:#fff
    style B fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
    style C fill:#42A5F5,stroke:#1976D2,stroke-width:2px,color:#fff
    style D fill:#FFA726,stroke:#F57C00,stroke-width:2px,color:#fff
```

## JDK命令行工具详解

所有命令行工具都位于JDK安装目录的`bin`文件夹下，可直接在终端使用。

### jps：Java进程状态查看

`jps`（Java Virtual Machine Process Status Tool）用于列出当前系统中所有运行的Java进程。

```mermaid
flowchart LR
    A[执行jps命令] --> B{可选参数}
    B -->|无参数| C[显示进程ID和主类名]
    B -->|-l| D[显示完整类名/JAR路径]
    B -->|-m| E[显示main方法参数]
    B -->|-v| F[显示JVM启动参数]
    
    style A fill:#AB47BC,stroke:#7B1FA2,stroke-width:2px,color:#fff
    style C fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
    style D fill:#42A5F5,stroke:#1976D2,stroke-width:2px,color:#fff
    style E fill:#FFA726,stroke:#F57C00,stroke-width:2px,color:#fff
    style F fill:#EF5350,stroke:#C62828,stroke-width:2px,color:#fff
```

**基础使用示例：**

```bash
# 查看所有Java进程
$ jps
8234 OrderService
9156 ProductService
9832 Jps
10456 PaymentService

# 显示完整类名
$ jps -l
8234 com.example.order.OrderServiceApplication
9156 com.example.product.ProductServiceApplication
9832 sun.tools.jps.Jps
10456 com.example.payment.PaymentServiceApplication

# 查看JVM启动参数
$ jps -v
8234 OrderService -Xms2g -Xmx2g -XX:+UseG1GC

# 查看传递给main方法的参数
$ jps -m
9156 ProductService --spring.profiles.active=prod --server.port=8081
```

### jstat：虚拟机统计监控

`jstat`（JVM Statistics Monitoring Tool）实时监控JVM运行状态，包括类加载、内存、GC等信息。

**命令格式：**

```bash
jstat -<option> [-t] [-h<lines>] <vmid> [<interval> [<count>]]
```

- `option`：统计选项（gc、gcutil、class等）
- `-t`：输出时间戳列
- `-h<lines>`：每隔多少行输出一次表头
- `vmid`：虚拟机进程ID
- `interval`：查询间隔（毫秒）
- `count`：查询次数

**常用统计选项：**

```mermaid
graph LR
    A[jstat选项] --> B[-gc<br/>GC堆状态]
    A --> C[-gcutil<br/>GC统计摘要]
    A --> D[-gccapacity<br/>各代容量]
    A --> E[-gcnew<br/>新生代统计]
    A --> F[-gcold<br/>老年代统计]
    A --> G[-class<br/>类加载统计]
    A --> H[-compiler<br/>JIT编译统计]
    
    style A fill:#5C6BC0,stroke:#3949AB,stroke-width:3px,color:#fff
    style B fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
    style C fill:#42A5F5,stroke:#1976D2,stroke-width:2px,color:#fff
```

**实战示例：监控GC情况**

```bash
# 每隔2秒输出一次GC统计，共输出5次，每3行输出表头
$ jstat -gc -t -h3 8234 2000 5

Timestamp        S0C    S1C    S0U    S1U      EC       EU        OC         OU       MC     MU    CCSC   CCSU   YGC     YGCT    FGC    FGCT     GCT   
       156.2  25600.0 25600.0  0.0   12800.5 204800.0 156234.3  512000.0   89432.1  51200.0 48932.5 6400.0 5892.3    45    0.342     2    0.158    0.500
       158.2  25600.0 25600.0 8234.1   0.0   204800.0  98234.7  512000.0   92341.5  51200.0 49123.8 6400.0 5912.7    46    0.351     2    0.158    0.509
       160.2  25600.0 25600.0  0.0   15678.2 204800.0 178945.2  512000.0   95678.3  51200.0 49345.2 6400.0 5932.1    47    0.359     2    0.158    0.517

# 输出GC百分比统计
$ jstat -gcutil 8234 1000 3
  S0     S1     E      O      M     CCS    YGC     YGCT    FGC    FGCT     GCT   
  0.00  50.00  76.32  17.46  95.58  92.06     45    0.342     2    0.158    0.500
 32.15   0.00  48.05  18.03  95.71  92.19     46    0.351     2    0.158    0.509
  0.00  61.24  87.36  18.69  96.38  92.63     47    0.359     2    0.158    0.517
```

**字段说明：**
- **S0C/S1C**：Survivor0/1区容量（KB）
- **S0U/S1U**：Survivor0/1区已使用（KB）
- **EC/EU**：Eden区容量/已使用（KB）
- **OC/OU**：老年代容量/已使用（KB）
- **MC/MU**：元空间容量/已使用（KB）
- **YGC/YGCT**：Young GC次数/总耗时（秒）
- **FGC/FGCT**：Full GC次数/总耗时（秒）

### jinfo：配置信息查询

`jinfo`（Configuration Info for Java）用于实时查看和动态调整JVM配置参数。

**查看JVM参数：**

```bash
# 查看所有JVM参数和系统属性
$ jinfo 8234

# 查看指定参数值
$ jinfo -flag MaxHeapSize 8234
-XX:MaxHeapSize=2147483648

$ jinfo -flag UseG1GC 8234
-XX:+UseG1GC

# 查看所有可管理的参数
$ jinfo -flags 8234
```

**动态修改参数（无需重启）：**

```bash
# 开启GC日志打印
$ jinfo -flag +PrintGC 8234

# 关闭显式GC
$ jinfo -flag +DisableExplicitGC 8234

# 修改参数值
$ jinfo -flag HeapDumpPath=/tmp/dumps 8234
```

### jmap：堆内存转储

`jmap`（Memory Map for Java）生成堆内存快照文件，用于离线分析内存使用情况。

```mermaid
sequenceDiagram
    participant User as 用户
    participant JMap as jmap工具
    participant JVM as 目标JVM进程
    participant File as dump文件
    
    User->>JMap: 执行jmap命令
    JMap->>JVM: 请求生成堆转储
    JVM->>JVM: 暂停应用（STW）
    JVM->>JVM: 遍历堆内存
    JVM->>File: 写入dump文件
    File-->>User: 生成完成
    
    Note over JVM: 大堆可能耗时较长
```

**生成堆转储文件：**

```bash
# 生成堆dump文件（二进制格式）
$ jmap -dump:format=b,file=/tmp/heap_dump.hprof 8234
Dumping heap to /tmp/heap_dump.hprof ...
Heap dump file created [1234567890 bytes in 12.345 secs]

# 仅转储存活对象（触发Full GC）
$ jmap -dump:live,format=b,file=/tmp/heap_live.hprof 8234

# 查看堆内存摘要信息
$ jmap -heap 8234
```

**查看对象统计信息：**

```bash
# 统计各类对象的数量和占用空间
$ jmap -histo 8234 | head -20

 num     #instances         #bytes  class name
----------------------------------------------
   1:        145678       23456789  [C
   2:         56789       12345678  java.lang.String
   3:         34567        8901234  java.util.HashMap$Node
   4:         23456        7890123  com.example.order.Order
   5:         12345        6789012  java.util.concurrent.ConcurrentHashMap$Node
```

### jstack：线程快照分析

`jstack`（Stack Trace for Java）生成线程堆栈快照，用于诊断死锁、线程阻塞等问题。

**线程状态分类：**

```mermaid
graph TB
    A[Java线程状态] --> B[NEW<br/>新建]
    A --> C[RUNNABLE<br/>运行]
    A --> D[BLOCKED<br/>阻塞]
    A --> E[WAITING<br/>等待]
    A --> F[TIMED_WAITING<br/>限时等待]
    A --> G[TERMINATED<br/>终止]
    
    D -.原因.-> D1[等待获取锁]
    E -.原因.-> E1[wait/join/park]
    F -.原因.-> F1[sleep/wait timeout]
    
    style A fill:#5C6BC0,stroke:#3949AB,stroke-width:3px,color:#fff
    style C fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
    style D fill:#EF5350,stroke:#C62828,stroke-width:2px,color:#fff
    style E fill:#FFA726,stroke:#F57C00,stroke-width:2px,color:#fff
```

**基础使用：**

```bash
# 生成线程快照
$ jstack 8234 > thread_dump.txt

# 生成线程快照并显示锁信息
$ jstack -l 8234

# 强制生成快照（进程无响应时）
$ jstack -F 8234
```

**死锁诊断实战示例：**

假设有如下银行转账死锁场景：

```java
public class BankTransfer {
    private static final Object accountA = new Object(); // 账户A锁
    private static final Object accountB = new Object(); // 账户B锁

    public static void main(String[] args) {
        // 线程1：从A转账到B
        new Thread(() -> {
            synchronized (accountA) {
                System.out.println("Transaction-1 locked Account-A");
                try { Thread.sleep(100); } catch (InterruptedException e) {}
                
                System.out.println("Transaction-1 waiting for Account-B lock...");
                synchronized (accountB) {
                    System.out.println("Transaction-1 completed");
                }
            }
        }, "Transaction-1").start();

        // 线程2：从B转账到A
        new Thread(() -> {
            synchronized (accountB) {
                System.out.println("Transaction-2 locked Account-B");
                try { Thread.sleep(100); } catch (InterruptedException e) {}
                
                System.out.println("Transaction-2 waiting for Account-A lock...");
                synchronized (accountA) {
                    System.out.println("Transaction-2 completed");
                }
            }
        }, "Transaction-2").start();
    }
}
```

使用jstack检测死锁：

```bash
$ jstack 8234

Found one Java-level deadlock:
=============================
"Transaction-2":
  waiting to lock monitor 0x00007f8a1c004a00 (object 0x000000076ab12340, a java.lang.Object),
  which is held by "Transaction-1"
  
"Transaction-1":
  waiting to lock monitor 0x00007f8a1c004b50 (object 0x000000076ab12350, a java.lang.Object),
  which is held by "Transaction-2"

Java stack information for the threads listed above:
===================================================
"Transaction-2":
        at BankTransfer.lambda$main$1(BankTransfer.java:24)
        - waiting to lock <0x000000076ab12340> (a java.lang.Object)
        - locked <0x000000076ab12350> (a java.lang.Object)
        at java.lang.Thread.run(Thread.java:750)
        
"Transaction-1":
        at BankTransfer.lambda$main$0(BankTransfer.java:13)
        - waiting to lock <0x000000076ab12350> (a java.lang.Object)
        - locked <0x000000076ab12340> (a java.lang.Object)
        at java.lang.Thread.run(Thread.java:750)

Found 1 deadlock.
```

## JDK可视化工具实战

### JConsole：监控与管理控制台

JConsole是基于JMX（Java Management Extensions）的图形化监控工具，可直接监控本地和远程Java进程。

```mermaid
graph TB
    A[JConsole功能模块] --> B[概览<br/>Overview]
    A --> C[内存<br/>Memory]
    A --> D[线程<br/>Threads]
    A --> E[类<br/>Classes]
    A --> F[VM概要<br/>VM Summary]
    A --> G[MBean]
    
    C --> C1[堆/非堆使用情况<br/>各内存区详情<br/>强制GC]
    D --> D1[线程数统计<br/>线程状态<br/>死锁检测]
    E --> E1[类加载数量<br/>卸载统计]
    
    style A fill:#5C6BC0,stroke:#3949AB,stroke-width:3px,color:#fff
    style C fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
    style D fill:#EF5350,stroke:#C62828,stroke-width:2px,color:#fff
```

**启动JConsole：**

```bash
# 启动JConsole
$ jconsole

# 或在JDK目录下直接运行
$ $JAVA_HOME/bin/jconsole
```

**远程监控配置：**

在目标Java应用启动时添加JMX参数：

```bash
java -Dcom.sun.management.jmxremote \
     -Dcom.sun.management.jmxremote.port=9999 \
     -Dcom.sun.management.jmxremote.authenticate=false \
     -Dcom.sun.management.jmxremote.ssl=false \
     -Djava.rmi.server.hostname=192.168.1.100 \
     -jar application.jar
```

然后在JConsole中输入远程地址：`192.168.1.100:9999`

### VisualVM：多合一诊断工具

VisualVM是功能最强大的JVM可视化工具，整合了多种诊断能力。

**核心功能矩阵：**

```mermaid
graph LR
    A[VisualVM核心能力] --> B[监控<br/>Monitor]
    A --> C[线程<br/>Threads]
    A --> D[采样器<br/>Sampler]
    A --> E[性能分析<br/>Profiler]
    
    B --> B1[CPU/内存/类<br/>实时曲线图]
    C --> C1[线程时间线<br/>线程Dump<br/>死锁检测]
    D --> D1[CPU采样<br/>内存采样]
    E --> E1[方法级性能分析<br/>热点方法定位]
    
    style A fill:#5C6BC0,stroke:#3949AB,stroke-width:3px,color:#fff
    style E fill:#AB47BC,stroke:#7B1FA2,stroke-width:2px,color:#fff
```

**VisualVM插件扩展：**

- **Visual GC**：可视化GC过程和各内存区变化
- **BTrace**：动态字节码追踪
- **Thread Inspector**：增强线程分析

### MAT：内存分析神器

Eclipse Memory Analyzer Tool（MAT）是专业的堆转储文件分析工具。

**MAT分析流程：**

```mermaid
flowchart TD
    A[获取Heap Dump] --> B[MAT加载dump文件]
    B --> C[自动泄漏疑点报告]
    C --> D{发现可疑对象}
    
    D -->|是| E[查看支配树<br/>Dominator Tree]
    E --> F[分析对象引用链<br/>Path to GC Roots]
    F --> G[定位泄漏代码]
    
    D -->|否| H[OQL查询<br/>对象统计]
    H --> I[人工分析]
    
    style A fill:#AB47BC,stroke:#7B1FA2,stroke-width:2px,color:#fff
    style C fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
    style G fill:#EF5350,stroke:#C62828,stroke-width:2px,color:#fff
```

**MAT核心视图：**

1. **Histogram（直方图）**：按类统计对象数量和内存占用
2. **Dominator Tree（支配树）**：显示对象的保留堆大小
3. **Leak Suspects（泄漏疑点）**：自动分析可能的内存泄漏
4. **Top Consumers（大内存消耗者）**：快速定位占用内存最多的对象

**OQL查询示例：**

```sql
-- 查找所有String对象
SELECT * FROM java.lang.String

-- 查找长度超过1000的String
SELECT s, s.value.length FROM java.lang.String s WHERE s.value.length > 1000

-- 查找特定类的实例
SELECT * FROM com.example.order.Order WHERE status = "PENDING"
```

## 第三方诊断工具

### Arthas：阿里巴巴开源诊断利器

Arthas是功能强大的在线诊断工具，无需修改代码即可排查问题。

```mermaid
graph TB
    A[Arthas核心功能] --> B[dashboard<br/>实时面板]
    A --> C[thread<br/>线程分析]
    A --> D[jad<br/>反编译]
    A --> E[watch<br/>方法监控]
    A --> F[trace<br/>调用链路]
    A --> G[monitor<br/>方法统计]
    A --> H[tt<br/>时光隧道]
    
    E --> E1[观察方法入参<br/>返回值<br/>异常信息]
    F --> F1[统计方法耗时<br/>调用路径]
    H --> H1[记录方法调用<br/>支持重放]
    
    style A fill:#5C6BC0,stroke:#3949AB,stroke-width:3px,color:#fff
    style E fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
    style F fill:#42A5F5,stroke:#1976D2,stroke-width:2px,color:#fff
    style H fill:#AB47BC,stroke:#7B1FA2,stroke-width:2px,color:#fff
```

**快速启动：**

```bash
# 下载arthas启动脚本
$ curl -O https://arthas.aliyun.com/arthas-boot.jar

# 启动并选择进程
$ java -jar arthas-boot.jar
[INFO] arthas-boot version: 3.7.1
[INFO] Found existing java process, please choose one and input the serial number.
* [1]: 8234 com.example.order.OrderServiceApplication
  [2]: 9156 com.example.product.ProductServiceApplication
1
```

**常用命令示例：**

```bash
# 查看实时仪表盘
[arthas@8234]$ dashboard

# 查看最繁忙的5个线程
[arthas@8234]$ thread -n 5

# 查看线程8的堆栈
[arthas@8234]$ thread 8

# 反编译类
[arthas@8234]$ jad com.example.order.Order

# 观察方法执行（查看入参和返回值）
[arthas@8234]$ watch com.example.order.OrderService createOrder "{params, returnObj}" -x 3

# 追踪方法调用路径和耗时
[arthas@8234]$ trace com.example.order.OrderService createOrder

# 统计方法调用次数和耗时
[arthas@8234]$ monitor -c 5 com.example.order.OrderService createOrder
```

### JProfiler：商业级性能分析工具

JProfiler是功能强大的商业JVM分析工具，提供直观的可视化界面和丰富的分析功能。

**核心特性：**

```mermaid
graph LR
    A[JProfiler功能] --> B[实时内存分析]
    A --> C[CPU性能剖析]
    A --> D[线程分析]
    A --> E[数据库分析]
    
    B --> B1[内存泄漏检测<br/>对象分配热点<br/>GC分析]
    C --> C1[热点方法<br/>调用树<br/>火焰图]
    D --> D1[线程历史<br/>锁竞争<br/>死锁检测]
    E --> E1[SQL执行统计<br/>慢查询分析]
    
    style A fill:#5C6BC0,stroke:#3949AB,stroke-width:3px,color:#fff
    style B fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
    style C fill:#EF5350,stroke:#C62828,stroke-width:2px,color:#fff
```

## 工具选型与组合使用策略

### 不同场景的工具选择

```mermaid
graph TB
    A[问题类型] --> B[性能缓慢]
    A --> C[内存泄漏]
    A --> D[CPU飙高]
    A --> E[线程死锁]
    A --> F[频繁GC]
    
    B --> B1["1. jstack查线程<br/>2. Arthas trace<br/>3. JProfiler剖析"]
    C --> C1["1. jmap生成dump<br/>2. MAT分析<br/>3. VisualVM监控"]
    D --> D1["1. top -Hp定位线程<br/>2. jstack分析<br/>3. Arthas profiler"]
    E --> E1["1. jstack检测<br/>2. JConsole可视化<br/>3. Arthas thread"]
    F --> F1["1. jstat监控GC<br/>2. GC日志分析<br/>3. VisualGC可视化"]
    
    style A fill:#5C6BC0,stroke:#3949AB,stroke-width:3px,color:#fff
```

### 典型故障排查流程

**场景一：应用响应缓慢**

```mermaid
flowchart TD
    A[应用响应缓慢] --> B[jstat查看GC频率]
    B --> C{GC频繁?}
    
    C -->|是| D[分析GC日志<br/>调整堆内存参数]
    C -->|否| E[jstack查看线程状态]
    
    E --> F{发现BLOCKED?}
    F -->|是| G[检查锁竞争<br/>优化同步代码]
    F -->|否| H[Arthas trace<br/>定位慢方法]
    
    H --> I[优化业务逻辑<br/>数据库查询]
    
    style A fill:#EF5350,stroke:#C62828,stroke-width:3px,color:#fff
    style D fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
    style G fill:#FFA726,stroke:#F57C00,stroke-width:2px,color:#fff
    style I fill:#42A5F5,stroke:#1976D2,stroke-width:2px,color:#fff
```

**场景二：内存持续增长**

```mermaid
sequenceDiagram
    participant Admin as 运维人员
    participant Monitor as 监控系统
    participant JMap as jmap工具
    participant MAT as MAT工具
    participant Dev as 开发人员
    
    Monitor->>Admin: 内存告警
    Admin->>JMap: 生成堆转储
    JMap->>MAT: 加载dump文件
    MAT->>MAT: 分析Leak Suspects
    MAT->>MAT: 查看Dominator Tree
    MAT->>Admin: 定位泄漏对象
    Admin->>Dev: 提供分析报告
    Dev->>Dev: 修复内存泄漏
```

## 诊断工具最佳实践

### 命令行工具使用技巧

1. **组合使用命令**：先用`jps`定位进程，再用`jstat`监控，最后用`jmap/jstack`诊断
2. **避免频繁dump**：生成堆转储会暂停应用，生产环境需谨慎操作
3. **保留历史快照**：定期保存线程快照和GC日志，便于问题回溯
4. **自动化脚本**：编写监控脚本定时采集jstat数据，绘制趋势图

### 可视化工具使用建议

```mermaid
graph TB
    A[可视化工具选型] --> B[开发测试环境]
    A --> C[生产环境]
    
    B --> B1[首选VisualVM<br/>功能全面免费]
    B --> B2[深度分析用JProfiler<br/>商业工具更专业]
    
    C --> C1[远程监控用JConsole<br/>轻量级稳定]
    C --> C2[紧急排查用Arthas<br/>无侵入在线诊断]
    C --> C3[离线分析用MAT<br/>生成dump后分析]
    
    style A fill:#5C6BC0,stroke:#3949AB,stroke-width:3px,color:#fff
    style B1 fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
    style C2 fill:#AB47BC,stroke:#7B1FA2,stroke-width:2px,color:#fff
```

### 性能分析黄金法则

1. **先整体后局部**：先看整体资源使用（CPU、内存、GC），再深入方法级分析
2. **先现象后原因**：先观察现象（慢、OOM、死锁），再分析根本原因
3. **先工具后代码**：先用工具定位问题范围，再review代码细节
4. **对比基线数据**：记录正常状态下的性能基线，异常时对比分析
5. **生产环境谨慎**：避免使用会暂停应用的操作（如-dump:live），优先使用无侵入工具

## 实战案例：完整的性能调优流程

### 案例背景

某电商订单服务在促销期间出现响应缓慢，偶尔超时。

### 诊断步骤

```mermaid
flowchart TD
    A[问题：订单服务慢] --> B[Step1: jstat监控GC]
    B --> C[发现：Young GC频繁<br/>每2秒一次]
    
    C --> D[Step2: jmap -heap查看堆]
    D --> E[发现：新生代仅500MB<br/>Eden区快速填满]
    
    E --> F[Step3: 调整参数<br/>-Xmn2g扩大新生代]
    F --> G[Step4: 重启验证]
    
    G --> H[结果：GC间隔延长至30秒<br/>响应时间降低60%]
    
    style A fill:#EF5350,stroke:#C62828,stroke-width:3px,color:#fff
    style C fill:#FFA726,stroke:#F57C00,stroke-width:2px,color:#fff
    style E fill:#FF7043,stroke:#D84315,stroke-width:2px,color:#fff
    style H fill:#66BB6A,stroke:#388E3C,stroke-width:2px,color:#fff
```

### 诊断命令记录

```bash
# 1. 查找目标进程
$ jps -l
12345 com.ecommerce.OrderService

# 2. 监控GC情况（每秒输出一次）
$ jstat -gcutil 12345 1000
  S0     S1     E      O      M     YGC    FGC    GCT
 12.50   0.00  98.76  45.23  89.34  1523     3    12.456
  0.00  15.32  23.45  45.67  89.45  1524     3    12.467
  
# 3. 查看堆配置
$ jmap -heap 12345 | grep -A 5 "NewSize"
NewSize = 524288000 (500.0MB)
MaxNewSize = 524288000 (500.0MB)

# 4. 查看当前JVM参数
$ jinfo -flags 12345 | grep Xmn
-Xmn500m

# 5. 修改启动参数后重启，再次验证
$ jstat -gcutil 12345 1000
  S0     S1     E      O      M     YGC    FGC    GCT
  8.23   0.00  34.56  28.45  87.23   45     1     2.345
```

## 工具资源与学习路径

### 官方文档

- **JDK工具指南**：[Oracle JDK Tools Reference](https://docs.oracle.com/javase/8/docs/technotes/tools/)
- **VisualVM官网**：https://visualvm.github.io/
- **MAT用户指南**：https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/welcome.html
- **Arthas文档**：https://arthas.aliyun.com/doc/

### 推荐学习资源

1. **《Java性能权威指南》**：深入讲解JVM性能调优方法论
2. **《深入理解Java虚拟机》**：JVM原理与工具使用的经典教材
3. **GCEasy**：在线GC日志分析工具（https://gceasy.io/）
4. **FastThread**：在线线程dump分析工具（https://fastthread.io/）

## 总结

JVM诊断工具是Java应用性能调优和故障排查的利器。本文系统介绍了JDK自带的命令行工具（jps、jstat、jinfo、jmap、jstack）、可视化工具（JConsole、VisualVM）以及第三方工具（MAT、Arthas）的使用方法和实战技巧。

在实际工作中，应根据问题类型选择合适的工具组合：
- **性能问题**：jstat + Arthas trace + JProfiler
- **内存泄漏**：jmap + MAT
- **线程问题**：jstack + JConsole
- **GC调优**：GC日志 + VisualGC

掌握这些工具的使用，结合对JVM原理的深入理解，就能快速定位并解决各类生产环境问题，保障Java应用的稳定高效运行。记住，工具只是手段，理解问题本质才是关键。