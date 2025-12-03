---
slug: /tech-sharing/production-issues/mybatis
---

# Mybatis粗心使用导致内存溢出

服务响应变慢，线程日志也出现`Java heap space`内存溢出的错误，这个服务属于基础业务服务，出现问题要尽快的排查

## 分析

因为设置了gc日志和jmap启动相关参数

所以我们进行分析，这里模拟线上环境将堆大小参数调整到了128m，完成的参数

```
-XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=128m -Xms64M -Xmx64M -Xloggc:./gc.log -XX:+PrintGCDateStamps -XX:+PrintGCDetails -XX:+PrintHeapAtGC -XX:+HeapDumpOnOutOfMemoryError
```

下面来分析这两个文件

## gc.log

![](/img/technologySharing/mybatis/GC前.png)
![](/img/technologySharing/mybatis/GC后.jpeg)
![](/img/technologySharing/mybatis/Old代.jpeg)
可以很明显的看出gc已经不能把对象进行回收了发生了内存泄露

## hprof文件

![](/img/technologySharing/mybatis/hprof文件.jpeg)

从这张图能看到tomcat的一个线程里面的逻辑是从mysql查询数据，其中有个数据库字段类型为text占用空间比较大，映射的对象由于是String类型所以显示的是byte[]数组占用为2000byte。这个数组在这个集合内还有很多很多...

这肯定是不正常的现象，然后我们从日志调用链路查到了具体的接口，看到了mybatis中这条sql的逻辑
![](/img/technologySharing/mybatis/mybatis中这条sql的逻辑.jpeg)
问题在departmentIdList参数，通过日志我们看到这个参数其实是没有传进来的为null，所以if条件是不进入的，这就导致把没必要的数据也全都查了出来，一次性查出了几十万的数据，再由于qps比较高，一下子就内存溢出了。

后来和开发人员沟通发现这个方法是之前就存在的，他是在原有的基础上添加了此条件，而别的地方也会用到这个方法不会带有这个参数，所以就查出了很多数据造成内存溢出。

## 解决思路

首先让开发人员另外写一个方法不要复用之前的，而且额外再加上条件限制。
![](/img/technologySharing/mybatis/加上条件限制.jpeg)
这里加上了额外的条件限制，如果departmentIdList参数为null的话，则查询不到数据。
