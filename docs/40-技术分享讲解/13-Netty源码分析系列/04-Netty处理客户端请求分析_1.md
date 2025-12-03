---
slug: /tech-sharing/netty-source/netty-client-part-1
---

# Netty处理客户端请求分析_1
## NioEventLoop.run()

netty启动初始化分析_3文章中分析到了，监听`accept`事件，下面分析当客户端请求时的处理流程，仍然回到`NioEventLoop.run()`

```java
protected void run() {
    int selectCnt = 0;
    for (;;) {
        try {
            int strategy;
            try {
                strategy = selectStrategy.calculateStrategy(selectNowSupplier, hasTasks());
                switch (strategy) {
                case SelectStrategy.CONTINUE:
                    continue;

                case SelectStrategy.BUSY_WAIT:
                    // fall-through to SELECT since the busy-wait is not supported with NIO

                case SelectStrategy.SELECT:
                    long curDeadlineNanos = nextScheduledTaskDeadlineNanos();
                    if (curDeadlineNanos == -1L) {
                        curDeadlineNanos = NONE; // nothing on the calendar
                    }
                    nextWakeupNanos.set(curDeadlineNanos);
                    try {
                        if (!hasTasks()) {
                            //调用NIO中Selector 中的 select()或者 selectNow()
                            strategy = select(curDeadlineNanos);
                        }
                    } finally {
                        // This update is just to help block unnecessary selector wakeups
                        // so use of lazySet is ok (no race condition)
                        nextWakeupNanos.lazySet(AWAKE);
                    }
                    // fall through
                default:
                }
            } catch (IOException e) {
                // If we receive an IOException here its because the Selector is messed up. Let's rebuild
                // the selector and retry. https://github.com/netty/netty/issues/8566
                rebuildSelector0();
                selectCnt = 0;
                handleLoopException(e);
                continue;
            }

            selectCnt++;
            cancelledKeys = 0;
            needsToSelectAgain = false;
            final int ioRatio = this.ioRatio;
            boolean ranTasks;
            if (ioRatio == 100) {
                try {
                    if (strategy > 0) {
                        processSelectedKeys();
                    }
                } finally {
                    // Ensure we always run tasks.
                    ranTasks = runAllTasks();
                }
            } else if (strategy > 0) {
                final long ioStartTime = System.nanoTime();
                try {
                    processSelectedKeys();
                } finally {
                    // Ensure we always run tasks.
                    final long ioTime = System.nanoTime() - ioStartTime;
                    ranTasks = runAllTasks(ioTime * (100 - ioRatio) / ioRatio);
                }
            } else {
                ranTasks = runAllTasks(0); // This will run the minimum number of tasks
            }

            if (ranTasks || strategy > 0) {
                if (selectCnt > MIN_PREMATURE_SELECTOR_RETURNS && logger.isDebugEnabled()) {
                    logger.debug("Selector.select() returned prematurely {} times in a row for Selector {}.",
                            selectCnt - 1, selector);
                }
                selectCnt = 0;
            } else if (unexpectedSelectorWakeup(selectCnt)) { // Unexpected wakeup (unusual case)
                selectCnt = 0;
            }
        } catch (CancelledKeyException e) {
            // Harmless exception - log anyway
            if (logger.isDebugEnabled()) {
                logger.debug(CancelledKeyException.class.getSimpleName() + " raised by a Selector {} - JDK bug?",
                        selector, e);
            }
        } catch (Error e) {
            throw (Error) e;
        } catch (Throwable t) {
            handleLoopException(t);
        } finally {
            // Always handle shutdown even if the loop processing threw an exception.
            try {
                if (isShuttingDown()) {
                    closeAll();
                    if (confirmShutdown()) {
                        return;
                    }
                }
            } catch (Error e) {
                throw (Error) e;
            } catch (Throwable t) {
                handleLoopException(t);
            }
        }
    }
}
```

### NioEventLoop.processSelectedKeys()

遍历 Selector 的内部 SelectionKey 集合（每一个 SelectionKey 关联了发生 IO 事件的 Channel），对每一个 Channel 上的 IO 事件进行处理

```java
private void processSelectedKeys() {
    if (selectedKeys != null) {
        processSelectedKeysOptimized();
    } else {
        processSelectedKeysPlain(selector.selectedKeys());
    }
}
```

### NioEventLoop.processSelectedKeysOptimized()

```java
private void processSelectedKeysOptimized() {
	//循环遍历数组
    for (int i = 0; i < selectedKeys.size; ++i) {
    	//拿到当前的selectionKey
        final SelectionKey k = selectedKeys.keys[i];
        // null out entry in the array to allow to have it GC'ed once the Channel close
        // See https://github.com/netty/netty/issues/2363
        
        //将当前引用设置为null
        selectedKeys.keys[i] = null;
		//获取channel(NioSeverSocketChannel)
        final Object a = k.attachment();
		//如果是AbstractNioChannel, 则调用processSelectedKey()方法处理io事件
        if (a instanceof AbstractNioChannel) {
            //遍历selectKeys的集合并处理
            processSelectedKey(k, (AbstractNioChannel) a);
        } else {
            @SuppressWarnings("unchecked")
            NioTask<SelectableChannel> task = (NioTask<SelectableChannel>) a;
            processSelectedKey(k, task);
        }

        if (needsToSelectAgain) {
            // null out entries in the array to allow to have it GC'ed once the Channel close
            // See https://github.com/netty/netty/issues/2363
            selectedKeys.reset(i + 1);

            selectAgain();
            i = -1;
        }
    }
}
```

- `selectedKeys`中事件key集合的来源，在netty启动初始化分析_1文章中的`NioEventLoop构造方法中的openSelector()`中进行了分析。
- 首先通过for循环遍历数组中的每一个key, 获得key之后首先将数组中对应的下标清空, 因为selector不会自动清空, 这与我们使用原生selector时候, 通过遍历`selector.selectedKeys()`的set的时候, 拿到key之后要执行remove()是一个意思。

### NioEventLoop.processSelectedKey(SelectionKey k, AbstractNioChannel ch)

```java
private void processSelectedKey(SelectionKey k, AbstractNioChannel ch) {
    final AbstractNioChannel.NioUnsafe unsafe = ch.unsafe();
    /**
     * 验证逻辑省略
     * */
    try {
        //拿到key的io事件
        int readyOps = k.readyOps();
        //连接事件
        if ((readyOps & SelectionKey.OP_CONNECT) != 0) {
            // remove OP_CONNECT as otherwise Selector.select(..) will always return without blocking
            // See https://github.com/netty/netty/issues/924
            int ops = k.interestOps();
            ops &= ~SelectionKey.OP_CONNECT;
            k.interestOps(ops);

            unsafe.finishConnect();
        }
        //写事件
        if ((readyOps & SelectionKey.OP_WRITE) != 0) {
            // Call forceFlush which will also take care of clear the OP_WRITE once there is nothing left to write
            ch.unsafe().forceFlush();
        }

        //读事件和接受链接事件
        //如果当前NioEventLoop是work线程的话, 这里就是op_read事件
        //如果是当前NioEventLoop是boss线程的话, 这里就是op_accept事件
        if ((readyOps & (SelectionKey.OP_READ | SelectionKey.OP_ACCEPT)) != 0 || readyOps == 0) {
            //通过channel绑定的unsafe对象执行read()方法用于处理连接或者读写事件
            unsafe.read();
        }
    } catch (CancelledKeyException ignored) {
        unsafe.close(unsafe.voidPromise());
    }
}
```

### NioMessageUnsafe.read()

```java
private final List<Object> readBuf = new ArrayList<Object>();

@Override
public void read() {
    //必须是NioEventLoop方法调用的, 不能通过外部线程调用
    assert eventLoop().inEventLoop();
    //服务端channel的config
    final ChannelConfig config = config();
    //服务端channel的pipeline
    final ChannelPipeline pipeline = pipeline();
    //创建接收数据Buffer分配器（用于分配容量大小合适的byteBuffer用来容纳接收数据）
    //在接收连接的场景中，这里的allocHandle只是用于控制read loop的循环读取创建连接的次数。
    final RecvByteBufAllocator.Handle allocHandle = unsafe().recvBufAllocHandle();
    //设置配置
    allocHandle.reset(config);

    boolean closed = false;
    Throwable exception = null;
    try {
        try {
            do {
                //用于读取bossGroup中EventLoop中的NIOServerSocketChannel接收到的请求数据，
                //并且把这些请求数据放入readBuf。
                //调用doReadMessages结束后，readBuf中存放了一个处理客户端后续请求的NioSocketChannel
                int localRead = doReadMessages(readBuf);
                //已无新的连接可接收则退出read loop
                if (localRead == 0) {
                    break;
                }
                if (localRead < 0) {
                    closed = true;
                    break;
                }
                //统计在当前事件循环中已经读取到得Message数量（创建连接的个数）
                allocHandle.incMessagesRead(localRead);
                //连接数是否超过最大值
            } while (allocHandle.continueReading());
        } catch (Throwable t) {
            exception = t;
        }

        int size = readBuf.size();
        for (int i = 0; i < size; i ++) {
            readPending = false;
            //传递事件, 将创建NioSokectChannel进行传递
            //最终会调用ServerBootstrap的内部类ServerBootstrapAcceptor的channelRead()方法
            //初始化客户端SocketChannel，并将其绑定到Sub Reactor线程组中的一个Reactor上
            pipeline.fireChannelRead(readBuf.get(i));
        }
        //清除本次accept 创建的客户端SocketChannel集合
        readBuf.clear();
        allocHandle.readComplete();
        //触发readComplete事件传播
        pipeline.fireChannelReadComplete();

        if (exception != null) {
            closed = closeOnReadError(exception);

            pipeline.fireExceptionCaught(exception);
        }

        if (closed) {
            inputShutdown = true;
            if (isOpen()) {
                close(voidPromise());
            }
        }
    } finally {
        if (!readPending && !config.isAutoRead()) {
            removeReadOp();
        }
    }
}
```

### NioServerSocketChannel.doReadMessages

```java
protected int doReadMessages(List<Object> buf) throws Exception {
    //调用服务端ServerSocketChannel的accept方法产生一个处理客户端后续请求的SocketChannel
    SocketChannel ch = SocketUtils.accept(javaChannel());

    try {
        if (ch != null) {
            //将这个SocketChannel对象封装成NioSocketChannel对象
            //添加到buf中，封装的时候会添加Pipeline属性
            //this代表当前NioServerSocketChannel, ch代表jdk的SocketChannel
            buf.add(new NioSocketChannel(this, ch));
            return 1;
        }
    } catch (Throwable t) {
        logger.warn("Failed to create a new channel from an accepted socket.", t);

        try {
            ch.close();
        } catch (Throwable t2) {
            logger.warn("Failed to close a socket.", t2);
        }
    }

    return 0;
}
```

首先根据jdk的`ServerSocketChannel`拿到jdk的Channel,封装成一个`NioSokectChannel`扔到`buf`中.。这里的`NioSocketChannel`是对jdk底层的`SocketChannel`的包装, 我们看到其构造方法传入两个参数, this代表当前`NioServerSocketChannel`, `ch代表jdk的SocketChannel`

**NioSocketChannel的构造方法**

```java
//parent = NioServerSocketChannel
//socket = jdk底层的socketChannel
public NioSocketChannel(Channel parent, SocketChannel socket) {
   super(parent, socket);
   config = new NioSocketChannelConfig(this, socket.socket());
}
```

继续跟进`super(parent, socket)`

**NioSocketChannel的构造方法**

```java
protected AbstractNioByteChannel(Channel parent, SelectableChannel ch) {
   //SelectionKey.OP_READ代表其监听事件是读事件     
   super(parent, ch, SelectionKey.OP_READ);
}
```

继续跟进`super(parent, ch, SelectionKey.OP_READ)`

**AbstractNioChannel的构造方法**

```java
protected AbstractNioChannel(Channel parent, SelectableChannel ch, int readInterestOp) {
   super(parent);
   this.ch = ch;
   this.readInterestOp = readInterestOp;
   try {
   		//设置为非阻塞
       ch.configureBlocking(false);
   } catch (IOException e) {
       try {
           ch.close();
       } catch (IOException e2) {
           logger.warn(
                       "Failed to close a partially initialized socket.", e2);
       }

       throw new ChannelException("Failed to enter non-blocking mode.", e);
   }
}
```

- 这里初始化了自身成员变量ch, 就是jdk底层的SocketChannel。
- 初始化了自身的监听事件readInterestOp, 也就是读事件。
- ch.configureBlocking(false)就是将jdk的SocketChannel设置为非阻塞。

继续跟进`super(parent)`

**AbstractChannel的构造方法**

```java
protected AbstractChannel(Channel parent) {
    //始化parent, 也就是创建自身的NioServerSocketChannel    
    this.parent = parent;
    id = newId();
    unsafe = newUnsafe();
    pipeline = newChannelPipeline();
}
```

### DefaultChannelPipeline.fireChannelRead(readBuf.get(i))

回到`NioMessageUnsafe.read()`中，分析完`NioServerSocketChannel.doReadMessages`后获得了存放`NioSocketChannel` (包含`NioServerSocketChannel`和`SocketChannel`)的`buf`。接着分析`DefaultChannelPipeline.fireChannelRead(readBuf.get(i))`。

```java
int size = readBuf.size();
for (int i = 0; i < size; i ++) {
    readPending = false;
    //传递事件, 将创建NioSokectChannel进行传递
    //最终会调用ServerBootstrap的内部类ServerBootstrapAcceptor的channelRead()方法
    pipeline.fireChannelRead(readBuf.get(i));
}
```

`fireChannelRead`会依次触发服务端的`NioServerSocketChannel`的`pipeline`中所有入站`Handler中channelRead()`方法的执行。例如`LoggingHandler`中`ChannelRead`方法的执行会打印出日志。

这里我们只需知道, 通过`fireChannelRead()`我们最终调用了`ServerBootstrap`的内部类`ServerBootstrapAcceptor` 中的`channelRead()`方法。

**ServerBootstrap.ServerBootstrapAcceptor.channelRead(ChannelHandlerContext ctx, Object msg)**

```java
//msg就是最初传入fireChannelRead()方法的NioSocketChannel
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    final Channel child = (Channel) msg;

    child.pipeline().addLast(childHandler);

    setChannelOptions(child, childOptions, logger);
    setAttributes(child, childAttrs);

    try {
        //work线程注册channel
        childGroup.register(child).addListener(new ChannelFutureListener() {
            @Override
            public void operationComplete(ChannelFuture future) throws Exception {
                if (!future.isSuccess()) {
                    forceClose(child, future.cause());
                }
            }
        });
    } catch (Throwable t) {
        forceClose(child, t);
    }
}
```

- 在这里，服务端启动类中的`acceptor(也是一个Handler)`把调用`ServerSocketChannel.accept()`产生的处理客户端请求的`SocketChannel`注册到了`childGroup`上，由`childGroup`中的`EventLoop`处理后续的IO事件。`childGroup`就是`workerGroup`。
- 更准确来说，这里是将`SocketChannel`注册到`childGroup`中`EventLoop`的`Selector`上，由于`childGroup`中有多个`EventLoop`，Netty会调用`childGroup`的`next`方法选择一个`EventLoop`来注册。
- 也就是说从这里开始，由`workerGroup`来接管后续的读/写事件

**AbstractUnsafe.register(EventLoop eventLoop, final ChannelPromise promise)**

继续跟踪发现执行到了`AbstractUnsafe.register`，此方法之前在进行注册accept事件时执行过得。此方法之前已做详细分析，这里不再赘述。直接贴出关键代码

```java
public final void register(EventLoop eventLoop, final ChannelPromise promise) {
   
    /*
    * 省略
    */
    AbstractChannel.this.eventLoop = eventLoop;

    if (eventLoop.inEventLoop()) {
        register0(promise);
    } else {
        try {
            eventLoop.execute(new Runnable() {
                @Override
                public void run() {
                    register0(promise);
                }
            });
        } catch (Throwable t) {
            
        }
    }
}
```

```java
private void register0(ChannelPromise promise) {
    try {
        /**
         * 省略
         * */
        //注册到selector上 
        doRegister();
        neverRegistered = false;
        registered = true;

        //触发事件
        pipeline.invokeHandlerAddedIfNeeded();
        //触发注册成功事件
        safeSetSuccess(promise);
        pipeline.fireChannelRegistered();
        // Only fire a channelActive if the channel has never been registered. This prevents firing
        // multiple channel actives if the channel is deregistered and re-registered.
        if (isActive()) {
            if (firstRegistration) {
                pipeline.fireChannelActive();
            } else if (config().isAutoRead()) {
                beginRead();
            }
        }
    } catch (Throwable t) {
        closeForcibly();
        closeFuture.setClosed();
        safeSetFailure(promise, t);
    }
}
```

```java
protected void doRegister() throws Exception {
    boolean selected = false;
    for (;;) {
        try {
        	//jdk底层的注册方法 第一个参数为selector, 第二个参数表示不关心任何事件
            selectionKey = javaChannel().register(eventLoop().unwrappedSelector(), 0, this);
            return;
        } catch (CancelledKeyException e) {
            if (!selected) {
                eventLoop().selectNow();
                selected = true;
            } else {
                throw e;
            }
        }
    }
}
```

同样, 这里也是表示不关心任何事件, 只是在当前`NioEventLoop`绑定的`selector`上注册。

**pipeline.fireChannelActive()**

- 回到`register0(ChannelPromise promise)`中，`doRegister()`完成注册后, 会执行到`if (isActive())`这个判断, 因为这个时候链路已经完成, 所以为`true`, 默认判断条件`if (firstRegistration)`也为`true`, 所以这里会走到`pipeline.fireChannelActive()`。

- 着会调用，直到调用到`AbstractUnsafe.beginRead()`(调用过程很长，这里不贴出)

**AbstractUnsafe.beginRead()**

```java
public final void beginRead() {
    assertEventLoop();

    if (!isActive()) {
        return;
    }

    try {
        doBeginRead();
    } catch (final Exception e) {
        invokeLater(new Runnable() {
            @Override
            public void run() {
                pipeline.fireExceptionCaught(e);
            }
        });
        close(voidPromise());
    }
}

protected void doBeginRead() throws Exception {
    // Channel.read() or ChannelHandlerContext.read() was called
    final SelectionKey selectionKey = this.selectionKey;
    if (!selectionKey.isValid()) {
        return;
    }

    readPending = true;

    final int interestOps = selectionKey.interestOps();
    if ((interestOps & readInterestOp) == 0) {
        selectionKey.interestOps(interestOps | readInterestOp);
    }
}
```

到这里就和之前的监听`accept`事件一样了，通过`selectionKey.interestOps(int ops)`来操作。只不多这时的`readInterestOp`值是1为`OP_READ`事件。

### 总结：

- 服务器端`bossGroup`中的`EventLoop`轮训`accept`事件，获取事件后在`processSelectedKey()`中调用`unsafe.read()`方法，这个`unsafe`是`AbstractNioChannel.NioUnsafe` 的实例，`unsafe.read()`由两个核心步骤组成：`doReadMessages()`和`pipeline.fireChannelRead()`。

- `doReadMessages()`用于创建`NioSocketChannel`对象，包装了`JDK`的`SocketChannel`对象，并添加`pipeline`、`unsafe`、`config`属性。
- `pipeline.fireChannelRead()`用于触发服务端`NioServerSocketChannel`的所有入站`Handler`的`channelRead()`方法，在其中的一个类型为`ServerBootstrapAcceptor`的入站`Handler`的`channelRead()`方法中将新创建的 `NioSocketChannel`对象注册到`workerGroup`中的一个`EventLoop`上，该`EventLoop`开始监听`NioSocketChannel`中的读事件。
