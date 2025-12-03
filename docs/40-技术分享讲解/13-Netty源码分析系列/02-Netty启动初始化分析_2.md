---
slug: /tech-sharing/netty-source/netty-part-2
---

# Netty启动初始化分析_2

继续分析 初始化和注册 AbstractBootstrap#initAndRegister()
之前分析了

- `channel = channelFactory.newChannel();`
- `init(channel);`

下面来分析`ChannelFuture regFuture = config().group().register(channel);`

## 5.1.3 注册

```java
ChannelFuture regFuture=config().group().register(channel);
```

### 5.1.3.1 得到配置 config()

```java
private final ServerBootstrapConfig config = new ServerBootstrapConfig(this);

public final ServerBootstrapConfig config() {
    return config;
}
```

### 5.1.3.2 得到EventLoopGroup group()

```java
public final EventLoopGroup group() {
    return bootstrap.group();
}
```

进入`AbstractBootstrap`

```java
//这里的group实现类是NioEventLoopGroup
volatile EventLoopGroup group;

public final EventLoopGroup group() {
    return group;
}
```

### 5.1.3.3 进行注册register(channel)

进入`MultithreadEventLoopGroup`

```java
public ChannelFuture register(Channel channel) {
    return next().register(channel);
}
```

### 5.1.3.3.1 进入next()方法

```java
public EventLoop next() {
    return (EventLoop) super.next();
}
```

进入`MultithreadEventExecutorGroup`

```java
private final EventExecutorChooserFactory.EventExecutorChooser chooser;

public EventExecutor next() {
    return chooser.next();
}
```

`DefaultEventExecutorChooserFactory.next()`

```java
private final AtomicInteger idx = new AtomicInteger();
private final EventExecutor[] executors;
public EventExecutor next() {
    return executors[idx.getAndIncrement() & executors.length - 1];
}
```

### 5.1.3.3.1.1 分析chooser是什么时候被赋值的

在`MultithreadEventExecutorGroup`的构造方法中

```java
chooser = chooserFactory.newChooser(children);
```

`DefaultEventExecutorChooserFactory.(EventExecutor[] executors)`

```java
public EventExecutorChooser newChooser(EventExecutor[] executors) {
    if (isPowerOfTwo(executors.length)) {
        return new PowerOfTwoEventExecutorChooser(executors);
    } else {
        return new GenericEventExecutorChooser(executors);
    }
}
```

```java
PowerOfTwoEventExecutorChooser(EventExecutor[] executors) {
    this.executors = executors;
}
```

可以看到`next()`方法就是从线程组`children`选择来进行注册，策略为轮询

### 5.1.3.3.2 进入register(channel)方法

进入`SingleThreadEventLoop`

```java
public ChannelFuture register(Channel channel) {
    return register(new DefaultChannelPromise(channel, this));
}
```

-  
### 进入`new DefaultChannelPromise(channel, this)`方法

-  

```java
new DefaultChannelPromise(channel, this)
```

`DefaultChannelPromise`继承了`ChannelPromise`，`ChannelPromise`是一种特殊的`ChannelFuture`相当于加强。

-  
### 进入`register(new DefaultChannelPromise(channel, this))`的`register`方法

-  

```java
public ChannelFuture register(final ChannelPromise promise) {
    ObjectUtil.checkNotNull(promise, "promise");
    promise.channel().unsafe().register(this, promise);
    return promise;
}
```

`promise.channel().unsafe()`得到的是`AbstractChannel`。

进入`AbstractChannel`

```java
public final void register(EventLoop eventLoop, final ChannelPromise promise) {
    ObjectUtil.checkNotNull(eventLoop, "eventLoop");
    if (isRegistered()) {
        promise.setFailure(new IllegalStateException("registered to an event loop already"));
        return;
    }
    if (!isCompatible(eventLoop)) {
        promise.setFailure(
                new IllegalStateException("incompatible event loop type: " + eventLoop.getClass().getName()));
        return;
    }

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
            logger.warn(
                    "Force-closing a channel whose registration task was not accepted by an event loop: {}",
                    AbstractChannel.this, t);
            closeForcibly();
            closeFuture.setClosed();
            safeSetFailure(promise, t);
        }
    }
}
```

**判断当前调用此方法的线程和eventLoop(也就是SingleThreadEventExecutor)中的线程是不是同一个eventLoop.inEventLoop()**

```java
public boolean inEventLoop(Thread thread) {
    return thread == this.thread;
}
```

- 解释为什么要有这个判断逻辑 
   - 因为要保证执行注册的逻辑始终都是由EventLoop中的thread来调用的，避免多个线程调用引发的线程不安全。
   - 第一次执行注册方法的时候, 如果是服务器channel是则是由server的用户线程执行的, 如果是客户端channel, 则是由Boss线程执行的, 所以走到这里均不是当前channel的NioEventLoop的线程, 于是会走到下面的eventLoop.execute()方法中

### eventLoop.execute

```java
private void execute(Runnable task, boolean immediate) {
    boolean inEventLoop = inEventLoop();
    //将任务放进队列中，此时的任务是register0(promise)
    addTask(task);
    if (!inEventLoop) {
    	//执行逻辑
        startThread();
        if (isShutdown()) {
            boolean reject = false;
            try {
                if (removeTask(task)) {
                    reject = true;
                }
            } catch (UnsupportedOperationException e) {
                // The task queue does not support removal so the best thing we can do is to just move on and
                // hope we will be able to pick-up the task before its completely terminated.
                // In worst case we will log on termination.
            }
            if (reject) {
                reject();
            }
        }
    }

    if (!addTaskWakesUp && immediate) {
        wakeup(inEventLoop);
    }
}
```

### SingleThreadEventExecutor.addTask(Runnable task)

```java
protected void addTask(Runnable task) {
    ObjectUtil.checkNotNull(task, "task");
    if (!offerTask(task)) {
        reject(task);
    }
}
```

#### SingleThreadEventExecutor.offerTask(Runnable task)

```java
final boolean offerTask(Runnable task) {
    if (isShutdown()) {
        reject();
    }
    return taskQueue.offer(task);
}
```

到这里将任务`register0(promise)`方法队列`taskQueue`中。接着回到`eventLoop.execute`中，`分析startThread()`

### SingleThreadEventExecutor.startThread

```java
private void startThread() {
    //判断线程是否没有启动过，没有的话设置为已启动状态，保证NIoEventLoop中只有一个线程在启动
    if (state == ST_NOT_STARTED) {
        //设置为已启动状态
        if (STATE_UPDATER.compareAndSet(this, ST_NOT_STARTED, ST_STARTED)) {
            boolean success = false;
            try {
                doStartThread();
                success = true;
            } finally {
                if (!success) {
                    STATE_UPDATER.compareAndSet(this, ST_STARTED, ST_NOT_STARTED);
                }
            }
        }
    }
}
```

**SingleThreadEventExecutor.doStartThread()**

```java
private void doStartThread() {
    assert thread == null;
    /**
	* 这个executor.execute是异步操作
	* 	源码：
	* 	public void execute(Runnable command) {
    *    	threadFactory.newThread(command).start();
    *	}
	*/
    executor.execute(new Runnable() {
        @Override
        public void run() {
            thread = Thread.currentThread();
            if (interrupted) {
                thread.interrupt();
            }

            boolean success = false;
            updateLastExecutionTime();
            try {
                //执行当前NioEventLoop中的run,这是整个NioEventLoop的核心
                SingleThreadEventExecutor.this.run();
                success = true;
            } catch (Throwable t) {
                logger.warn("Unexpected exception from an event executor: ", t);
            } finally {
                //当线程中loop结束的时候使用cas修改状态，修改为ST_SHUTTING_DOWN
                for (;;) {
                    int oldState = state;
                    if (oldState >= ST_SHUTTING_DOWN || STATE_UPDATER.compareAndSet(
                            SingleThreadEventExecutor.this, oldState, ST_SHUTTING_DOWN)) {
                        break;
                    }
                }

                // Check if confirmShutdown() was called at the end of the loop.
                if (success && gracefulShutdownStartTime == 0) {
                    if (logger.isErrorEnabled()) {
                        logger.error("Buggy " + EventExecutor.class.getSimpleName() + " implementation; " +
                                SingleThreadEventExecutor.class.getSimpleName() + ".confirmShutdown() must " +
                                "be called before run() implementation terminates.");
                    }
                }

                try {
                    // Run all remaining tasks and shutdown hooks. At this point the event loop
                    // is in ST_SHUTTING_DOWN state still accepting tasks which is needed for
                    // graceful shutdown with quietPeriod.
                    for (;;) {
                        if (confirmShutdown()) {
                            break;
                        }
                    }

                    // Now we want to make sure no more tasks can be added from this point. This is
                    // achieved by switching the state. Any new tasks beyond this point will be rejected.
                    for (;;) {
                        int oldState = state;
                        if (oldState >= ST_SHUTDOWN || STATE_UPDATER.compareAndSet(
                                SingleThreadEventExecutor.this, oldState, ST_SHUTDOWN)) {
                            break;
                        }
                    }

                    // We have the final set of tasks in the queue now, no more can be added, run all remaining.
                    // No need to loop here, this is the final pass.
                    confirmShutdown();
                } finally {
                    try {
                        //执行cleanup，修改状态为ST_TERMINATED，释放当前线程锁。如果队列不为空，
                        //输出队列中的未完成的任务，回调terminationFuture方法
                        cleanup();
                    } finally {
                        // Lets remove all FastThreadLocals for the Thread as we are about to terminate and notify
                        // the future. The user may block on the future and once it unblocks the JVM may terminate
                        // and start unloading classes.
                        // See https://github.com/netty/netty/issues/6596.
                        FastThreadLocal.removeAll();

                        STATE_UPDATER.set(SingleThreadEventExecutor.this, ST_TERMINATED);
                        threadLock.countDown();
                        int numUserTasks = drainTasks();
                        if (numUserTasks > 0 && logger.isWarnEnabled()) {
                            logger.warn("An event executor terminated with " +
                                    "non-empty task queue (" + numUserTasks + ')');
                        }
                        terminationFuture.setSuccess(null);
                    }
                }
            }
        }
    });
}
```

**NioEventLoop.run()**

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

这是一个死循环，里面主要两个逻辑

- 执行`select(curDeadlineNanos)`，进行阻塞等待事件来临。但是前提条件 `strategy = selectStrategy.calculateStrategy(selectNowSupplier, hasTasks())`,`strategy`为-1才能执行`select(curDeadlineNanos)`。`strategy`为-1要求`hasTasks()`为false，也就是`tailTasks`队列中没有任务才行
- 执行到`ranTasks = runAllTasks(0)`,从队列中取出任务后执行

**runAllTasks(0)**
重点关于`ranTasks = runAllTasks(0)`这行，这里要取队列`taskQueue`中的任务来执行

```java
protected boolean runAllTasks(long timeoutNanos) {
    fetchFromScheduledTaskQueue();
    //从队列taskQueue取出任务
    Runnable task = pollTask();
    if (task == null) {
        afterRunningAllTasks();
        return false;
    }

    final long deadline = timeoutNanos > 0 ? ScheduledFutureTask.nanoTime() + timeoutNanos : 0;
    long runTasks = 0;
    long lastExecutionTime;
    for (;;) {
        //执行任务
        safeExecute(task);

        runTasks ++;

        // Check timeout every 64 tasks because nanoTime() is relatively expensive.
        // XXX: Hard-coded value - will make it configurable if it is really a problem.
        if ((runTasks & 0x3F) == 0) {
            lastExecutionTime = ScheduledFutureTask.nanoTime();
            if (lastExecutionTime >= deadline) {
                break;
            }
        }

        task = pollTask();
        if (task == null) {
            lastExecutionTime = ScheduledFutureTask.nanoTime();
            break;
        }
    }

    afterRunningAllTasks();
    this.lastExecutionTime = lastExecutionTime;
    return true;
}
```

```java
protected Runnable pollTask() {
    assert inEventLoop();
    return pollTaskFrom(taskQueue);
}

protected static Runnable pollTaskFrom(Queue<Runnable> taskQueue) {
    for (;;) {
        Runnable task = taskQueue.poll();
        if (task != WAKEUP_TASK) {
            return task;
        }
    }
}
```

这时`pollTaskFrom`参数中的`taskQueue`就是刚才`eventLoop.execute`中的`addTask(task)`里面执行的队列。下面分析这个注册任务的执行
**AbstractEventExecutor.safeExecute(Runnable task)**

```java
protected static void safeExecute(Runnable task) {
    try {
        task.run();
    } catch (Throwable t) {
        logger.warn("A task raised an exception. Task: {}", task, t);
    }
}
```

此时`task`就是`register0(promise)`
**AbstractChannel.register0(promise)**

```java
private void register0(ChannelPromise promise) {
    try {
        //查看注册操作是否已经取消，或者对应channel已经关闭
        if (!promise.setUncancellable() || !ensureOpen(promise)) {
            return;
        }
        boolean firstRegistration = neverRegistered;
        //执行真正的注册操作
        doRegister();
        //修改注册状态
        neverRegistered = false;
        registered = true;

        //回调pipeline中添加的ChannelInitializer的handlerAdded方法，在这里初始化channelPipeline
        pipeline.invokeHandlerAddedIfNeeded();
		//设置regFuture为success，触发operationComplete回调,将bind操作放入Reactor的任务队列中，等待Reactor线程执行。
        safeSetSuccess(promise);
        //触发channelRegister事件
        pipeline.fireChannelRegistered();
        //对于服务端ServerSocketChannel来说 只有绑定端口地址成功后 channel的状态才是active的。
        //此时绑定操作作为异步任务在Reactor的任务队列中，绑定操作还没开始，所以这里的isActive()是false
        if (isActive()) {
            if (firstRegistration) {
            	//触发channelActive事件
                pipeline.fireChannelActive();
            } else if (config().isAutoRead()) {
                beginRead();
            }
        }
    } catch (Throwable t) {
        // Close the channel directly to avoid FD leak.
        closeForcibly();
        closeFuture.setClosed();
        safeSetFailure(promise, t);
    }
}
```

**AbstractNioChannel.doRegister()**

```java
protected void doRegister() throws Exception {
    boolean selected = false;
    for (;;) {
        try {
            selectionKey = javaChannel().register(eventLoop().unwrappedSelector(), 0, this);
            return;
        } catch (CancelledKeyException e) {
            if (!selected) {
                // Force the Selector to select now as the "canceled" SelectionKey may still be
                // cached and not removed because no Select.select(..) operation was called yet.
                eventLoop().selectNow();
                selected = true;
            } else {
                // We forced a select operation on the selector before but the SelectionKey is still cached
                // for whatever reason. JDK bug ?
                throw e;
            }
        }
    }
}
```

在此方法内看到了`channel`注册到`selector`的操作，但事件类型为0，也就是`对任何事件都不感兴趣`。后续一定会有个操作来监听`OPS_ACCEPT`事件。这个操作会在`AbstractBootstrap.doBind(final SocketAddress localAddress)`中执行下篇会进行分析
