---
slug: /tech-sharing/sentinel/sentinel/principles
---

# Sentinel基本原理以及核心类介绍

## 架构图

![sentinel-slot-chain-architecture.png](/img/technologySharing/sentinel/架构图.png)

## ProcessorSlotChain

Sentinel 的核心骨架，如上图结构，将不同的 Slot 按照顺序串在一起（责任链模式），从而将不同的功能（限流、降级、系统保护）组合在一起。slot chain 其实可以分为两部分：统计数据构建部分（statistic）和判断部分（rule checking）

## Context

Context 代表调用链路上下文，贯穿一次调用链路中的所有 Entry。Context 维持着入口节点（entranceNode）、本次调用链路的 curNode、调用来源（origin）等信息。Context 名称即为调用链路入口名称。

Context 维持的方式：通过 ThreadLocal 传递，只有在入口 enter 的时候生效。由于 Context 是通过 ThreadLocal 传递的，因此对于异步调用链路，线程切换的时候会丢掉 Context，因此需要手动通过 ContextUtil.runOnContext(context, f) 来变换 context。

**简要的概括就是：**

Context是对资源操作的上下文，每个资源操作必须属于一个Context。如果代码中没有指定Context，则会创建一个name为sentinel_default_context的默认Context。一个Context生命周期中可以包含多个资源操作。Context生命周期中的最后一个资源在exit()时会清理该Conetxt，这也就意味着这个Context生命周期结束了。

**代码举例**

```java
// 创建一个来自于appA访问的Context，
// entranceOne为Context的name
ContextUtil.enter("entranceOne", "appA");
// Entry就是一个资源操作对象
Entry resource1 = null;
Entry resource2 = null;
try {
	// 获取资源resource1的entry
	resource1 = SphU.entry("resource1");
	// 代码能走到这里，说明当前对资源resource1的请求通过了流控
	// 对资源resource1的相关业务处理。。。
	// 获取资源resource2的entry
	resource2 = SphU.entry("resource2");
	// 代码能走到这里，说明当前对资源resource2的请求通过了流控
	// 对资源resource2的相关业务处理。。。
} catch (BlockException e) {
// 代码能走到这里，说明请求被限流，
// 这里执行降级处理
} finally {
	if (resource1 != null) {
		resource1.exit();
	}
	if (resource2 != null) {
		resource2.exit();
	}
}
// 释放Context
ContextUtil.exit();
```

```java
// 创建另一个来自于appA访问的Context，
// entranceTwo为Context的name
ContextUtil.enter("entranceTwo", "appA");
// Entry就是一个资源操作对象
Entry resource3 = null;
try {
	// 获取资源resource2的entry
	resource2 = SphU.entry("resource2");
	// 代码能走到这里，说明当前对资源resource2的请求通过了流控
	// 对资源resource2的相关业务处理。。。
	// 获取资源resource3的entry
	resource3 = SphU.entry("resource3");
	// 代码能走到这里，说明当前对资源resource3的请求通过了流控
	// 对资源resource3的相关业务处理。。。
} catch (BlockException e) {
// 代码能走到这里，说明请求被限流，
// 这里执行降级处理
} finally {
	if (resource2 != null) {
		resource2.exit();
	}
	if (resource3 != null) {
		resource3.exit();
	}
}
// 释放Context
ContextUtil.exit();
```

## Entry

每一次资源调用都会创建一个 `Entry`。`Entry` 包含了资源名、curNode（当前统计节点）、originNode（来源统计节点）等信息。

CtEntry 为普通的 Entry，在调用 SphU.entry(xxx) 的时候创建。特性：Linked entry within current context（内部维护着 parent 和 child）

`需要注意的一点：`CtEntry 构造函数中会做`调用链的变换`，即将当前 Entry 接到传入 Context 的调用链路上（setUpEntryFor）。

资源调用结束时需要 entry.exit()。exit 操作会过一遍 slot chain exit，恢复调用栈，exit context 然后清空 entry 中的 context 防止重复调用。

## Node

**Sentinel 里面的各种种类的统计节点**

- `Node` 用于完成数据统计的接口
- `StatisticNode` 最为基础的统计节点，包含秒级和分钟级两个滑动窗口结构，是Node接口的实现类，用于完成数据统计
- `EntranceNode` 入口节点，特殊的链路节点，对应某个 Context 入口的所有调用数据。Constants.ROOT 节点也是入口节点。也就是一个Context会有一个入口节点，用于统计当前Context的总体流量数据
- `DefaultNode` 链路节点，用于统计调用链路上某个资源的数据，维持树状结构。也就是说用于统计一个资源在当前Context中的流量数据
- `ClusterNode` 簇点，用于统计每个资源全局的数据（不区分调用链路），以及存放该资源的按来源区分的调用数据（类型为 StatisticNode）。特别地，Constants.ENTRY_NODE 节点用于统计全局的入口资源数据。也就是说用于统计一个资源在所有Context中的总体流量数据

**构建的时机**

- `EntranceNode` 在 `ContextUtil.enter(xxx)` 的时候就创建了，然后塞到 Context 里面。
- `NodeSelectorSlot` 根据 context 创建 `DefaultNode`，然后 set curNode to context。
- `ClusterBuilderSlot` 首先根据 resourceName 创建 `ClusterNode`，并且 set clusterNode to defaultNode；然后再根据 origin 创建来源节点（类型为 `StatisticNode`），并且 set originNode to curEntry。

**几种 Node 的维度（数目）**

- `ClusterNode` 的维度是 resource
- `DefaultNode` 的维度是 resource * context，存在每个 NodeSelectorSlot 的 map 里面
- `EntranceNode` 的维度是 context，存在 ContextUtil 类的 contextNameNodeMap 里面
- 来源节点（类型为 `StatisticNode`）的维度是 resource * origin，存在每个 ClusterNode 的 `originCountMap` 里面

**Node关系图**

![](/img/technologySharing/sentinel/Node关系图.png)

## slot

- `NodeSelectorSlot`  负责收集资源的路径，并将这些资源的调用路径，以树状结构存储起来，用于根据调用路径来限流降。
- `ClusterBuilderSlot` 用于存储资源的统计信息以及调用者信息，例如该资源的 RT, QPS, thread count，Block count，Exception count 等等，这些信息将用作为多维度限流，降级的依据。简单来说，就是用于构建
ClusterNode。
- `StatisticSlot` 用于记录、统计不同纬度的 runtime 指标监控信息 
   - `StatisticSlot` 是 Sentinel 最为重要的类之一，用于根据规则判断结果进行相应的统计操作
   - entry 的时候：依次执行后面的判断 slot。每个 slot 触发流控的话会抛出异常（`BlockException` 的子类）。若有 `BlockException` 抛出，则记录 block 数据；若无异常抛出则算作可通过（pass），记录 pass 数据
   - exit 的时候：若无 error（无论是业务异常还是流控异常），记录 complete（success）以及 RT，线程数-1
   - 记录数据的维度：线程数+1、记录当前 DefaultNode 数据、记录对应的 originNode 数据（若存在 origin）、累计 IN 统计数据（若流量类型为 IN）
- `ParamFlowSlot` 对应热点流控
- `FlowSlot` 用于根据预设的限流规则以及前面 slot 统计的状态，来进行流量控制。对应流控规则
- `AuthoritySlot` 根据配置的黑白名单和调用来源信息，来做黑白名单控制。对应授权规则
- `DegradeSlot` 通过统计信息以及预设的规则，来做熔断降级。对应降级规则
- `SystemSlot` 通过系统的状态，例如 load1 等，来控制总的入口流量。对应系统规则

## spi机制

Sentinel槽链中各Slot的执行顺序是固定好的。但并不是绝对不能改变的。Sentinel将ProcessorSlot 作
为 SPI 接口进行扩展，使得 SlotChain 具备了扩展能力。用户可以自定义Slot并编排Slot 间的顺序。
![](/img/technologySharing/sentinel/spi机制.png)

### 官网描述
开发者可以在用同一个 sentinel-core 的基础上自行扩展接口实现，从而可以方便地根据业务需求给 Sentinel 添加自定义的逻辑。目前 Sentinel 提供如下的扩展点：

- 初始化过程扩展：提供 InitFunc SPI接口，可以添加自定义的一些初始化逻辑，如动态规则源注册等。
- Slot/Slot Chain 扩展：用于给 Sentinel 功能链添加自定义的功能并自由编排。
- 指标统计扩展（StatisticSlot Callback）：用于扩展 StatisticSlot 指标统计相关的逻辑。
- Transport 扩展：提供 CommandHandler、CommandCenter 等接口，用于对心跳发送、监控 API Server 进行扩展。
- 集群流控扩展：可以方便地定制 token client/server 自定义实现，可参考[对应文档](https://github.com/alibaba/Sentinel/wiki/%E9%9B%86%E7%BE%A4%E6%B5%81%E6%8E%A7#%E6%89%A9%E5%B1%95%E6%8E%A5%E5%8F%A3%E8%AE%BE%E8%AE%A1)
- 日志扩展：用于自定义 record log Logger，可用于对接 slf4j 等标准日志实现。
  ![](/img/technologySharing/sentinel/官网描述.png)
