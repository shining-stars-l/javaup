---
slug: /tech-sharing/nio-netty/nio-netty-part-2
---

# NIO和Netty总结_2
## 地址

netty.io/wiki/reference-counted-objects.html

## AbstractReferenceCountedByteBuf的说明

AbstractReferenceCountedByteBuf 对于ByteBuf消息计数的保留和释放：

## Netty处理器重要概念：

1. Netty的处理器可以分为两类：入站处理器 和 出站处理器。
2. 入站处理器的顶层是`ChannelInboundHandler`，出站处理器的顶层是`ChannelOutboundHandler`。
3. 数据处理时常用的各种编解码器本质上都是处理器。
4. 编解码器：无论我们向网络中写入的数据是什么类型（int，char，String，二进制等），数据在网络中传递时，其都是以字节流的形式呈现的；将数据由原本的形式转换为字节流的操作称为编码（`encode`），将数据由字节转换为它原本的格式或是其他格式的操作称为解码（`decode`），编解码统一称为`codec`。
5. 编码：本质上是一种出站处理器；因此，编码一定是一种`ChannelOutboundHandler`。
6. 解码：本质上是一种入站处理器；因此，解码一定是一种`ChannelInboundHandler`。
7. 在Netty中，编码器通常以`XXXEncoder`命名；解码器通常以`XXXDecoder`命名。

## 关于Netty编解码器的重要结论：

1. 无论是编码器还是解码器，其所接收的消息类型必须要与待处理的参数类型一致，否则该编码器或解码器并不会执行。
2. 在解码器进行数据解码时，一定要记得判断缓冲（ByteBuf）中的数据是否足够，否则将会产生一些问题。

## ReplayingDecoder的优势：

### 网址

[https://www.jianshu.com/p/4cbf8a07b492](https://www.jianshu.com/p/4cbf8a07b492)

### 介绍

- `ReplayingDecoder`继承了`ByteToMessageDecoder`，但是使用`ReplayingDecoder`的好处在于：`ReplayingDecoder`在处理数据时可以认为所有的数据（ByteBuf） 已经接收完毕，而不用判断接收数据的长度。

```java
public abstract class ReplayingDecoder<S> extends ByteToMessageDecoder
```

- `ReplayingDecoder`使用了特殊的ByteBuf：`ReplayingDecoderByteBuf`，当数据不够时会抛出一类特殊的错误，然后`ReplayingDecoder`会重置`readerIndex`并且再次调用`decode`方法。
- 泛型S使用 枚举`Enum`来表示状态，其内部存在状态管理。如果是无状态的，则使用`Void`。

## netty提供的常用解码器：

- `LineBasedFrameDecoder`
- `FixedLengthFrameDecoder`
- `DelimiterBasedFrameDecoder`
- `LengthFieldBasedFrameDecoder`
