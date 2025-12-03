---
slug: /tech-sharing/concurrency/synchronized
---


# synchronized各种使用场景以及注意细节

## 案例

开启10个线程，每个线程中循环100次对result变量进行++自增，主线程等待10s后输出result值结果

```java
public class SynchronizedCase {
    private static Integer result = 0;
    
    public static void main(String[] args) {
        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                for (int j = 0; j < 100; j++) {
                    result++;
                }
            }).start();
        }
        try {
            Thread.sleep(10000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("执行结果 result : " + result);
    }
}
```

### 结果

```java
执行结果 result : 869
```

执行结果不一定是869，可能是其他的数，总之就是比正确的结果1000小

### 原因
result++这个操作的执行过程其实是3个步骤

1. 读取result变量
2. 将result变量进行+1
3. 将result值再赋给result变量
详细的过程需要进行反编译来分析详细的过程，不是本文的重点，我们只需要知道这个三个过程就行

## Synchronized

## 特性

- 互斥性：保证同一时刻只能有允许一个线程持有锁(对象或者静态类范围)，通过这种多线程协调机制，保证其他线程必须等待该持有锁的线程执行完自己的任务释放了锁后，再获得锁的线程才能执行
- 可见性：保证了获得锁的线程执行后，对于共享变量所做的操作，对于其他获得锁的线程是可见的（即在获得锁时应获得最新共享变量的值）。

## 作用范围

- synchronized代码块加到对象上，则锁的范围为此对象

```java
public class SynchronizedCase2 {
    private static Integer result = 0;
    
    public static void main(String[] args) {
    	//要加锁的对象
        Object object = new Object();
        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                synchronized (object) {
                    for (int j = 0; j < 100; j++) {
                        result++;
                    }
                }
            }).start();
        }
        try {
            Thread.sleep(10000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("执行结果 result : " + result);
    }
}
```

- synchronized加在方法上，则锁的范围对调用方法的this对象

```java
public class SynchronizedCase3 {
    private static Integer result = 0;
    
    public void increment(){
        for (int j = 0; j < 100; j++) {
            result++;
        }
    }
    
    public static void main(String[] args) {
        SynchronizedCase3 synchronizedCase3 = new SynchronizedCase3();
        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                synchronizedCase3.increment();
            }).start();
        }
        try {
            Thread.sleep(10000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("执行结果 result : " + result);
    }
}
```

- synchronized代码块加到class上，则锁的范围为此类

```java
public class SynchronizedCase4 {
    private static Integer result = 0;
    
    public static void main(String[] args) {
        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                synchronized (SynchronizedCase4.class) {
                    for (int j = 0; j < 100; j++) {
                        result++;
                    }
                }
            }).start();
        }
        try {
            Thread.sleep(10000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("执行结果 result : " + result);
    }
}
```

- synchronized添加在静态方法上，则锁的范围为此静态方法的类

```java
public class SynchronizedCase5 {
    private static Integer result = 0;
    
    public static synchronized void increment(){
        for (int j = 0; j < 100; j++) {
            result++;
        }
    }
    
    public static void main(String[] args) {
        for (int i = 0; i < 10; i++) {
            new Thread(() -> {
                SynchronizedCase5.increment();
            }).start();
        }
        try {
            Thread.sleep(10000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("执行结果 result : " + result);
    }
}
```

## 注意点

- 一个线程加了synchronized对象锁，另一个线程没有加锁，是否能保证互斥性

```java
public class SynchronizedCase5 {
    private static Integer result = 0;
    
    public static void main(String[] args) {
        Object object = new Object();
        new Thread(() -> {
            synchronized (object) {
                for (int j = 0; j < 50000; j++) {
                    result++;
                }
            }
        }).start();
        new Thread(() -> {
            for (int j = 0; j < 50000; j++) {
                result++;
            }
        }).start();
        try {
            Thread.sleep(10000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("执行结果 result : " + result);
    }
}
```

结果

```
执行结果 result : 60859
```

实际结果证明这种情况不能保证线程安全性

- 一个线程加了synchronized对象锁，另一个线程加synchronized到此class上，是否能保证互斥性

```java
public class SynchronizedCase6 {
    private static Integer result = 0;
    
    public static void main(String[] args) {
        SynchronizedCase6 synchronizedCase6 = new SynchronizedCase6();
        synchronizedCase6.test();
    }
    
    public void test(){
        new Thread(() -> {
            synchronized (this) {
                for (int j = 0; j < 50000; j++) {
                    result++;
                }
            }
        }).start();
        new Thread(() -> {
            synchronized (SynchronizedCase6.class) {
                for (int j = 0; j < 50000; j++) {
                    result++;
                }
            }
        }).start();
        try {
            Thread.sleep(10000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        System.out.println("执行结果 result : " + result);
    }
}
```

### 结果

```
执行结果 result : 59847
```

由于一个线程的锁是在this对象，另一个对象是在class上，不是同一个锁，所以保证不了互斥性
