---
slug: /tech-sharing/springboot-issues/spring-smartlifecycle-lifecycle
---


# Spring中的SmartLifecycle和Lifecycle

1. `Lifecycle`是`spring`提供的生命周期操作的一个接口，用户可以在容器的启动和停止时执行自己的逻辑。
2. `SmartLifecycle`是对`Lifecycle`的扩展，例如增加了控制顺序等，详细会在下面介绍
3. 和`bean`的初始化和销毁的方法相比，`bean`的初始化方法和销毁方法是`Bean`生命周期级别的；而`Lifecycle`是容器生命周期级别的

## 介绍

### Lifecycle

**举例**

```java
@Component
public class TestLifecycle implements Lifecycle {

    //此组件运行状态的标识
    private volatile boolean running = false;

    //容器启动调用
    @Override
    public void start() {
        System.out.println("TestLifecycle.start()执行");
        running = true;
    }

    //容器停止调用
    @Override
    public void stop() {
        System.out.println("TestLifecycle.stop()执行");
        running = false;
    }

    //查看是否已运行。返回false，start()才执行。返回true，stop()才执行
    @Override
    public boolean isRunning() {
        System.out.println("TestLifecycle.isRunning()执行");
        return running;
    }
}
```

**结果**

```
TestLifecycle.isRunning()执行 running: false
TestLifecycle.start()执行
TestLifecycle.isRunning()执行 running: true
TestLifecycle.stop()执行
```

**注意**
一定要显示调用`spring`容器的`start`和`stop`方法,`Lifecycle`的接口方法才会被执行。所以一般都会使用`SmartLifecycle`

## SmartLifecycle

### 特点

1. 不需要显示调用容器的`start()`方法，就可以回调`SmartLifecycle`接口的`start()`
2. 容器中如果有多个`SmartLifecycle`实例，可以方便控制调用顺序

**举例**

```java
@Component
public class TestSmartLifecycle implements SmartLifecycle {

    //此组件运行状态的标识
    private volatile boolean running = false;

    /**
     * 只有返回true，容器才会在refresh时回调start()方法。
     * 返回false，则和Lifecycle相同，需要显示调用容器的start()方法。
     */
    @Override
    public boolean isAutoStartup() {
        return true;
    }

    /**
     *
     * @param callback
     */
    @Override
    public void stop(Runnable callback) {
        System.out.println("- - - TestSmartLifecycle stop callback- - -");
        stop();
        callback.run();
    }

    @Override
    public void start() {
        System.out.println("- - - TestSmartLifecycle start - - -");
        running = true;
    }

    @Override
    public void stop() {
        System.out.println("- - - TestSmartLifecycle stop - - -");
        running = false;
    }

    @Override
    public boolean isRunning() {
        System.out.println("- - - TestSmartLifecycle isRunning running: " + running + "- - -");
        return running;
    }

    /**
     * 阶段值   越小越靠前执行start()方法，越靠后执行stop()方法
     *
     * @return
     */
    @Override
    public int getPhase() {
        return 0;
    }
}
```

**结果**

```
- - - TestSmartLifecycle isRunning running: false- - -
- - - TestSmartLifecycle start - - -

- - - TestSmartLifecycle isRunning running: true- - -
- - - TestSmartLifecycle stop callback- - -
- - - TestSmartLifecycle stop - - -
```

## 方法介绍

### isAutoStartup()

只有返回`true`，容器才会在`refresh`时回调`start()`方法。
返回`false`，则和`Lifecycle`相同，需要显示调用容器的`start()`方法。

### start()

与`Lifecycle`接口中的功能一样，当刷新容器(也就是启动完成)时调用

### stop(Runnable callback)

当容器停止时，回调该方法。当执行完你自定义的逻辑后，一定要调用下`callback.run()` 这个是为了，告诉容器你已停止自己的组件完成。
这里多说一点，很多源码会在该方法内仅写两行代码，参考上面例子。一行是`stop()`把真正的逻辑转发到`stop()`
这个方法。另一行就是必须调用的`callback.run()`

### stop()

不会被Spring框架调用到!

### isRunning()

与`Lifecycle`接口中的功能一样，判断组件是否在运行

### getPhase()

控制多个`SmartLifecycle`的回调顺序的，返回值越小越靠前执行`start()`方法，越靠后执行`stop()`方法