---
slug: /damai/tech-highlights/countdownlatch-cyclicbarrier
title: "并发编程工具CountDownLatch和CyclicBarrier介绍：Semaphore详解"
sidebar_label: "并发编程工具CountDownLatch和CyclicBarrier介绍"
pagination_label: "并发编程工具CountDownLatch和CyclicBarrier介绍"
description: "围绕《并发编程工具CountDownLatch和CyclicBarrier介绍》，重点讲解CountDownLatch、CyclicBarrier、Semaphore 以及线程协同与并发同步控制等技术实现与工程实践。内容进一步围绕并发同步工具、线程门栓、await与countDown、栅栏同步、并发控制等关键主题展开。"
keywords: ["CountDownLatch", "CyclicBarrier", "Semaphore", "并发同步工具", "线程门栓", "await与countDown", "栅栏同步", "并发控制"]
---

# 并发编程工具CountDownLatch和CyclicBarrier介绍

import VipInline from '@site/src/components/VipInline';

## 线程门栓 CountDownLatch


### 介绍


从字面意思可以理解为类似一个`门栓`，能够使一个线程等待其余线程执行完后，此线程再继续执行。



### 特点


是通过一个`计数器`来实现的，`计数器`的初始值是`线程的数量`。每当一个线程执行完毕后，`计数器`的值就`-1`，当`计数器`的值为`0`时，表示所有线程都执行完毕，然后之前等待的线程就可以恢复工作了。



### 常用的方法


```java
/**
* 构造器
* @param count 计数次数
*/
public CountDownLatch(int count)
/**
* 阻塞等待，当计数不为0会一直等待
*/
public void await()
/**
* 阻塞等待
* @param timeout 等待的时间
* @param unit 时间单位
*/
public boolean await(long timeout, TimeUnit unit)
/**
* 将计数减1
*/
public void countDown()
```



## 举例1


对一个原子类的变量进行统计自增，主线程开启两个线程对这个变量自增加1，两个线程执行完后，主线程再对这个变量自增加1



```java
public static void testCountDownLatch(){
    long startTime = System.currentTimeMillis();
    
    AtomicInteger count = new AtomicInteger(0);
    
    //设置countDownLatch要计数的次数
    CountDownLatch countDownLatch = new CountDownLatch(2);

    new Thread(() -> {
        try {
            Thread.sleep(1000);
            count.incrementAndGet();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }finally {
            //计数器减1
            countDownLatch.countDown();
        }
    }).start();
    new Thread(() -> {
        try {
            Thread.sleep(1000);
            count.incrementAndGet();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }finally {
            //计数器减1
            countDownLatch.countDown();
        }
    }).start();

    try {
        countDownLatch.await();
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    }

    count.incrementAndGet();
    long endTime = System.currentTimeMillis();
    System.out.println("==次数:"+count.get()+",执行时间:"+(endTime - startTime)+"==");
}
```

<VipInline />