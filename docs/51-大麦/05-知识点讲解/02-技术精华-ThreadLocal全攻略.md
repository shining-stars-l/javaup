---
slug: /damai/knowledge/threadlocal-guide
---

# ThreadLocal全攻略

## ThreadLocal

### 每个线程向ThreadLocal设置值，再取值，实现线程之间的隔离

```java
public class ThreadLocalCase1 {
    
    private static ThreadLocal<Integer> threadLocal = new ThreadLocal<>();
    
    public static void main(String[] args) {
        Random random = new Random(); 
        for (int i = 0; i < 5; i++) {
            Thread thread = new Thread(() -> {
                int value = random.nextInt(10000);
                threadLocal.set(value);
                System.out.println(Thread.currentThread().getName() + "开始执行，放入值，值为 : " + value);
                System.out.println(Thread.currentThread().getName() + "结束执行，进行取值，值为 : " + threadLocal.get());
            }); 
            thread.setName("thread-" + i); 
            thread.start();
        }
    }
}
```

### 结果

```
thread-0开始执行，放入值，值为 : 7406
thread-4开始执行，放入值，值为 : 5258
thread-3开始执行，放入值，值为 : 9672
thread-2开始执行，放入值，值为 : 8583
thread-1开始执行，放入值，值为 : 9311
thread-2结束执行，进行取值，值为 : 8583
thread-3结束执行，进行取值，值为 : 9672
thread-4结束执行，进行取值，值为 : 5258
thread-0结束执行，进行取值，值为 : 7406
thread-1结束执行，进行取值，值为 : 9311
```

实现了线程之间的隔离性



### 主线程向ThreadLocal设置值，每个子线程再取值

```java
public class ThreadLocalCase2 {
    
    private static ThreadLocal<Integer> threadLocal = new ThreadLocal<>();
      
    public static void main(String[] args) {
        Random random = new Random();
        int value = random.nextInt(10000);
        threadLocal.set(value);
        System.out.println(Thread.currentThread().getName() + "放入值，值为 : " + value);
        Thread thread = new Thread(() -> {
            System.out.println(Thread.currentThread().getName() + "进行取值，值为 : " + threadLocal.get());
        });
        thread.setName("thread-1");
        thread.start();
        System.out.println(Thread.currentThread().getName() + "进行取值，值为 : " + threadLocal.get());
    }
}
```

### 结果

```
main放入值，值为 : 3831
main进行取值，值为 : 3831
thread-1进行取值，值为 : null
```

发现主线程向 `ThreadLocal` 设置值，每个子线程再取值时为null，这时需要换用 `InheritableThreadLocal`



## InheritableThreadLocal

### 主线程向InheritableThreadLocal设置值，子线程再取值

```java
public class ThreadLocalCase2 {
    
    private static InheritableThreadLocal<Integer> threadLocal = new InheritableThreadLocal<>();
    
    public static void main(String[] args) {
        Random random = new Random();
        int value = random.nextInt(10000);
        threadLocal.set(value);
        System.out.println(Thread.currentThread().getName() + "放入值，值为 : " + value);
        Thread thread = new Thread(() -> {
            System.out.println(Thread.currentThread().getName() + "进行取值，值为 : " + threadLocal.get());
        });
        thread.setName("thread-1");
        thread.start();
        System.out.println(Thread.currentThread().getName() + "进行取值，值为 : " + threadLocal.get());
    }
}
```

### 结果

```
main放入值，值为 : 2046
main进行取值，值为 : 2046
thread-1进行取值，值为 : 2046
```

```java
public class ThreadLocalCase3 {
    private static ExecutorService executor = Executors.newFixedThreadPool(2);
    private static InheritableThreadLocal<Integer> threadLocal = new InheritableThreadLocal<>();
    public static void main(String[] args) {
        for (int i = 0; i < 5; i++) {
            Random random = new Random();
            int value = random.nextInt(10000);
            threadLocal.set(value);
            System.out.println(Thread.currentThread().getName() + "放入值，值为 : " + value);
            executor.execute(() -> {
                System.out.println(Thread.currentThread().getName() + "进行取值，值为 : " + threadLocal.get());
            });
            System.out.println(Thread.currentThread().getName() + "进行取值，值为 : " + threadLocal.get());
            threadLocal.remove();
        }
    }
}
```

### 结果

```
main放入值，值为 : 8525
main进行取值，值为 : 8525
main放入值，值为 : 7802
main进行取值，值为 : 7802
pool-1-thread-1进行取值，值为 : 8525
main放入值，值为 : 3570
pool-1-thread-2进行取值，值为 : 7802
main进行取值，值为 : 3570
pool-1-thread-1进行取值，值为 : 8525
main放入值，值为 : 5081
main进行取值，值为 : 5081
pool-1-thread-2进行取值，值为 : 7802
main放入值，值为 : 4829
main进行取值，值为 : 4829
pool-1-thread-1进行取值，值为 : 8525
```

结果发现线程池取出了两次7802和三次8525，主线程中设置的3570、5081、4829在线程池中没有被取出，发生了错误。
这是由于InheritableThreadLocal会保证 **子线程能读取父线程中的数据，但线程池中的核心线程是复用的**，所以有可能会发生重复读取的情况。



## TransmittableThreadLocal

### 开启循环，每个循环中主线程使用InheritableThreadLocal进行设置，使用线程池来进行取值，解决线程复用产生的问题

```java
public class ThreadLocalCase4 {
    
    private static ExecutorService executor = Executors.newFixedThreadPool(2);
    
    private static TransmittableThreadLocal<Integer> threadLocal = new TransmittableThreadLocal<>();
    
    public static void main(String[] args) {
        
        for (int i = 0; i < 5; i++) {
            Random random = new Random();
            int value = random.nextInt(10000);
            threadLocal.set(value);
            System.out.println(Thread.currentThread().getName() + "放入值，值为 : " + value);
            executor.execute(TtlRunnable.get(() -> {
                System.out.println(Thread.currentThread().getName() + "进行取值，值为 : " + threadLocal.get());
            }));
            System.out.println(Thread.currentThread().getName() + "进行取值，值为 : " + threadLocal.get());
            threadLocal.remove();
        }
        
    }
}
```

### 结果

```
main放入值，值为 : 974
main进行取值，值为 : 974
main放入值，值为 : 4545
main进行取值，值为 : 4545
main放入值，值为 : 5901
pool-1-thread-1进行取值，值为 : 974
main进行取值，值为 : 5901
pool-1-thread-1进行取值，值为 : 5901
pool-1-thread-2进行取值，值为 : 4545
main放入值，值为 : 3716
main进行取值，值为 : 3716
pool-1-thread-1进行取值，值为 : 3716
main放入值，值为 : 2452
main进行取值，值为 : 2452
pool-1-thread-2进行取值，值为 : 2452
```

结果是即使线程池的线程被复用，读取的结果也是正常的



## ThreadLocal原理

### Thread

```java
public class Thread implements Runnable {
   //省略....
   
    /* 
     * 当前线程的ThreadLocalMap，主要存储该线程自身的ThreadLocal
     */
    ThreadLocal.ThreadLocalMap threadLocals = null;

   //省略....
}
```

- **ThreadLocal类：** 
   - `ThreadLocal` 是一个泛型类，用于存储每个线程的本地变量副本。 每个线程通过 `ThreadLocal` 实例获取和操作自己的变量副本，避免了多线程间的资源竞争。
- **ThreadLocalMap：** 
   - `ThreadLocalMap` 是 `ThreadLocal` 的内部静态类，用于存储线程局部变量。 每个线程都有一个独立的 `ThreadLocalMap` 实例，用来存储该线程的 `ThreadLocal` 变量。
   `ThreadLocalMap` 以 `ThreadLocal` 实例作为键，实际存储的值作为值。
- **get()和set()方法：** 
   - 使用 `ThreadLocal` 的get()方法，可以获取当前线程的 `ThreadLocal` 变量。使用 `ThreadLocal` 的set()方法，可以设置当前线程的 `ThreadLocal` 变量。
   get()和set()方法内部会调用 `Thread.currentThread()` 获取当前线程，然后在该线程的 `ThreadLocalMap` 中查找或设置对应的值。


![](/img/technologySharing/threadlocal/ThreadLocal.png)

### 内存泄露问题

- ThreadLocalMap 中的键使用弱引用： 
   - ThreadLocalMap 中的键是对 ThreadLocal 实例的弱引用。当没有强引用指向 ThreadLocal 实例时，垃圾回收器会回收这个 ThreadLocal 实例，导致 ThreadLocalMap 中的键变为null。
   - jdk1.8环境下的 ThreadLocal 采取嗅探机制，将调用 get 或 set 方法时，会主动探测是否含有 key 为空的 value 没有被回收的情况，如果有会主动清理。但我们依旧要在使用完后主动的调用 remove


![](/img/technologySharing/threadlocal/ThreadLocal内存溢出.png)



## InheritableThreadLocal原理

### InheritableThreadLocal重写的方法
```java
public class InheritableThreadLocal<T> extends ThreadLocal<T> {
    
    protected T childValue(T parentValue) {
        return parentValue;
    }

    
    ThreadLocalMap getMap(Thread t) {
       return t.inheritableThreadLocals;
    }

    
    void createMap(Thread t, T firstValue) {
        t.inheritableThreadLocals = new ThreadLocalMap(this, firstValue);
    }
}
```



### Thread结构

```java
public class Thread implements Runnable {
    //省略....
    /* 
     * 存储本线程自身的ThreadLocal
     */
    ThreadLocal.ThreadLocalMap threadLocals = null;

    /*
     * 从父线程集成而来的ThreadLocalMap，
     */
    ThreadLocal.ThreadLocalMap inheritableThreadLocals = null;
    
    //省略....
}
```



### 主线程中调用InheritableThreadLocal的set方法

set依旧是`ThreadLocal`中

```java
public void set(T value) {
    Thread t = Thread.currentThread();
    //被InheritableThreadLocal重写，第一次为空
    ThreadLocalMap map = getMap(t);
    if (map != null) {
        map.set(this, value);
    } else {
    	//被InheritableThreadLocal重写，创建ThreadLocalMap赋值给inheritableThreadLocals变量
        createMap(t, value);
    }
}
```

这时就是Thread中的inheritableThreadLocals变量存储ThreadLocalMap



### 子线程初始化

```java
public Thread(Runnable target) {
    init(null, target, "Thread-" + nextThreadNum(), 0);
}
```

```java
private void init(ThreadGroup g, Runnable target, String name,
                  long stackSize) {
    init(g, target, name, stackSize, null, true);
}
```

```java
private void init(ThreadGroup g, Runnable target, String name,
                  long stackSize, AccessControlContext acc,
                  boolean inheritThreadLocals) {

    //省略....
    
    //inheritThreadLocals为true
    //parent.inheritableThreadLocals就是在主线程进行set的时候生成为所以不为null
    if (inheritThreadLocals && parent.inheritableThreadLocals != null)
        this.inheritableThreadLocals =
            ThreadLocal.createInheritedMap(parent.inheritableThreadLocals);

    //省略....        
    
}
```

`ThreadLocal.createInheritedMap(parent.inheritableThreadLocals)` 就是将主线程的 `ThreadLocalMap` 拷贝到子线程中

```java
static ThreadLocalMap createInheritedMap(ThreadLocalMap parentMap) {
    return new ThreadLocalMap(parentMap);
}
```

```java
/**
 * 将父线程的ThreadLocalMap拷贝到此线程中
 */
private ThreadLocalMap(ThreadLocalMap parentMap) {
    //父线程的ThreadLocalMap的entry数组 
    Entry[] parentTable = parentMap.table;
    int len = parentTable.length;
    setThreshold(len);
    // 这里的table就是此线程中的ThreadLocalMap的entry数组 
    table = new Entry[len];

    // 循环进行拷贝 parentMap 的记录
    for (int j = 0; j < len; j++) {
        Entry e = parentTable[j];
        if (e != null) {
            @SuppressWarnings("unchecked")
            ThreadLocal<Object> key = (ThreadLocal<Object>) e.get();
            if (key != null) {
                //这里被InheritableThreadLocal重写，直接返回value，不做任何操作
                Object value = key.childValue(e.value);
                Entry c = new Entry(key, value);
                int h = key.threadLocalHashCode & (len - 1);
                while (table[h] != null)
                    h = nextIndex(h, len);
                table[h] = c;
                size++;
            }
        }
    }
}
```

到这里就将父线程中的值复制到子线程中了

![](/img/technologySharing/threadlocal/InheritableThreadLocal.png)



## TransmittableThreadLocal原理

知道了 `InheritableThreadLocal` 的原理后，`TransmittableThreadLocal` 就比较好理解了

因为 `TransmittableThreadLocal` 继承了 `InheritableThreadLocal`，所以是含有 `InheritableThreadLocal` 功能的，原理也比较简单，直接原理图就能概括

![](/img/technologySharing/threadlocal/TransmittableThreadLocal.png)
