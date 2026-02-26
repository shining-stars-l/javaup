---
slug: /damai/tech-highlights/callable-future
description: "围绕《超详细的Callable_Future原理解析》，重点讲解Callable、Future、FutureTask、RunnableFuture 关系与异步任务执行模型等技术实现与源码细节。"
keywords: ["Callable", "Future", "FutureTask", "RunnableFuture", "异步任务模型", "阻塞获取结果", "任务取消", "并发控制"]
---

# 超详细的Callable_Future原理解析

import VipInline from '@site/src/components/VipInline';

## Callable/Future


### 介绍


`execute特点`



1. execute 只可以接收一个 Runnable 的参数
2. execute 如果出现异常会抛出
3. execute 没有返回值



`submit特点`



1. submit 可以接收 Runable 和 Callable 这两种类型的参数，
2. 对于 submit 方法，如果传入一个 Callable，可以得到一个 Future 的返回值
3. submit 方法调用不会抛异常，除非调用 Future.get



### 使用


```java
public static void testFutureTask() throws ExecutionException, InterruptedException {
        FutureTask task = new FutureTask(() -> {
            System.out.println("执行异步call方法");
            return 1;
        });
        new Thread(task).start();
        System.out.println("异步结果:"+task.get());
}
```



想一想我们为什么需要使用回调呢？那是因为结果值是由另一线程计算的，当前线程是不知道结果值什么时候计算完成，所以它传递一个回调接口给计算线程，当计算完成时，调用这个回调接口，回传结果值。



利用 FutureTask、 Callable、 Thread 对耗时任务（如查询数据库）做预处理，在需要计算结果之前就启动计算。


## 原理

### Callable、Future、FutureTask关系图

<VipInline />