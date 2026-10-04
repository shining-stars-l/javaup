---
slug: /agent-up-memory/external-capture/http-entry-and-envelope-validation
description: 按后端真实执行顺序讲解外部会话采集接口的报文读取、协议字段校验、完成证据检查、两条消息约束和异常响应映射。
keywords: [外部会话采集, AutomaticCaptureController, memory-capture/turns, 报文校验, 完成证据, 202, Agent Up Memory]
---

import VipInline from '@site/src/components/VipInline';

# 外部会话采集HTTP入口与报文校验

## 这一篇先看请求是怎么被处理的

外部客户端完成一轮对话后，请求 `POST /api/v1/memory-capture/turns`。这条接口只接收已经完成的“一问一答”，把 JSON 转成后端自己的 `Envelope`。项目、连接、召回 trace 和 L0 写入会在后面的模块里继续检查，这个 Controller 不直接写数据库。

我把这一段拆成四个动作，读源码时按这个顺序跟就不会乱了：

1. 读取请求体，限制整个 JSON 的大小。
2. 用 Jackson 解析 JSON，并拒绝重复字段。
3. 按白名单、类型、长度和消息顺序校验字段。
4. 调用 `AutomaticCaptureAdapter`，把结果转换成 202 收据，或者把异常转换成稳定的错误码。

![外部会话采集 HTTP 入口、报文校验与响应分支](/img/agent-up-memory/讲解/07-外部会话采集与L0落库/01-HTTP入口与报文分支.drawio.png)

<VipInline />
