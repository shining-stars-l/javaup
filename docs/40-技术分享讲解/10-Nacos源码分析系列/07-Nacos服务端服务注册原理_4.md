---
slug: /tech-sharing/nacos-source/nacos-part-4
---

# Nacos服务端服务注册原理_4
在`nacos服务端服务注册原理_3`文章分析到了当服务端接收到服务注册和注销后，通过一系列的事件发布后和处理后，最后会通过grpc再通知给对应的订阅服务的客户端，这篇文章就来分析客户端接收服务端相应的过程

## 客户端的监听

### NacosWatch

```java
public class NacosWatch
		implements ApplicationEventPublisherAware, SmartLifecycle, DisposableBean {...}
```

`NacosWatch`实现了`SmartLifecycle`接口，所以当容器启动后会执行`start`方法。下面来分析此方法

### NacosWatch.start()

```java
public void start() {
	//判断服务端通知的监听是否开启，没有的话设置为true然后开启监听
	if (this.running.compareAndSet(false, true)) {
		EventListener eventListener = listenerMap.computeIfAbsent(buildKey(),
				event -> new EventListener() {
					@Override
					//当接口服务端通知后处理even事件
					public void onEvent(Event event) {
						if (event instanceof NamingEvent) {
							List<Instance> instances = ((NamingEvent) event)
									.getInstances();
							Optional<Instance> instanceOptional = selectCurrentInstance(
									instances);
							instanceOptional.ifPresent(currentInstance -> {
								resetIfNeeded(currentInstance);
							});
						}
					}
				});
		//获得namingService ，此方法内会创建接收服务端的grpc连接
		NamingService namingService = nacosServiceManager
				.getNamingService(properties.getNacosProperties());
		try {
			namingService.subscribe(properties.getService(), properties.getGroup(),
					Arrays.asList(properties.getClusterName()), eventListener);
		}
		catch (Exception e) {
			log.error("namingService subscribe failed, properties:{}", properties, e);
		}

		this.watchFuture = this.taskScheduler.scheduleWithFixedDelay(
				this::nacosServicesWatch, this.properties.getWatchDelay());
	}
}
```

### nacosServiceManager.getNamingService(properties.getNacosProperties())

此方法会创建接收服务端的grpc连接，链路较长为
`NacosServiceManager.getNamingService`
--->
`NacosServiceManager.buildNamingService(properties)`
--->
`NacosServiceManager.createNewNamingService(properties)`
--->
`NacosServiceManager.createNamingService(properties)`
--->
`NamingFactory.createNamingService(properties)`

```java
Class<?> driverImplClass = Class.forName("com.alibaba.nacos.client.naming.NacosNamingService");
Constructor constructor = driverImplClass.getConstructor(Properties.class);
return (NamingService) constructor.newInstance(properties);
```

--->
`(NamingService) constructor.newInstance(properties)`
--->
`public NacosNamingService(Properties properties)`
--->
`NacosNamingService.init(properties)`
--->
`new NamingClientProxyDelegate(...)`
--->
`new NamingGrpcClientProxy(...)`
--->
`NamingGrpcClientProxy.start(serverListFactory, serviceInfoHolder)`

### NamingGrpcClientProxy.start(serverListFactory, serviceInfoHolder)

此方法开始真正的建立接收服务端的grpc连接

```java
private void start(ServerListFactory serverListFactory, ServiceInfoHolder serviceInfoHolder) throws NacosException {
    rpcClient.serverListFactory(serverListFactory);
    // 注册连接事件Listener，当连接建立和断开时处理事件
    rpcClient.registerConnectionListener(redoService);
    //在客户端建立gRPC时，注册registerServerRequestHandler
    //用于处理从服务端推送到客户端的请求，添加到了serverRequestHandlers集合
    rpcClient.registerServerRequestHandler(new NamingPushRequestHandler(serviceInfoHolder));
    //grpc客户端启动
    rpcClient.start();
    NotifyCenter.registerSubscriber(this);
}
```

### RpcClient.start()

```java
public final void start() throws NacosException {
    
    boolean success = rpcClientStatus.compareAndSet(RpcClientStatus.INITIALIZED, RpcClientStatus.STARTING);
    if (!success) {
        return;
    
    /**
     * 省略
     */
    //connect to server ,try to connect to server sync once, async starting if fail.
    Connection connectToServer = null;
    rpcClientStatus.set(RpcClientStatus.STARTING);
    
    int startUpRetryTimes = RETRY_TIMES;
    while (startUpRetryTimes > 0 && connectToServer == null) {
        try {
            startUpRetryTimes--;
            ServerInfo serverInfo = nextRpcServer();
            
            LoggerUtils.printIfInfoEnabled(LOGGER, "[{}] Try to connect to server on start up, server: {}", name,
                    serverInfo);
            
            connectToServer = connectToServer(serverInfo);
        } catch (Throwable e) {
            LoggerUtils.printIfWarnEnabled(LOGGER,
                    "[{}]Fail to connect to server on start up, error message={}, start up retry times left: {}",
                    name, e.getMessage(), startUpRetryTimes);
        }
        
    }
    
    if (connectToServer != null) {
        LoggerUtils.printIfInfoEnabled(LOGGER, "[{}] Success to connect to server [{}] on start up,connectionId={}",
                name, connectToServer.serverInfo.getAddress(), connectToServer.getConnectionId());
        this.currentConnection = connectToServer;
        rpcClientStatus.set(RpcClientStatus.RUNNING);
        eventLinkedBlockingQueue.offer(new ConnectionEvent(ConnectionEvent.CONNECTED));
    } else {
        switchServerAsync();
    }
    
    registerServerRequestHandler(new ConnectResetRequestHandler());
    
    //register client detection request.
    registerServerRequestHandler(new ServerRequestHandler() {
        @Override
        public Response requestReply(Request request) {
            if (request instanceof ClientDetectionRequest) {
                return new ClientDetectionResponse();
            }
            
            return null;
        }
    });
    
}
```

### RpcClient.connectToServer(serverInfo)

```java
public Connection connectToServer(ServerInfo serverInfo) {
    try {
        if (grpcExecutor == null) {
            int threadNumber = ThreadUtils.getSuitableThreadCount(8);
            grpcExecutor = new ThreadPoolExecutor(threadNumber, threadNumber, 10L, TimeUnit.SECONDS,
                    new LinkedBlockingQueue<>(10000),
                    new ThreadFactoryBuilder().setDaemon(true).setNameFormat("nacos-grpc-client-executor-%d")
                            .build());
            grpcExecutor.allowCoreThreadTimeOut(true);
            
        }
        int port = serverInfo.getServerPort() + rpcPortOffset();
        RequestGrpc.RequestFutureStub newChannelStubTemp = createNewChannelStub(serverInfo.getServerIp(), port);
        if (newChannelStubTemp != null) {
            
            Response response = serverCheck(serverInfo.getServerIp(), port, newChannelStubTemp);
            if (response == null || !(response instanceof ServerCheckResponse)) {
                shuntDownChannel((ManagedChannel) newChannelStubTemp.getChannel());
                return null;
            }
            
            BiRequestStreamGrpc.BiRequestStreamStub biRequestStreamStub = BiRequestStreamGrpc
                    .newStub(newChannelStubTemp.getChannel());
            GrpcConnection grpcConn = new GrpcConnection(serverInfo, grpcExecutor);
            grpcConn.setConnectionId(((ServerCheckResponse) response).getConnectionId());
            
            //在连接server时绑定相关事件
            StreamObserver<Payload> payloadStreamObserver = bindRequestStream(biRequestStreamStub, grpcConn);
            
            
            grpcConn.setPayloadStreamObserver(payloadStreamObserver);
            grpcConn.setGrpcFutureServiceStub(newChannelStubTemp);
            grpcConn.setChannel((ManagedChannel) newChannelStubTemp.getChannel());
            
            ConnectionSetupRequest conSetupRequest = new ConnectionSetupRequest();
            conSetupRequest.setClientVersion(VersionUtils.getFullClientVersion());
            conSetupRequest.setLabels(super.getLabels());
            conSetupRequest.setAbilities(super.clientAbilities);
            conSetupRequest.setTenant(super.getTenant());
            grpcConn.sendRequest(conSetupRequest);
            //wait to register connection setup
            Thread.sleep(100L);
            return grpcConn;
        }
        return null;
    } catch (Exception e) {
        LOGGER.error("[{}]Fail to connect to server!,error={}", GrpcClient.this.getName(), e);
    }
    return null;
}
```

### RpcClient.bindRequestStream

```java
private StreamObserver<Payload> bindRequestStream(final BiRequestStreamGrpc.BiRequestStreamStub streamStub,
        final GrpcConnection grpcConn) {
    
    return streamStub.requestBiStream(new StreamObserver<Payload>() {
        
        @Override
        public void onNext(Payload payload) {
            
            LoggerUtils.printIfDebugEnabled(LOGGER, "[{}]Stream server request receive, original info: {}",
                    grpcConn.getConnectionId(), payload.toString());
            try {
                Object parseBody = GrpcUtils.parse(payload);
                final Request request = (Request) parseBody;
                if (request != null) {
                    
                    try {
                        //接受server push处理
                        Response response = handleServerRequest(request);
                        if (response != null) {
                            response.setRequestId(request.getRequestId());
                            sendResponse(response);
                        } else {
                            LOGGER.warn("[{}]Fail to process server request, ackId->{}", grpcConn.getConnectionId(),
                                    request.getRequestId());
                        }
                        
                    } catch (Exception e) {
                        LoggerUtils.printIfErrorEnabled(LOGGER, "[{}]Handle server request exception: {}",
                                grpcConn.getConnectionId(), payload.toString(), e.getMessage());
                        sendResponse(request.getRequestId(), false);
                    }
                    
                }
                
            } catch (Exception e) {
                LoggerUtils.printIfErrorEnabled(LOGGER, "[{}]Error to process server push response: {}",
                        grpcConn.getConnectionId(), payload.getBody().getValue().toStringUtf8());
            }
        }
        
       
    });
}
```

### RpcClient.handleServerRequest

```java
protected Response handleServerRequest(final Request request) {
    
    LoggerUtils.printIfInfoEnabled(LOGGER, "[{}]receive server push request,request={},requestId={}", name,
            request.getClass().getSimpleName(), request.getRequestId());
    lastActiveTimeStamp = System.currentTimeMillis();
    //此循环中有个元素是NamingPushRequestHandler
    for (ServerRequestHandler serverRequestHandler : serverRequestHandlers) {
        try {
            Response response = serverRequestHandler.requestReply(request);
            
            if (response != null) {
                LoggerUtils.printIfInfoEnabled(LOGGER, "[{}]ack server push request,request={},requestId={}", name,
                        request.getClass().getSimpleName(), request.getRequestId());
                return response;
            }
        } catch (Exception e) {
            LoggerUtils.printIfInfoEnabled(LOGGER, "[{}]handleServerRequest:{}, errorMessage={}", name,
                    serverRequestHandler.getClass().getName(), e.getMessage());
        }
        
    }
    return null;
}
```

### NamingPushRequestHandler.requestReply(Request request)

```java
public Response requestReply(Request request) {
    if (request instanceof NotifySubscriberRequest) {
        NotifySubscriberRequest notifyResponse = (NotifySubscriberRequest) request;
        serviceInfoHolder.processServiceInfo(notifyResponse.getServiceInfo());
        return new NotifySubscriberResponse();
    }
    return null;
}
```

到这里`serviceInfoHolder.processServiceInfo(notifyResponse.getServiceInfo())`更新缓存的逻辑`nacos客户端获取服务原理(订阅机制)`已经做了详细的分析，这里只分析事件发布机制
**serviceInfoHolder.processServiceInfo(serviceObj)**

```java
public ServiceInfo processServiceInfo(ServiceInfo serviceInfo) {
    /**
     * 省略
     */
    
    NAMING_LOGGER.info("current ips:(" + serviceInfo.ipCount() + ") service: " + serviceInfo.getKey() + " -> "
            + JacksonUtils.toJson(serviceInfo.getHosts()));
    // 添加实例变更事件，会被订阅者执行
    NotifyCenter.publishEvent(new InstancesChangeEvent(serviceInfo.getName(), serviceInfo.getGroupName(),
            serviceInfo.getClusters(), serviceInfo.getHosts()));
    return serviceInfo;
}
```

## 事件发布机制 NotifyCenter.publishEvent(new InstancesChangeEvent(...))

事件发布机制的详细过程在`nacos服务端服务注册原理_2和_3文章`中，针对服务端的事件发布机制已做了详细的分析，客户端流程也是相同，所以这里只分析主要的过程。

### NotifyCenter.publishEvent(new InstancesChangeEvent(...))

1. 当发布了`InstancesChangeEvent`事件后，仍旧放入队列`queue`中.
2. 放入队列失败，或者放入成功从队列取出后，都是执行`DefaultPublisher.receiveEvent`
3. 然后执行`InstancesChangeNotifier.onEvent(InstancesChangeEvent event)`

### InstancesChangeNotifier.onEvent(InstancesChangeEvent event)
![](/img/technologySharing/nacos/InstancesChangeNotifier.onEvent.png)

可以看到for循环中的`listener`就是`NacosWatch`中的`eventListener`，然后就执行onEvent中的逻辑了。

### EventListener.onEvent

```java
EventListener eventListener = listenerMap.computeIfAbsent(buildKey(),
    event -> new EventListener() {
        @Override
        public void onEvent(Event event) {
            if (event instanceof NamingEvent) {
                List<Instance> instances = ((NamingEvent) event)
                        .getInstances();
                Optional<Instance> instanceOptional = selectCurrentInstance(
                        instances);
                instanceOptional.ifPresent(currentInstance -> {
                    resetIfNeeded(currentInstance);
                });
            }
        }
    });
```

到这里还有个问题，`NacosWatch`中的`eventListener`是什么时候放入到`InstancesChangeNotifier`里的`listenerMap`呢。

**回到**`NacosWatch.start()`

```java
public void start() {
    if (this.running.compareAndSet(false, true)) {
        EventListener eventListener = listenerMap.computeIfAbsent(buildKey(),
                event -> new EventListener() {
                    @Override
                    public void onEvent(Event event) {
                        if (event instanceof NamingEvent) {
                            List<Instance> instances = ((NamingEvent) event)
                                    .getInstances();
                            Optional<Instance> instanceOptional = selectCurrentInstance(
                                    instances);
                            instanceOptional.ifPresent(currentInstance -> {
                                resetIfNeeded(currentInstance);
                            });
                        }
                    }
                });

        NamingService namingService = nacosServiceManager
                .getNamingService(properties.getNacosProperties());
        try {
            namingService.subscribe(properties.getService(), properties.getGroup(),
                    Arrays.asList(properties.getClusterName()), eventListener);
        }
        catch (Exception e) {
            log.error("namingService subscribe failed, properties:{}", properties, e);
        }

        this.watchFuture = this.taskScheduler.scheduleWithFixedDelay(
                this::nacosServicesWatch, this.properties.getWatchDelay());
    }
}
```

**重点关注namingService.subscribe**

```java
namingService.subscribe(properties.getService(), properties.getGroup(),
		 Arrays.asList(properties.getClusterName()), eventListener)
```

```java
public void subscribe(String serviceName, String groupName, List<String> clusters, EventListener listener)
        throws NacosException {
    if (null == listener) {
        return;
    }
    String clusterString = StringUtils.join(clusters, ",");
	//这时的changeNotifier实际就是InstancesChangeNotifier
    changeNotifier.registerListener(groupName, serviceName, clusterString, listener);
    clientProxy.subscribe(serviceName, groupName, clusterString);
}
```

**InstancesChangeNotifier.registerListener**

```java
public void registerListener(String groupName, String serviceName, String clusters, EventListener listener) {
    String key = ServiceInfo.getKey(NamingUtils.getGroupedName(serviceName, groupName), clusters);
    ConcurrentHashSet<EventListener> eventListeners = listenerMap.get(key);
    if (eventListeners == null) {
        synchronized (lock) {
            eventListeners = listenerMap.get(key);
            if (eventListeners == null) {
                eventListeners = new ConcurrentHashSet<EventListener>();
                listenerMap.put(key, eventListeners);
            }
        }
    }
    eventListeners.add(listener);
}
```

到这里就可以看到`NacosWatch`中的`eventListener`是什么时候放入到`InstancesChangeNotifier`里的`listenerMap`的过程了。

## 总结

1. 服务端接收到服务注册请求后，发布了`ClientRegisterServiceEvent`客户端注册事件
2. `ClientRegisterServiceEvent`事件被`ClientServiceIndexesManager`订阅后发布`ServiceChangedEvent`服务变更事件
3. `ServiceChangedEvent`被`NamingSubscriberServiceV2Impl`订阅并创建`PushDelayTask`并被`PushExecuteTask`执行，负责向订阅该服务的客户端发起推送`serviceInfo`请求
4. 推送的请求被`NamingPushRequestHandler`处理并发布`InstancesChangeEvent`，最终回调`AbstractEventListener`
