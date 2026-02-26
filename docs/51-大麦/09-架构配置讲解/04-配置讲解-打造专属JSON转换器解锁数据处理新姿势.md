---
slug: /damai/architecture-config/json-converter
description: "围绕《打造专属JSON转换器解锁数据处理新姿势》，重点讲解Gateway、注解、Jackson序列化、JSON转换器定制、long精度处理等技术实现与工程落地细节。"
keywords: ["Gateway", "注解", "Jackson序列化", "JSON转换器定制", "long精度处理", "日期格式转换", "空值序列化", "多字段报错处理"]
---

import VipInline from '@site/src/components/VipInline';

# 打造专属JSON转换器解锁数据处理新姿势


目前的项目几乎都是采用前后端分离来进行开发，在前端调用后端提供的接口时，不是说写好接口直接把数据返回给前端就完事了，这里面有很多格式的配置，下面会依次介绍要考虑的问题



## long类型丢失精度


在Java中，`long`类型是一个64位的整型，可以存储从-2^63到2^63-1范围内的整数。当这个整数被传输到前端时，通常是通过JSON格式进行传输的。前端大多数情况下是使用JavaScript来处理这些数据。JavaScript中，所有的数字（包括整数和浮点数）都是以64位浮点数格式存储的，根据IEEE 754标准。这种格式的数字最大能精确表示的整数范围是-2^53+1到2^53-1。



当一个超出JavaScript精确表示范围的`long`整数从Java后端传输到前端时，如果直接作为数字类型传输，那么在JavaScript中解析这个数字时就会丢失精度。这是因为在转换过程中，超出JavaScript能精确表示的范围的部分将无法准确表示，从而导致精度丢失。



### 解决方案


+  将long类型转为String类型返回

```java
long num = 4553115512345L;
String str = String.valueOf(num);
```



+  使用`@JsonFormat`注解，对实体类中的属性进行序列化和反序列化格式化的时候，将格式转为String类型

```java
public class Test {
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long orderId;
}
```



+  通过Springboot的配置

```yaml
spring:
  jackson:
    serialization:
      WRITE_NUMBERS_AS_STRINGS: true
```

其实真正使用基本都是采用第三种，因为前两种都需要挨个配置很麻烦的

<VipInline />
