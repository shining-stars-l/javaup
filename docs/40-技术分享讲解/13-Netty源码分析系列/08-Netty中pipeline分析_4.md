---
slug: /tech-sharing/netty-source/netty-pipeline-part-4
---

# Netty中pipeline分析_4

## 异常处理的场景

```java
@Override
public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
    throw new Exception("throw Exception");
}
@Override
public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
    System.out.println(cause.getMessage());
}
```

我们在`handler`的`channelRead`方法中主动抛出异常, 模拟程序中出现异常的场景, 经测试会发现, 程序最终会走到`exceptionCaught`方法中, 获取异常对象并打印其信息

那么抛出异常之后, 是如何走到`exceptionCaught`方法的呢?

我们回顾之前小节`channelRead`事件的传播流程, `channelRead`方法是在`AbstractChannelHandlerContext`类的`invokeChannelRead`方法中被调用

## AbstractChannelHandlerContext.invokeChannelRead

```java
private void invokeChannelRead(Object msg) {
    if (invokeHandler()) {
        try {
            //调用了当前handler的channelRead方法, 其实就是head对象调用自身的channelRead方法
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

这里不难看出, 当调用户自定义的`handler`的`channelRead`方法发生异常之后, 会被捕获, 并调用`notifyHandlerException`方法, 并传入异常对象, 也就是我们示例中抛出的异常

### AbstractChannelHandlerContext.notifyHandlerException(Throwable cause)

```java
private void notifyHandlerException(Throwable cause) {

    //代码省略

    invokeExceptionCaught(cause);
}
```

### AbstractChannelHandlerContext.invokeExceptionCaught(final Throwable cause)

```java
private void invokeExceptionCaught(final Throwable cause) {
    if (invokeHandler()) {
        try {
            //当前handler调用exceptionCaught()方法
            handler().exceptionCaught(this, cause);
        } catch (Throwable error) {
            //代码省略
        }
    } else {
        fireExceptionCaught(cause);
    }
}
```

走到这里一切都明白了, 这里调用了当前`handler`的`exceptionCaught`方法, 也就是我们重写的`exceptionCaught`方法

知道了为什么会走到`exceptionCaught`方法之后, 我们再进行剖析异常事件的传播流程

## 两种写法

```java
@Override
public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
    System.out.println(cause.getMessage());
}
@Override
public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
    //写法1
    ctx.fireChannelRead(cause);
    //写法2
    ctx.pipeline().fireExceptionCaught(cause);
}
```

这两种写法我们并不陌生, 可能我们能直接猜到, 第一种写法是从当前节点进行传播, 第二种写法则从头结点或者尾节点进行转播, 那么和传播`inbound`事件或`outbound`事件有什么区别呢?我们先以第二种写法为例, 剖析异常事件传输的整个流程

### DefualtChannelPipeline.fireExceptionCaught

```java
public final ChannelPipeline fireExceptionCaught(Throwable cause) {
    AbstractChannelHandlerContext.invokeExceptionCaught(head, cause);
    return this;
}
```

我们看到`invokeExceptionCaught`传入了`head`节点, 我们可以猜测, 异常事件的传播是从`head`节点开始的

### AbstractChannelHandlerContext.invokeExceptionCaught(head, cause)

```java
static void invokeExceptionCaught(final AbstractChannelHandlerContext next, final Throwable cause) {
    ObjectUtil.checkNotNull(cause, "cause");
    EventExecutor executor = next.executor();
    if (executor.inEventLoop()) {
        //执行下一个节点的异常方法
        next.invokeExceptionCaught(cause);
    } else {
        try {
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    next.invokeExceptionCaught(cause);
                }
            });
        } catch (Throwable t) {
            //忽略代码
        }
    }
}
```

因为这里是传入的是`head`节点, 所以这里的`next`指向`head`节点。

我们跟到`invokeExceptionCaught`方法中, 这里其实是`headContext`的父类`AbstractChannelHandlerContext`中的方法

### AbstractChannelHandlerContext.invokeExceptionCaught(cause)

```java
private void invokeExceptionCaught(final Throwable cause) {
    if (invokeHandler()) {
        try {
            //当前handler调用exceptionCaught()方法
            handler().exceptionCaught(this, cause);
        } catch (Throwable error) {
            //代码省略
        }
    } else {
        fireExceptionCaught(cause);
    }
}
```

这里又是我们熟悉的逻辑, 调用当前`handler`的`exceptionCaught`方法, 因为当前`handler`是`head`, 所以首先会调用`headContext`的`exceptionCaught`方法

### exceptionCaught方法

```java
public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
    ctx.fireExceptionCaught(cause);
}
```

这里仅仅是继续传播异常事件, 这时候我们发现, 这个写法和我们刚才提到传播异常事件的两种写法的第一种写法一样

```java
@Override
public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
    //写法1
    ctx.fireChannelRead(cause);
    //写法2
    ctx.pipeline().fireExceptionCaught(cause);
}
```

根据我们之前的学习, 我们知道第一种写法是从当前节点传播, 而第二种写法是从头传播, 并且要求传播事件一定要使用第一种写法, 否则事件到这里会重新从头传播进而引发不可预知错误, 这个结论在异常传播同样适用, 同学们一定要注意这点

我们继续跟`fireExceptionCaught`方法, 这里会走到`AbstractChannelHandlerContex`类的`fireExceptionCaught`方法

### AbstractChannelHandlerContex.fireExceptionCaught

```java
public ChannelHandlerContext fireExceptionCaught(final Throwable cause) {
    //传播异常事件的时候, 直接拿了当前节点的下一个节点
    invokeExceptionCaught(next, cause);
    return this;
}
```

这个时候我们发现, 这里并没有去获取下一个的`inbound`节点还是`outbound`节点, 而是直接通过`next`拿到下一个节点, 这就说明在异常事件传播的过程中是不区分`inbound`事件还是`outbound`事件的, 都是直接从`head`节点按照链表结构往下传播

### AbstractChannelHandlerContex.invokeExceptionCaught(next, cause)

```java
static void invokeExceptionCaught(final AbstractChannelHandlerContext next, final Throwable cause) {
    ObjectUtil.checkNotNull(cause, "cause");
    EventExecutor executor = next.executor();
    if (executor.inEventLoop()) { 
        next.invokeExceptionCaught(cause);
    } else {
        try {
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    next.invokeExceptionCaught(cause);
                }
            });
        } catch (Throwable t) {
            //代码省略
        }
    }
}
```

这里又是我们熟悉的逻辑, 我们知道`invokeExceptionCaught`中执行了`next`的`exceptionCaught`, 这里的`next`, 因为我们是从`head`节点开始剖析的, 所以这里很有可能就是用户自定义的`handler`, 如果用户没有重写`exceptionCaught`方法, 则会交给用户`handler`的父类处理

### 我们以ChannelInboundHandlerAdapter为例看它的该方法实现

```java
public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause)
        throws Exception {
    ctx.fireExceptionCaught(cause);
}
```

我们看到这里继续向下传播了异常事件

走到这里我们会知道, 如果我们没有重写`exceptionCaught`方法, 异常事件会一直传播到链表的底部, 就是`tail`节点

### 我们跟到TailConext的exceptionCaught方法

```java
public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
    onUnhandledInboundException(cause);
}
```

我们看到最终这里释放了异常对象

以上就是有关异常事件的传播
