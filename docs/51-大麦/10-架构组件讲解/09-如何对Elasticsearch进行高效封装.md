---
slug: /damai/architecture-components/elasticsearch-wrapper
description: "围绕《如何对Elasticsearch进行高效封装》，重点讲解全文搜索、复杂查询构建、聚合分析、实时搜索与Elasticsearch 7.x type变更适配等技术实现与工程落地细节。"
keywords: ["Elasticsearch封装", "全文搜索", "复杂查询构建", "聚合分析", "实时搜索", "7.x type变更", "自动装配", "索引检索"]
---

# 如何对Elasticsearch进行高效封装

import VipInline from '@site/src/components/VipInline';

## Elasticsearch 的功能和作用


Elasticsearch 是当今世界上最受欢迎的搜索引擎之一，广泛应用于日志分析、全文搜索、安全情报、业务分析等多个领域。它以其高性能、强大的数据分析能力和易用性而闻名。Elasticsearch 能够处理各种类型的数据，包括文本、数字、地理位置、结构化和非结构化数据。



### 核心功能


+ **全文搜索**: Elasticsearch 提供高级的全文搜索功能，包括多语言处理、自动类型推断、自然语言处理等，使得搜索结果更加准确和相关
+ **实时分析**: 与传统数据库相比，Elasticsearch 能够在数据写入的同时进行实时分析，为用户提供即时的业务洞察
+ **水平可扩展性**: Elasticsearch 可以轻松扩展到多个节点，无需更改应用程序代码，就能处理 PB 级别的数据
+ **高可用性和分布式**: Elasticsearch 的分布式特性使其具有高可用性和容错能力，即使在节点故障的情况下也能保证服务的连续性
+ **多租户能力**: 通过使用 Elasticsearch 的索引和别名功能，可以在单个 Elasticsearch 集群上支持多个租户的数据隔离



### 应用场景


+ **日志和事件数据分析**: Elasticsearch 被广泛用于收集、分析和可视化日志数据，帮助组织发现系统中的问题和优化机会
+ **网站搜索**: 提供网站内容的快速、相关搜索，改善用户体验
+ **安全情报**: 分析网络流量和用户行为，以检测恶意活动和安全威胁
+ **商业智能**: 对客户数据、市场趋势进行实时分析，支持决策制定



## 特点


Elasticsearch 的搜索能力是其最核心的功能之一，提供了从简单的文本匹配到复杂的聚合查询等广泛的搜索功能。它通过灵活的数据索引结构和强大的查询语言（Query DSL）来实现高效、精确的搜索结果。以下是 Elasticsearch 搜索能力的详细介绍：



### 全文搜索


Elasticsearch 强大的全文搜索能力是其最引人注目的特性之一。它使用了倒排索引（Inverted Index）来高效地存储和检索文本数据。用户可以进行模糊查询、词干匹配、同义词处理等，以及利用 Elasticsearch 提供的各种文本分析器来优化搜索结果的相关性



### 复杂查询构建


Elasticsearch 的 Query DSL 提供了丰富的查询构建块，允许用户执行精确匹配、范围查询、布尔查询、嵌套查询等复杂搜索操作。这些查询可以组合使用，构建出能够满足几乎任何搜索需求的复杂查询



### 聚合分析


除了搜索文档，Elasticsearch 还提供了强大的聚合功能，允许用户在搜索结果上进行统计分析。这包括但不限于计数、求和、平均值、最小/最大值等。聚合功能可以帮助用户洞察数据模式，支持复杂的数据分析需求



### 实时搜索


Elasticsearch 能够提供几乎实时的搜索体验。当文档被索引时，它几乎立即就可以被搜索到。这对于需要实时反馈的应用场景（如日志监控、社交媒体分析等）至关重要



## Elasticsearch的type问题


Elasticsearch存储数据是以每个索引index作为维度来存储的，可以理解成关系型数据库中的表，而字段是以文档document存在的，可以理解成表的字段



而在Elasticsearch6.x之前还存在type的概念，介于index和document之间



Elasticsearch6.x之前一个index下可以有多个不同的type，而在7.x开始就type的概念去掉了，采用同一个doc表示type，也就是一个index只能有一个type，这个type还必须是doc，而在8.x中，彻底将type的概念去除了



### 7.x为什么去掉了type？


#### 映射爆炸（Mapping Explosion）


在使用多类型时，如果不同类型之间有大量不同的字段，这会导致映射的数量急剧增加，进而引发映射爆炸问题。映射爆炸不仅会消耗大量的内存资源，还会降低 Elasticsearch 的性能，尤其是在处理大量数据时



#### 字段名冲突


在同一个index的不同type中，如果有相同名称但映射类型不同的字段，会造成字段名冲突。这是因为 Elasticsearch 在内部是将这些字段扁平化处理的，而不同类型的相同名称字段可能会导致数据解析和查询时的混乱



我们可以和关系型数据库来对比，在同一个数据库中，这些不同的表，可以有名称相同但类型不同的字段。而在 Elasticsearch 同一个index的不同type中，如果有不同document的字段名相同，但是类型不同，就会报错



#### 总结


综上所述，Elasticsearch 从 7.x 版本开始废弃类型的主要目的是为了提升系统的性能、避免映射爆炸和字段冲突的问题，以及简化数据模型的设计和管理。这一改变反映了 Elasticsearch 对于提高性能、可维护性和用户体验的持续追求



# 操作


Springboot提供了对Elasticsearch的操作，需要添加以下依赖



```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
</dependency>
```



但使用中还是有一些问题，在平时开发中还是使用关系型数据库更加普遍，对于数据库、表、字段的概念更为熟悉，也更加习惯对表概念的操作。而在操作Elasticsearch时，提供的api其实是很复杂的，各种操作的对象，如`SearchSourceBuilder` `FieldSortBuilder` `BoolQueryBuilder` 等等，操作上其实算不上简单，所以为了解决这个问题，本人在大麦网中在springboot操作Elasticsearch的基础上，进一步的封装，使用起来贴近于关系型数据库的方式，操作起来更加的容易上手


<VipInline />