---
slug: /ai-programming/claude-code/interview-playbook
title: "Claude Code面试追问与项目回答"
sidebar_label: "Claude Code面试追问与项目回答"
pagination_label: "Claude Code面试追问与项目回答"
description: "用一组连续追问串起Claude Code的Agent Loop、上下文、CLAUDE.md、Memory、Skills、Hooks、多Agent、权限与MCP，并以线上重复扣款排查展示项目题的证据链和回答方式。"
keywords: ["Claude Code面试题", "Claude Code原理", "Agent Loop", "上下文管理", "Skills", "Hooks", "MCP", "重复扣款", "项目面试"]
---

# Claude Code面试追问与项目回答

Claude Code 面试很少停在“用过哪些命令”。面试官听到 `/compact`、Skills、Hooks 这些名词后，通常会沿着运行原理、工程边界和真实项目继续追问。

这一篇我换一种讲法：把常见知识点放进一轮连续面试。每个回答后面都补上面试官可能继续追问的地方。小伙伴可以先自己说一遍，再对照代码、命令和项目案例检查有没有遗漏。

## 第一问：你怎么理解Claude Code

**面试官：Claude Code 和普通聊天机器人有什么区别？**

**候选人：** Claude Code 是运行在本地开发环境里的编码 Agent。它能够读取仓库、搜索代码、调用 Shell、修改文件、运行测试，再根据工具结果决定下一步。一次任务通常会循环多轮，直到完成、遇到权限边界，或者需要用户补充信息。

普通聊天场景里，模型给出文本就结束了。Claude Code 面对“修复库存接口的并发问题”时，可以自己建立计划、找入口、看测试、修改实现并执行验证。最后交付的重点也变了：用户需要看到具体改动和验证证据，光有一段看起来合理的答案还不够。

**面试官继续问：所以它只是给大模型套了一组工具吗？**

工具只是基础。真正让任务连续推进的还有上下文组织、权限决策、会话状态、规则加载、压缩、子任务调度和工具结果反馈。缺少这些运行时能力，模型拿到一堆函数后仍然很难稳定完成长任务。

![Claude Code运行时能力分层图](/img/ai-interview/claudecode/runtime-layers-interview.png)

## 第二问：Agent Loop每一轮发生了什么

**面试官：能不能把一次循环讲具体一点？**

**候选人：** 我会拆成六步：

1. 运行时把用户要求、规则、会话历史和可用工具整理给模型；
2. 模型判断当前缺什么信息，可能先搜索，也可能直接回答；
3. 模型提出工具调用，例如读取文件或运行测试；
4. 权限系统检查这次动作，必要时请求用户批准；
5. 工具执行，结果回到上下文；
6. 模型基于新证据继续循环，或者给出最终结果。

假设用户要求“定位订单导出为什么少了一列”。第一轮可能搜索导出入口，第二轮读取 DTO 和 Excel 注解，第三轮查看测试，第四轮修改模板并运行用例。模型每一轮看到的工具结果，会改变下一轮的判断。

**面试官继续问：模型怎么知道任务已经完成？**

完成条件一部分来自用户要求，一部分来自仓库规则和任务计划。高质量交付还要有可验证信号，例如测试通过、构建成功、生成文件能打开、接口返回符合预期。复杂团队可以用 Stop Hook 检查是否给出了验证证据，但 Hook 的判断标准必须清楚，防止会话反复循环。

## 第三问：上下文窗口为什么会影响代码质量

**面试官：Claude Code能访问整个仓库，为什么还会忘记前面的内容？**

**候选人：** 能访问仓库表示它随时可以调用工具去读，模型在某一轮真正处理的内容仍受上下文窗口限制。系统提示、`CLAUDE.md`、聊天历史、工具定义、文件内容、命令输出和模型回复都会占空间。

上下文变长以后，常见问题有三类：

- 早期约束经过多轮后权重变弱；
- 大段日志和重复文件挤占有效信息；
- 同一事实出现多个版本，模型拿错旧结论。

这类退化没有一个适用于所有任务的固定百分比。模型、内容类型、重复程度和任务难度都会影响结果。面试中把“到 40% 一定变差”说成产品保证，证据不够稳。

**面试官继续问：你会怎么控制？**

我会从工作方式控制：

1. 搜索后只读取相关片段，避免一上来塞整个仓库；
2. 长日志先过滤错误、时间段和关键ID；
3. 每完成一个阶段记录已确认事实、未确认问题和下一步；
4. 话题彻底切换时使用新 Session 或 `/clear`；
5. 长任务接近窗口压力时主动 `/compact`，给出保留重点；
6. 用 `/context` 查看当前上下文组成，找出占用最大的来源。

![ClaudeCode的Context命令](/img/ai-interview/claudecode/ClaudeCode的Context命令.png)

## 第四问：`/compact`会不会把关键信息弄丢

**面试官：压缩以后还能接着开发吗？**

**候选人：** 可以，但要给压缩后的状态留好锚点。`/compact` 会把较早的会话整理成摘要，释放上下文空间。摘要保留的是模型判断出来的关键信息，逐字聊天记录和部分中间细节不会继续完整出现在活跃上下文里。

我通常在压缩前写一个 Handoff：

```markdown
## 已确认
- 对账差异来自两个写入入口；
- consumer按message_id去重；
- repair-job按batch_id去重；
- ledger表缺少业务唯一索引。

## 已修改
- 暂无，当前只读调查。

## 下一步
1. 和业务确认唯一键是否为tenant_id + receipt_no + line_no；
2. 补并发复现测试；
3. 评估历史重复数据对建索引的影响。

## 不能做
- 未经确认不执行生产修数；
- 保留工作区里已有的本地改动。
```

压缩后先读取这个状态，再抽查关键代码位置。版本号、测试结果、用户明确禁止的动作和未提交改动，应该写得具体。

**面试官继续问：自动压缩和手动压缩的区别呢？**

自动压缩由运行时在上下文接近限制时触发，手动 `/compact` 由用户选择时机，还可以附带希望保留的关注点。长任务里我更愿意在一个阶段刚结束时主动压缩，此时因果关系比较清楚。

## 第五问：`CLAUDE.md`、Rules和Memory怎么分工

**面试官：团队规范应该写在哪里？**

**候选人：** 要先看规范的范围和生命周期。

| 内容 | 位置 | 举例 |
| --- | --- | --- |
| 项目长期规则 | 仓库中的 `CLAUDE.md` | 构建命令、架构边界、禁止修改的目录 |
| 目录或语言专项规则 | `.claude/rules/` | Java测试规范、数据库迁移要求 |
| 个人跨项目习惯 | 用户级 `~/.claude/CLAUDE.md` | 常用输出格式、个人工具偏好 |
| Claude积累的项目经验 | Auto Memory | 调试线索、反复使用的命令、项目习惯 |

`CLAUDE.md` 更像团队给 Agent 的长期操作手册，应该由人审查并进入版本管理。Auto Memory 是 Claude 在工作过程中积累的经验，内容会变化，适合记录可复用线索。临时任务要求仍放在当前 Prompt 或计划里。

**面试官继续问：Memory是不是每次把全部历史都塞进上下文？**

当前官方说明中，Auto Memory 启动时加载 `MEMORY.md` 的前 200 行或 25KB，其他 Topic files 按需读取。它采用索引加专题文件的方式，避免把所有记忆一次性灌进窗口。

Memory 里的信息也可能过期。例如原来项目使用 Maven，半年后迁到 Gradle，旧命令就会误导。重要规则还要回到仓库文件、构建脚本或官方资料核对。

![规则与记忆的生命周期图](/img/ai-interview/claudecode/rules-memory-lifecycle.png)

## 第六问：为什么已经有`CLAUDE.md`还需要Skills

**面试官：把部署步骤都写进 `CLAUDE.md` 不行吗？**

**候选人：** 可以写，但每次会话都携带一整套详细部署流程会消耗上下文，其他任务也会受到干扰。Skill 把一类任务的说明、脚本、模板和参考资料放在独立目录里，根据任务按需加载。

例如“审查数据库迁移”可以做成一个 Skill：

```markdown
---
name: review-db-migration
description: 审查数据库迁移脚本的锁表、回滚、历史脏数据和兼容性风险。
allowed-tools: Read, Grep, Glob, Bash
---

执行时：
1. 读取本次迁移及相邻版本；
2. 找对应实体和查询；
3. 检查唯一索引前的历史重复数据；
4. 运行只读校验脚本；
5. 输出风险、证据和回滚条件。
```

这个 Skill 只有遇到迁移审查时才展开。它还可以引用 `scripts/` 里的固定检查程序，减少模型临时拼命令带来的差异。

**面试官继续问：Skill和自定义命令是什么关系？**

当前 Claude Code 已把自定义命令并入 Skills 体系，原有 `.claude/commands/` 仍然兼容。回答时可以把 Skill 看成更完整的任务能力包：除了入口提示，还能带脚本、模板、参考文件、工具限制和模型选择。

## 第七问：Hooks和Skills会不会重复

**面试官：代码改完要自动跑检查，你会写Skill还是Hook？**

**候选人：** 如果用户主动发起一次“审查数据库迁移”，用 Skill；如果每次修改 `openapi.yaml` 都要自动执行兼容检查，用 `PostToolUse` Hook。Skill 描述一套可调用流程，Hook 绑定生命周期事件。

几个常见位置：

| 要求 | 机制 |
| --- | --- |
| 工具执行前检查生产命令 | `PreToolUse` |
| 文件修改后运行格式化或契约检查 | `PostToolUse` |
| Claude准备结束时核对测试证据 | `Stop` |
| 会话启动时注入动态环境信息 | `SessionStart` |

**面试官继续问：脚本返回 `exit 1` 能拦住危险命令吗？**

对大多数 Hook 事件，`exit 1` 属于非阻断错误，流程通常继续。策略型阻断一般使用 `exit 2`，原因写到 stderr。`exit 0` 表示 Hook 执行成功，还可以在 stdout 返回符合规范的结构化 JSON。

`PostToolUse` 发生时工具已经执行成功，即使 Hook 返回阻断反馈，也无法撤销刚才的副作用。生产写操作应在 `PreToolUse`、权限系统、基础设施权限或发布审批层提前拦截。

## 第八问：多Agent什么时候能提速

**面试官：遇到复杂问题，你会直接开多个Agent吗？**

**候选人：** 我先判断分支能否独立验收。日志调查、表结构审查、测试设计通常可以并行；多个 Agent 同时改一个核心 Service，冲突和返工会迅速增加。

我会这样选：

- Subagent：主 Agent 派专项搜索、审查或测试，结果回主线；
- `/subtask`：当前会话里可以后台完成的支线；
- `/fork`：复制当前上下文，开启一个独立 Session 探索另一条路线；
- Agent Teams：多个独立成员需要共享任务、彼此通信的多模块工作。

只读任务可以共享目录。并行写代码时，先检查工作区状态，再按分支使用 Git Worktree 隔离。Agent Teams 当前仍是实验能力，团队使用前要确认版本、开关和回退流程。

**面试官继续问：多Agent一定更快吗？**

等待时间可能缩短，总 Token、沟通和合并成本通常会上升。任务边界含糊、分支高度依赖、最终都修改同一文件时，单主线更省事。

## 第九问：怎样控制Claude Code的安全边界

**面试官：Prompt里写“禁止删除数据”够不够？**

**候选人：** 提示词能让模型理解要求，强制边界还要靠权限、Sandbox、系统账号和审批。Claude Code 在工具调用前会做权限判断，团队可以在设置里配置 allow、ask 和 deny 规则。

例如拒绝读取本地密钥和生产配置：

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./secrets/**)",
      "Read(./deploy/production/**)"
    ]
  }
}
```

规则要用当前官方支持的语法核对，不能凭感觉拼模式。更高一层还要让开发账号拿不到生产写权限。这样即使 Prompt、Hook 或某次判断失效，基础设施仍能挡住危险动作。

**面试官继续问：用了 `--dangerously-skip-permissions` 呢？**

它会跳过正常权限确认，风险很高，只适合外部已经提供强隔离的受控环境。日常开发机、含凭据环境和生产网络里不应该为了省几次确认就打开。

## 第十问：MCP在Claude Code里解决什么问题

**面试官：Claude Code已经能运行Shell，为什么还需要MCP？**

**候选人：** MCP 为模型提供标准化的外部工具和资源。例如读取设计系统、查询监控平台、访问工单、操作浏览器或调用内部知识服务。相比让模型临时猜 CLI 参数，MCP 工具可以给出明确的输入 Schema 和结构化返回。

以排查库存告警为例：代码在本地仓库，报警详情在监控平台，消息轨迹在内部链路系统。接入对应 MCP 后，Claude 可以围绕同一个 trace_id 串起这些证据，前提是权限和数据范围允许。

**面试官继续问：MCP Server是不是接得越多越好？**

MCP Server 的数量要按当前工作流控制。每个 Server 会带来工具描述、权限面、连接状态和选择成本。长期不用的工具会占上下文，也可能让模型选错相近能力。我一般按项目启用必要 Server，敏感写操作单独授权，定期清理失效连接。

MCP 工具返回成功只代表调用完成。监控查询可能时间范围选错，工单更新也可能写错对象，关键结果仍要做业务层验证。

![Claude Code通过MCP连接工程系统](/img/ai-interview/claudecode/mcp-ecosystem.png)

## 第十一问：你怎么判断一次Claude Code任务做得好不好

**面试官：模型说“已修复”，你会相信吗？**

**候选人：** 我会看交付证据。软件任务至少检查五项：

1. 修改范围和用户要求一致；
2. 根因能被代码、日志、数据或测试支持；
3. 修复覆盖失败路径和边界条件；
4. 运行了与风险相称的验证；
5. 工作区里原有改动没有被覆盖。

生成文档、表格、图片或页面时，还要检查最终成品。构建成功只能证明流程跑通，不能证明页面没有断图、Excel 能导入、流程图能读清。

**面试官继续问：测试通过就能交付吗？**

要看测试覆盖了什么。修并发问题只跑一个串行单测，证据偏弱；改数据库唯一索引却没检查历史重复数据，部署时仍可能失败；改前端样式只跑 TypeScript 编译，也看不到实际布局。验证要对准这次风险。

## 项目题：线上重复扣款怎样借助Claude Code排查

**面试官：说一个你用Claude Code处理复杂问题的例子。**

下面用订阅续费重复扣款来演示。回答项目题时，我会按照“现场、假设、证据、根因、修复、验证、边界”展开。这样面试官能听清 Claude Code 做了什么，也能看出工程决策仍然由人负责。

### 先把线上现场固定下来

报警显示同一个订阅在 800ms 内出现两笔成功扣款：

| 字段 | 第一笔 | 第二笔 |
| --- | --- | --- |
| `subscription_id` | `SUB-80317` | `SUB-80317` |
| `billing_period` | `2026-08` | `2026-08` |
| `request_id` | `schedule-9918` | `retry-2271` |
| `gateway_charge_id` | `CH-77102` | `CH-77103` |
| 入口 | 定时续费 | 失败补偿消费者 |

我先让 Claude Code 做只读调查，并明确禁止直接退款、改生产数据和执行部署：

```text
调查SUB-80317在2026-08账期的两次扣款。先只读：
1. 找定时续费和补偿消费者的入口；
2. 追踪request_id、幂等键和网关请求参数；
3. 查本地schema与迁移脚本中的唯一约束；
4. 输出带文件路径的时间线和仍未确认的事实。
不要修改生产数据，不要调用退款接口，不要部署。
```

这段任务说明给了同一业务样本、时间范围、检查点和权限边界。没有这些条件，Agent 可能在整个支付模块里漫无目的搜索。

### 再建立三个可证伪的假设

我会让 Claude Code 把“可能重复扣款”拆成具体假设：

1. 支付网关重放了同一个请求；
2. 内部消息被重复投递，消费者幂等失效；
3. 定时任务和补偿消费者使用不同请求ID，同时处理同一业务账期。

然后为每个假设找证据：

| 假设 | 支持证据 | 反证 |
| --- | --- | --- |
| 网关重放 | 两次请求的外部幂等键相同 | 网关产生了两个不同charge_id且幂等键不同 |
| 消息重复 | 两条消费记录的message_id相同 | 两个入口分别是scheduler和retry consumer |
| 两入口竞争 | subscription和billing_period相同，request_id不同 | 数据库已有业务唯一约束并命中冲突 |

实际代码里，两个入口最后都调用：

```java
public ChargeResult charge(ChargeCommand command) {
    if (chargeRecordRepository.existsByRequestId(command.requestId())) {
        return chargeRecordRepository.findByRequestId(command.requestId());
    }

    ChargeResult result = paymentGateway.charge(
        command.customerId(),
        command.amount(),
        command.requestId()
    );

    chargeRecordRepository.save(ChargeRecord.success(command, result));
    return result;
}
```

这个实现使用 `request_id` 做幂等。定时任务和补偿消息为同一账期生成了不同 `request_id`，所以两次检查都通过。`exists` 与外部扣款之间还有竞争窗口，即使 request_id 恰好相同，并发请求也可能同时越过查询。

### 根因要落到业务唯一性

这次扣款在业务上由三项确定：

```text
tenant_id + subscription_id + billing_period
```

原实现把一次技术请求的 ID 当成续费业务键。两个入口各自生成请求 ID 后，幂等保护失效；数据库也没有业务唯一索引，支付网关收到的幂等键仍然是 request_id，最后形成两笔真实扣款。

完整因果链是：

```text
定时续费与补偿消费者同时触发
  → 为同一账期生成两个request_id
  → 两次existsByRequestId都查不到记录
  → 网关收到两个不同幂等键
  → 网关分别完成扣款
  → 本地保存两条成功记录
```

![重复扣款并发时序图](/img/ai-interview/claudecode/duplicate-charge-sequence.png)

### 修复要同时覆盖本地和外部副作用

只给数据库加索引还不够。如果代码先请求支付网关、后保存本地记录，唯一索引只能挡住第二次保存，外部第二笔扣款已经发生。

我会把修复拆成三层：

1. 用业务键在本地原子认领账期；
2. 用同一个稳定业务键生成支付网关幂等键；
3. 用状态机和重试处理“本地已认领、调用网关时进程退出”。

数据库先加业务唯一约束：

```sql
ALTER TABLE subscription_charge
ADD CONSTRAINT uk_subscription_billing_cycle
UNIQUE (tenant_id, subscription_id, billing_period);
```

在执行这条迁移前，必须扫描历史重复数据。生产表已有重复记录时，建索引会直接失败。数据清理方案还要经过财务和支付团队确认，Claude Code 只能帮忙生成查询、归类样本和审查脚本，不能自行决定退款。

服务层可以改成按账期认领：

```java
@Transactional
public ChargeRecord claimBillingCycle(ChargeCommand command) {
    BillingCycleKey cycleKey = BillingCycleKey.of(
        command.tenantId(),
        command.subscriptionId(),
        command.billingPeriod()
    );

    try {
        return chargeRecordRepository.insertPending(cycleKey, command.amount());
    } catch (DuplicateKeyException duplicate) {
        return chargeRecordRepository.findByCycleKey(cycleKey)
            .orElseThrow(() -> new IllegalStateException(
                "账期记录已被认领，但暂时无法读取：" + cycleKey
            ));
    }
}
```

调用支付网关时使用稳定的外部幂等键：

```java
public String gatewayIdempotencyKey(BillingCycleKey key) {
    return String.join(":",
        "subscription-renewal",
        key.tenantId(),
        key.subscriptionId(),
        key.billingPeriod().toString()
    );
}
```

如果进程在网关成功后、更新本地状态前崩溃，重试仍使用相同网关幂等键，并主动查询网关结果。`PENDING`、`CHARGING`、`SUCCEEDED`、`FAILED_RETRYABLE` 等状态如何转换，要结合支付渠道能力设计。

### 并发测试要复现两个不同入口

普通串行测试无法证明竞争窗口已经消失。我会让 Claude Code 先生成测试骨架，再人工检查同步点和断言：

```java
@Test
void shouldChargeOnceWhenSchedulerAndRetryConsumerRace() throws Exception {
    CountDownLatch ready = new CountDownLatch(2);
    CountDownLatch start = new CountDownLatch(1);

    Callable<ChargeRecord> scheduler = () -> {
        ready.countDown();
        start.await();
        return renewalJob.charge("tenant-a", "SUB-80317", YearMonth.of(2026, 8));
    };

    Callable<ChargeRecord> retryConsumer = () -> {
        ready.countDown();
        start.await();
        return retryHandler.charge("tenant-a", "SUB-80317", YearMonth.of(2026, 8));
    };

    Future<ChargeRecord> first = executor.submit(scheduler);
    Future<ChargeRecord> second = executor.submit(retryConsumer);

    assertTrue(ready.await(2, TimeUnit.SECONDS));
    start.countDown();

    ChargeRecord firstResult = first.get();
    ChargeRecord secondResult = second.get();

    assertEquals(firstResult.id(), secondResult.id());
    assertEquals(1, gatewayStub.chargeCount());
    assertEquals(1, chargeRecordRepository.countByCycle(
        "tenant-a", "SUB-80317", YearMonth.of(2026, 8)
    ));
}
```

这个测试同时断言本地只有一个账期记录、网关只调用一次、两个入口拿到同一业务结果。真实项目还要加进程崩溃恢复、网关超时、网关成功但本地更新失败、消息重复投递和跨节点并发测试。

### Claude Code在项目中承担了哪些工作

面试回答里要把工具作用说清楚。我会这样说明：

- Claude Code 搜索两个入口和公共调用链，整理带文件位置的证据；
- 读取迁移脚本和 Repository，确认缺少业务唯一索引；
- 依据生产样本还原并发时间线；
- 生成并发测试骨架和候选修复；
- 运行局部测试、模块测试和迁移校验；
- 我负责确认业务唯一键、支付渠道幂等语义、历史数据处理和上线审批。

这个边界能避免把项目讲成“Agent 自动修好了一切”。面试官真正关心的是你有没有控制范围、验证根因、处理外部副作用和评估上线风险。

### 上线前还要过哪些检查

1. 查询历史上相同业务键的重复记录，形成处理清单；
2. 在生产数据快照上演练唯一索引迁移；
3. 确认网关幂等键长度、字符和保留时间；
4. 检查旧版本与新版本滚动发布期间的兼容性；
5. 为账期认领冲突、网关重试和状态滞留增加监控；
6. 准备回滚方案，避免回滚代码后无法识别新状态；
7. 重复扣款的退款名单由支付与财务审核。

![重复扣款修复后的状态机与恢复流程](/img/ai-interview/claudecode/charge-recovery-state.png)

## 遇到追问时先别急着只说术语

如果面试官继续问“为什么选 Hook”“为什么不用 Agent Teams”“为什么不能只加唯一索引”，先回到这个项目的约束：动作发生在哪个生命周期、任务是否真的能独立、外部扣款是否已经产生副作用。

一个好回答通常能给出三样东西：可定位的证据、明确的工程边界、与风险匹配的验证。Claude Code 相关名词很多，最后仍要落到这三项。

## 参考资料

- [Claude Code 官方文档：How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)
- [Claude Code 官方文档：Manage Claude's memory](https://code.claude.com/docs/en/memory)
- [Claude Code 官方文档：Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Claude Code 官方文档：Hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code 官方文档：Create custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code 官方文档：Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams)
- [Claude Code 官方文档：Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code 官方文档：Manage permissions](https://code.claude.com/docs/en/permissions)
