---
slug: /tech-sharing/netty-source/netty-pipeline
---

# Netty服务端处理请求联合pipeline分析

在之前的章节中，有很多内容没有详细分析，此章节来将之前的没有详细分析的内容进行讲解

## 两个问题

1. 在客户端接入的时候, `NioMessageUnsafe`的`read`方法中`pipeline.fireChannelRead(readBuf.get(i))`为什么会调用到`ServerBootstrap`的内部类`ServerBootstrapAcceptor`中的`channelRead()`方法。
2. 客户端`handler`是什么时候被添加的?

**先分析第一个问题。回到netty处理客户端请求分析_1中服务端接收到**`**accpet**`**事件后，进行读取的方法**`**NioMessageUnsafe.read()**`

## NioMessageUnsafe.read()

```java
public void read() {
    //必须是NioEventLoop方法调用的, 不能通过外部线程调用
    assert eventLoop().inEventLoop();
    //服务端channel的config
    final ChannelConfig config = config();
    //服务端channel的pipeline
    final ChannelPipeline pipeline = pipeline();
    //处理服务端接入的速率
    final RecvByteBufAllocator.Handle allocHandle = unsafe().recvBufAllocHandle();
    //设置配置
    allocHandle.reset(config);
    boolean closed = false;
    Throwable exception = null;
    try {
        try {
            do {
                //创建jdk底层的channel
                //readBuf用于临时承载读到链接
                int localRead = doReadMessages(readBuf);
                if (localRead == 0) {
                    break;
                }
                if (localRead < 0) {
                    closed = true;
                    break;
                }
                //分配器将读到的链接进行计数
                allocHandle.incMessagesRead(localRead);
                //连接数是否超过最大值
            } while (allocHandle.continueReading());
        } catch (Throwable t) {
            exception = t;
        }
        int size = readBuf.size();
        //遍历每一条客户端连接
        for (int i = 0; i < size; i ++) {
            readPending = false;
            //传递事件, 将创建NioSokectChannel进行传递
            //最终会调用ServerBootstrap的内部类ServerBootstrapAcceptor的channelRead()方法
            pipeline.fireChannelRead(readBuf.get(i));
        }
        readBuf.clear();
        allocHandle.readComplete();
        pipeline.fireChannelReadComplete();
        //代码省略
    } finally {
        //代码省略
    }
}
```

重点看`pipeline.fireChannelRead(readBuf.get(i))`

首先, 这里`pipeline`是服务端`channel`的`pipeline`, 也就是`NioServerSocketChannel`的`pipeline`

我们学习过`pipeline`之后, 对这种写法并不陌生, 就是传递`channelRead`事件, 这里通过传递`channelRead`事件走到了`ServerBootstrapAcceptor`的`channelRead()`方法, 说明在这步之前, `ServerBootstrapAcceptor`作为一个`handler`添加到了服务端`channel`的`pipeline`中, 那么这个`handler`什么时候添加的呢?

**我们回顾下第一章, 初始化NioServerSocketChannel的时候, 调用了ServerBootstrap的init方法**
回顾下`ServerBootstrap.init`的调用链路:

`ServerBootstrap.bind(8899)`
--->
`AbstractBootstrap.doBind(final SocketAddress localAddress)`
--->
`AbstractBootstrap.initAndRegister()`
--->
`ServerBootstrap.init(Channel channel)`

## ServerBootstrap.init(Channel channel)

```java
void init(Channel channel) throws Exception {
    //获取用户定义的选项(1)
    final Map<ChannelOption<?>, Object> options = options0();
    synchronized (options) {
        channel.config().setOptions(options);
    }

    //获取用户定义的属性(2)
    final Map<AttributeKey<?>, Object> attrs = attrs0();
    synchronized (attrs) {
        for (Entry<AttributeKey<?>, Object> e: attrs.entrySet()) {
            @SuppressWarnings("unchecked")
            AttributeKey<Object> key = (AttributeKey<Object>) e.getKey();
            channel.attr(key).set(e.getValue());
        }
    }
    //获取channel的pipline(3)
    ChannelPipeline p = channel.pipeline();
    //work线程组(4)
    final EventLoopGroup currentChildGroup = childGroup;
    //用户设置的Handler(5)
    final ChannelHandler currentChildHandler = childHandler;
    final Entry<ChannelOption<?>, Object>[] currentChildOptions;
    final Entry<AttributeKey<?>, Object>[] currentChildAttrs;
    //选项转化为Entry对象(6)
    synchronized (childOptions) { 
        currentChildOptions = childOptions.entrySet().toArray(newOptionArray(childOptions.size()));
    }
    //属性转化为Entry对象(7)
    synchronized (childAttrs) { 
        currentChildAttrs = childAttrs.entrySet().toArray(newAttrArray(childAttrs.size()));
    }
    //添加服务端handler(8)
    p.addLast(new ChannelInitializer<Channel>() {
        //初始化channel
        @Override
        public void initChannel(Channel ch) throws Exception {
            final ChannelPipeline pipeline = ch.pipeline();
            ChannelHandler handler = config.handler();
            if (handler != null) { 
                pipeline.addLast(handler);
            } 
            ch.eventLoop().execute(new Runnable() {
                @Override
                public void run() { 
                    pipeline.addLast(new ServerBootstrapAcceptor(
                            currentChildGroup, currentChildHandler, currentChildOptions, currentChildAttrs));
                }
            });
        }
    });
}
```

我们重点关注第8步, 添加服务端`channel`, 这里的`pipeline`, 是服务服务端`channel`的`pipeline`, 也就是`NioServerSocketChannel`绑定的`pipeline`, 这里添加了一个`ChannelInitializer`类型的`handler`

### ChannelInitializer的继承关系

```java
public abstract class ChannelInitializer<C extends Channel> extends ChannelInboundHandlerAdapter {
    //省略类体
}
```

我们看到其继承了`ChannelInboundHandlerAdapter`, 说明是一个`inbound`类型的`handler`

这里我们可能会想到, 添加完`handler`会执行`handlerAdded`, 然后在`handlerAdded`方法中做了添加`ServerBootstrapAcceptor`这个`handler`

但是, 实际上并不是这样的, 当程序执行到这里, 并没有马上执行`handlerAdded`, 我们紧跟`addLast`方法

### 最后执行到DefualtChannelPipeline.addLast(EventExecutorGroup group, String name, ChannelHandler handler)

```java
public final ChannelPipeline addLast(EventExecutorGroup group, String name, ChannelHandler handler) {
    final AbstractChannelHandlerContext newCtx;
    synchronized (this) {
        //判断handler是否被重复添加(1)
        checkMultiplicity(handler);
        //创建一个HandlerContext并添加到列表(2)
        newCtx = newContext(group, filterName(name, handler), handler);

        //添加HandlerContext(3)
        addLast0(newCtx);

        //是否已注册
        if (!registered) {
            newCtx.setAddPending();
            callHandlerCallbackLater(newCtx, true);
            return this;
        }

        EventExecutor executor = newCtx.executor();
        if (!executor.inEventLoop()) {
            newCtx.setAddPending();
            //回调用户事件
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    callHandlerAdded0(newCtx);
                }
            });
            return this;
        }
    }
    //回调添加事件(4)
    callHandlerAdded0(newCtx);
    return this;
}
```

首先完成了`handler`的添加, 但是并没有马上执行回调

这里我们重点关注`if (!registered)`这个条件判断, 其实在注册完成, `registered`会变成`true`, 但是走到这一步的时候`NioServerSockeChannel`并没有完成注册(可以回顾第一章看注册在哪一步), 所以会进到if里并返回自身

### DefualtChannelPipeline.callHandlerCallbackLater(AbstractChannelHandlerContext ctx, boolean added)

```java
private void callHandlerCallbackLater(AbstractChannelHandlerContext ctx, boolean added) {
    assert !registered;
    //判断是否已添加, 未添加, 进行添加, 已添加进行删除
    PendingHandlerCallback task = added ? new PendingHandlerAddedTask(ctx) : new PendingHandlerRemovedTask(ctx);
    //获取第一个Callback任务
    PendingHandlerCallback pending = pendingHandlerCallbackHead;
    //如果第一个Callback任务为空
    if (pending == null) {
        //将第一个任务设置为刚创建的任务
        pendingHandlerCallbackHead = task;
    } else {
        while (pending.next != null) {
            pending = pending.next;
        }
        pending.next = task;
    }
}
```

因我们调用这个方法的时候`added`传的`true`, 所以`PendingHandlerCallback task`赋值为`new PendingHandlerAddedTask(ctx)`

`PendingHandlerAddedTask`这个类, 我们从名字可以看出, 这是一个`handler`添加的延迟任务, 用于执行`handler`延迟添加的操作, 同样也对应一个名字为`PendingHandlerRemovedTask`的类, 用于执行延迟删除`handler`的操作, 这两个类都继承抽象类`PendingHandlerCallback`

### PendingHandlerAddedTask构造方法

```java
PendingHandlerAddedTask(AbstractChannelHandlerContext ctx) {
    super(ctx);
}
```

进入`super(ctx)`

### PendingHandlerCallback构造方法

```java
PendingHandlerCallback(AbstractChannelHandlerContext ctx) {
    this.ctx = ctx;
}
```

在父类中, 保存了要添加的`context`, 也就是`ChannelInitializer`类型的包装类

### 回到callHandlerCallbackLater方法

```java
PendingHandlerCallback pending = pendingHandlerCallbackHead;
```

这表示获取第一个`PendingHandlerCallback`的任务, 其实`PendingHandlerCallback`是一个单向链表, 自身维护一个`PendingHandlerCallback`类型的`next`, 指向下一个任务, 在`DefaultChannelPipeline`这个类中, 定义了个`PendingHandlerCallback`类型的引用`pendingHandlerCallbackHead`, 用来指向延迟回调任务的中的第一个任务。

之后判断这个任务是为空, 如果是第一次添加`handler`, 那么这里就是空, 所以将第一个任务赋值为我们刚创建的添加任务。

如果不是第一次添加`handler`, 则将我们新创建的任务添加到链表的尾部, 因为这里我们是第一次添加, 所以第一个回调任务就指向了我们创建的添加`handler`的任务。

完成这一系列操作之后, `addLast`方法返归, 此时并没有完成添加操作。

而什么时候完成添加操作的呢?

**回到在服务端channel注册时候的会走到AbstractChannel.register0方法**
回顾下`AbstractChannel.register0`的调用链路:

`ServerBootstrap.bind(8899)`
--->
`AbstractBootstrap.doBind(final SocketAddress localAddress)`
--->
`AbstractBootstrap.initAndRegister()`
--->
`config().group().register(channel)`
--->
`SingleThreadEventLoop.register(final ChannelPromise promise)`
--->
`AbstractChannel.register(EventLoop eventLoop, final ChannelPromise promise)`
--->
`AbstractChannel.register0(ChannelPromise promise)`

## AbstractChannel.register0(ChannelPromise promise)

```java
private void register0(ChannelPromise promise) {
    try {
        //做实际的注册(1)
        doRegister();
        neverRegistered = false;
        registered = true;
        //触发事件(2)
        pipeline.invokeHandlerAddedIfNeeded();
        safeSetSuccess(promise);
        //触发注册成功事件(3)
        pipeline.fireChannelRegistered();
        if (isActive()) {
            if (firstRegistration) {
                //传播active事件(4)
                pipeline.fireChannelActive();
            } else if (config().isAutoRead()) {
                beginRead();
            }
        }
    } catch (Throwable t) {
        //省略代码
    }
}
```

重点关注第二步pipeline.invokeHandlerAddedIfNeeded(), 这里已经通过doRegister()方法完成了实际的注册, 我们跟到该方法中

### pipeline.invokeHandlerAddedIfNeeded()

```java
final void invokeHandlerAddedIfNeeded() {
    assert channel.eventLoop().inEventLoop();
    if (firstRegistration) {
        firstRegistration = false;
        callHandlerAddedForAllHandlers();
    }
}
```

这里会判断是否第一次注册, 这里返回`true`, 然后会执行`callHandlerAddedForAllHandlers()`方法, 我们跟进去

### DefaultChannelPipeline.callHandlerAddedForAllHandlers

```java
private void callHandlerAddedForAllHandlers() {
    final PendingHandlerCallback pendingHandlerCallbackHead;
    synchronized (this) {
        assert !registered;
        registered = true;
        pendingHandlerCallbackHead = this.pendingHandlerCallbackHead;
        this.pendingHandlerCallbackHead = null;
    }
    //获取task
    PendingHandlerCallback task = pendingHandlerCallbackHead;
    while (task != null) {
        //执行添加handler方法
        task.execute();
        task = task.next;
    }
}
```

这里拿到第一个延迟执行`handler`添加的`task`其实就是我们之前剖析过的, 延迟执行`handler`添加的`task`, 就是`PendingHandlerAddedTask`对象

在`while`循环中, 通过执行`execute()`方法将`handler`添加

### 进入PendingHandlerAddedTask.execute()

```java
void execute() {
    //获取当前eventLoop线程
    EventExecutor executor = ctx.executor();
    //是当前执行的线程
    if (executor.inEventLoop()) {
        callHandlerAdded0(ctx);
    } else {
        try {
            //添加到队列
            executor.execute(this);
        } catch (RejectedExecutionException e) {
            //代码省略
        }
    }
}
```

再进入`callHandlerAdded0`方法

### callHandlerAdded0(final AbstractChannelHandlerContext ctx)

```java
private void callHandlerAdded0(final AbstractChannelHandlerContext ctx) {
    try {
        ctx.handler().handlerAdded(ctx);
        ctx.setAddComplete();
    } catch (Throwable t) {
        //省略...
    }
}
```

终于在这里, 我们看到了执行回调的方法

## 再回到ServerBootstrap.init(Channel channel)

```java
void init(Channel channel) throws Exception {
    //获取用户定义的选项(1)
    final Map<ChannelOption<?>, Object> options = options0();
    synchronized (options) {
        channel.config().setOptions(options);
    }

    //获取用户定义的属性(2)
    final Map<AttributeKey<?>, Object> attrs = attrs0();
    synchronized (attrs) {
        for (Entry<AttributeKey<?>, Object> e: attrs.entrySet()) {
            @SuppressWarnings("unchecked")
            AttributeKey<Object> key = (AttributeKey<Object>) e.getKey();
            channel.attr(key).set(e.getValue());
        }
    }
    //获取channel的pipline(3)
    ChannelPipeline p = channel.pipeline();
    //work线程组(4)
    final EventLoopGroup currentChildGroup = childGroup;
    //用户设置的Handler(5)
    final ChannelHandler currentChildHandler = childHandler;
    final Entry<ChannelOption<?>, Object>[] currentChildOptions;
    final Entry<AttributeKey<?>, Object>[] currentChildAttrs;
    //选项转化为Entry对象(6)
    synchronized (childOptions) { 
        currentChildOptions = childOptions.entrySet().toArray(newOptionArray(childOptions.size()));
    }
    //属性转化为Entry对象(7)
    synchronized (childAttrs) { 
        currentChildAttrs = childAttrs.entrySet().toArray(newAttrArray(childAttrs.size()));
    }
    //添加服务端handler(8)
    p.addLast(new ChannelInitializer<Channel>() {
        //初始化channel
        @Override
        public void initChannel(Channel ch) throws Exception {
            final ChannelPipeline pipeline = ch.pipeline();
            ChannelHandler handler = config.handler();
            if (handler != null) { 
                pipeline.addLast(handler);
            } 
            ch.eventLoop().execute(new Runnable() {
                @Override
                public void run() { 
                    pipeline.addLast(new ServerBootstrapAcceptor(
                            currentChildGroup, currentChildHandler, currentChildOptions, currentChildAttrs));
                }
            });
        }
    });
}
```

我们继续看第8步添加服务端`handler`

因为这里的`handler`是`ChannelInitializer`, 所以完成添加之后会调用`ChannelInitializer`的`handlerAdded`方法

跟到`handlerAdded`方法

### ChannelInitializer.handlerAdded(ChannelHandlerContext ctx)

```java
public void handlerAdded(ChannelHandlerContext ctx) throws Exception {
    //默认情况下, 会返回true
    if (ctx.channel().isRegistered()) {
        initChannel(ctx);
    }
}
```

因为执行到这步服务端`channel`已经完成注册, 所以会执行到`initChannel`方法

### ChannelInitializer.initChannel(ChannelHandlerContext ctx)

```java
private boolean initChannel(ChannelHandlerContext ctx) throws Exception {
    //这段代码是否被执行过
    if (initMap.putIfAbsent(ctx, Boolean.TRUE) == null) {
        try {
            initChannel((C) ctx.channel());
        } catch (Throwable cause) {
            exceptionCaught(ctx, cause);
        } finally {
            //调用之后会删除当前节点
            remove(ctx);
        }
        return true;
    }
    return false;
}
```

我们关注`initChannel`这个方法, 这个方法是在`ChannelInitializer`的匿名内部来实现的, 这里我们注意, 在`initChannel`方法执行完毕之后会调用`remove(ctx)`删除当前节点

### 继续跟进initChannel方法

```java
public void initChannel(Channel ch) throws Exception {
    final ChannelPipeline pipeline = ch.pipeline();
    ChannelHandler handler = config.handler();
    if (handler != null) { 
        pipeline.addLast(handler);
    } 
    ch.eventLoop().execute(new Runnable() {
        @Override
        public void run() { 
            pipeline.addLast(new ServerBootstrapAcceptor(
                    currentChildGroup, currentChildHandler, currentChildOptions, currentChildAttrs));
        }
    });
}
```

这里首先添加用户自定义的`handler`, 这里如果用户没有定义, 则添加不成功, 然后, 会调用`addLast`将`ServerBootstrapAcceptor`这个`handler`添加了进去, 同样这个`handler`也继承了`ChannelInboundHandlerAdapter`, 在这个`handler`中, 重写了`channelRead`方法, 所以, 这就是第一个问题的答案

**紧接着我们看第二个问题:**`**客户端handler是什么时候被添加的?**`

## 看ServerBootstrapAcceptor的channelRead方法

```java
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    final Channel child = (Channel) msg;
    //添加channelHadler, 这个channelHandler, 就是用户代码添加的ChannelInitializer
    child.pipeline().addLast(childHandler);

    //代码省略

    try {
        //work线程注册channel
        childGroup.register(child).addListener(new ChannelFutureListener() {
            //代码省略
        });
    } catch (Throwable t) {
        forceClose(child, t);
    }
}
```

这里真相可以大白了, 服务端再创建完客户端`channel`之后, 将新创建的`NioSocketChannel`作为参数触发`channelRead`事件(可以回顾`NioMessageUnsafe.read`方法, 代码这里就不贴了), 所以这里的参数`msg`就是`NioSocketChannel`

拿到`channel`时候再将客户端的`handler`添加进去, 我们回顾客户端`handler`的添加过程:

```java
.childHandler(new ChannelInitializer<SocketChannel>() {
    @Override
    public void initChannel(SocketChannel ch) {
        ch.pipeline().addLast(new StringDecoder());
        ch.pipeline().addLast(new StringEncoder());
        ch.pipeline().addLast(new ServerHandler());
    }
});
```

和服务端`channel`的逻辑一样, 首先会添加`ChannelInitializer`这个`handler`但是没有注册所以没有执行添加`handler`的回调, 将任务保存到一个延迟回调的`task`中

等客户端`channel`注册完毕, 会将执行添加`handler`的回调, 也就是`handlerAdded`方法, 在回调中执行`initChannel`方法将客户端`handler`添加进去, 然后删除`ChannelInitializer`这个`handler`

因为在服务端`channel`中这块逻辑已经进行了详细的剖析, 所以这边就不在赘述, 同学们可以自己跟进去走一遍流程

这里注意, 因为每创建一个`NioSoeketChannel`都会调用服务端`ServerBootstrapAcceptor`的`channelRead`方法, 所以这里会将每一个`NioSocketChannel`的`handler`进行添加

## 总结

本文章分析了事件传输的相关逻辑, 包括`handler`的添加, 删除, `inbound`和`outbound`以及异常事件的传输, 最后结合第一章和第三章, 剖析了服务端`channel`和客户端`channel`的添加过程。
