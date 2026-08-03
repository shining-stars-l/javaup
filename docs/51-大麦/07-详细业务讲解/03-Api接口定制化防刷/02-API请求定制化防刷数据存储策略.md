---
slug: /damai/business/api-anti-bot/storage
title: "API请求定制化防刷数据存储策略：Gateway、Kafka、幂等、Kafka Topic详解"
sidebar_label: "API请求定制化防刷数据存储策略"
pagination_label: "API请求定制化防刷数据存储策略"
description: "围绕《API请求定制化防刷数据存储策略》，重点讲解Gateway、Kafka、幂等、Kafka Topic等技术实现与工程落地细节。内容进一步围绕Gateway、Kafka、幂等、Kafka Topic等关键主题展开。通过原理拆解、实现步骤与适用场景说明相关方案如何落地。同时补充常见问题、排查思路、项目实践建议与技术…"
keywords: ["Gateway", "Kafka", "幂等", "Kafka Topic"]
---

# API请求定制化防刷数据存储策略

import VipInline from '@site/src/components/VipInline';

## 介绍


先在gateway网关中进行限制规则的执行验证功能，关于此功能的详细讲解，可跳转到文档

[业务讲解-API接口定制化防刷策略实现](/damai/business/api-anti-bot/strategy)



接着要把进行限制的请求记录下来，然后保存起来方便查看，为了尽可能最小的影响程序的性能，决定把保存数据这个步骤使用kafka来进行异步执行，当在gateway产生数据后，放到kafka中，然后由customize服务来进行消费



## kafka的配置


### 生产者配置


在`damai-gateway-service`服务模块下



### 参数配置
```yaml
spring:
  kafka:
  bootstrap-servers: 127.0.0.1:9092
  producer:
    retries: 1
    key-serializer: org.apache.kafka.common.serialization.StringSerializer
    value-serializer: org.apache.kafka.common.serialization.StringSerializer
  topic: save_api_data
```

### Topic配置
```java
@Data
public class KafkaTopic {
    
    @Value("${spring.kafka.topic:default}")
    private String topic;

}
```



### 发送者配置
```java
@ConditionalOnProperty(value = "spring.kafka.bootstrap-servers")
public class ProducerConfig {
    
    @Bean
    public KafkaTopic kafkaTopic(){
        return new KafkaTopic();
    }
    
    @Bean
    public ApiDataMessageSend apiDataMessageSend(KafkaTemplate<String, String> kafkaTemplate, KafkaTopic kafkaTopic){
        return new ApiDataMessageSend(kafkaTemplate, kafkaTopic.getTopic());
    }
}
```



```java
@Slf4j
@AllArgsConstructor
public class ApiDataMessageSend {
    
    private KafkaTemplate<String, String> kafkaTemplate;
    
    private String topic;
    
    public void sendMessage(String message) {
        log.info("sendMessage message : {}", message);
        kafkaTemplate.send(topic,message);
    }
}
```

<VipInline />