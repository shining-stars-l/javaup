---
slug: /damai/knowledge/nacos-core
---

# Nacos核心知识点总结

## Client

从Nacos2.0以后，新增了**Client**模型，管理与该客户端有关的数据内容，如果一个客户端发布了一个服务，那么这个客户端发布的所有服务和订阅者信息都会被更新到一个Client对象中

这个Client对象对应于这个客户端的链接，然后通过事件机制触发索引信息的更新。

**Client负责管理一个客户端的服务实例注册Publish和服务订阅Subscribe**，可以方便地对需要推送的服务范围进行快速聚合，同时一个客户端gRPC长连接对应 **一个Client**，每个Client有自己唯一的 clientId

ConnectionBasedClientManager负责管理长连接clientId与Client模型的映射关系

<br/>

# 客户端重试机制

由于网络的不稳定，RPC 请求可能失败，那么失败了就得有保障措施，比如说请求重试。

Nacos 中的服务注册的请求重试就是通过 RedoService 实现的。

其原理为：当注册服务等操作时，先将请求缓存到 map 中，**然后定时任务每隔3秒检测一次，将需要重试的任务重新发起请求**

<br/>

# 健康检查机制

- 在2.0版本以后，持久实例不变，临时实例而是通过 **长连接** 来判断实例是否健康。

-  长连接： 一个连接上可以连续发送多数据包，在连接保持期间，如果没有数据包发送，需要双方发链路检测包，在 Nacos2.0 之后，使用 `Grpc` 协议代替了 http 协议。长连接会保持客户端和服务端发送的状态，在源码中 `ConnectionManager` 管理所有客户端的长连接 

- `ConnectionManager`: 每3秒检测所有超过20S内没有发生过通讯的客户端，向客户端发起ClientDetectionRequest探测请求，如果客户端在1s内成功响应，则检测通过，否则执行unregister方法移除Connection
   
-  如果客户端持续和服务端进行通讯，服务端是不需要主动下探的，只有当客户端没有一直和服务端通信的时候，服务端才会主动下探操作 

```java
@Service
public class ConnectionManager extends Subscriber<ConnectionLimitRuleChangeEvent> {

Map<String, Connection> connections = new ConcurrentHashMap<String, Connection>();

   //只要spring容器启动，会触发这个方法
    @PostConstruct
    public void start() {
    // 启动不健康连接排除功能.
    RpcScheduledExecutor.COMMON_SERVER_EXECUTOR.scheduleWithFixedDelay(new Runnable() {
      @Override
      public void run() {
        // 1. 统计过时（20s）连接
         Set<Map.Entry<String, Connection>> entries = connections.entrySet();
        //2.获得需要剔除的IP和端口
        //3.根据限制获取剔除的IP和端口
        //4.如果还是有需要剔除的客户端，则继续执行
        //5.没有活动的客户端执行探测            
        //6.如果没有马上响应，则马上剔除
        //7.剔除后发布ClientDisconnectEvent事件
      }
    });

    }
}

//注销（移出）连接方法
public synchronized void unregister(String connectionId) {
Connection remove = this.connections.remove(connectionId);
if (remove != null) {
    String clientIp = remove.getMetaInfo().clientIp;
    AtomicInteger atomicInteger = connectionForClientIp.get(clientIp);
    if (atomicInteger != null) {
        int count = atomicInteger.decrementAndGet();
        if (count <= 0) {
            connectionForClientIp.remove(clientIp);
        }
    }
    remove.close();
    Loggers.REMOTE_DIGEST.info("[{}]Connection unregistered successfully. ", connectionId);
    clientConnectionEventListenerRegistry.notifyClientDisConnected(remove);
}
//当服务端操作移除事件以后，会操作notifyClientDisConnected()方法,主要调用的是 clientConnectionEventListener.clientDisConnected(connection)方法，将连接信息传入进去

public void notifyClientDisConnected(final Connection connection) {

for (ClientConnectionEventListener clientConnectionEventListener : clientConnectionEventListeners) {
    try {
        clientConnectionEventListener.clientDisConnected(connection);
    } catch (Throwable throwable) {
        Loggers.REMOTE.info("[NotifyClientDisConnected] failed for listener {}",
                clientConnectionEventListener.getName(), throwable);
    }
}
        
//clientConnectionEventListenerd的实现类是ConnectionBasedClientManager，在这里面会出发清除索引缓存等操作

@Component("connectionBasedClientManager")
public class ConnectionBasedClientManager extends ClientConnectionEventListener implements ClientManager {
    @Override
    public boolean clientDisconnected(String clientId) {
        Loggers.SRV_LOG.info("Client connection {} disconnect, remove instances and subscribers", clientId);
        //同步移除client数据
        ConnectionBasedClient client = clients.remove(clientId);
        if (null == client) {
            return true;
        }
        client.release();
        //服务订阅，将变更通知到客户端
        NotifyCenter.publishEvent(new ClientEvent.ClientDisconnectEvent(client));
        return true;
    }
}
```
<br/>

# ServiceManager

```java
//ServiceManager是 Nacos的服务管理器，内部维护了两个 ConcurrentHashMap 类型的成员变量，singletonRepository 用来保证Service的单例；
namespaceSingletonMaps 用来存储namespace下的所有 Service。

//保证单例Service
private final ConcurrentHashMap<Service, Service> singletonRepository;
//namespace下的所有service，存储Service的容器
private final ConcurrentHashMap<String, Set<Service>> namespaceSingletonMaps;

/**
 * 获取单例 Service
 */
public Service getSingleton(Service service) {
    // Service在singletonRepository中不存在，发布ServiceMetadataEvent事件，将Service设置到singletonRepository中
    singletonRepository.computeIfAbsent(service, key -> {
        NotifyCenter.publishEvent(new MetadataEvent.ServiceMetadataEvent(service, false));
        return service;
    });
    // 获取单例 Service
    Service result = singletonRepository.get(service);
    // 容器，存储 namespace 与 Service集 的映射关系
    namespaceSingletonMaps.computeIfAbsent(result.getNamespace(), namespace -> new ConcurrentHashSet<>());
    namespaceSingletonMaps.get(result.getNamespace()).add(result);
    return result;
}
```

<br/>

# 集群间的数据同步

为了确保集群间数据一致，不仅仅依赖于`数据发生改变时`的实时同步，后台有`定时任务`做数据同步

- 在 `1.x` 版本中，责任节点每 5s 同步所有 Service的Instance 列表的摘要（md5）给非责任节点。非责任节点用对端传来的服务 md5 比对本地服务的 md5，如果发生改变，需要反查责任节点

- 在 `2.x` 版本中，对这个流程做了改造，当责任节点的 Client 数据发生变更后，会同步这个 Client 的`全量数据`给`其他非责任节点`。非责任节点会更新 Client 信息。为了避免非责任节点上非直连的 Client 数据不一致，责任节点每 5s 向非责任节点发送核实数据，续租这些 Client，来维持非责任节点的 Client 数据不过期。包含了 Client 全量数据；非责任节点定时扫描非直连的 Client 数据，如果超过 30s 没有续租，移除这些非直连的 client。这样可以减少 1.x 版本中的反查。

<br/>

# 集群接受客户端的注册或注销

- 在 `1.x` 中，所有客户端请求会经过 `DistroFilter`，它会判断当前节点是否为责任节点，判断的方法：如果 hash 服务名然后和 nacos 节点数量取模，得到的值就是责任节点的下标。如果当前节点不是责任节点，则转发给责任节点处理，责任节点处理后，由当前节点返回客户端

- 在 `2.x` 中，`DistroFilter` 对于客户端就没用了，因为客户端与服务端会建立`长连接`，当前 nacos 节点是否是责任节点，取决于 Client 身上的 isNative 属性。如果是客户端直接注册在这个 nacos 节点上的，它的 isNative 属性为 true，如果是由 Distro 协议，由集群中其他节点同步过来的，那么它的 isNative 属性为 false

<br/>

# 注册中心模型

- `Service`：服务，namespace+group+name=**单例**Service。**Service与Instance不会直接发生关系**，由 ServiceManager 管理 

- `Instance`：实例，InstancePublishInfo，由Client管理。 

- `Client`：一个客户端长连接对应一个 Client，一个 Client 持有对应客户端注册和监听的的 Service&Instance。Client 使 Service 和 Instance发生关联，由 ClientManager 管理。 

-  `Connection`：连接（长连接），一个 Connection 对应一个 Client，由 ConnectionManager 管理。 

<br/>

# 模型索引
**Service 与 Instance 没有直接关系**，需要通过遍历所有 Client 注册的服务和实例，得到 Service 下所有 Instance。为了加速查询，提供了两个索引服务

- `ClientServiceIndexesManager`：Service->Client，**服务与发布这个服务** 和 **服务与监听这个服务**的客户端的关联关系

- `ServiceStorage`：Service->Instance，服务与服务下实例的关联关系

<br/>

## 服务注册

对于客户端来说，临时实例注册，走 gRPC；持久实例注册走 http。

对于服务端来说，无论是 gRPC 还是 http，底层流程都是一样的：

1. 建立Connection->Client->Service->Instance的关系
2. 构建索引，用于辅助查询
3. 通知订阅客户端
4. 集群数据同步



## 服务发现

服务查询，走 **ServiceStorage** 索引服务。如果 ServiceStorage 查询不到数据，走复杂查询逻辑，然后再放入 ServiceStorage 缓存。当服务发生变更时，ServiceStorage 缓存数据会更新。

服务订阅，服务端会把 Client 订阅的服务，注册到 Client 里管理。
