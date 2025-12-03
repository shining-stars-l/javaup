---
slug: /link-flow/tech-highlights/threadlocal-pitfalls
---

import PaidCTA from '@site/src/components/PaidCTA';

# ThreadLocal使用中致命的细节问题

我们在之前已经讲了很多关于 ThreadLocal 的设计与多线程的解决方案，而本章节介绍一个使用中容易被忽略的细节，保证你看完了后直拍大腿

# BaseParameterHolder
先设计一个ThreadLocal的工具
```java
public class BaseParameterHolder {
    
    private static final ThreadLocal<Map<String, String>> THREAD_LOCAL_MAP = new ThreadLocal<>();
    
    
    public static void setParameter(String name, String value) {
        Map<String, String> map = THREAD_LOCAL_MAP.get();
        if (map == null) {
            map = new HashMap<>(64);
        }
        map.put(name, value);
        THREAD_LOCAL_MAP.set(map);
    }
    
    public static String getParameter(String name) {
        return Optional.ofNullable(THREAD_LOCAL_MAP.get()).map(map -> map.get(name)).orElse(null);
    }
    
    public static void removeParameter(String name) {
        Map<String, String> map = THREAD_LOCAL_MAP.get();
        if (map != null) {
            map.remove(name);
        }
    }
    
    public static ThreadLocal<Map<String, String>> getThreadLocal() {
        return THREAD_LOCAL_MAP;
    }
    
    public static Map<String, String> getParameterMap() {
        Map<String, String> map = THREAD_LOCAL_MAP.get();
        if (map == null) {
            map = new HashMap<>(64);
        }
        return map;
    }
    
    public static void setParameterMap(Map<String, String> map) {
        THREAD_LOCAL_MAP.set(map);
    }
    
    public static void removeParameterMap(){
        THREAD_LOCAL_MAP.remove();
    }
}
```
**BaseParameterHolder** 中有个 ThreadLocal 类型成员属性 **THREAD_LOCAL_MAP**，里面放的数据是Map结构。

在操作 **BaseParameterHolder** 进行设值和取值的时候，其实就是操作 **THREAD_LOCAL_MAP** 中的Map结构

看着很简单，接下来用案例来详细解释

## 案例1
```java
public class Test01 {
    
    public static void main(String[] args) {
        BaseParameterHolder.setParameter("name", "小红");
        ExecutorService executors = Executors.newFixedThreadPool(10);
        
        Map<String, String> parameterMap = BaseParameterHolder.getParameterMap();
        System.out.println("主线程执行的数据获取:" + BaseParameterHolder.getParameter("name"));
        executors.execute(() -> {
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                throw new RuntimeException(e);
            }
            BaseParameterHolder.setParameterMap(parameterMap);
            System.out.println("线程池执行的数据获取:" + BaseParameterHolder.getParameter("name"));
        });
    }
}
```
先在主线程中，向BaseParameterHolder中存放数据，然后将数据取出，进行输出。

在线程池执行中，再把数据放入BaseParameterHolder中，然后将数据取出，进行输出。

### 结果
```
主线程执行的数据获取:小红
线程池执行的数据获取:小红
```
这样做肯定主线程和子线程都能取到数据

## 案例2
一般在操作 ThreadLocal 时，为了防止内存泄露，通常会在使用完后，手动的删除，所以在案例2中多了个删除的动作
```java
public class Test02 {
    
    public static void main(String[] args) {
        BaseParameterHolder.setParameter("name", "小红");
        ExecutorService executors = Executors.newFixedThreadPool(10);
        
        Map<String, String> parameterMap = BaseParameterHolder.getParameterMap();
        System.out.println("主线程执行的数据获取:" + BaseParameterHolder.getParameter("name"));
        executors.execute(() -> {
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                throw new RuntimeException(e);
            }
            BaseParameterHolder.setParameterMap(parameterMap);
            System.out.println("线程池执行的数据获取:" + BaseParameterHolder.getParameter("name"));
        });
        System.out.println("主线程执行删除数据");
        BaseParameterHolder.removeParameter("name");
    }
}
```
大家可以先思考一下结果是什么，然后再看结果

<PaidCTA />
