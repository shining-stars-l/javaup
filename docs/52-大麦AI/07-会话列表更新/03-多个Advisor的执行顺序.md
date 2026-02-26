---
slug: /damai-ai/conversation-list/advisor-order
---

# 多个Advisor的执行顺序

import VipInline from '@site/src/components/VipInline';


确定采用自定义 advisor 的方案后，那就要考虑是在 before 方法中执行：还是 after 方法执行？所以要弄清楚 多个 advisor 的执行顺序

官网关于 advisor 的详细介绍：[https://docs.spring.io/spring-ai/reference/api/advisors.html](https://docs.spring.io/spring-ai/reference/api/advisors.html)

<!-- 这是一张图片，ocr 内容为：PROMPT CHATRESPONSE 1 PROMPT TO ADVISEDRESPONSE ADVISEDREQUEST TO CHATRESPONSE ADVISEDREQUEST ADVISEDRESPONSE AROUNDADVISOR(S) 2 5 BEFORE AFTER ADVISING ADVISING ADVISEDREQUEST ADVISEDRESPONSE AROUNDADVISOR (INTERNAL) 3 PROMPT CHATRESPONSE CHAT MODEL -->
![](https://cdn.nlark.com/yuque/0/2025/png/22643320/1750151774524-3a1eb118-e264-42c2-bca3-6b4899da4df1.png)

当涉及 **多个 Advisor** 的时候，理解 **before 和 after 的执行顺序** 是非常重要的。

Advisor 的执行流程和拦截器链（Interceptor Chain）类似，多个 Advisor 是有顺序的，且遵循 **责任链模式**。

## 执行顺序总结
假设有 3 个 Advisor：`Advisor A`、`Advisor B`、`Advisor C`

顺序注册为：

```plain
A -> B -> C -> AI 模型执行
```

### 执行流程：
| 阶段 | 执行顺序 |
| --- | --- |
| before 阶段 | A.before -> B.before -> C.before |
| AI 执行 | 调用 AI 模型 |
| after 阶段 | C.after -> B.after -> A.after |


✅ 重点记忆：

+ **before 是顺序执行（从外到内）**
+ **after 是逆序执行（从内到外，栈式回溯）**

---

## 详细执行流程图
```plain
调用入口
   │
A.before
   │
B.before
   │
C.before
   │
AI 模型执行
   │
C.after
   │
B.after
   │
A.after
   │
返回结果
```


## ChatTypeTitleAdvisor 的 adviseStream 方法
按道理说 ChatTypeTitleAdvisor 实现了 after 方法后就可以实现想要的功能了，为什么还要再需要实现 adviseStream 方法？它是干什么用的？

首先我们不实现 adviseStream 方法，还是只实现 before 和 after 这两个方法，看一下 ChatTypeTitleAdvisor 和 MessageChatMemoryAdvisor 的执行顺序

## 实际执行的顺序
```plain
调用入口
   │
ChatTypeTitleAdvisor.before
   │
MessageChatMemoryAdvisor.before
   │
AI 模型执行
   │
ChatTypeTitleAdvisor.after
   │
MessageChatMemoryAdvisor.after
   │
返回结果
```



当实际debug的时候会发现 MessageChatMemoryAdvisor.after 会在 ChatTypeTitleAdvisor.after 之后执行，这不对啊？之前讲解的时候不是说了类似栈结构吗，先进后出吗？那么按道理来说 MessageChatMemoryAdvisor.after 会在 ChatTypeTitleAdvisor.after 之前执行的啊



其实答案就是这个 **adviseStream** 方法，先看一下 MessageChatMemoryAdvisor 的 adviseStream 方法

```java
public Flux<ChatClientResponse> adviseStream(ChatClientRequest chatClientRequest,
        StreamAdvisorChain streamAdvisorChain) {
    // Get the scheduler from BaseAdvisor
    Scheduler scheduler = this.getScheduler();

    // Process the request with the before method
    return Mono.just(chatClientRequest)
        .publishOn(scheduler)
        .map(request -> this.before(request, streamAdvisorChain))
        .flatMapMany(streamAdvisorChain::nextStream)
        .transform(flux -> new ChatClientMessageAggregator().aggregateChatClientResponse(flux,
                response -> this.after(response, streamAdvisorChain)));
}
```



这个方法的关键点在这里：

```java
.transform(flux -> new ChatClientMessageAggregator().aggregateChatClientResponse(flux,
                response -> this.after(response, streamAdvisorChain)));
```

ChatClientMessageAggregator 负责响应流的聚合，聚合完成后才进入 after。



**说白了就是 MessageChatMemoryAdvisor 会等待其他的 Advisor 执行完 after 方法后，再执行 MessageChatMemoryAdvisor 的 after 方法。**

## 想要的执行顺序是这样
```plain
调用入口
   │
ChatTypeTitleAdvisor.before
   │
MessageChatMemoryAdvisor.before
   │
AI 模型执行
   │
MessageChatMemoryAdvisor.after
   │
ChatTypeTitleAdvisor.after
   │
返回结果
```



**所以让 ChatTypeTitleAdvisor 也和 MessageChatMemoryAdvisor 一样，也实现 adviseStream 方法。这样对冲一下，结果还是可以让 ChatTypeTitleAdvisor 的 after 靠后执行了**

## 修改前端
到这里后端的逻辑就搞定了，接着就是需要修改前端了，要写个方法 checkAndUpdateChatTitles

```javascript
// 检查并更新聊天标题
const checkAndUpdateChatTitles = async () => {
  try {
    // 检查是否有标题为"新的对话"的聊天记录
    const hasNewChatTitle = chatHistory.value.some(chat => 
      chat.title === '新的对话'
    )
    
    if (!hasNewChatTitle) {
      return
    }
    
    // 调用接口获取聊天记录列表
    const chatListData = await chatAPI.chatTypeHistoryList(2)
    
    // 检查响应是否有内容
    if (!chatListData || (Array.isArray(chatListData) && chatListData.length === 0)) {
      return
    }
    
    // 更新聊天记录标题
    if (Array.isArray(chatListData)) {
      // 使用 forEach 修改数组元素，然后强制触发更新
      let hasUpdated = false
      
      for (let i = 0; i < chatHistory.value.length; i++) {
        const chat = chatHistory.value[i]
        const matchedChat = chatListData.find(apiChat => apiChat.id === chat.id)
        
        if (matchedChat && matchedChat.title && matchedChat.title.trim()) {
          // 直接修改对象属性并创建新引用
          chatHistory.value[i] = { 
            ...chat, 
            title: matchedChat.title 
          }
          hasUpdated = true
        }
      }
      
      // 如果有更新，强制触发响应式更新
      if (hasUpdated) {
        // 触发数组的响应式更新
        triggerRef(chatHistory)
        await nextTick()
      }
    }
  } catch (error) {
    console.error('检查并更新聊天标题失败:', error)
  }
}
```

判断页面上已经有的会话列表标题是否是 新的对话，如果是的话，调用后端接口获取到会话列表，更新到对应的会话标题上

在页面加载完毕和进行ai对话完毕的时候，会调用此方法


<VipInline />