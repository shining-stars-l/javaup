---
slug: /damai-ai/mcp/log
title: "AI智能运维分析 - MCP的分布式日志检索功能：MCP日志检索、ELK、故障定位详解"
sidebar_label: "AI智能运维分析 - MCP的分布式日志检索功能"
pagination_label: "AI智能运维分析 - MCP的分布式日志检索功能"
description: "MCP分布式日志检索实战，讲解AI助手如何通过ELK链路查询多服务日志，实现故障定位、异常聚合与智能化运维排障分析。内容进一步围绕MCP日志检索、Elasticsearch查询、智能排障、运维分析等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目实践建议与技术面试要…"
keywords: ["MCP日志检索", "ELK", "Elasticsearch查询", "分布式日志", "故障定位", "异常聚合", "智能排障", "运维分析"]
---

# AI智能运维分析 - MCP的分布式日志检索功能

import VipInline from '@site/src/components/VipInline';

## 前提准备
### 大麦项目上报日志到ELK中
此日志数据需要从大麦项目上报，所以需要启动大麦项目，并每个服务中的log4j2.xml中的上报功能开启（默认给注释了）

<img src="/img/damai-ai/mcp-分布式日志/1.png" alt="表关系" width="100%" />

### 搭建ELK
需要搭建 ElasticSearch、Logstash、Kibana，这三个一起就叫做 ELK，因为 Logstash 在配置启动时的索引必须要配置，这样就没办法让这个索引实现可配置化了，**<span style={{color:'#DF2A3F'}}>所以需要小伙伴自己来搭建ELK了</span>**。

搭建教程地址：

[如何安装项目需要的中间件环境](/damai/getting-started/install-dependencies)

### 访问ELK
搭建好ELK后，启动大麦项目的服务，就可以将日志上报给ELK了，接着进入Kibana中，来创建日志视图进行查看日志

**选择左侧菜单 Management 下的 Stack Management**

<img src="/img/damai-ai/mcp-分布式日志/2.png" alt="表关系" width="100%" />

**选择 数据视图，创建数据视图**

<img src="/img/damai-ai/mcp-分布式日志/3.png" alt="表关系" width="100%" />

**名称输入 damai-logs，索引模式输入 damai-logs-*，然后点击 保存数据视图到Kibana**

<img src="/img/damai-ai/mcp-分布式日志/4.png" alt="表关系" width="100%" />

**点击 Analytics 下的 Discover，就可以查看日志信息了**

<img src="/img/damai-ai/mcp-分布式日志/5.png" alt="表关系" width="100%" />

<VipInline />
