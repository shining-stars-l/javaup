---
slug: /tech-sharing/nacos-source/nacos-part-6
---

# Nacos服务端服务注册原理_6

当负责节点将数据发送给非负责节点以后，将要处理发送过来的Client数据。通过DistroController收到数据。

```java
@PutMapping("/datum")
public ResponseEntity onSyncDatum(@RequestBody Map<String, Datum<Instances>> dataMap) throws Exception {
    
    if (dataMap.isEmpty()) {
        Loggers.DISTRO.error("[onSync] receive empty entity!");
        throw new NacosException(NacosException.INVALID_PARAM, "receive empty entity!");
    }
    
    for (Map.Entry<String, Datum<Instances>> entry : dataMap.entrySet()) {
        if (KeyBuilder.matchEphemeralInstanceListKey(entry.getKey())) {
            String namespaceId = KeyBuilder.getNamespace(entry.getKey());
            String serviceName = KeyBuilder.getServiceName(entry.getKey());
            if (!serviceManager.containService(namespaceId, serviceName) && switchDomain
                    .isDefaultInstanceEphemeral()) {
                serviceManager.createEmptyService(namespaceId, serviceName, true);
            }
            DistroHttpData distroHttpData = new DistroHttpData(createDistroKey(entry.getKey()), entry.getValue());
            distroProtocol.onReceive(distroHttpData);
        }
    }
    return ResponseEntity.ok("ok");
}
```

## DistroProtocol.onReceive(DistroData distroData)

```java
public boolean onReceive(DistroData distroData) {
    Loggers.DISTRO.info("[DISTRO] Receive distro data type: {}, key: {}", distroData.getType(),
            distroData.getDistroKey());
    String resourceType = distroData.getDistroKey().getResourceType();
    DistroDataProcessor dataProcessor = distroComponentHolder.findDataProcessor(resourceType);
    if (null == dataProcessor) {
        Loggers.DISTRO.warn("[DISTRO] Can't find data process for received data {}", resourceType);
        return false;
    }
    return dataProcessor.processData(distroData);
}
```

### DistroClientDataProcessor.processData(DistroData distroData)

```java
public boolean processData(DistroData distroData) {
    switch (distroData.getType()) {
        case ADD:
        case CHANGE:
            ClientSyncData clientSyncData = ApplicationUtils.getBean(Serializer.class)
                    .deserialize(distroData.getContent(), ClientSyncData.class);
            // 将负责节点发送过来的Client信息进行缓存添加
            handlerClientSyncData(clientSyncData);
            return true;
        case DELETE:
            String deleteClientId = distroData.getDistroKey().getResourceKey();
            Loggers.DISTRO.info("[Client-Delete] Received distro client sync data {}", deleteClientId);
            // 删除操作，从clients缓存中删除
            clientManager.clientDisconnected(deleteClientId);
            return true;
        default:
            return false;
    }
}
```

这里分析add/change添加和修改的逻辑。

### DistroClientDataProcessor.handlerClientSyncData(ClientSyncData clientSyncData)

```java
private void handlerClientSyncData(ClientSyncData clientSyncData) {
    Loggers.DISTRO.info("[Client-Add] Received distro client sync data {}", clientSyncData.getClientId());
    // 同步客户端连接，此时如果客户端不存在，则会注册一个非负责节点client，后面就会获取到该客户端操作
    clientManager.syncClientConnected(clientSyncData.getClientId(), clientSyncData.getAttributes());
    // 获取Client，这里client实际为ConnectionBasedClient
    Client client = clientManager.getClient(clientSyncData.getClientId());
    // 更新Client数据
    upgradeClient(client, clientSyncData);
}
```

- 客户端直接注册到此节点上的ConnectionBasedClient，其isNative属性为true；
- 如果是Distro协议，此节点同步到集群中其他节点，节点上的ConnectionBasedClient，它的isNative属性为false。
- 如果是2.x的版本，则使用了长连接，那么长连接建立在哪个节点上，哪个节点就是责任节点，客户端也只会向这个责任节点发送请求。

### DistroClientDataProcessor.upgradeClient(Client client, ClientSyncData clientSyncData)

集群中非负责节点来更新Client节点的Service和Instance信息,，并发布对应事件

```java
private void upgradeClient(Client client, ClientSyncData clientSyncData) {
    List<String> namespaces = clientSyncData.getNamespaces();
    List<String> groupNames = clientSyncData.getGroupNames();
    List<String> serviceNames = clientSyncData.getServiceNames();
    List<InstancePublishInfo> instances = clientSyncData.getInstancePublishInfos();
    Set<Service> syncedService = new HashSet<>();
    for (int i = 0; i < namespaces.size(); i++) {
        Service service = Service.newService(namespaces.get(i), groupNames.get(i), serviceNames.get(i));
        Service singleton = ServiceManager.getInstance().getSingleton(service);
        syncedService.add(singleton);
        InstancePublishInfo instancePublishInfo = instances.get(i);
        if (!instancePublishInfo.equals(client.getInstancePublishInfo(singleton))) {
            client.addServiceInstance(singleton, instancePublishInfo);
            NotifyCenter.publishEvent(
                    new ClientOperationEvent.ClientRegisterServiceEvent(singleton, client.getClientId()));
        }
    }
    for (Service each : client.getAllPublishedService()) {
        if (!syncedService.contains(each)) {
            client.removeServiceInstance(each);
            NotifyCenter.publishEvent(
                    new ClientOperationEvent.ClientDeregisterServiceEvent(each, client.getClientId()));
        }
    }
}
```

### ConnectionBasedClientManager.clientDisconnected(String clientId)

同步负责节点删除的操作，从clients缓存中移除，并发布对应的事件

```java
public boolean clientDisconnected(String clientId) {
    Loggers.SRV_LOG.info("Client connection {} disconnect, remove instances and subscribers", clientId);
    ConnectionBasedClient client = clients.remove(clientId);
    if (null == client) {
        return true;
    }
    client.release();
    NotifyCenter.publishEvent(new ClientEvent.ClientDisconnectEvent(client));
    return true;
}
```

### 总结：
当负责节点收到ClientChangedEvent、ClientDisconnectEvent和ClientVerifyFailedEvent事件时，会向集群的其他非负责的节点发送Client的信息；集群中其他非负责的节点收到请求后会进行相应的更新或者删除缓存的Client数据信息。
