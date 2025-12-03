---
slug: /tech-sharing/ribbon-source/ribbon-part-1
---

# Ribbon的执行原理_1

## restTemplate

```java
ResponseEntity<String> stringResponseEntity = restTemplate.postForEntity(url, map, String.class);
```

一直调用直到`LoadBalancerInterceptor.intercept(final HttpRequest request, final byte[] body,final ClientHttpRequestExecution execution)`

```java
public ClientHttpResponse intercept(final HttpRequest request, final byte[] body,
        final ClientHttpRequestExecution execution) throws IOException {
    final URI originalUri = request.getURI();
    String serviceName = originalUri.getHost();
    Assert.state(serviceName != null,
            "Request URI does not contain a valid hostname: " + originalUri);
    //这里的loadBalancer为RibbonLoadBalancerClient
    return this.loadBalancer.execute(serviceName,
            this.requestFactory.createRequest(request, body, execution));
}
```

### this.requestFactory.createRequest(request, body, execution)

```java
public LoadBalancerRequest<ClientHttpResponse> createRequest(
    final HttpRequest request, final byte[] body,
    final ClientHttpRequestExecution execution) {
  return instance -> {
    HttpRequest serviceRequest = new ServiceRequestWrapper(request, instance,
        this.loadBalancer);
    if (this.transformers != null) {
      for (LoadBalancerRequestTransformer transformer : this.transformers) {
        serviceRequest = transformer.transformRequest(serviceRequest,
            instance);
      }
    }
    return execution.execute(serviceRequest, body);
  };
}
```

用lambda构建了并返回了`LoadBalancerRequest`，最终肯定还是会调用到lambda中的`execution.execute(serviceRequest, body)`

### this.loadBalancer.execute

回到this.loadBalancer.execute

RibbonLoadBalancerClient.execute(String serviceId, LoadBalancerRequest request)

```java
public <T> T execute(String serviceId, LoadBalancerRequest<T> request)
    throws IOException {
  return execute(serviceId, request, null);
}
```

```java
public <T> T execute(String serviceId, LoadBalancerRequest<T> request, Object hint)
    throws IOException {
  //根据服务名获取ILoadBalancer类型的负载均衡器
  ILoadBalancer loadBalancer = getLoadBalancer(serviceId);
  Server server = getServer(loadBalancer, hint);
  if (server == null) {
    throw new IllegalStateException("No instances available for " + serviceId);
  }
  RibbonServer ribbonServer = new RibbonServer(serviceId, server,
      isSecure(server, serviceId),
      serverIntrospector(serviceId).getMetadata(server));

  return execute(serviceId, ribbonServer, request);
}
```

```java
//根据服务名获取ILoadBalancer类型的负载均衡器  
protected ILoadBalancer getLoadBalancer(String serviceId) {
  //这里的clientFactory为SpringClientFactory
  return this.clientFactory.getLoadBalancer(serviceId);
}
```

SpringClientFactory.getLoadBalancer(String name)

```java
public ILoadBalancer getLoadBalancer(String name) {
  return getInstance(name, ILoadBalancer.class);
}
```

```java
public <C> C getInstance(String name, Class<C> type) {
  C instance = super.getInstance(name, type);
  if (instance != null) {
    return instance;
  }
  IClientConfig config = getInstance(name, IClientConfig.class);
  return instantiateWithConfig(getContext(name), type, config);
}
```

NamedContextFactory.getInstance(String name, Class type)

```java
public <T> T getInstance(String name, Class<T> type) {
  AnnotationConfigApplicationContext context = getContext(name);
  try {
    return context.getBean(type);
  }
  catch (NoSuchBeanDefinitionException e) {
    // ignore
  }
  return null;
}
```

SpringClientFacotry.getContext(String name)

```java
protected AnnotationConfigApplicationContext getContext(String name) {
  return super.getContext(name);
}
```

NamedContextFactory.getContext(String name)

```java
protected AnnotationConfigApplicationContext getContext(String name) {
  if (!this.contexts.containsKey(name)) {
    synchronized (this.contexts) {
      if (!this.contexts.containsKey(name)) {
        this.contexts.put(name, createContext(name));
      }
    }
  }
  return this.contexts.get(name);
}
```

第一次执行到这里是拿不到的，会执行`createContext(name)`
### createContext(String name)

```java
protected AnnotationConfigApplicationContext createContext(String name) {
    AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
    if (this.configurations.containsKey(name)) {
        for (Class<?> configuration : this.configurations.get(name)
                .getConfiguration()) {
            context.register(configuration);
        }
    }
    for (Map.Entry<String, C> entry : this.configurations.entrySet()) {
        if (entry.getKey().startsWith("default.")) {
            for (Class<?> configuration : entry.getValue().getConfiguration()) {
                context.register(configuration);
            }
        }
    }
    context.register(PropertyPlaceholderAutoConfiguration.class,
            this.defaultConfigType);
    context.getEnvironment().getPropertySources().addFirst(new MapPropertySource(
            this.propertySourceName,
            Collections.<String, Object>singletonMap(this.propertyName, name)));
    if (this.parent != null) {
        // Uses Environment from parent as well as beans
        context.setParent(this.parent);
        // jdk11 issue
        // https://github.com/spring-cloud/spring-cloud-netflix/issues/3101
        context.setClassLoader(this.parent.getClassLoader());
    }
    context.setDisplayName(generateDisplayName(name));
    context.refresh();
    return context;
}
```

### 到这里可以分析出以下流程：

1. 当调用`SpringClientFactory.getInstance`时，会调用父类`NamedContextFactory.getInstance`
2. 接着会调用`getContext(String name)`
3. 如果`contexts`不包含服务name，name就会执行`createContext(name)`,`contexts`为map，key为fegin服务名，value为每个服务自己的spring上下文。

```java
private Map<String, AnnotationConfigApplicationContext> contexts = new ConcurrentHashMap<>();
```

在`NamedContextFactory#createContext`方法中有一行

```java
context.register(PropertyPlaceholderAutoConfiguration.class,
				this.defaultConfigType);
```

`defaultConfigType`在加载`SpringClientFactory`时加载父类`NamedContextFactory`进行赋值

```java
public SpringClientFactory() {
		super(RibbonClientConfiguration.class, NAMESPACE, "ribbon.client.name");
	}
```

所以`defaultConfigType`为`RibbonClientConfiguration`加载过程在下一篇分析
