---
slug: /tech-sharing/netty-source/netty-part-3
---

# Netty启动初始化分析_3
## 5.2 真正的绑定端口号逻辑doBind0

经过前两篇文章分析完了5.1 初始化和注册`AbstractBootstrap#initAndRegister()`，接着回到`AbstractBootstrap.doBind(final SocketAddress localAddress)`中，开始分析真正的绑定端口号逻辑

```java
private ChannelFuture doBind(final SocketAddress localAddress) {
    final ChannelFuture regFuture = initAndRegister();
    final Channel channel = regFuture.channel();
    if (regFuture.cause() != null) {
        return regFuture;
    }

    if (regFuture.isDone()) {
        // At this point we know that the registration was complete and successful.
        ChannelPromise promise = channel.newPromise();
        doBind0(regFuture, channel, localAddress, promise);
        return promise;
    } else {
        // Registration future is almost always fulfilled already, but just in case it's not.
        final PendingRegistrationPromise promise = new PendingRegistrationPromise(channel);
        regFuture.addListener(new ChannelFutureListener() {
            @Override
            public void operationComplete(ChannelFuture future) throws Exception {
                Throwable cause = future.cause();
                if (cause != null) {
                    // Registration on the EventLoop failed so fail the ChannelPromise directly to not cause an
                    // IllegalStateException once we try to access the EventLoop of the Channel.
                    promise.setFailure(cause);
                } else {
                    // Registration was successful, so set the correct executor to use.
                    // See https://github.com/netty/netty/issues/2586
                    promise.registered();

                    doBind0(regFuture, channel, localAddress, promise);
                }
            }
        });
        return promise;
    }
}
```

进入`doBind0(regFuture, channel, localAddress, promise)`

### AbstractBootstrap.doBind0(regFuture, channel, localAddress, promise)

```java
private static void doBind0(
        final ChannelFuture regFuture, final Channel channel,
        final SocketAddress localAddress, final ChannelPromise promise) {

    // This method is invoked before channelRegistered() is triggered.  Give user handlers a chance to set up
    // the pipeline in its channelRegistered() implementation.
    channel.eventLoop().execute(new Runnable() {
        @Override
        public void run() {
            if (regFuture.isSuccess()) {
                channel.bind(localAddress, promise).addListener(ChannelFutureListener.CLOSE_ON_FAILURE);
            } else {
                promise.setFailure(regFuture.cause());
            }
        }
    });
}
```

`channel.eventLoop().execute`，和之前注册的任务一样，放进队列`taskQueue`中。而取队列的过程在netty源码分析_2分析过，这里直接分析任务执行流程。会执行`channel.bind(localAddress, promise).addListener(ChannelFutureListener.CLOSE_ON_FAILURE)`，先分析`channel.bind(localAddress, promise)`

### AbstractChannel.bind(SocketAddress localAddress, ChannelPromise promise)

```java
public ChannelFuture bind(SocketAddress localAddress, ChannelPromise promise) {
    return pipeline.bind(localAddress, promise);
}
```

这里的链路调用很长，过程不贴出来了，最终会调用到`AbstractNioChannel.doBeginRead()`

### AbstractNioChannel.doBeginRead()

此方法比较重要，逻辑是将之前注册到selector中的事件从不感兴趣修改为关注`OP_ACCEPT`事件类型

```java
protected void doBeginRead() throws Exception {
    // Channel.read() or ChannelHandlerContext.read() was called
    final SelectionKey selectionKey = this.selectionKey;
    if (!selectionKey.isValid()) {
        return;
    }

    readPending = true;
	//获得感兴趣的事件,由于之前在register中注册的就是0，这里得到的就是0
    final int interestOps = selectionKey.interestOps();
    //判断是不是对任何事件都不监听
    if ((interestOps & readInterestOp) == 0) {
    	//将accept事件注册, readInterestOp就是OP_ACCEPT事件类型
        selectionKey.interestOps(interestOps | readInterestOp);
    }
}
```

`readInterestOp`就是`OP_ACCEPT`事件类型，赋值是在最开始的`NioServerSocketChannel`初始化的过程中

```java
protected AbstractNioChannel(Channel parent, SelectableChannel ch, int readInterestOp){
	/**
	* 省略
	*/
    this.readInterestOp = readInterestOp;
    /**
	* 省略
	*/
}
```

```java
public NioServerSocketChannel(ServerSocketChannel channel) {
    super(null, channel, SelectionKey.OP_ACCEPT);
    config = new NioServerSocketChannelConfig(this, javaChannel().socket());
}
```

### NioEventLoop.run()

经过`doBind0`后，这时终于能监听`accept`事件了。回到`NioEventLoop.run()`中

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

这时队列`tailTasks`的任务为空，`strategy = selectStrategy.calculateStrategy(selectNowSupplier, hasTasks())`的结果为-1，可以执行`strategy = select(curDeadlineNanos)`

### NioEventLoop.select(long deadlineNanos)

调用NIO的Selector 中的 select()或者 selectNow()，返回注册到当前Selector中的，发生关注的IO事件的Channel个数

```java
private int select(long deadlineNanos) throws IOException {
    if (deadlineNanos == NONE) {
    	//会执行到这里，关注accept事件，没有此事件则会一直阻塞
        return selector.select();
    }
    // Timeout will only be 0 if deadline is within 5 microsecs
    long timeoutMillis = deadlineToDelayNanos(deadlineNanos + 995000L) / 1000000L;
    return timeoutMillis <= 0 ? selector.selectNow() : selector.select(timeoutMillis);
}
```

### 总结

-  `select`轮训注册在其中的 Selector 上的 Channel 的 IO 事件 
-  `processSelectedKeys`在对应的 Channel 上处理 IO 事件 
-  `runAllTasks`以此循环处理任务队列中的任务 

至此完成了流程图中`Boss Group`中的部分
![](/img/technologySharing/netty/流程图.png)