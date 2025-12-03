---
slug: /tech-sharing/nacos-source/springboot-nacos-part-2
---

# SpringBoot客户端服务注册Nacos原理_2
上文中讲到了
`NacosNamingService.registerInstance(serviceId, group, instance)：`

## NamingService结构：

```java
public interface NamingService {
    
    //服务注册
    void registerInstance

    //服务注销
    void deregisterInstance

    //获取服务列表
    List<Instance> getAllInstances

    //查询健康服务
    List<Instance> selectInstances

    //查询集群中健康的服务
    List<Instance> selectInstances

    //负载均衡策略选择一个健康的服务
    Instance selectOneHealthyInstance

    //订阅服务事件
    void subscribe

    //取消订阅服务事件
    void unsubscribe

    //获取所有（或指定）服务名称
    ListView<String> getServicesOfServer

    //获取所有订阅的服务
    List<ServiceInfo> getSubscribeServices
     
    //获取Nacos服务的状态
    String getServerStatus
     
    //关闭服务
    void shutDown

}
```

可以看到`NamingService`是一个统一行为的接口，里面定义了很多重要的方法，如服务注册、服务注销、查询服务列表等。

## Instance结构

![](/img/technologySharing/nacos/Instance结构.png)

可以看到Instance就是服务实例，包括了ip地址、port端口号、weight权重、healthy健康、ephemeral是否临时节点、clusterName集群名字等。

## 接着分析服务注册逻辑

### NacosNamingService.registerInstance(String serviceName, String groupName, Instance instance)

```java
public void registerInstance(String serviceName, String groupName, Instance instance) throws NacosException {
    //检查心跳
    NamingUtils.checkInstanceIsLegal(instance);
    //通过代理执行服务注册操作，这里的clientProxy实际为NamingClientProxyDelegate
    clientProxy.registerService(serviceName, groupName, instance);
}
```

### NamingClientProxyDelegate.registerService(serviceName, groupName, instance)

```java
public void registerService(String serviceName, String groupName, Instance instance) throws NacosException {
    getExecuteClientProxy(instance).registerService(serviceName, groupName, instance);
}
```

### NamingClientProxyDelegate.getExecuteClientProxy(instance)

```java
private NamingClientProxy getExecuteClientProxy(Instance instance) {
    return instance.isEphemeral() ? grpcClientProxy : httpClientProxy;
}
```

这里的路基是判断实例是临时还是持久，默认是临时，所以这里返回的是`grpcClientProxy`类型为`NamingGrpcClientProxy`采用grpc协议，nacos2.x版本中默认都是此协议进行通信。

### NamingGrpcClientProxy.registerService(serviceName, groupName, instance)

```java
public void registerService(String serviceName, String groupName, Instance instance) throws NacosException {
    NAMING_LOGGER.info("[REGISTER-SERVICE] {} registering service {} with instance {}", namespaceId, serviceName,
            instance);
    //缓存数据
    redoService.cacheInstanceForRedo(serviceName, groupName, instance);
    //进行服务注册
    doRegisterService(serviceName, groupName, instance);
}
```

```java
public void cacheInstanceForRedo(String serviceName, String groupName, Instance instance) {
    String key = NamingUtils.getGroupedName(serviceName, groupName);
    InstanceRedoData redoData = InstanceRedoData.build(serviceName, groupName, instance);
    synchronized (registeredInstances) {
        registeredInstances.put(key, redoData);
    }
}
```

### NamingGrpcClientProxy.doRegisterService(String serviceName, String groupName, Instance instance)

```java
public void doRegisterService(String serviceName, String groupName, Instance instance) throws NacosException {
    //构建请求request
    InstanceRequest request = new InstanceRequest(namespaceId, serviceName, groupName,
            NamingRemoteConstants.REGISTER_INSTANCE, instance);
    //进行请求注册
    requestToServer(request, Response.class);
    //注册成功的话将缓存对应的信息改为已注册状态
    redoService.instanceRegistered(serviceName, groupName);
}
```

### NamingGrpcClientProxy.requestToServer(request, Response.class)

```java
private <T extends Response> T requestToServer(AbstractNamingRequest request, Class<T> responseClass)
        throws NacosException {
    try {
        request.putAllHeader(getSecurityHeaders());
        request.putAllHeader(getSpasHeaders(
                NamingUtils.getGroupedNameOptional(request.getServiceName(), request.getGroupName())));
        //grpc真正的请求数据，这里的rpcClient实际为GrpcSdkClient   
        Response response =
                requestTimeout < 0 ? rpcClient.request(request) : rpcClient.request(request, requestTimeout);
        if (ResponseCode.SUCCESS.getCode() != response.getResultCode()) {
            throw new NacosException(response.getErrorCode(), response.getMessage());
        }
        if (responseClass.isAssignableFrom(response.getClass())) {
            return (T) response;
        }
        NAMING_LOGGER.error("Server return unexpected response '{}', expected response should be '{}'",
                response.getClass().getName(), responseClass.getName());
    } catch (Exception e) {
        throw new NacosException(NacosException.SERVER_ERROR, "Request nacos server failed: ", e);
    }
    throw new NacosException(NacosException.SERVER_ERROR, "Server return invalid response");
}
```

### NamingGrpcRedoService.instanceRegistered(serviceName, groupName)

```java
public void instanceRegistered(String serviceName, String groupName) {
    String key = NamingUtils.getGroupedName(serviceName, groupName);
    synchronized (registeredInstances) {
        InstanceRedoData redoData = registeredInstances.get(key);
        if (null != redoData) {
            redoData.setRegistered(true);
        }
    }
}
```

## 分析GrpcClient启动的逻辑

### 初始化

```java
public NamingGrpcClientProxy(String namespaceId, SecurityProxy securityProxy, ServerListFactory serverListFactory,
        Properties properties, ServiceInfoHolder serviceInfoHolder) throws NacosException {
    super(securityProxy, properties);
    this.namespaceId = namespaceId;
    this.uuid = UUID.randomUUID().toString();
    //请求的超时时间，默认3s
    this.requestTimeout = Long.parseLong(properties.getProperty(CommonParams.NAMING_REQUEST_TIMEOUT, "-1"));
    Map<String, String> labels = new HashMap<String, String>();
    labels.put(RemoteConstants.LABEL_SOURCE, RemoteConstants.LABEL_SOURCE_SDK);
    labels.put(RemoteConstants.LABEL_MODULE, RemoteConstants.LABEL_MODULE_NAMING);
    //创建grpc
    this.rpcClient = RpcClientFactory.createClient(uuid, ConnectionType.GRPC, labels);
    
    this.redoService = new NamingGrpcRedoService(this);
    //将grpc客户端启动
    start(serverListFactory, serviceInfoHolder);
}
```

```java
private void start(ServerListFactory serverListFactory, ServiceInfoHolder serviceInfoHolder) throws NacosException {
    rpcClient.serverListFactory(serverListFactory);
    //注册连接事件当连接建立和断开时处理事件
    rpcClient.registerConnectionListener(redoService);
    //注册registerServerRequestHandler用于处理从Nacos Push到Client的请求
    rpcClient.registerServerRequestHandler(new NamingPushRequestHandler(serviceInfoHolder));
    //grpc客户端启动
    rpcClient.start();
    NotifyCenter.registerSubscriber(this);
}
```

到这里可以知道:

- gRPC 客户端代理的初始化主要逻辑为创建gRPC 客户端并启动。
- 并注册`ServerRequestHandler`用于处理Nacos 服务端推送的`NotifySubscriberRequest`请求。
- 注册`ConnectionListener`用于处理gRPC建立和断开连接事件。
- 请求超时时间可以通过`namingRequestTimeout`设置，默认3秒。

### grpc客户端启动

**rpcClient.start()**

```java
public final void start() throws NacosException {
    //将Client状态由INITIALIZED变更为STARTING
    boolean success = rpcClientStatus.compareAndSet(RpcClientStatus.INITIALIZED, RpcClientStatus.STARTING);
    if (!success) {
        return;
    }



    /**
     * 守护线程不断从阻塞队列eventLinkedBlockingQueue获取grpc连接/断开事件，
     * 并调用上文中注册的namingGrpcConnectionEventListener回调其onConnected/onDisConnect方法。其中事件添加时机为：
     * 
     * grpc连接建立时，添加连接事件：
     * // 连接成功添加ConnectionEvent
     * eventLinkedBlockingQueue.offer(new ConnectionEvent(ConnectionEvent.CONNECTED));
     * 
     * grpc连接关闭时，添加关闭事件：
     * private void closeConnection(Connection connection) {
     *      if (connection != null) {
     *          connection.close();
     *          // 断开连接添加DISCONNECTED事件
     *          eventLinkedBlockingQueue.add(new ConnectionEvent(ConnectionEvent.DISCONNECTED));
     *      }
     * }
     *
     *  
     * */

    //守护线程的线程池
    clientEventExecutor = new ScheduledThreadPoolExecutor(2, new ThreadFactory() {
        @Override
        public Thread newThread(Runnable r) {
            Thread t = new Thread(r);
            t.setName("com.alibaba.nacos.client.remote.worker");
            t.setDaemon(true);
            return t;
        }
    });
    
    //不断的从eventLinkedBlockingQueue获取连接时间，根据事件的类型回调notifyConnected/notifyDisConnected事件
    clientEventExecutor.submit(new Runnable() {
        @Override
        public void run() {
            while (!clientEventExecutor.isTerminated() && !clientEventExecutor.isShutdown()) {
                ConnectionEvent take = null;
                try {
                    take = eventLinkedBlockingQueue.take();
                    if (take.isConnected()) {
                        notifyConnected();
                    } else if (take.isDisConnected()) {
                        notifyDisConnected();
                    }
                } catch (Throwable e) {
                    //Do nothing
                }
            }
        }
    });




    /**
     * 
     * 守护线程不断从阻塞队列reconnectionSignal获取重新连接事件（ReconnectContext）也就是更换nacos server的连接grpc通道：
     *
     * 阻塞队列没有重新连接事件：则做心跳保鲜检测，心跳频率为5秒。当超过5秒时会向Nacos Server发起健康检查，当返回不健康时，
     * 将grpc client标记为unhealthy；返回健康则刷新心跳时间lastActiveTimeStamp。
     *
     * 阻塞队列有重新连接事件：重连事件上下文reconnectContext的的server ip在我们设置的nacos server 列表则使用，
     * 否则改为随机选择nacos server ip地址，并与新server建立连接。
     * 
     * */
    clientEventExecutor.submit(new Runnable() {
        @Override
        public void run() {
            while (true) {
                try {
                    if (isShutdown()) {
                        break;
                    }
                    //获取重定向连接上下文，指重新连接到其他server节点
                    ReconnectContext reconnectContext = reconnectionSignal
                            .poll(keepAliveTime, TimeUnit.MILLISECONDS);
                    if (reconnectContext == null) {
                        //check alive time.
                        //client活动时间超过5秒，向Nacos Server发起健康检测
                        if (System.currentTimeMillis() - lastActiveTimeStamp >= keepAliveTime) {
                            //进行健康检查
                            boolean isHealthy = healthCheck();
                            //如果为非健康节点的话
                            if (!isHealthy) {
                                if (currentConnection == null) {
                                    continue;
                                }
                                LoggerUtils.printIfInfoEnabled(LOGGER,
                                        "[{}]Server healthy check fail,currentConnection={}", name,
                                        currentConnection.getConnectionId());
                                
                                RpcClientStatus rpcClientStatus = RpcClient.this.rpcClientStatus.get();
                                if (RpcClientStatus.SHUTDOWN.equals(rpcClientStatus)) {
                                    break;
                                }
                                //将客户端为unhealthy状态
                                boolean success = RpcClient.this.rpcClientStatus
                                        .compareAndSet(rpcClientStatus, RpcClientStatus.UNHEALTHY);
                                if (success) {
                                    //重置ReconnectContext移除serverInfo
                                    reconnectContext = new ReconnectContext(null, false);
                                } else {
                                    continue;
                                }
                                
                            } else {
                                //健康连接更新时间戳
                                lastActiveTimeStamp = System.currentTimeMillis();
                                continue;
                            }
                        } else {
                            //心跳保鲜未过期，跳过本次检测
                            continue;
                        }
                        
                    }
                    
                    if (reconnectContext.serverInfo != null) {
                        //clear recommend server if server is not in server list.
                        boolean serverExist = false;
                        //判断连接上下文的reconnectContext.serverInfo是否在我们推荐设置的列表中
                        for (String server : getServerListFactory().getServerList()) {
                            ServerInfo serverInfo = resolveServerInfo(server);
                            if (serverInfo.getServerIp().equals(reconnectContext.serverInfo.getServerIp())) {
                                serverExist = true;
                                reconnectContext.serverInfo.serverPort = serverInfo.serverPort;
                                break;
                            }
                        }
                        //不在推荐的列表中则移除，改为随机选择
                        if (!serverExist) {
                            LoggerUtils.printIfInfoEnabled(LOGGER,
                                    "[{}] Recommend server is not in server list ,ignore recommend server {}", name,
                                    reconnectContext.serverInfo.getAddress());
                            
                            reconnectContext.serverInfo = null;
                            
                        }
                    }
                    //重新连接
                    reconnect(reconnectContext.serverInfo, reconnectContext.onRequestFail);
                } catch (Throwable throwable) {
                    //Do nothing
                }
            }
        }
    });
    


    //connect to server ,try to connect to server sync once, async starting if fail.
    //异步连接失败的话尝试为同步连接
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
    

    /**
     * 
     * 如果连接建立成功添加连接事件到阻塞队列；连接建立失败发起异步建立连接请求。
     * 注册ConnectResetRequestHandler用于处理nacos server推送的重置连接请求。
     * jvm退出时通过hook关闭grpc client。
     * */

    if (connectToServer != null) {
        LoggerUtils.printIfInfoEnabled(LOGGER, "[{}] Success to connect to server [{}] on start up,connectionId={}",
                name, connectToServer.serverInfo.getAddress(), connectToServer.getConnectionId());
        this.currentConnection = connectToServer;
        rpcClientStatus.set(RpcClientStatus.RUNNING);
        //连接成功的话构建ConnectionEvent添加到eventLinkedBlockingQueue中
        eventLinkedBlockingQueue.offer(new ConnectionEvent(ConnectionEvent.CONNECTED));
    } else {
        //没有建立连接成功的话重新发起异步建立连接
        switchServerAsync();
    }
    //注册ConnectResetRequestHandler用于处理nacos服务端推送的重置连接请求
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

```java
protected void reconnect(final ServerInfo recommendServerInfo, boolean onRequestFail) {
    
    try {
        
        AtomicReference<ServerInfo> recommendServer = new AtomicReference<ServerInfo>(recommendServerInfo);
        // nRequestFail=true表示当健康检查失败grpcClient被设置为unhealthy，
        //重连时重新发起健康检查，如果检查通过则不再执行重连
        if (onRequestFail && healthCheck()) {
            LoggerUtils.printIfInfoEnabled(LOGGER, "[{}] Server check success,currentServer is{} ", name,
                    currentConnection.serverInfo.getAddress());
            rpcClientStatus.set(RpcClientStatus.RUNNING);
            return;
        }
        
        LoggerUtils.printIfInfoEnabled(LOGGER, "[{}] try to re connect to a new server ,server is {}", name,
                recommendServerInfo == null ? " not appointed,will choose a random server."
                        : (recommendServerInfo.getAddress() + ", will try it once."));
        
        // loop until start client success.
        boolean switchSuccess = false;
        
        int reConnectTimes = 0;
        int retryTurns = 0;
        Exception lastException = null;
        //切换nacos server没有成功则会一直重试
        while (!switchSuccess && !isShutdown()) {
            
            //1.get a new server
            ServerInfo serverInfo = null;
            try {
                //获取需要重新连接的server地址
                serverInfo = recommendServer.get() == null ? nextRpcServer() : recommendServer.get();
                //2.create a new channel to new server
                //与新的server建立grpc连接，如果连接失败返回null
                Connection connectionNew = connectToServer(serverInfo);
                //关闭缓存的当前连接并重定向到新的连接
                if (connectionNew != null) {
                    LoggerUtils.printIfInfoEnabled(LOGGER, "[{}] success to connect a server  [{}],connectionId={}",
                            name, serverInfo.getAddress(), connectionNew.getConnectionId());
                    //successfully create a new connect.
                    if (currentConnection != null) {
                        LoggerUtils.printIfInfoEnabled(LOGGER,
                                "[{}] Abandon prev connection ,server is  {}, connectionId is {}", name,
                                currentConnection.serverInfo.getAddress(), currentConnection.getConnectionId());
                        //set current connection to enable connection event.
                        currentConnection.setAbandon(true);
                        closeConnection(currentConnection);
                    }
                    currentConnection = connectionNew;
                    rpcClientStatus.set(RpcClientStatus.RUNNING);
                    switchSuccess = true;
                    //添加连接成功时间到阻塞队列
                    boolean s = eventLinkedBlockingQueue.add(new ConnectionEvent(ConnectionEvent.CONNECTED));
                    return;
                }
                
                //close connection if client is already shutdown.
                if (isShutdown()) {
                    closeConnection(currentConnection);
                }
                
                lastException = null;
                
            } catch (Exception e) {
                lastException = e;
            } finally {
                //清理本次重连请求
                recommendServer.set(null);
            }
            //执行到这里表示上面没有成功建立连接，打印重试次数日志
            if (reConnectTimes > 0
                    && reConnectTimes % RpcClient.this.serverListFactory.getServerList().size() == 0) {
                LoggerUtils.printIfInfoEnabled(LOGGER,
                        "[{}] fail to connect server,after trying {} times, last try server is {},error={}", name,
                        reConnectTimes, serverInfo, lastException == null ? "unknown" : lastException);
                if (Integer.MAX_VALUE == retryTurns) {
                    retryTurns = 50;
                } else {
                    retryTurns++;
                }
            }
            
            reConnectTimes++;
            //重试时等待特定的时间
            try {
                //sleep x milliseconds to switch next server.
                if (!isRunning()) {
                    // first round ,try servers at a delay 100ms;second round ,200ms; max delays 5s. to be reconsidered.
                    Thread.sleep(Math.min(retryTurns + 1, 50) * 100L);
                }
            } catch (InterruptedException e) {
                // Do  nothing.
            }
        }
        
        if (isShutdown()) {
            LoggerUtils.printIfInfoEnabled(LOGGER, "[{}] Client is shutdown ,stop reconnect to server", name);
        }
        
    } catch (Exception e) {
        LoggerUtils.printIfWarnEnabled(LOGGER, "[{}] Fail to  re connect to server ,error is {}", name, e);
    }
}
```

重新切换连接server逻辑：

- 当检查失败grpc client会被标记为unhealthy这类型onRequestFail为true，重连时重新发起健康检查，如果检查成功，则退出本次重连。
- 获取重连的server地址和端口，并建立grpc连接，关闭当前缓存的旧连接并重定向到新连接，同时添加连接成功时间到阻塞队列。
- 一直重试直到连接建立成功，每次重试等待一些时间（100ms,200ms...最大为5秒）。

到这里可以知道：

- gRPC Client启动逻辑主要在于建立与nacos server的grpc连接，其中两个守护线程一直在运行。
- 守护线程1用于处理grpc连接的建立和关闭事件。
- 守护线程2用于与nacos server的心跳保鲜，并负责异步建立grpc连接。
- 守护线程2同时负责当nacos server的地址信息发生变更时重新与新server建立连接。
- nacos server的地址变更通过grpc通道由server推送ConnectResetRequest到client。
- grpc client只与nacos server集群中一台建立grpc连接。

### GrpcClient.connectToServer(serverInfo)

此方法的作用是客户端与服务端建立连接，`GrpcClient`负责与远程服务器建立连接，并初始化Grpc一元请求远程调用的Stub以及双向流的`StreamObserver`，创建一个`GrpcConnection`的对象，并将初始化的Channel注入到`GrpcConnection`中。

随后发起一个连接建立的请求，在服务端侧注册自己的连接。值得一提的是，双向流的`BiRequestStreamStub`是建立在`RequestFutureStub`的`Channel`之上的，利用了HTTP2多路复用的特性，所以Client与Server之间只会有一个连接建立。

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
            
            //create stream request and bind connection event to this connection.
            StreamObserver<Payload> payloadStreamObserver = bindRequestStream(biRequestStreamStub, grpcConn);
            
            // stream observer to send response to server
            grpcConn.setPayloadStreamObserver(payloadStreamObserver);
            grpcConn.setGrpcFutureServiceStub(newChannelStubTemp);
            grpcConn.setChannel((ManagedChannel) newChannelStubTemp.getChannel());
            //send a  setup request.
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
