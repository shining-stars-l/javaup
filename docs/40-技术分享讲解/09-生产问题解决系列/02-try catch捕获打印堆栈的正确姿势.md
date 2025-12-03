---
slug: /tech-sharing/production-issues/try-catch
---

# try catch捕获打印堆栈的正确姿势

当开启多线程后，线程内的方法出现异常时异常是不会抛到主线程的，这时可以进行try catch并打印堆栈的方法进行处理。当出现问题后能快速定位有问题的代码位置

## 说明

```java
public static void testTryCatch(){
	Executors.newFixedThreadPool(1).execute(() -> {
		execute1();
		execute2();
	});
	execute3();
}
public static void execute1(){
	int i = 4/0;
	logger.info("execute1执行 结果:{}",i);
}
public static void execute2(){
	int i = 4/2;
	logger.info("execute2执行 结果:{}",i);
}
public static void execute3(){
	int i = 4/4;
	logger.info("execute3执行 结果:{}",i);
}
```

### 结果

```java
Exception in thread "pool-1-thread-1" java.lang.ArithmeticException: / by zero
	at test.SpringbootApplication.execute1(SpringbootApplication.java:236)
	at test.SpringbootApplication.lambda$testTryCatch$4(SpringbootApplication.java:230)
	at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1149)
	at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:624)
	at java.lang.Thread.run(Thread.java:750)
11:26:29.993 [main] INFO test.SpringbootApplication - execute3执行 结果:1
```

可以看到子线程出现异常时不会影响到主线程执行

## try catch处理

```java
public static void testTryCatch(){
	Executors.newFixedThreadPool(1).execute(() -> {
		try{
			execute1();
		}catch (Exception e) {
		  logger.info("testTryCatch出现异常1 message:{}",e.toString());
	      logger.info("testTryCatch出现异常2 message:{}",e.getMessage());
	      logger.info("testTryCatch出现异常3 message:{}", JSON.toJSONString(e.getStackTrace()));
	      logger.info("testTryCatch出现异常4 message:{}",e);
	      logger.info("testTryCatch出现异常5",e);
		}
	});
}
public static void execute1(){
	int i = 4/0;
	logger.info("execute1执行 结果:{}",i);
}
```

### 结果

```java
13:52:23.946 [pool-1-thread-1] INFO test.SpringbootApplication - testTryCatch出现异常1 message:java.lang.ArithmeticException: / by zero
13:52:23.949 [pool-1-thread-1] INFO test.SpringbootApplication - testTryCatch出现异常2 message:/ by zero
13:52:24.008 [pool-1-thread-1] INFO test.SpringbootApplication - testTryCatch出现异常3 message:
[
    {
        "className": "test.SpringbootApplication", 
        "fileName": "SpringbootApplication.java", 
        "lineNumber": 237, 
        "methodName": "execute1", 
        "nativeMethod": false
    }, 
    {
        "className": "test.SpringbootApplication", 
        "fileName": "SpringbootApplication.java", 
        "lineNumber": 224, 
        "methodName": "lambda$testTryCatch$4", 
        "nativeMethod": false
    }, 
    {
        "className": "java.util.concurrent.ThreadPoolExecutor", 
        "fileName": "ThreadPoolExecutor.java", 
        "lineNumber": 1149, 
        "methodName": "runWorker", 
        "nativeMethod": false
    }, 
    {
        "className": "java.util.concurrent.ThreadPoolExecutor$Worker", 
        "fileName": "ThreadPoolExecutor.java", 
        "lineNumber": 624, 
        "methodName": "run", 
        "nativeMethod": false
    }, 
    {
        "className": "java.lang.Thread", 
        "fileName": "Thread.java", 
        "lineNumber": 750, 
        "methodName": "run", 
        "nativeMethod": false
    }
]
13:52:24.009 [pool-1-thread-1] INFO test.SpringbootApplication - testTryCatch出现异常4 message:{}
java.lang.ArithmeticException: / by zero
	at test.SpringbootApplication.execute1(SpringbootApplication.java:237)
	at test.SpringbootApplication.lambda$testTryCatch$4(SpringbootApplication.java:224)
	at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1149)
	at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:624)
	at java.lang.Thread.run(Thread.java:750)
13:52:24.009 [pool-1-thread-1] INFO test.SpringbootApplication - testTryCatch出现异常5
java.lang.ArithmeticException: / by zero
	at test.SpringbootApplication.execute1(SpringbootApplication.java:237)
	at test.SpringbootApplication.lambda$testTryCatch$4(SpringbootApplication.java:224)
	at java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1149)
	at java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:624)
	at java.lang.Thread.run(Thread.java:750)
```

- 第一种和第二种输出只是输出了异常的信息，没有堆栈
- 第三种`e.getStackTrace()`返回值是数组，包括了堆栈了信息
- 第四种能够看到完整的堆栈，比第三种更加的清晰，使用占位符无效
- 第五种和第四种效果相同，不使用占位符

### 结果

如果要输出完整的堆栈信息，建议使用第五种输出方式
