---
slug: /tech-sharing/netty-source/netty-pipeline-part-1
---

# Netty中pipeline分析_1

## 概述

- `pipeline`, 顾名思义, 就是管道的意思, 事件在`pipeline`中传输, 用户可以中断事件, 添加自己的事件处理逻辑, 可以直接将事件中断不再往下传输, 同样可以改变管道的流向, 传递其他事件。
- 事件通常分为两种, 一是`inBound`入站事件, 另一种是`outBound`出站事件。 
   - `inBound`事件, 顾名思义, 就是从另一端流向自己的事件, 比如读事件, 连接完成事件等等。
   - `outBound`, 是从自己流向另一端的事件, 比如连接事件, 写事件, 刷新缓冲区事件等等。
- 事件是通过`handler`对象进行处理的, 里面封装着事件的处理逻辑.而每个`handler`, 是由`HandlerContext`进行包装的, 里面封装了对事件传输的操作。
- 每一个`channel`绑定一个`pipeline`, 那么`pipeline`和`handler`又是什么关系? 
   - `pipeline`可以理解成是一个双向链表, 只是存放的并不是数据而是`HandlerContext`, 而`HandlerContext`又包装了`handler`, 事件传输时, 从头结点(或者尾节点)开始, 找到下一个`HandlerContext`, 执行`Handler`的业务逻辑, 然后再继续往下走, 直到执行到尾节点(或者头结点, 反向)为止。
  ![](/img/technologySharing/netty/channel.webp)

## 继承关系

![](/img/technologySharing/netty/继承关系.png)

- 如果属于`ChannelInboundHandler`的子类, 则属于`Inbound`类型的`handler`。
- 如果属于`ChannelOutboundHandler`的子类, 则属于`Outbound`类型的`handler`。

## pipeline的创建

## 回到AbstractChannel的构造方法

```java
protected AbstractChannel(Channel parent) {
    this.parent = parent;
    id = newId();
    unsafe = newUnsafe();
    pipeline = newChannelPipeline();
}
```

### newChannelPipeline()

```java
protected DefaultChannelPipeline newChannelPipeline() {
	//传入当前channel
    return new DefaultChannelPipeline(this);
}
```

### DefaultChannelPipeline的构造方法

```java
protected DefaultChannelPipeline(Channel channel) {
    this.channel = ObjectUtil.checkNotNull(channel, "channel");
    succeededFuture = new SucceededChannelFuture(channel, null);
    voidPromise =  new VoidChannelPromise(channel, true);

    tail = new TailContext(this);
    head = new HeadContext(this);

    head.next = tail;
    tail.prev = head;
}
```

- 保存了当前`channel`。
- 保存了两个属性`succeededFuture`, `voidPromise`, 这两个属性是Future相关的内容, 之后会讲到。
- 初始化了两个节点, `head`节点和`tail`节点, 在`pipeline`中代表头结点和尾节点

### new TailContext(this)

尾结点的构建

```java
final class TailContext extends AbstractChannelHandlerContext implements ChannelInboundHandler {
    TailContext(DefaultChannelPipeline pipeline) {
        //inbound处理器
        super(pipeline, null, TAIL_NAME, true, false);
        //将当前节点设置为已添加, head和tail.....
        setAddComplete();
    }

    //自身也是handler
    @Override
    public ChannelHandler handler() {
        return this;
    }
     
    //方法省略
}
```

- 这个是`DefualtPipline`的内部类, 首先看其继承了`AbstractChannelHandlerContext`类, 说明自身是个`HandlerContext`, 同时也实现`ChannelInboundHander`接口, 并且其中的`handler()`方法返回了自身, 说明自身也是`handler`, 而实现`ChannelInboundHander`, 说明自身只处理`Inbound`事件。
- 构造方法中, 调用了父类的构造器, 看其中参数 
   - `pipeline`是自身所属的`pipeline`
   - `executor`为null
   - `TAIL_NAME`是当前`handler`, 也就是自身的命名
   - `true`代表自身是`inboundHandler`
   - `fasle`代表自身不是`outboundHandler`

**AbstractChannelHandlerContext的构造方法**

```java
AbstractChannelHandlerContext(DefaultChannelPipeline pipeline, EventExecutor executor, String name, 
                              boolean inbound, boolean outbound) {
    //名字
    this.name = ObjectUtil.checkNotNull(name, "name");
    //pipeline
    this.pipeline = pipeline;
    //线程处理器
    this.executor = executor;
    //事件标识
    this.inbound = inbound;
    this.outbound = outbound;
    ordered = executor == null || executor instanceof OrderedEventExecutor;
}
```

- `pipeline`为自身绑定的`pipeline`
- `exeutor`是线程执行器, 这里为空
- `inbound`和`outbound`是事件标志, 这里分别是`true`和`false`, 也就是自身属于`inboundHnadler`而不属于`outboundHandler`

### new HeadContext(this)

头结点的构建

```java
final class HeadContext extends AbstractChannelHandlerContext
        implements ChannelOutboundHandler, ChannelInboundHandler {

    private final Unsafe unsafe;

    HeadContext(DefaultChannelPipeline pipeline) {
        super(pipeline, null, HEAD_NAME, false, true);
        unsafe = pipeline.channel().unsafe();
        setAddComplete();
    }

    @Override
    public ChannelHandler handler() {
        return this;
    }
}
```

1. 看过了`tail`节点, `head`节点就不难理解, 同样继承了`AbstractChannelHandlerContext`, 说明自身是一个`HandlerContext`, 与`tail`不同的是, 这里实现了`ChannelOutboundHandler`接口和`ChannelOutboundHandler`接口, 说明其既能处理`inbound`事件也能处理`outbound`的事件, `handler`方法返归自身, 说明自身是一个`handler`。
2. 在构造方法中初始化了一个`Unsafe`类型的成员变量, 是通过自身绑定的`channel`拿到的, 说明这个类中可以进行对`channel`的读写操作。这里同样调用了父类的构造方法, 不同的是, 这里`inbound`参数传入了`false`, 而`outbound`参数传入了`true`, 这里说明这里标志的事件是`outbound`事件。同学们可能疑惑, 为什么同时执行`ChannelOutboundHandler`接口和`ChannelOutboundHandler`接口，但是标志的事件不同?
3. 其实这两个地方应用的场景是不同的, 继承`ChannelOutboundHandler`和`ChannelOutboundHandler`, 说明其既能处理`inbound`事件也能处理`outBound`的事件, 但是只有`outbound`属性为`true`说明自身是一个`outboundhandler`, 是一个可以处理`inbound`事件的`outboundhandler`(估计被绕晕了), 这两种`handler`主要是保证在事件传输中保证事件的单方向流动, 在后面事件传输我们能领会到。

**AbstractChannelHandlerContext的构造方法**

```java
AbstractChannelHandlerContext(DefaultChannelPipeline pipeline, EventExecutor executor, String name, 
                              boolean inbound, boolean outbound) {
    //名字
    this.name = ObjectUtil.checkNotNull(name, "name");
    //pipeline
    this.pipeline = pipeline;
    //线程处理器
    this.executor = executor;
    //事件标识
    this.inbound = inbound;
    this.outbound = outbound;
    ordered = executor == null || executor instanceof OrderedEventExecutor;
}
```

`AbstractChannelHandlerContext`的构建和尾结点构建时相同

### 回到DefaultChannelPipeline的构造方法

```java
protected DefaultChannelPipeline(Channel channel) {
    this.channel = ObjectUtil.checkNotNull(channel, "channel");
    succeededFuture = new SucceededChannelFuture(channel, null);
    voidPromise =  new VoidChannelPromise(channel, true);

    tail = new TailContext(this);
    head = new HeadContext(this);

    head.next = tail;
    tail.prev = head;
}
```

介绍完了`new TailContext(this)`和`new HeadContext(this)`,继续分析

```java
head.next = tail;
tail.prev = head;
```

`tail`节点和`head`节点中的`next`和`prev`属性, 其实是其父类`AbstractChannelHandlerContext`, 每一个`handlerContext`都拥有这两个属性, 代表自身的下一个节点和上一个节点, 因为我们概述中介绍过`pipeline`其实是一个双向链表, 所以其中每一个节点必须有指向其他节点的指针。
