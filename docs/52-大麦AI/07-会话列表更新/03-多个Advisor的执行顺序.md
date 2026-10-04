---
slug: /damai-ai/conversation-list/advisor-order
title: "多个Advisor的执行顺序：Advisor执行顺序、order优先级、before回调链详解"
sidebar_label: "多个Advisor的执行顺序"
pagination_label: "多个Advisor的执行顺序"
description: "多个Advisor执行顺序解析，讲解order优先级对before/after回调链的影响，并给出标题更新与会话记忆协同的时序控制方法。内容进一步围绕before回调链、拦截器时序、标题更新时机、Spring AI等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目实…"
keywords: ["Advisor执行顺序", "order优先级", "before回调链", "after回调链", "拦截器时序", "标题更新时机", "会话记忆协同", "Spring AI"]
---

# 多个Advisor的执行顺序

import VipInline from '@site/src/components/VipInline';


确定采用自定义 advisor 的方案后，那就要考虑是在 before 方法中执行：还是 after 方法执行？所以要弄清楚 多个 advisor 的执行顺序

官网关于 advisor 的详细介绍：[https://docs.spring.io/spring-ai/reference/api/advisors.html](https://docs.spring.io/spring-ai/reference/api/advisors.html)

<img src="/img/damai-ai/会话标题/advisor.png" alt="表关系" width="100%" />

当涉及 **多个 Advisor** 的时候，理解 **before 和 after 的执行顺序** 是非常重要的。

Advisor 的执行流程和拦截器链（Interceptor Chain）类似，多个 Advisor 是有顺序的，且遵循 **责任链模式**。

<VipInline />
