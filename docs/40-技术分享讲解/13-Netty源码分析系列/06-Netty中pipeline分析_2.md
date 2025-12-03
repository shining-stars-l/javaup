---
slug: /tech-sharing/netty-source/netty-pipeline-part-2
---

# Netty中pipeline分析_2

## 添加

```java
ServerBootstrap serverBootstrap = new ServerBootstrap();
serverBootstrap.group(bossGroup,workGroup)
        .channel(NioServerSocketChannel.class)
        .childHandler(new ChannelInitializer<SocketChannel>(){
            @Override
            protected void initChannel(SocketChannel ch) throws Exception {
                ChannelPipeline pipeline = ch.pipeline();
                pipeline.addLast(new MyServerHandler());
            }
        });
ChannelFuture channelFuture = serverBootstrap.bind(8899).sync();
channelFuture.channel().closeFuture().sync();
```

分析`pipeline.addLast(new MyServerHandler())`中的`addLast`。

首先通过`channel`拿到当前的`pipline`, 拿到`pipeline`之后再为其添加`handler`, 因为`channel`初始化默认创建的是`DefualtChannelPipeline`

## DefaultChannelPipeline.addLast(ChannelHandler... handlers)

```java
public final ChannelPipeline addLast(ChannelHandler... handlers) {
    return addLast(null, handlers);
}
```

```java
public final ChannelPipeline addLast(EventExecutorGroup executor, ChannelHandler... handlers) {
    if (handlers == null) {
        throw new NullPointerException("handlers");
    }

    for (ChannelHandler h: handlers) {
        if (h == null) {
            break;
        }
        addLast(executor, null, h);
    }

    return this;
}
```

这里的`handlers`只有一个

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

### 分为四个步骤：

1. 重复添加验证
2. 创建一个`HandlerContext`并添加到列表
3. 添加`context`
4. 回调添加事件

### checkMultiplicity(handler)重复添加验证

```java
private static void checkMultiplicity(ChannelHandler handler) {
    if (handler instanceof ChannelHandlerAdapter) {
        ChannelHandlerAdapter h = (ChannelHandlerAdapter) handler; 
        if (!h.isSharable() && h.added) {
            throw new ChannelPipelineException(
                    h.getClass().getName() +
                    " is not a @Sharable handler, so can't be added or removed multiple times.");
        }
        //满足条件设置为true, 代表已添加
        h.added = true;
    }
}
```

1. 首先判断是不是`ChannelHandlerAdapter`类型, 因为我们自定义的`handler`通常会直接或者间接的继承该接口, 所以这里为`true`拿到`handler`之后转换成`ChannelHandlerAdapter`类型。
2. 然后进行条件判断 `if (!h.isSharable() && h.added)`代表如果不是共享的`handler`, 并且是未添加状态, 则抛出异常。

### isSharable()

```java
public boolean isSharable() { 
    Class<?> clazz = getClass();
    Map<Class<?>, Boolean> cache = InternalThreadLocalMap.get().handlerSharableCache();
    Boolean sharable = cache.get(clazz);
    if (sharable == null) { 
        //如果这个类注解了Sharable.class, 说明这个类会被多个channel共享
        sharable = clazz.isAnnotationPresent(Sharable.class);
        cache.put(clazz, sharable);
    }
    return sharable;
}
```

1. 首先拿到当前`handler`的`class`对象。
2. 然后再从`netty`自定义的一个`ThreadLocalMap`对象中获取一个盛放`handler`的`class`对象的`map`, 并获取其`value`。
3. 如果`value`值为空, 则会判断是否被`Sharable`注解, 并将自身`handler`的`class`对象和判断结果存入`map`对象中, 最后返回判断结果。
4. 这说明了被`Sharable`注解的`handler`是一个共享`handler`。
5. 从这个逻辑我们可以判断, 共享对象是可以重复添加的。

回到`DefaultChannelPipeline.addLast`,如果是共享对象或者没有被添加, 则将`ChannelHandlerAdapter`的`added`设置为`true`, 代表已添加分析完了重复添加验证, 回到`addLast`方法中, 我们看第二步, 创建一个`HandlerContext`并添加到列表

### newCtx = newContext(group, filterName(name, handler), handler)

```java
newCtx = newContext(group, filterName(name, handler), handler)
```

首先看filterName(name, handler)方法, 这个方法是判断添加handler的name是否重复

### filterName(name, handler)

首先看`filterName(name, handler)`方法, 这个方法是判断添加`handler`的`name`是否重复

```java
private String filterName(String name, ChannelHandler handler) {
    if (name == null) {
        //没有名字创建默认名字
        return generateName(handler);
    }
    //检查名字是否重复
    checkDuplicateName(name);
    return name;
}
```

因为我们添加`handler`时候, 不一定会给`handler`命名, 所以这一步`name`有可能是`null`, 如果是`null`, 则创建一个默认的名字, 这里创建名字的方法就不分析了

### checkDuplicateName(name)

```java
private void checkDuplicateName(String name) {
    //不为空
    if (context0(name) != null) {
        throw new IllegalArgumentException("Duplicate handler name: " + name);
    }
}
```

继续跟进分析`context0(name)`方法

### context0(name)

```java
private AbstractChannelHandlerContext context0(String name) {
    //遍历pipeline
    AbstractChannelHandlerContext context = head.next;
    while (context != tail) {
        //发现name相同, 说明存在handler
        if (context.name().equals(name)) {
            //返回
            return context;
        }
        context = context.next;
    }
    return null;
}
```

这里的逻辑就是将`pipeline`中, 从`head`节点往下遍历`HandlerContext`, 一直遍历到`tail`, 如果发现名字相同则会认为重复并返回`HandlerContext`对象。

继续跟到`newContext(group, filterName(name, handler), handler)`方法中。

### newContext(EventExecutorGroup group, String name, ChannelHandler handler)

```java
private AbstractChannelHandlerContext newContext(EventExecutorGroup group, String name, ChannelHandler handler) {
    return new DefaultChannelHandlerContext(this, childExecutor(group), name, handler);
}
```

可以看到创建了一个`DefaultChannelHandlerContext`对象, 构造方法的参数中, 第一个`this`代表当前的`pipeline`对象, `group`为`null`, 所以`childExecutor(group)`也会返回`null`, `name`为`handler`的名字, `handler`为新添加的`handler`对象

### new DefaultChannelHandlerContext(this, childExecutor(group), name, handler)

```java
DefaultChannelHandlerContext(
        DefaultChannelPipeline pipeline, EventExecutor executor, String name, ChannelHandler handler) {
    super(pipeline, executor, name, isInbound(handler), isOutbound(handler));
    if (handler == null) {
        throw new NullPointerException("handler");
    }
    this.handler = handler;
}
```

- 首先调用了父类的构造方法, 之后将`handler`赋值为自身`handler`的成员变量, `HandlerConext`和`handler`关系在此也展现了出来, 是一种组合关系
- 父类的构造方法, 有这么两个参数:`isInbound(handler)`, `isOutbound(handler)`, 这两个参数意思是判断需要添加的`handler`是`inboundHandler`还是`outBoundHandler`

### isInbound(handler)

```java
private static boolean isInbound(ChannelHandler handler) {
    return handler instanceof ChannelInboundHandler;
}
```

这里通过是否实现`ChannelInboundHandler`接口来判断是否为`inboundhandler`

### isOutbound(handler)

```java
private static boolean isOutbound(ChannelHandler handler) {
    return handler instanceof ChannelOutboundHandler;
}
```

通过判断是否实现`ChannelOutboundHandler`接口判断是否为`outboundhandler`

### 在跟到其父类AbstractChannelHandlerContext的构造方法中

```java
AbstractChannelHandlerContext(DefaultChannelPipeline pipeline, EventExecutor executor, String name, 
                              boolean inbound, boolean outbound) {
    this.name = ObjectUtil.checkNotNull(name, "name");
    this.pipeline = pipeline;
    this.executor = executor;
    this.inbound = inbound;
    this.outbound = outbound;
    ordered = executor == null || executor instanceof OrderedEventExecutor;
}
```

之前`tail`节点和`head`节点创建的时候也执行到了这里，初始化了`name`, `pipeline`, 以及标识添加的`handler`是`inboundhanlder`还是`outboundhandler`。

回到`DefaultChannelPipeline.addLast`,分析完了创建`HandlerContext`的相关逻辑, 我们继续跟第三步, 添加`HandlerContext`

### addLast0(newCtx)

```java
private void addLast0(AbstractChannelHandlerContext newCtx) {
    //拿到tail节点的前置节点
    AbstractChannelHandlerContext prev = tail.prev;
    //当前节点的前置节点赋值为tail节点的前置节点
    newCtx.prev = prev;
    //当前节点的下一个节点赋值为tail节点
    newCtx.next = tail;
    //tail前置节点的下一个节点赋值为当前节点
    prev.next = newCtx;
    //tail节点的前一个节点赋值为当前节点
    tail.prev = newCtx;
}
```

做了一个指针的指向操作, 将新添加的`handlerConext`放在`tail`节点之前, 之前`tail`节点的上一个节点之后, 如果是第一次添加`handler`, 那么添加后的结构入下图所示
![](/img/technologySharing/netty/handler添加.png)

添加完`handler`之后, 这里会判断当前`channel`是否已经注册, 这部分逻辑之后再进行分析，先接着继续执行。

之后会判断当前线程线程是否为`eventLoop`线程, 如果不是`eventLoop`线程, 就将添加回调事件封装成`task`交给`eventLoop`线程执行, 否则, 直接执行添加回调事件`callHandlerAdded0(newCtx)`。

### callHandlerAdded0(newCtx)

```java
private void callHandlerAdded0(final AbstractChannelHandlerContext ctx) {
    try {
        ctx.handler().handlerAdded(ctx);
        ctx.setAddComplete();
    } catch (Throwable t) {
        /**
 		* 省略
 		* */
    }
}
```

分析`ctx.handler().handlerAdded(ctx)`，其中`ctx`是我们新创建的`HandlerContext`, 通过`handler()`方法拿到绑定的`handler`, 也就是新添加的`handler`, 然后执行`handlerAdded(ctx)`方法, 如果我们没有重写这个方法, 则会执行父类的该方法。

### ChannelHandlerAdapter.(ChannelHandlerContext ctx)

```java
public void handlerAdded(ChannelHandlerContext ctx) throws Exception {
    // NOOP
}
```

没做任何操作, 也就是如果我们没有重写该方法时, 如果添加`handler`之后将不会做任何操作, 这里如果我们需要做一些业务逻辑, 可以通过重写该方法进行实现

## 删除

删除的逻辑和添加的逻辑相同，区别删除是将`pipeline`的双向链表的节点去掉。这里就不详细的分析。
