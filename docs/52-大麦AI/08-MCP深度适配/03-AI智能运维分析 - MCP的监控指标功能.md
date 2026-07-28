---
slug: /damai-ai/mcp/metrics
description: "MCP监控指标能力落地，说明AI助手如何接入Prometheus与Grafana指标数据，完成性能分析、异常识别与运维决策辅助。"
keywords: ["MCP指标查询", "Prometheus", "Grafana", "监控指标", "时序数据分析", "性能观测", "异常识别", "AI运维助手"]
---

import VipInline from '@site/src/components/VipInline';

# AI智能运维分析 - MCP的监控指标功能

## 前提准备
### 搭建 prometheus 和 grafana
大麦AI需要从 prometheus 来获取对应的数据，grafana 是用来可视化显示，所以需要把这这两个搭建好，搭建教程：

[项目集成prometheus和grafana](/damai/getting-started/prometheus-grafana)

# 项目功能实现
## 1. 项目架构概述
本项目采用 **Spring AI + MCP（Model Context Protocol）** 架构，实现AI智能运维监控分析功能。核心模块包括：

| 模块 | 说明 |
| --- | --- |
| damai-core-service | AI核心服务，提供智能对话能力 |
| damai-mcp-metrics-service | MCP监控指标服务，提供系统监控查询工具 |


<VipInline />
