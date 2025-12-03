---
slug: /tech-sharing/netty-source/netty-pipeline-part-3
---

# Netty中pipeline分析_3
## 传播inbound事件

### 概述

有关于`inbound`事件, 在概述中做过简单的介绍, 就是以自己为基准, 流向自己的事件, 比如最常见的`channelRead`事件, 就是对方发来数据流的所触发的事件, 己方要对这些数据进行处理, 这一小节, 以激活`channelRead`为例讲解有关`inbound`事件的处理流程。

在业务代码中, 我们自己的`handler`往往会通过重写`channelRead`方法来处理对方发来的数据, 那么对方发来的数据是如何走到`channelRead`方法中了呢, 也是我们这一小节要剖析的内容。

在业务代码中, 传递`channelRead`事件方式是通过`fireChannelRead`方法进行传播的。

## 两种写法

```java
public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
    //写法1:
    ctx.fireChannelRead(msg);
    //写法2
    ctx.pipeline().fireChannelRead(msg);
}
```

这里重写了`channelRead`方法, 并且方法体内继续通过`fireChannelRead`方法进行传播`channelRead`事件, 那么这两种写法有什么异同?

我们先以写法2为例, 将这种写法进行剖析。

这里首先获取当前`context`的`pipeline`对象, 然后通过`pipeline`对象调用自身的`fireChannelRead`方法进行传播, 因为默认创建的`DefaultChannelpipeline`。

## DefaultChannelPipeline.fireChannelRead(msg)

```java
public final ChannelPipeline fireChannelRead(Object msg) {
    AbstractChannelHandlerContext.invokeChannelRead(head, msg);
    return this;
}
```

这里首先调用的是`AbstractChannelHandlerContext`类的静态方法`invokeChannelRead`, 参数传入`head`节点和事件的消息

### AbstractChannelHandlerContext.invokeChannelRead(head, msg)

```java
static void invokeChannelRead(final AbstractChannelHandlerContext next, Object msg) {
    final Object m = next.pipeline.touch(ObjectUtil.checkNotNull(msg, "msg"), next);
    EventExecutor executor = next.executor();
    if (executor.inEventLoop()) {
        next.invokeChannelRead(m);
    } else {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                next.invokeChannelRead(m);
            }
        });
    }
}
```

这里的`m`通常就是我们传入的`msg`, 而`next`, 目前是`head`节点, 然后再判断是否为当前`eventLoop`线程, 如果不是则将方法包装成`task`交给`eventLoop`线程处理

### AbstractChannelHandlerContext.invokeChannelRead(m)

```java
private void invokeChannelRead(Object msg) {
    if (invokeHandler()) {
        try {
            ((ChannelInboundHandler) handler()).channelRead(this, msg);
        } catch (Throwable t) {
            notifyHandlerException(t);
        }
    } else {
        fireChannelRead(msg);
    }
}
```

首先通过`invokeHandler()`判断当前`handler`是否已添加, 如果添加, 则执行当前`handler`的`chanelRead`方法, 其实这里就明白了, 通过`fireChannelRead`方法传递事件的过程中, 其实就是找到相关`handler`执行其`channelRead`方法, 由于我们在这里的`handler`就是`head`节点, 所以我们跟到`HeadContext`的`channelRead`方法中

### HeadContext的channelRead方法

```java
public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
    //向下传递channelRead事件
    ctx.fireChannelRead(msg);
}
```

在这里我们看到, 这里通过`fireChannelRead`方法继续往下传递`channelRead`事件, 而这种调用方式, 就是我们刚才分析用户代码的第一种调用方式

```java
public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
    //写法1:
    ctx.fireChannelRead(msg);
    //写法2
    ctx.pipeline().fireChannelRead(msg);
}
```

这里直接通过`context`对象调用`fireChannelRead`方法, 那么和使用`pipeline`调用有什么区别的, 我会回到`HeadConetx`的`channelRead`方法, 我们来剖析`ctx.fireChannelRead(msg)`这句, 大家就会对这个问题有答案了, 跟到`ctx`的`fireChannelRead`方法中, 这里会走到`AbstractChannelHandlerContext`类中的`fireChannelRead`方法中

## AbstractChannelHandlerContext.fireChannelRead(msg)

```java
public ChannelHandlerContext fireChannelRead(final Object msg) {
    invokeChannelRead(findContextInbound(), msg);
    return this;
}
```

这里我们看到, `invokeChannelRead`方法中传入了一个`findContextInbound()`参数, 而这`findContextInbound`方法其实就是找到当前`Context`的下一个节点

### AbstractChannelHandlerContext.findContextInbound()

```java
private AbstractChannelHandlerContext findContextInbound() {
    AbstractChannelHandlerContext ctx = this;
    do {
        ctx = ctx.next;
    } while (!ctx.inbound);
    return ctx;
}
```

这里的逻辑也比较简单, 是通过一个`doWhile`循环, 找到当前`handlerContext`的下一个节点, 这里要注意循环的终止条件, `while (!ctx.inbound)`表示下一个`context`标志的事件不是`inbound`的事件, 则循环继续往下找, 言外之意就是要找到下一个标注`inbound`事件的节点

有关事件的标注, 之前已经进行了分析, 如果是用户定义的`handler`, 是通过`handler`继承的接口而定的, 如果`tail`或者`head`, 那么是在初始化的时候就已经定义好, 这里不再赘述

回到`AbstractChannelHandlerContext.fireChannelRead(msg)`

## AbstractChannelHandlerContext.fireChannelRead(msg)

```java
public ChannelHandlerContext fireChannelRead(final Object msg) {
    invokeChannelRead(findContextInbound(), msg);
    return this;
}
```

找到下一个节点后, 继续调用`invokeChannelRead`方法, 传入下一个和消息对象

### AbstractChannelHandlerContext.invokeChannelRead(final AbstractChannelHandlerContext next, Object msg)

```java
static void invokeChannelRead(final AbstractChannelHandlerContext next, Object msg) {
    final Object m = next.pipeline.touch(ObjectUtil.checkNotNull(msg, "msg"), next);
    EventExecutor executor = next.executor();
    if (executor.inEventLoop()) {
        next.invokeChannelRead(m);
    } else {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                next.invokeChannelRead(m);
            }
        });
    }
}
```

这里的逻辑我们又不陌生了, 因为我们传入的是当前`context`的下一个节点, 所以这里会调用下一个节点`invokeChannelRead`方法, 因我们刚才剖析的是`head`节点, 所以下一个节点有可能是用户添加的`handler`的包装类`HandlerConext`的对象

### AbstractChannelHandlerContext.invokeChannelRead(Object msg)

```java
private void invokeChannelRead(Object msg) {
    if (invokeHandler()) {
        try { 
            ((ChannelInboundHandler) handler()).channelRead(this, msg);
        } catch (Throwable t) {
            //发生异常的时候在这里捕获异常
            notifyHandlerException(t);
        }
    } else {
        fireChannelRead(msg);
    }
}
```

又是我们熟悉的逻辑, 调用了自身`handler`的`channelRead`方法, 如果是用户自定义的`handler`, 则会走到用户定义的`channelRead()`方法中去, 所以这里就解释了为什么通过传递`channelRead`事件, 最终会走到用户重写的`channelRead`方法中去

同样, 也解释了该小节最初提到过的两种写法的区别

```java
public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
    //写法1:
    ctx.fireChannelRead(msg);
    //写法2
    ctx.pipeline().fireChannelRead(msg);
}
```

- 写法1是通过当前节点往下传播事件
- 写法2是通过头节点往下传递事件
- 所以, 在`handler`中如果要在`channelRead`方法中传递`channelRead`事件, 一定要采用写法1的方式向下传递, 或者交给其父类处理, 如果采用2的写法则每次事件传输到这里都会继续从`head`节点传输, 从而陷入死循环或者发生异常
- 还有一点需要注意, 如果用户代码中`channelRead`方法, 如果没有显示的调用`ctx.fireChannelRead(msg)`那么事件则不会再往下传播, 则事件会在这里终止, 所以如果我们写业务代码的时候要考虑有关资源释放的相关操作

如果`ctx.fireChannelRead(msg)`则事件会继续往下传播, 如果每一个`handler`都向下传播事件, 当然, 根据我们之前的分析`channelRead`事件只会在标识为`inbound`事件的`HandlerConetext`中传播, 传播到最后, 则最终会调用到`tail`节点的`channelRead`方法

## tailConext的channelRead方法

```java
public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
    onUnhandledInboundMessage(msg);
}
```

### onUnhandledInboundMessage(msg)

```java
protected void onUnhandledInboundMessage(Object msg) {
    try {
        logger.debug(
                "Discarded inbound message {} that reached at the tail of the pipeline. " +
                        "Please check your pipeline configuration.", msg);
    } finally {
        //释放资源
        ReferenceCountUtil.release(msg);
    }
}
```

这里做了释放资源的相关的操作

到这里，对于`inbound`事件的传输流程以及`channelRead`方法的执行流程已经分析完毕。

## 传播outBound事件

### 概述

有关于`outBound`事件, 和`inbound`正好相反，以自己为基准, 流向对方的事件, 比如最常见的`wirte`事件

在业务代码中, , 有可能使用wirte方法往写数据

```java
public void channelActive(ChannelHandlerContext ctx) throws Exception {
    ctx.channel().write("test data");
}
```

当然, 直接调用`write`方法是不能往对方`channel`中写入数据的, 因为这种方式只能写入到缓冲区, 还要调用`flush`方法才能将缓冲区数据刷到`channel`中, 或者直接调用`writeAndFlush`方法, 有关逻辑, 我们会在后面章节中详细讲解, 这里只是以`wirte`方法为例为了演示`outbound`事件的传播的流程

## 两种写法

```java
public void channelActive(ChannelHandlerContext ctx) throws Exception {
    //写法1
    ctx.channel().write("test data");
    //写法2
    ctx.write("test data");
}
```

这两种写法有什么区别, 首先分析第一种写法

```java
//这里获取ctx所绑定的channel
ctx.channel().write("test data");
```

## AbstractChannel.write(Object msg)

```java
public ChannelFuture write(Object msg) {
	//这里pipeline是DefaultChannelPipeline
    return pipeline.write(msg);
}
```

继续跟踪`DefaultChannelPipeline.write(msg)`

### DefaultChannelPipeline.write(msg)

```java
public final ChannelFuture write(Object msg) {
    //从tail节点开始(从最后的节点往前写)
    return tail.write(msg);
}
```

这里调用`tail`节点`write`方法, 这里我们应该能分析到, `outbound`事件, 是通过`tail`节点开始往上传播的。

其实`tail`节点并没有重写`write`方法, 最终会调用其父类`AbstractChannelHandlerContext.write方法`

### AbstractChannelHandlerContext.write(Object msg)

```java
public ChannelFuture write(Object msg) { 
    return write(msg, newPromise());
}
```

这里有个`newPromise()`这个方法, 这里是创建一个`Promise`对象, 有关`Promise`的相关知识会在以后章节进行分析，继续分析`write`

### AbstractChannelHandlerContext.write(final Object msg, final ChannelPromise promise)

```java
public ChannelFuture write(final Object msg, final ChannelPromise promise) {
    /**
     * 省略
     * */
    write(msg, false, promise);
    return promise;
}
```

### AbstractChannelHandlerContext.write(Object msg, boolean flush, ChannelPromise promise)

```java
private void write(Object msg, boolean flush, ChannelPromise promise) { 
    AbstractChannelHandlerContext next = findContextOutbound();
    final Object m = pipeline.touch(msg, next);
    EventExecutor executor = next.executor();
    if (executor.inEventLoop()) {
        if (flush) {
            next.invokeWriteAndFlush(m, promise);
        } else {
            //没有调flush
            next.invokeWrite(m, promise);
        }
    } else {
        AbstractWriteTask task;
        if (flush) {
            task = WriteAndFlushTask.newInstance(next, m, promise);
        }  else {
            task = WriteTask.newInstance(next, m, promise);
        }
        safeExecute(executor, task, promise, m);
    }
}
```

这里跟我们之前分析过`channelRead`方法有点类似, 但是事件传输的方向有所不同, 这里`findContextOutbound()`是获取上一个标注`outbound`事件的`HandlerContext`

### AbstractChannelHandlerContext.findContextOutbound()

```java
private AbstractChannelHandlerContext findContextOutbound() {
    AbstractChannelHandlerContext ctx = this;
    do {
        ctx = ctx.prev;
    } while (!ctx.outbound);
    return ctx;
}
```

这里的逻辑跟之前的`findContextInbound()`方法有点像, 只是过程是反过来的

在这里, 会找到当前`context`的上一个节点, 如果标注的事件不是`outbound`事件, 则继续往上找, 意思就是找到上一个标注`outbound`事件的节点

回到`AbstractChannelHandlerContext.write方法`

```java
AbstractChannelHandlerContext next = findContextOutbound();
```

这里将找到节点赋值到`next`属性中，因为我们之前分析的`write`事件是从`tail`节点传播的, 所以上一个节点就有可能是用户自定的`handler`所属的`context`

然后判断是否为当前`eventLoop`线程, 如果是不是, 则封装成`task`异步执行, 如果不是, 则继续判断是否调用了`flush`方法, 因为我们这里没有调用, 所以会执行到`next.invokeWrite(m, promise)`

### AbstractChannelHandlerContext.invokeWrite(Object msg, ChannelPromise promise)

```java
private void invokeWrite(Object msg, ChannelPromise promise) {
    if (invokeHandler()) {
        invokeWrite0(msg, promise);
    } else {
        write(msg, promise);
    }
}
```

这里会判断当前`handler`的状态是否是添加状态, 这里返回的是`true`, 将会走到`invokeWrite0(msg, promise)`这一步

### AbstractChannelHandlerContext.invokeWrite0(Object msg, ChannelPromise promise)

```java
private void invokeWrite0(Object msg, ChannelPromise promise) {
    try {
        //调用当前handler的wirte()方法
        ((ChannelOutboundHandler) handler()).write(this, msg, promise);
    } catch (Throwable t) {
        notifyOutboundHandlerException(t, promise);
    }
}
```

这里的逻辑也似曾相识, 调用了当前节点包装的`handler`的`write`方法, 如果用户没有重写`write`方法, 则会交给其父类处理

### ChannelOutboundHandlerAdapter.write

```java
public void write(ChannelHandlerContext ctx, Object msg, ChannelPromise promise) throws Exception {
    ctx.write(msg, promise);
}
```

这里调用了当前`ctx`的`write`方法, 这种写法和我们小节开始的写法是相同的, 我们回顾一下

```java
public void channelActive(ChannelHandlerContext ctx) throws Exception {
    //写法1
    ctx.channel().write("test data");
    //写法2
    ctx.write("test data");
}
```

我们跟到其`write`方法中, 这里走到的是`AbstractChannelHandlerContext`类的`write`方法

### AbstractChannelHandlerContext.write(Object msg, boolean flush, ChannelPromise promise)

```java
private void write(Object msg, boolean flush, ChannelPromise promise) { 
    AbstractChannelHandlerContext next = findContextOutbound();
    final Object m = pipeline.touch(msg, next);
    EventExecutor executor = next.executor();
    if (executor.inEventLoop()) {
        if (flush) {
            next.invokeWriteAndFlush(m, promise);
        } else {
            //没有调flush
            next.invokeWrite(m, promise);
        }
    } else {
        AbstractWriteTask task;
        if (flush) {
            task = WriteAndFlushTask.newInstance(next, m, promise);
        }  else {
            task = WriteTask.newInstance(next, m, promise);
        }
        safeExecute(executor, task, promise, m);
    }
}
```

又是我们所熟悉逻辑, 找到当前节点的上一个标注事件为`outbound`事件的节点, 继续执行`invokeWrite`方法, 根据之前的剖析, 我们知道最终会执行到上一个`handler`的`write`方法中。

走到这里已经不难理解, `ctx.channel().write("test data")`其实是从`tail`节点开始传播写事件, 而`ctx.write("test data")`是从自身开始传播写事件。

所以, 在`handler`中如果重写了`write`方法要传递`write`事件, 一定采用`ctx.write("test data")`这种方式或者交给其父类处理处理, 而不能采用`ctx.channel().write("test data")`这种方式, 因为会造成每次事件传输到这里都会从`tail`节点重新传输, 导致不可预知的错误。

如果用代码中没有重写`handler`的`write`方法, 则事件会一直往上传输, 当传输完所有的`outbound`节点之后, 最后会走到`head`节点的`wirte`方法中。

### HeadContext.write

```java
public void write(ChannelHandlerContext ctx, Object msg, ChannelPromise promise) throws Exception {
    unsafe.write(msg, promise);
}
```

我们看到`write`事件最终会流向这里, 通过`unsafe`对象进行最终的写操作

## inbound事件和outbound事件的传输流程图

![](/img/technologySharing/netty/inbound事件和outbound事件的传输流程图.png)