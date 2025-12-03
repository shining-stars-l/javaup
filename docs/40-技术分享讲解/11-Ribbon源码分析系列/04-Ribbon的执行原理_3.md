---
slug: /tech-sharing/ribbon-source/ribbon-part-3
---

# Ribbon的执行原理_3

ribbon的执行原理_2 文章中详细分析了ribbon选择负载均衡器并进行执行的过程，本篇文章就实现自定义服务过滤功能来做详细的分析

## 场景

1. 灰度和生产的服务都部署在同一个注册中心
2. 生产环境的服务只能调用生产环境的微服务
3. 灰度环境的服务优先调用灰度环境的服务当灰度不存在，则调用生成环境的服务

## 思路

### 自定义规则

可从默认的规则`ZoneAvoidanceRule`入手，因为在生成的时候使用了`@ConditionalOnMissingBean`说明了可以我们可以自定义Rule

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

```java
public class ZoneAvoidanceRule extends PredicateBasedRule {

    private static final Random random = new Random();
    
    private CompositePredicate compositePredicate;
    
    public ZoneAvoidanceRule() {
        super();
        ZoneAvoidancePredicate zonePredicate = new ZoneAvoidancePredicate(this);
        AvailabilityPredicate availabilityPredicate = new AvailabilityPredicate(this);
        compositePredicate = createCompositePredicate(zonePredicate, availabilityPredicate);
    }
    
    private CompositePredicate createCompositePredicate(ZoneAvoidancePredicate p1, AvailabilityPredicate p2) {
        return CompositePredicate.withPredicates(p1, p2)
                             .addFallbackPredicate(p2)
                             .addFallbackPredicate(AbstractServerPredicate.alwaysTrue())
                             .build();
        
    }
    
    
    @Override
    public void initWithNiwsConfig(IClientConfig clientConfig) {
        ZoneAvoidancePredicate zonePredicate = new ZoneAvoidancePredicate(this, clientConfig);
        AvailabilityPredicate availabilityPredicate = new AvailabilityPredicate(this, clientConfig);
        compositePredicate = createCompositePredicate(zonePredicate, availabilityPredicate);
    }



    /**
     * 被调用的地方是getPredicate().chooseRoundRobinAfterFiltering(lb.getAllServers(), key);
     * chooseRoundRobinAfterFiltering(lb.getAllServers(), key)就是真正要过滤逻辑了
     * */ 
    @Override
    public AbstractServerPredicate getPredicate() {
        return compositePredicate;
    }  

    /**
     * 省略部分代码
     * */  
}
```

从`ZoneAvoidanceRule`可以得出以下几点

- 在构造方法中将`ZoneAvoidancePredicate`和`AvailabilityPredicate`这两个过滤器通过调用createCompositePredicate方法包装成了`compositePredicate`组合型过滤器，这三个过滤器在上文有详细解释，这里不再赘述
- `createCompositePredicate`方法能够将多个过滤器包装进来，然后挨个执行
- 当执行真正的过滤逻辑时也就是`getPredicate().chooseRoundRobinAfterFiltering(lb.getAllServers(), key)`方法，`getPredicate()`就是要返回这个包装后的组合型过滤器`compositePredicate`
- 由上可知，我们需要定义一个Rule需要继承`PredicateBasedRule`，并重写上述几个方法

### 自定义过滤器

规则分析后，接下来要考虑自定义的过滤器要怎么做，从`createCompositePredicate`方法入手，其中注入了`ZoneAvoidancePredicate`，我们可以进行分析，关于这个过滤器的作用已在上一篇文章详细的分析，这里只分析关键部分

```java
public class ZoneAvoidancePredicate extends  AbstractServerPredicate {

    /**
     * 省略其余逻辑
     * */
    ZoneAvoidancePredicate(IRule rule) {
        super(rule);
    }
    

    @Override
    public boolean apply(@Nullable PredicateKey input) {
        if (!ENABLED.get()) {
            return true;
        }
        String serverZone = input.getServer().getZone();
        if (serverZone == null) {
            // there is no zone information from the server, we do not want to filter
            // out this server
            return true;
        }
        LoadBalancerStats lbStats = getLBStats();
        if (lbStats == null) {
            // no stats available, do not filter
            return true;
        }
        if (lbStats.getAvailableZones().size() <= 1) {
            // only one zone is available, do not filter
            return true;
        }
        Map<String, ZoneSnapshot> zoneSnapshot = ZoneAvoidanceRule.createSnapshot(lbStats);
        if (!zoneSnapshot.keySet().contains(serverZone)) {
            // The server zone is unknown to the load balancer, do not filter it out 
            return true;
        }
        logger.debug("Zone snapshots: {}", zoneSnapshot);
        Set<String> availableZones = ZoneAvoidanceRule.getAvailableZones(zoneSnapshot, triggeringLoad.get(), triggeringBlackoutPercentage.get());
        logger.debug("Available zones: {}", availableZones);
        if (availableZones != null) {
            return availableZones.contains(input.getServer().getZone());
        } else {
            return false;
        }
    }    
}
```

- `ZoneAvoidancePredicate`继承了`AbstractServerPredicate`实现了apply方法，此方法是真正执行过滤服务实例的逻辑。
- 执行有参构造方法，将rule传给了父类

通过以上分析，我们有了思路来做相应的设计

## 自定义过滤器逻辑

### 配置

```java
@ConfigurationProperties("spring.cloud.nacos.discovery.metadata")
@Setter
@Getter
public class ExtraRibbonProperties {
    
    private String mark;
}
```

### 自动装配配置

```java
@Configuration(proxyBeanMethods = false)
@AutoConfigureBefore(RibbonClientConfiguration.class)
@ConditionalOnProperty(value = "ribbon.filter.metadata.enabled", matchIfMissing = true)
@EnableConfigurationProperties(ExtraRibbonProperties.class)
public class ExtraRibbonAutoConfiguration {
    
    @Bean
    public DiscoveryEnabledRule discoveryEnabledRule(ExtraRibbonProperties extraRibbonProperties){
        return new DiscoveryEnabledRule(extraRibbonProperties);
    }
}
```

### 自定义规则

```java
public class DiscoveryEnabledRule extends PredicateBasedRule {
    
    /**
     * 这里为静态的原因是ribbon在定时任务执行时是直接调用DiscoveryEnabledRule的构造方法，而不是从spring中获得
     * */
    private static String mark;
    
    private CompositePredicate predicate = null;
    
    public DiscoveryEnabledRule(ExtraRibbonProperties extraRibbonProperties){
        super();
        mark = extraRibbonProperties.getMark();
        MetadataAwarePredicate metadataAwarePredicate = new MetadataAwarePredicate(mark, this);
        Assert.notNull(metadataAwarePredicate, "参数 'abstractServerPredicate' 不能为 null");
        predicate = createCompositePredicate(metadataAwarePredicate, new AvailabilityPredicate(this, null));
    }
    
    public DiscoveryEnabledRule(){
        super();
        MetadataAwarePredicate metadataAwarePredicate = new MetadataAwarePredicate(mark, this);
        Assert.notNull(metadataAwarePredicate, "参数 'abstractServerPredicate' 不能为 null");
        predicate = createCompositePredicate(metadataAwarePredicate, new AvailabilityPredicate(this, null));
    }
    
    @Override
    public AbstractServerPredicate getPredicate() {
        return predicate;
    }
    
    private CompositePredicate createCompositePredicate(AbstractServerPredicate abstractServerPredicate, AvailabilityPredicate availabilityPredicate) {
        return CompositePredicate.withPredicates(abstractServerPredicate, availabilityPredicate)
                .build();
    }
}
```

### 自定义过滤器

```java
@Log4j2
public class MetadataAwarePredicate extends AbstractServerPredicate{
    
    public static final String MARK_FLAG_TRUE = "true";
    
    public static final String MARK_FLAG_FALSE = "false";
    
    private static final String MARK_PARAMETER = "mark";
    
    private String mark;
    
    private DiscoveryEnabledRule discoveryEnabledRule;
    
    public MetadataAwarePredicate(String mark,DiscoveryEnabledRule discoveryEnabledRule){
        super(discoveryEnabledRule);
        this.mark = mark;
        this.discoveryEnabledRule = discoveryEnabledRule;
    }
    
    
    @Override
    public boolean apply(PredicateKey input) {
        boolean result = true
        //这里可以写具体的过滤逻辑
        return result;
    }
}
```
