---
slug: /super-agent/mcp/source-code-analysis
description: "结合 office-mcp-client 与 office-mcp-server，深入剖析 Spring AI MCP 的真实调用链路"
keywords: ["MCP源码分析", "Spring AI源码", "工具调用原理", "ChatModel", "SyncMcpToolCallback"]
---

import VipInline from '@site/src/components/VipInline';

# MCP调用链路源码解密

前面几篇我们已经把 MCP Server 和 Client 跑起来了，但上一篇对“源码调用链路”的描述还是偏通用，容易把 Spring AI 的公共机制和本项目的真实实现混在一起。

这一篇就不只讲一些概念了，以之前的项目里的这两个模块为准，把链路重新梳理一遍：

- `ai-example-spring-ai-office-mcp-client`
- `ai-example-spring-ai-office-mcp-server`

我们要回答的问题也很具体：

- 用户发一句“帮我查下 E10086 2025-03 的考勤”，请求先落到哪里？
- Client 端的 MCP 工具是什么时候发现的？是在模型返回 `tool_calls` 之后，还是更早？
- Server 端的 `@Tool` 方法，是怎样变成 `/mcp` 接口可调用工具的？
- 工具执行完以后，结果是怎么回到大模型，再生成最终自然语言回答的？

## 从对话入口端来入手

### Client 端：`office-mcp-client`

```java
@RestController
@RequestMapping("/api/assistant")
public class AssistantController {

    private final AssistantService assistantService;

    @PostMapping("/chat")
    public ChatResponse chat(@RequestBody ChatRequest request) {
        String response = assistantService.chat(request.message());
        return new ChatResponse(response);
    }
}
```

```java
@Service
public class AssistantService {

    private final ChatModel chatModel;
    private final SyncMcpToolCallbackProvider toolCallbackProvider;

    private ChatClient chatClient;

    @PostConstruct
    public void init() {
        ToolCallback[] toolCallbacks = toolCallbackProvider.getToolCallbacks();

        this.chatClient = ChatClient.builder(chatModel)
                .defaultToolCallbacks(toolCallbacks)
                .build();
    }

    public String chat(String userMessage) {
        return chatClient.prompt()
                .user(userMessage)
                .call()
                .content();
    }
}
```

所以这套示例的真实入口是：

`AssistantController -> AssistantService -> ChatClient`

### Server 端：`office-mcp-server`

这个模块不是手写一个 `/mcp` Controller，而是交给 Spring AI Starter 自动暴露。

```java
@Configuration
public class McpServerConfig {

    @Bean
    public ToolCallbackProvider attendanceToolProvider(AttendanceTools attendanceTools) {
        return MethodToolCallbackProvider.builder()
                .toolObjects(attendanceTools)
                .build();
    }

    @Bean
    public ToolCallbackProvider meetingRoomToolProvider(MeetingRoomTools meetingRoomTools) {
        return MethodToolCallbackProvider.builder()
                .toolObjects(meetingRoomTools)
                .build();
    }
}
```

以及具体的 `@Tool` 方法：

```java
@Service
public class AttendanceTools {

    @Tool(description = "查询员工的考勤记录，包括出勤天数、迟到次数、早退次数、请假天数。")
    public String checkAttendance(String employeeId, String month) {
        ...
    }
}
```

```java
@Service
public class MeetingRoomTools {

    @Tool(description = "查询指定会议室在某天的预订情况和空闲时段。")
    public String queryRoomSchedule(String roomId, String date) {
        ...
    }
}
```

所以 Server 侧真正暴露出去的工具，来自：

- `AttendanceTools.checkAttendance`
- `AttendanceTools.clockIn`
- `MeetingRoomTools.queryRoomSchedule`
- `MeetingRoomTools.bookMeetingRoom`
- `MeetingRoomTools.cancelBooking`

<VipInline />
