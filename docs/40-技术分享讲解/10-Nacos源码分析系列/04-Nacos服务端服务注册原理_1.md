---
slug: /tech-sharing/nacos-source/nacos-part-1
---

# Nacos服务端服务注册原理_1

首先梳理下`GrpcSdkServer`结构
```java
@Service
public class GrpcSdkServer extends BaseGrpcServer {
    
    private static final int PORT_OFFSET = 1000;
    
    @Override
    public int rpcPortOffset() {
        return PORT_OFFSET;
    }
    
    @Override
    public ThreadPoolExecutor getRpcExecutor() {
        return GlobalExecutor.sdkRpcExecutor;
    }
}
```

`GrpcSdkServer`被@Service注解修饰，父类`BaseGrpcServer`又继承了`BaseRpcServer`

## BaseRpcServer

```java
@PostConstruct
public void start() throws Exception {
    String serverName = getClass().getSimpleName();
    Loggers.REMOTE.info("Nacos {} Rpc server starting at port {}", serverName, getServicePort());

    startServer();

    Loggers.REMOTE.info("Nacos {} Rpc server started at port {}", serverName, getServicePort());
    Runtime.getRuntime().addShutdownHook(new Thread() {
        @Override
        public void run() {
            Loggers.REMOTE.info("Nacos {} Rpc server stopping", serverName);
            try {
                BaseRpcServer.this.stopServer();
                Loggers.REMOTE.info("Nacos {} Rpc server stopped successfully...", serverName);
            } catch (Exception e) {
                Loggers.REMOTE.error("Nacos {} Rpc server stopped fail...", serverName, e);
            }
        }
    });

}

public abstract void startServer() throws Exception;
```

可以看到`BaseGrpcServer`和`BaseRpcServer`都是抽象类，而`BaseRpcServer`的`start()`方法又被@PostConstruct注解修饰，所以当spring容器启动后会执行`start()方法`，而`start()`中的`startServer()`被`BaseGrpcServer`类重写，所以就会执行`BaseGrpcServer.startServer()`，这是一个模板设计模式。

## BaseGrpcServer.startServer()

```java
public void startServer() throws Exception {
    final MutableHandlerRegistry handlerRegistry = new MutableHandlerRegistry();
    
    //初始化了一个服务调用的拦截器，在这个拦截器中获取到远程调用的属性(connection、id、ip、port)放入线程上下文中
    ServerInterceptor serverInterceptor = new ServerInterceptor() {
        @Override
        public <T, S> ServerCall.Listener<T> interceptCall(ServerCall<T, S> call, Metadata headers,
                ServerCallHandler<T, S> next) {
            Context ctx = Context.current()
                    .withValue(CONTEXT_KEY_CONN_ID, call.getAttributes().get(TRANS_KEY_CONN_ID))
                    .withValue(CONTEXT_KEY_CONN_REMOTE_IP, call.getAttributes().get(TRANS_KEY_REMOTE_IP))
                    .withValue(CONTEXT_KEY_CONN_REMOTE_PORT, call.getAttributes().get(TRANS_KEY_REMOTE_PORT))
                    .withValue(CONTEXT_KEY_CONN_LOCAL_PORT, call.getAttributes().get(TRANS_KEY_LOCAL_PORT));
            if (REQUEST_BI_STREAM_SERVICE_NAME.equals(call.getMethodDescriptor().getServiceName())) {
                //通过反射获取到了Netty Channel在grpc的一个封装
                Channel internalChannel = getInternalChannel(call);
                ctx = ctx.withValue(CONTEXT_KEY_CHANNEL, internalChannel);
            }
            return Contexts.interceptCall(ctx, call, headers, next);
        }
    };
    //grpc中添加处理服务
    addServices(handlerRegistry, serverInterceptor);
    //设置相关的Server属性以及对连接的管理，这里的transportReady会在连接建立时根据当前的连接的属性构造一个新的Attributes，主要是为每个连接建议一个connectionId，和前面提到的拦截器相呼应。并在连接断开时从connectionManager移除连接。
    //设置server启动的端口（默认为 8848 + 1001 = 9849），getRpcExecutor线程执行器（线程数默认为 = 处理器核数*16） 
    //，maxInboundMessageSize最大限制为10M，压缩解压缩使用gzip。
    server = ServerBuilder.forPort(getServicePort()).executor(getRpcExecutor())
            .maxInboundMessageSize(getInboundMessageSize()).fallbackHandlerRegistry(handlerRegistry)
            .compressorRegistry(CompressorRegistry.getDefaultInstance())
            .decompressorRegistry(DecompressorRegistry.getDefaultInstance())
            .addTransportFilter(new ServerTransportFilter() {
                @Override
                public Attributes transportReady(Attributes transportAttrs) {
                    InetSocketAddress remoteAddress = (InetSocketAddress) transportAttrs
                            .get(Grpc.TRANSPORT_ATTR_REMOTE_ADDR);
                    InetSocketAddress localAddress = (InetSocketAddress) transportAttrs
                            .get(Grpc.TRANSPORT_ATTR_LOCAL_ADDR);
                    int remotePort = remoteAddress.getPort();
                    int localPort = localAddress.getPort();
                    String remoteIp = remoteAddress.getAddress().getHostAddress();
                    Attributes attrWrapper = transportAttrs.toBuilder()
                            .set(TRANS_KEY_CONN_ID, System.currentTimeMillis() + "_" + remoteIp + "_" + remotePort)
                            .set(TRANS_KEY_REMOTE_IP, remoteIp).set(TRANS_KEY_REMOTE_PORT, remotePort)
                            .set(TRANS_KEY_LOCAL_PORT, localPort).build();
                    String connectionId = attrWrapper.get(TRANS_KEY_CONN_ID);
                    Loggers.REMOTE_DIGEST.info("Connection transportReady,connectionId = {} ", connectionId);
                    return attrWrapper;
                    
                }
                
                @Override
                public void transportTerminated(Attributes transportAttrs) {
                    String connectionId = null;
                    try {
                        connectionId = transportAttrs.get(TRANS_KEY_CONN_ID);
                    } catch (Exception e) {
                        // Ignore
                    }
                    if (StringUtils.isNotBlank(connectionId)) {
                        Loggers.REMOTE_DIGEST
                                .info("Connection transportTerminated,connectionId = {} ", connectionId);
                        connectionManager.unregister(connectionId);
                    }
                }
            }).build();
    //启动service的grpc
    server.start();
}
```

## addServices(handlerRegistry, serverInterceptor)

此方法是向Server对象中注册服务，客户端记性连接或接收到请求时，服务端会进行对应的处理

```java
private void addServices(MutableHandlerRegistry handlerRegistry, ServerInterceptor... serverInterceptor) {
        
        //构造MethodDescriptor，包括：服务调用方式简单RPC即UNARY、服务的接口名和方法名、请求序列化类、响应序列化类
        final MethodDescriptor<Payload, Payload> unaryPayloadMethod = MethodDescriptor.<Payload, Payload>newBuilder()
                .setType(MethodDescriptor.MethodType.UNARY)
                .setFullMethodName(MethodDescriptor.generateFullMethodName(REQUEST_SERVICE_NAME, REQUEST_METHOD_NAME))
                .setRequestMarshaller(ProtoUtils.marshaller(Payload.getDefaultInstance()))
                .setResponseMarshaller(ProtoUtils.marshaller(Payload.getDefaultInstance())).build();

        //接受请求将调用执行(有服务注册或注销的请求这里会执行)
        final ServerCallHandler<Payload, Payload> payloadHandler = ServerCalls
                .asyncUnaryCall((request, responseObserver) -> {
                    //接收到数据，会回调此方法
                    grpcCommonRequestAcceptor.request(request, responseObserver);
                });

        //构建服务
        final ServerServiceDefinition serviceDefOfUnaryPayload = ServerServiceDefinition.builder(REQUEST_SERVICE_NAME)
                .addMethod(unaryPayloadMethod, payloadHandler).build();

        //注册到内部注册中心，可以根据服务定义信息查询实现类（普通对象request/response调用）        
        handlerRegistry.addService(ServerInterceptors.intercept(serviceDefOfUnaryPayload, serverInterceptor));
        
        //服务接口处理类，接收到biRequestStream请求将调用执行
        final ServerCallHandler<Payload, Payload> biStreamHandler = ServerCalls.asyncBidiStreamingCall(
                (responseObserver) -> grpcBiStreamRequestAcceptor.requestBiStream(responseObserver));
        
        //构造MethodDescriptor，包括：服务双向流调用方式BIDI_STREAMING、服务的接口名和方法名、请求序列化类、响应序列化类
        final MethodDescriptor<Payload, Payload> biStreamMethod = MethodDescriptor.<Payload, Payload>newBuilder()
                .setType(MethodDescriptor.MethodType.BIDI_STREAMING).setFullMethodName(MethodDescriptor
                        .generateFullMethodName(REQUEST_BI_STREAM_SERVICE_NAME, REQUEST_BI_STREAM_METHOD_NAME))
                .setRequestMarshaller(ProtoUtils.marshaller(Payload.newBuilder().build()))
                .setResponseMarshaller(ProtoUtils.marshaller(Payload.getDefaultInstance())).build();
        //构建服务BiRequestStream
        final ServerServiceDefinition serviceDefOfBiStream = ServerServiceDefinition
                .builder(REQUEST_BI_STREAM_SERVICE_NAME).addMethod(biStreamMethod, biStreamHandler).build();
        //注册到内部注册中心中，可以根据服务定义信息查询实现类（双向流调用）
        handlerRegistry.addService(ServerInterceptors.intercept(serviceDefOfBiStream, serverInterceptor));        
}
```

## grpcCommonRequestAcceptor.request(request, responseObserver)

当客户端进行服务的注册或下线时，就会执行此方法

```java
public void request(Payload grpcRequest, StreamObserver<Payload> responseObserver) {
    
    traceIfNecessary(grpcRequest, true);
    String type = grpcRequest.getMetadata().getType();
    
    /**
     * 省略
     * */
    
    //根据请求类型来获得实际的RequestHandler，这里type实际为InstanceRequest，requestHandler实际为InstanceRequestHandler
    RequestHandler requestHandler = requestHandlerRegistry.getByRequestType(type);
    //no handler found.
    if (requestHandler == null) {
        Loggers.REMOTE_DIGEST.warn(String.format("[%s] No handler for request type : %s :", "grpc", type));
        Payload payloadResponse = GrpcUtils
                .convert(buildErrorResponse(NacosException.NO_HANDLER, "RequestHandler Not Found"));
        traceIfNecessary(payloadResponse, false);
        responseObserver.onNext(payloadResponse);
        responseObserver.onCompleted();
        return;
    }
    
    //check connection status.
    String connectionId = CONTEXT_KEY_CONN_ID.get();
    boolean requestValid = connectionManager.checkValid(connectionId);
    /**
     * 省略
     * */
    
    Object parseObj = null;
    try {
        //将请求进行解析
        parseObj = GrpcUtils.parse(grpcRequest);
    } catch (Exception e) {
        Loggers.REMOTE_DIGEST
                .warn("[{}] Invalid request receive from connection [{}] ,error={}", "grpc", connectionId, e);
        Payload payloadResponse = GrpcUtils.convert(buildErrorResponse(NacosException.BAD_GATEWAY, e.getMessage()));
        traceIfNecessary(payloadResponse, false);
        responseObserver.onNext(payloadResponse);
        responseObserver.onCompleted();
        return;
    }
    
   /**
     * 省略
     * */
    
    Request request = (Request) parseObj;
    try {
        Connection connection = connectionManager.getConnection(CONTEXT_KEY_CONN_ID.get());
        RequestMeta requestMeta = new RequestMeta();
        //填充clientIP、connId、version等信息
        requestMeta.setClientIp(connection.getMetaInfo().getClientIp());
        requestMeta.setConnectionId(CONTEXT_KEY_CONN_ID.get());
        requestMeta.setClientVersion(connection.getMetaInfo().getVersion());
        requestMeta.setLabels(connection.getMetaInfo().getLabels());
        //更新连接时间
        connectionManager.refreshActiveTime(requestMeta.getConnectionId());
        //执行真正的处理逻辑
        Response response = requestHandler.handleRequest(request, requestMeta);
        Payload payloadResponse = GrpcUtils.convert(response);
        traceIfNecessary(payloadResponse, false);
        responseObserver.onNext(payloadResponse);
        responseObserver.onCompleted();
    } catch (Throwable e) {
        Loggers.REMOTE_DIGEST
                .error("[{}] Fail to handle request from connection [{}] ,error message :{}", "grpc", connectionId,
                        e);
        Payload payloadResponse = GrpcUtils.convert(buildErrorResponse(
                (e instanceof NacosException) ? ((NacosException) e).getErrCode() : ResponseCode.FAIL.getCode(),
                e.getMessage()));
        traceIfNecessary(payloadResponse, false);
        responseObserver.onNext(payloadResponse);
        responseObserver.onCompleted();
    }
    
}
```

## RequestHandler requestHandler = requestHandlerRegistry.getByRequestType(type)

来分析下 `RequestHandler requestHandler = requestHandlerRegistry.getByRequestType(type);`这个方法，看看是RequestHandler有哪些实现并什么时候注册到requestHandlerRegistry中的。

**RequestHandlerRegistry:**

```java
@Service
public class RequestHandlerRegistry implements ApplicationListener<ContextRefreshedEvent> {
    
    Map<String, RequestHandler> registryHandlers = new HashMap<String, RequestHandler>();
    
    @Autowired
    private TpsMonitorManager tpsMonitorManager;
    
   
    public RequestHandler getByRequestType(String requestType) {
        return registryHandlers.get(requestType);
    }
    
    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        //拿到所有RequestHandler的实现类
        Map<String, RequestHandler> beansOfType = event.getApplicationContext().getBeansOfType(RequestHandler.class);
        Collection<RequestHandler> values = beansOfType.values();
        for (RequestHandler requestHandler : values) {
            
            Class<?> clazz = requestHandler.getClass();
            boolean skip = false;
            while (!clazz.getSuperclass().equals(RequestHandler.class)) {
                if (clazz.getSuperclass().equals(Object.class)) {
                    skip = true;
                    break;
                }
                clazz = clazz.getSuperclass();
            }
            //如果父类是RequestHandler类型，则跳过
            if (skip) {
                continue;
            }
            
            try {
                Method method = clazz.getMethod("handle", Request.class, RequestMeta.class);
                if (method.isAnnotationPresent(TpsControl.class) && TpsControlConfig.isTpsControlEnabled()) {
                    TpsControl tpsControl = method.getAnnotation(TpsControl.class);
                    String pointName = tpsControl.pointName();
                    TpsMonitorPoint tpsMonitorPoint = new TpsMonitorPoint(pointName);
                    tpsMonitorManager.registerTpsControlPoint(tpsMonitorPoint);
                }
            } catch (Exception e) {
                //ignore.
            }
            Class tClass = (Class) ((ParameterizedType) clazz.getGenericSuperclass()).getActualTypeArguments()[0];
            //放入map缓存中
            registryHandlers.putIfAbsent(tClass.getSimpleName(), requestHandler);
        }
    }
}
```

可以看到`RequestHandlerRegistry`实现了`ApplicationListener`接口，在spring启动后会执行`onApplicationEvent`，然后在此方法中将所有RequestHandler的实现类放进了缓存中。

## connectionManager

`ConnectionManager`用于管理与Server之间建立的长连接，在Nacos中，只有建立了双向流的连接才会被纳入到管理之中，Nacos本身也是利用双向流来完成Server端的主动推送。与Sentinel/Seata类似的，都是采用ConcurrentHashMap来保存对应的Connection连接对象，在注册连接时还会检查当前的连接相关的限制，对客户端进行一个统计计数，并调用事件回调通知监听器有连接建立。注意这里使用了synchronized的关键字，也就说明回调函数实际上是串行执行的（举个例子，RpcAckCallbackInitorOrCleaner会在连接建立/断开时初始化/清理RpcAckCallbackSynchronizer中连接对应的Map Entry）

## Response response = requestHandler.handleRequest(request, requestMeta);

下面就是正式的处理注册和注销的流程

```java
public Response handleRequest(T request, RequestMeta meta) throws NacosException {
    for (AbstractRequestFilter filter : requestFilters.filters) {
        try {
            Response filterResult = filter.filter(request, meta, this.getClass());
            if (filterResult != null && !filterResult.isSuccess()) {
                return filterResult;
            }
        } catch (Throwable throwable) {
            Loggers.REMOTE.error("filter error", throwable);
        }
        
    }
    return handle(request, meta);
}
```

## InstanceRequestHandler.handle(InstanceRequest request, RequestMeta meta)

```java
@Override
@Secured(action = ActionTypes.WRITE, parser = NamingResourceParser.class)
public InstanceResponse handle(InstanceRequest request, RequestMeta meta) throws NacosException {
    //构建存放nacos中的service服务
    Service service = Service
            .newService(request.getNamespace(), request.getGroupName(), request.getServiceName(), true);
    switch (request.getType()) {
        //注册
        case NamingRemoteConstants.REGISTER_INSTANCE:
            return registerInstance(service, request, meta);
        //注销
        case NamingRemoteConstants.DE_REGISTER_INSTANCE:
            return deregisterInstance(service, request, meta);
        default:
            throw new NacosException(NacosException.INVALID_PARAM,
                    String.format("Unsupported request type %s", request.getType()));
    }
}
```

到这里就能清晰的看到服务端处理注册和注销的逻辑了，其中注册逻辑实际调用的是`EphemeralClientOperationServiceImpl.registerInstance(Service service, Instance instance, String clientId)`。会在下一篇分析
