---
slug: /tech-sharing/ribbon-source/ribbon
---

# Ribbon的加载原理

## RibbonClientConfiguration:

```java
@SuppressWarnings("deprecation")
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties
// Order is important here, last should be the default, first should be optional
// see
// https://github.com/spring-cloud/spring-cloud-netflix/issues/2086#issuecomment-316281653
@Import({ HttpClientConfiguration.class, OkHttpRibbonConfiguration.class,
		RestClientRibbonConfiguration.class, HttpClientRibbonConfiguration.class })
public class RibbonClientConfiguration {

	/**
	 * Ribbon client default connect timeout.
	 */
	public static final int DEFAULT_CONNECT_TIMEOUT = 1000;

	/**
	 * Ribbon client default read timeout.
	 */
	public static final int DEFAULT_READ_TIMEOUT = 1000;

	/**
	 * Ribbon client default Gzip Payload flag.
	 */
	public static final boolean DEFAULT_GZIP_PAYLOAD = true;

	@RibbonClientName
	private String name = "client";

	// TODO: maybe re-instate autowired load balancers: identified by name they could be
	// associated with ribbon clients

	@Autowired
	private PropertiesFactory propertiesFactory;

	@Autowired
	private Environment environment;

	@Bean
	@ConditionalOnMissingBean
	public IClientConfig ribbonClientConfig() {
		DefaultClientConfigImpl config = new DefaultClientConfigImpl();

		config.loadProperties(this.name);

		config.set(CommonClientConfigKey.ConnectTimeout, getProperty(
				CommonClientConfigKey.ConnectTimeout, DEFAULT_CONNECT_TIMEOUT));

		config.set(CommonClientConfigKey.ReadTimeout,
				getProperty(CommonClientConfigKey.ReadTimeout, DEFAULT_READ_TIMEOUT));

		config.set(CommonClientConfigKey.GZipPayload, DEFAULT_GZIP_PAYLOAD);
		return config;
	}

	private Integer getProperty(IClientConfigKey<Integer> connectTimeout,
			int defaultConnectTimeout) {
		return environment.getProperty("ribbon." + connectTimeout, Integer.class,
				defaultConnectTimeout);
	}

	@Bean
	@ConditionalOnMissingBean
	public IRule ribbonRule(IClientConfig config) {
		if (this.propertiesFactory.isSet(IRule.class, name)) {
			return this.propertiesFactory.get(IRule.class, config, name);
		}
		ZoneAvoidanceRule rule = new ZoneAvoidanceRule();
		rule.initWithNiwsConfig(config);
		return rule;
	}

	@Bean
	@ConditionalOnMissingBean
	public IPing ribbonPing(IClientConfig config) {
		if (this.propertiesFactory.isSet(IPing.class, name)) {
			return this.propertiesFactory.get(IPing.class, config, name);
		}
		return new DummyPing();
	}

	@Bean
	@ConditionalOnMissingBean
	@SuppressWarnings("unchecked")
	public ServerList<Server> ribbonServerList(IClientConfig config) {
		if (this.propertiesFactory.isSet(ServerList.class, name)) {
			return this.propertiesFactory.get(ServerList.class, config, name);
		}
		ConfigurationBasedServerList serverList = new ConfigurationBasedServerList();
		serverList.initWithNiwsConfig(config);
		return serverList;
	}

	@Bean
	@ConditionalOnMissingBean
	public ServerListUpdater ribbonServerListUpdater(IClientConfig config) {
		return new PollingServerListUpdater(config);
	}

	@Bean
	@ConditionalOnMissingBean
	public ILoadBalancer ribbonLoadBalancer(IClientConfig config,
			ServerList<Server> serverList, ServerListFilter<Server> serverListFilter,
			IRule rule, IPing ping, ServerListUpdater serverListUpdater) {
		if (this.propertiesFactory.isSet(ILoadBalancer.class, name)) {
			return this.propertiesFactory.get(ILoadBalancer.class, config, name);
		}
		return new ZoneAwareLoadBalancer<>(config, rule, ping, serverList,
				serverListFilter, serverListUpdater);
	}

	@Bean
	@ConditionalOnMissingBean
	@SuppressWarnings("unchecked")
	public ServerListFilter<Server> ribbonServerListFilter(IClientConfig config) {
		if (this.propertiesFactory.isSet(ServerListFilter.class, name)) {
			return this.propertiesFactory.get(ServerListFilter.class, config, name);
		}
		ZonePreferenceServerListFilter filter = new ZonePreferenceServerListFilter();
		filter.initWithNiwsConfig(config);
		return filter;
	}

	@Bean
	@ConditionalOnMissingBean
	public RibbonLoadBalancerContext ribbonLoadBalancerContext(ILoadBalancer loadBalancer,
			IClientConfig config, RetryHandler retryHandler) {
		return new RibbonLoadBalancerContext(loadBalancer, config, retryHandler);
	}

	@Bean
	@ConditionalOnMissingBean
	public RetryHandler retryHandler(IClientConfig config) {
		return new DefaultLoadBalancerRetryHandler(config);
	}

	@Bean
	@ConditionalOnMissingBean
	public ServerIntrospector serverIntrospector() {
		return new DefaultServerIntrospector();
	}

	@PostConstruct
	public void preprocess() {
		setRibbonProperty(name, DeploymentContextBasedVipAddresses.key(), name);
	}

	static class OverrideRestClient extends RestClient {

		private IClientConfig config;

		private ServerIntrospector serverIntrospector;

		protected OverrideRestClient(IClientConfig config,
				ServerIntrospector serverIntrospector) {
			super();
			this.config = config;
			this.serverIntrospector = serverIntrospector;
			initWithNiwsConfig(this.config);
		}

		@Override
		public URI reconstructURIWithServer(Server server, URI original) {
			URI uri = updateToSecureConnectionIfNeeded(original, this.config,
					this.serverIntrospector, server);
			return super.reconstructURIWithServer(server, uri);
		}

		@Override
		protected Client apacheHttpClientSpecificInitialization() {
			ApacheHttpClient4 apache = (ApacheHttpClient4) super.apacheHttpClientSpecificInitialization();
			apache.getClientHandler().getHttpClient().getParams().setParameter(
					ClientPNames.COOKIE_POLICY, CookiePolicy.IGNORE_COOKIES);
			return apache;
		}
	}
}
```

可以看出`IClientConfig`配置，`ILoadBalancer`(实际的实现为`ZoneAwareLoadBalancer`)负载均衡器，`RibbonLoadBalancerContext`上下文，`ServerIntrospector`eureka或nacos的适配器，等关键的bean都是在`RibbonClientConfiguration`中加载的。

下面逐个分析关键bean的加载

## ribbonClientConfig配置信息实例

```java
@Bean
@ConditionalOnMissingBean
public IClientConfig ribbonClientConfig() {
    DefaultClientConfigImpl config = new DefaultClientConfigImpl();

    config.loadProperties(this.name);

    config.set(CommonClientConfigKey.ConnectTimeout, getProperty(
            CommonClientConfigKey.ConnectTimeout, DEFAULT_CONNECT_TIMEOUT));
    config.set(CommonClientConfigKey.ReadTimeout,
            getProperty(CommonClientConfigKey.ReadTimeout, DEFAULT_READ_TIMEOUT));
    config.set(CommonClientConfigKey.GZipPayload, DEFAULT_GZIP_PAYLOAD);
    return config;
}
```

## ribbonRule负载均衡的策略

是一个轮询，只是加了一些过滤器，根据一些条件过滤服务器，里面默认是轮询RoundRobinRule

```java
@Bean
@ConditionalOnMissingBean
public IRule ribbonRule(IClientConfig config) {
  if (this.propertiesFactory.isSet(IRule.class, name)) {
    return this.propertiesFactory.get(IRule.class, config, name);
  }
  ZoneAvoidanceRule rule = new ZoneAvoidanceRule();
  rule.initWithNiwsConfig(config);
  return rule;
}
```

ZoneAvoidanceRule的父类ClientConfigEnabledRoundRobinRule

```java
public class ClientConfigEnabledRoundRobinRule extends AbstractLoadBalancerRule {

    RoundRobinRule roundRobinRule = new RoundRobinRule();

    @Override
    public void initWithNiwsConfig(IClientConfig clientConfig) {
        roundRobinRule = new RoundRobinRule();
    }

    @Override
    public void setLoadBalancer(ILoadBalancer lb) {
    	super.setLoadBalancer(lb);
    	roundRobinRule.setLoadBalancer(lb);
    }
    
    @Override
    public Server choose(Object key) {
        if (roundRobinRule != null) {
            return roundRobinRule.choose(key);
        } else {
            throw new IllegalArgumentException(
                    "This class has not been initialized with the RoundRobinRule class");
        }
    }

}
```

## ribbonServerListUpdater服务列表更新器

ribbon定时器定时更新服务列表

```java
@Bean
@ConditionalOnMissingBean
public ServerListUpdater ribbonServerListUpdater(IClientConfig config) {
  return new PollingServerListUpdater(config);
}
```

## ribbonLoadBalancer负载均衡器

这样就将刚才介绍的配置，策略，Ping，服务更新器都融合了起来。实际构建返回的是`ZoneAwareLoadBalancer`

```java
@Bean
@ConditionalOnMissingBean
public ILoadBalancer ribbonLoadBalancer(IClientConfig config,
    ServerList<Server> serverList, ServerListFilter<Server> serverListFilter,
    IRule rule, IPing ping, ServerListUpdater serverListUpdater) {
  if (this.propertiesFactory.isSet(ILoadBalancer.class, name)) {
    return this.propertiesFactory.get(ILoadBalancer.class, config, name);
  }
  return new ZoneAwareLoadBalancer<>(config, rule, ping, serverList,
      serverListFilter, serverListUpdater);
}
```

## ZoneAwareLoadBalancer的创建

ZoneAwareLoadBalancer比较关键，要重点分析，涉及到Ping的定时器和服务获取的定时器的执行

```java
public ZoneAwareLoadBalancer(IClientConfig clientConfig, IRule rule,
                               IPing ping, ServerList<T> serverList, ServerListFilter<T> filter,
                               ServerListUpdater serverListUpdater) {
      super(clientConfig, rule, ping, serverList, filter, serverListUpdater);
  }
```

进入父类`DynamicServerListLoadBalancer`的构造方法

```java
public DynamicServerListLoadBalancer(IClientConfig clientConfig, IRule rule, IPing ping,
                                     ServerList<T> serverList, ServerListFilter<T> filter,
                                     ServerListUpdater serverListUpdater) {
    super(clientConfig, rule, ping);
    this.serverListImpl = serverList;
    this.filter = filter;
    this.serverListUpdater = serverListUpdater;
    if (filter instanceof AbstractServerListFilter) {
        ((AbstractServerListFilter) filter).setLoadBalancerStats(getLoadBalancerStats());
    }
    restOfInit(clientConfig);
}
```

进入父类`BaseLoadBalancer`的构造方法

```java
public BaseLoadBalancer(IClientConfig config, IRule rule, IPing ping) {
    initWithConfig(config, rule, ping, createLoadBalancerStatsFromConfig(config));
}
```

```java
void initWithConfig(IClientConfig clientConfig, IRule rule, IPing ping, LoadBalancerStats stats) {
    this.config = clientConfig;
    String clientName = clientConfig.getClientName();
    this.name = clientName;
    int pingIntervalTime = Integer.parseInt(""
            + clientConfig.getProperty(
                    CommonClientConfigKey.NFLoadBalancerPingInterval,
                    Integer.parseInt("30")));
    int maxTotalPingTime = Integer.parseInt(""
            + clientConfig.getProperty(
                    CommonClientConfigKey.NFLoadBalancerMaxTotalPingTime,
                    Integer.parseInt("2")));

    setPingInterval(pingIntervalTime);
    setMaxTotalPingTime(maxTotalPingTime);

    // cross associate with each other
    // i.e. Rule,Ping meet your container LB
    // LB, these are your Ping and Rule guys ...
    //设置规则
    setRule(rule);
    //设置定时
    setPing(ping);

    setLoadBalancerStats(stats);
    rule.setLoadBalancer(this);
    if (ping instanceof AbstractLoadBalancerPing) {
        ((AbstractLoadBalancerPing) ping).setLoadBalancer(this);
    }
    logger.info("Client: {} instantiated a LoadBalancer: {}", name, this);
    boolean enablePrimeConnections = clientConfig.get(
            CommonClientConfigKey.EnablePrimeConnections, DefaultClientConfigImpl.DEFAULT_ENABLE_PRIME_CONNECTIONS);

    if (enablePrimeConnections) {
        this.setEnablePrimingConnections(true);
        PrimeConnections primeConnections = new PrimeConnections(
                this.getName(), clientConfig);
        this.setPrimeConnections(primeConnections);
    }
    init();

}
```

### setRule(rule)

rule默认是`RoundRobinRule`，这里被设置为`ZoneAvoidanceRule`默认还是`RoundRobinRule`

```java
public void setRule(IRule rule) {
    super.setRule(rule);
    //这里的balancers为null，if逻辑不会执行
    if (balancers != null) {
        for (String zone: balancers.keySet()) {
            balancers.get(zone).setRule(cloneRule(rule));
        }
    }
}
```

```java
public void setRule(IRule rule) {
    if (rule != null) {
        //会执行到这里，rule实际为ZoneAvoidanceRule
        this.rule = rule;
    } else {
        /* default rule */
        this.rule = new RoundRobinRule();
    }
    if (this.rule.getLoadBalancer() != this) {
        this.rule.setLoadBalancer(this);
    }
}
```

### setRule(rule)

设置定时任务

```java
public void setPing(IPing ping) {
    if (ping != null) {
        if (!ping.equals(this.ping)) {
            this.ping = ping;
            setupPingTask(); // since ping data changed
        }
    } else {
        this.ping = null;
        // cancel the timer task
        lbTimer.cancel();
    }
}
```

### setupPingTask()

```java
void setupPingTask() {
    if (canSkipPing()) {
        return;
    }
    if (lbTimer != null) {
        lbTimer.cancel();
    }
    lbTimer = new ShutdownEnabledTimer("NFLoadBalancer-PingTimer-" + name,
            true);
    lbTimer.schedule(new PingTask(), 0, pingIntervalSeconds * 1000);
    forceQuickPing();
}
```

### PingTask()

这里的`pingStrategy`实际为`SerialPingStrategy`

```java
class PingTask extends TimerTask {
    public void run() {
        try {
          //这里的pingStrategy实际为SerialPingStrategy
          new Pinger(pingStrategy).runPinger();
        } catch (Exception e) {
            logger.error("LoadBalancer [{}]: Error pinging", name, e);
        }
    }
}
```

```java
public void runPinger() throws Exception {
    if (!pingInProgress.compareAndSet(false, true)) { 
        return; // Ping in progress - nothing to do
    }
    
    // we are "in" - we get to Ping

    Server[] allServers = null;
    boolean[] results = null;

    Lock allLock = null;
    Lock upLock = null;

    try {
        /*
         * The readLock should be free unless an addServer operation is
         * going on...
         */
        allLock = allServerLock.readLock();
        allLock.lock();
        allServers = allServerList.toArray(new Server[allServerList.size()]);
        allLock.unlock();

        int numCandidates = allServers.length;
        results = pingerStrategy.pingServers(ping, allServers);

        final List<Server> newUpList = new ArrayList<Server>();
        final List<Server> changedServers = new ArrayList<Server>();

        for (int i = 0; i < numCandidates; i++) {
            boolean isAlive = results[i];
            Server svr = allServers[i];
            boolean oldIsAlive = svr.isAlive();

            svr.setAlive(isAlive);

            if (oldIsAlive != isAlive) {
                changedServers.add(svr);
                logger.debug("LoadBalancer [{}]:  Server [{}] status changed to {}", 
                    name, svr.getId(), (isAlive ? "ALIVE" : "DEAD"));
            }

            if (isAlive) {
                newUpList.add(svr);
            }
        }
        upLock = upServerLock.writeLock();
        upLock.lock();
        upServerList = newUpList;
        upLock.unlock();

        notifyServerStatusChangeListener(changedServers);
    } finally {
        pingInProgress.set(false);
    }
}
```

注意：ribbon和nacos整合时，ZoneAwareLoadBalancer构建时需要的`ServerList<Server> serverList`,是从nacos加载的。

### restOfInit(IClientConfig clientConfig)

回到进入父类`DynamicServerListLoadBalancer`的构造方法，接着分析`restOfInit(IClientConfig clientConfig)`

```java
void restOfInit(IClientConfig clientConfig) {
    boolean primeConnection = this.isEnablePrimingConnections();
    // turn this off to avoid duplicated asynchronous priming done in BaseLoadBalancer.setServerList()
    this.setEnablePrimingConnections(false);
    //开启ribbon服务缓存列表的定时任务
    enableAndInitLearnNewServersFeature();
    //从nacos拉取服务列表
    updateListOfServers();
    if (primeConnection && this.getPrimeConnections() != null) {
        this.getPrimeConnections()
                .primeConnections(getReachableServers());
    }
    this.setEnablePrimingConnections(primeConnection);
    LOGGER.info("DynamicServerListLoadBalancer for client {} initialized: {}", clientConfig.getClientName(), this.toString());
}
```

可以看到启动有两个逻辑：

- `enableAndInitLearnNewServersFeature()`开启ribbon服务缓存列表的定时任务，实际执行的任务是`updateListOfServers()`
- `updateListOfServers()`定时任务设置好后，会先进行一次服务列表更新

### enableAndInitLearnNewServersFeature

```java
public void enableAndInitLearnNewServersFeature() {
    LOGGER.info("Using serverListUpdater {}", serverListUpdater.getClass().getSimpleName());
    //这里的serverListUpdater为PollingServerListUpdater，在刚才分析执行构造方法时传进来
    serverListUpdater.start(updateAction);
}
```

PollingServerListUpdater.start(final UpdateAction updateAction)

```java
public synchronized void start(final UpdateAction updateAction) {
    if (isActive.compareAndSet(false, true)) {
        final Runnable wrapperRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isActive.get()) {
                    if (scheduledFuture != null) {
                        scheduledFuture.cancel(true);
                    }
                    return;
                }
                try {
                    updateAction.doUpdate();
                    lastUpdated = System.currentTimeMillis();
                } catch (Exception e) {
                    logger.warn("Failed one update cycle", e);
                }
            }
        };

        scheduledFuture = getRefreshExecutor().scheduleWithFixedDelay(
                wrapperRunnable,
                initialDelayMs,
                refreshIntervalMs,
                TimeUnit.MILLISECONDS
        );
    } else {
        logger.info("Already active, no-op");
    }
}
```

```java
protected final ServerListUpdater.UpdateAction updateAction = new ServerListUpdater.UpdateAction() {
    @Override
    public void doUpdate() {
        updateListOfServers();
    }
};
```

可以看到`PollingServerListUpdaterstart.start(final UpdateAction updateAction)`方法中创建了定时任务，延迟10秒，间隔30秒，然后执行`updateListOfServers`方法

### DynamicServerListLoadBalancer.updateListOfServers()

拉取nacos的服务列表

```java
public void updateListOfServers() {
    List<T> servers = new ArrayList<T>();
    if (serverListImpl != null) {
        //这里serverListImpl实际为NacosServerList
        servers = serverListImpl.getUpdatedListOfServers();
        LOGGER.debug("List of Servers for {} obtained from Discovery client: {}",
                getIdentifier(), servers);

        if (filter != null) {
            servers = filter.getFilteredListOfServers(servers);
            LOGGER.debug("Filtered List of Servers for {} obtained from Discovery client: {}",
                    getIdentifier(), servers);
        }
    }
    updateAllServerList(servers);
}
```

这里看到`serverListImpl.getUpdatedListOfServers()`就是拉取nacos服务列表的流程

### serverListImpl注入过程

其实是依靠springboot自动装配特性注入的。

引入nacos依赖

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    <version>2.2.7.RELEASE</version>
</dependency>
<dependency>
    <groupId>com.alibaba.nacos</groupId>
    <artifactId>nacos-common</artifactId>
    <version>2.0.3</version>
</dependency>
```

![](/img/technologySharing/ribbon/RibbonNacosAutoConfiguration.png)
springboot自动装配中加载`RibbonNacosAutoConfiguration`

```java
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties
@ConditionalOnBean(SpringClientFactory.class)
@ConditionalOnRibbonNacos
@ConditionalOnNacosDiscoveryEnabled
@AutoConfigureAfter(RibbonAutoConfiguration.class)
@RibbonClients(defaultConfiguration = NacosRibbonClientConfiguration.class)
public class RibbonNacosAutoConfiguration {

}
```

其中有这么一行`@RibbonClients(defaultConfiguration = NacosRibbonClientConfiguration.class)`，进入`NacosRibbonClientConfiguration`

```java
@Configuration(proxyBeanMethods = false)
@ConditionalOnRibbonNacos
public class NacosRibbonClientConfiguration {

    @Autowired
    private PropertiesFactory propertiesFactory;

    @Bean
    @ConditionalOnMissingBean
    public ServerList<?> ribbonServerList(IClientConfig config,
            NacosDiscoveryProperties nacosDiscoveryProperties) {
        if (this.propertiesFactory.isSet(ServerList.class, config.getClientName())) {
            ServerList serverList = this.propertiesFactory.get(ServerList.class, config,
                    config.getClientName());
            return serverList;
        }
        NacosServerList serverList = new NacosServerList(nacosDiscoveryProperties);
        serverList.initWithNiwsConfig(config);
        return serverList;
    }

    @Bean
    @ConditionalOnMissingBean
    public NacosServerIntrospector nacosServerIntrospector() {
        return new NacosServerIntrospector();
    }

}
```

可以看到执行加载bean方法`ribbonServerList`，返回的实际类型为`NacosServerList`，这样就会在执行加载负载均衡器`ribbonLoadBalancer`方法构建`ZoneAwareLoadBalancer`时需要的参数`serverList`传入进去。

### serverListImpl.getUpdatedListOfServers()

获得nacos的服务列表

**NacosServerList.getUpdatedListOfServers()**

```java
public List<NacosServer> getUpdatedListOfServers() {
  return getServers();
}
```

```java
private List<NacosServer> getServers() {
  try {
    //获得服务组
    String group = discoveryProperties.getGroup();
    //discoveryProperties.namingServiceInstance()得到的是NacosNamingService
    //NacosNamingService.selectInstances(serviceId, group, true)属于nacos内容会在nacos篇进行详细分析
    List<Instance> instances = discoveryProperties.namingServiceInstance()
        .selectInstances(serviceId, group, true);
    return instancesToServerList(instances);
  }
  catch (Exception e) {
    throw new IllegalStateException(
        "Can not get service instances from nacos, serviceId=" + serviceId,
        e);
  }
}
```

**NacosNamingService.selectInstances(serviceId, group, true)**

属于nacos内容会在nacos篇进行详细分析

**NacosServerList.instancesToServerList(List instances)**

将服务`Instance`类型转换为`NacosServer`类型

```java
private List<NacosServer> instancesToServerList(List<Instance> instances) {
  List<NacosServer> result = new ArrayList<>();
  if (CollectionUtils.isEmpty(instances)) {
    return result;
  }
  for (Instance instance : instances) {
    result.add(new NacosServer(instance));
  }

  return result;
}
```

### DynamicServerListLoadBalancer.updateAllServerList(List ls)

回到`DynamicServerListLoadBalancer.updateListOfServers()`当执行完`NacosNamingService.selectInstances(serviceId, group, true)`从nacos获取最新服务列表后进行更新ribbon的缓存列表

```java
protected void updateAllServerList(List<T> ls) {
    // other threads might be doing this - in which case, we pass
    if (serverListUpdateInProgress.compareAndSet(false, true)) {
        try {
            for (T s : ls) {
                s.setAlive(true); // set so that clients can start using these
                                  // servers right away instead
                                  // of having to wait out the ping cycle.
            }
            setServersList(ls);
            super.forceQuickPing();
        } finally {
            serverListUpdateInProgress.set(false);
        }
    }
}
```

```java
public void setServersList(List lsrv) {
    //进入此方法更新缓存列表
    super.setServersList(lsrv);
    List<T> serverList = (List<T>) lsrv;
    Map<String, List<Server>> serversInZones = new HashMap<String, List<Server>>();
    for (Server server : serverList) {
        // make sure ServerStats is created to avoid creating them on hot
        // path
        getLoadBalancerStats().getSingleServerStat(server);
        String zone = server.getZone();
        if (zone != null) {
            zone = zone.toLowerCase();
            List<Server> servers = serversInZones.get(zone);
            if (servers == null) {
                servers = new ArrayList<Server>();
                serversInZones.put(zone, servers);
            }
            servers.add(server);
        }
    }
    setServerListForZones(serversInZones);
}
```

BaseLoadBalancer.setServersList(List lsrv)

```java
@Monitor(name = PREFIX + "AllServerList", type = DataSourceType.INFORMATIONAL)
protected volatile List<Server> allServerList = Collections
        .synchronizedList(new ArrayList<Server>());
@Monitor(name = PREFIX + "UpServerList", type = DataSourceType.INFORMATIONAL)
protected volatile List<Server> upServerList = Collections
        .synchronizedList(new ArrayList<Server>());



public void setServersList(List lsrv) {
    Lock writeLock = allServerLock.writeLock();
    logger.debug("LoadBalancer [{}]: clearing server list (SET op)", name);
    
    ArrayList<Server> newServers = new ArrayList<Server>();
    writeLock.lock();
    try {
        ArrayList<Server> allServers = new ArrayList<Server>();
        for (Object server : lsrv) {
            if (server == null) {
                continue;
            }

            if (server instanceof String) {
                server = new Server((String) server);
            }

            if (server instanceof Server) {
                logger.debug("LoadBalancer [{}]:  addServer [{}]", name, ((Server) server).getId());
                allServers.add((Server) server);
            } else {
                throw new IllegalArgumentException(
                        "Type String or Server expected, instead found:"
                                + server.getClass());
            }

        }
        boolean listChanged = false;
        if (!allServerList.equals(allServers)) {
            listChanged = true;
            if (changeListeners != null && changeListeners.size() > 0) {
               List<Server> oldList = ImmutableList.copyOf(allServerList);
               List<Server> newList = ImmutableList.copyOf(allServers);                   
               for (ServerListChangeListener l: changeListeners) {
                   try {
                       l.serverListChanged(oldList, newList);
                   } catch (Exception e) {
                       logger.error("LoadBalancer [{}]: Error invoking server list change listener", name, e);
                   }
               }
            }
        }
        if (isEnablePrimingConnections()) {
            for (Server server : allServers) {
                if (!allServerList.contains(server)) {
                    server.setReadyToServe(false);
                    newServers.add((Server) server);
                }
            }
            if (primeConnections != null) {
                primeConnections.primeConnectionsAsync(newServers, this);
            }
        }
        // This will reset readyToServe flag to true on all servers
        // regardless whether
        // previous priming connections are success or not
        allServerList = allServers;
        if (canSkipPing()) {
            for (Server s : allServerList) {
                s.setAlive(true);
            }
            upServerList = allServerList;
        } else if (listChanged) {
            forceQuickPing();
        }
    } finally {
        writeLock.unlock();
    }
}
```

可以看到最终是把从nacos获取的服务列表更新到了`BaseLoadBalancer`中的`allServerList`和`upServerList`集合中
