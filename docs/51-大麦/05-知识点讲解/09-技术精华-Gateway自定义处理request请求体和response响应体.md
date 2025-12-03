---
slug: /damai/knowledge/gateway-request-response-custom
---

# Gateway自定义处理request请求体和response响应体

# 介绍
本人最近将网关 Zuul 升级到 Gateway，Gateway 特点这里不多说了，Gateway 和 Zuul 的区别很大，其底层使用了 Netty 和响应式编程，而不是Zuul常规的 Servlet 方式

原先的 Zuul 网关里有对请求体验证签名和加密的逻辑，要把这些逻辑迁移到 Gateway 中，这个过程中遇到的问题太多，例如 处理中异常如何处理、请求体或响应体过长会被拦截等等
网上说的都乱七八糟的，有的请求体过长还会被截取。所以决定还是自己来写

这里把 Gateway 通过的逻辑进行改造后直接贴出来，需要自己处理的逻辑可以直接添加进去，已经在生产中使用

<br/>

# 处理请求体内容
```java
@Component
@Slf4j
public class RequestValidationFilter implements GlobalFilter, Ordered {

    @Autowired
    private ServerCodecConfigurer serverCodecConfigurer;
    

    @Override
    public Mono<Void> filter(final ServerWebExchange exchange, final GatewayFilterChain chain) {
        return readBody(exchange,chain);
           
    }

    private Mono<Void> readBody(ServerWebExchange exchange, GatewayFilterChain chain){
        log.info("current thread readBody : {}",Thread.currentThread().getName());
        
        ServerRequest serverRequest = ServerRequest.create(exchange, serverCodecConfigurer.getReaders());
        
        Map<String,String> headMap = new HashMap<>();
        Mono<String> modifiedBody = serverRequest.bodyToMono(String.class).flatMap(originalBody -> {
            //处理请求体和请求头逻辑的方法
            String body = handle(originalBody, exchange, headMap);
            return Mono.just(body);
        });
        BodyInserter bodyInserter = BodyInserters.fromPublisher(modifiedBody, String.class);
        HttpHeaders headers = new HttpHeaders();
        headers.putAll(exchange.getRequest().getHeaders());
        headers.remove(HttpHeaders.CONTENT_LENGTH);
        
        CachedBodyOutputMessage outputMessage = new CachedBodyOutputMessage(exchange, headers);
        return bodyInserter
                .insert(outputMessage, new BodyInserterContext())
                .then(Mono.defer(() -> chain.filter(
                        exchange.mutate().request(decorateHead(exchange, headers, outputMessage, headMap)).build()
                )))
                .onErrorResume((Function<Throwable, Mono<Void>>) throwable -> Mono.error(throwable));
    }

    private String handle(String originalBody,ServerWebExchange exchange,Map<String,String> headMap){
        log.info("current thread verify: {}",Thread.currentThread().getName());
        ServerHttpRequest request = exchange.getRequest();
        String requestBody = originalBody;
        // 这里处理自己的请求体逻辑
        // requestBody = ....
        // 这里处理自己的请求头逻辑，如果不需要可以去掉
        // headMap = ...
        return requestBody;
    }
    //将网关层request请求头中的重要参数传递给后续的微服务中
    private ServerHttpRequestDecorator decorateHead(ServerWebExchange exchange, HttpHeaders headers, CachedBodyOutputMessage outputMessage, Map<String,String> headMap){
        return new ServerHttpRequestDecorator(exchange.getRequest()){
            @Override
            public HttpHeaders getHeaders() {
                log.info("current thread getHeaders: {}",Thread.currentThread().getName());
                long contentLength = headers.getContentLength();
                HttpHeaders newHeaders = new HttpHeaders();
                newHeaders.putAll(headers);
                if (headMap != null) {
                    newHeaders.setAll(headMap);
                }
                if (contentLength > 0){
                    newHeaders.setContentLength(contentLength);
                }else {
                    newHeaders.set(HttpHeaders.TRANSFER_ENCODING,"chunked");
                }
                return newHeaders;
            }

            @Override
            public Flux<DataBuffer> getBody() {
                return outputMessage.getBody();
            }
        };
    }

    @Override
    public int getOrder() {
        return -2;
    }
}
```
<br/>

# 处理响应体内容
```java
/**
 * 参考 {@link org.springframework.cloud.gateway.filter.factory.rewrite.ModifyResponseBodyGatewayFilterFactory}
 */
@Component
@Slf4j
public class ResponseValidationFilter implements GlobalFilter, Ordered {
    
    @Override
    public int getOrder() {
        return -2;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        return chain.filter(exchange.mutate().response(decorate(exchange)).build());
    }

    /**
     * 解决netty buffer默认长度1024导致的接受body不完全问题
     * @param exchange
     * @return
     */
    @SuppressWarnings("unchecked")
    private ServerHttpResponse decorate(ServerWebExchange exchange) {
        return new ServerHttpResponseDecorator(exchange.getResponse()) {

            @Override
            public Mono<Void> writeWith(Publisher<? extends DataBuffer> body) {

                String originalResponseContentType = exchange
                        .getAttribute(ORIGINAL_RESPONSE_CONTENT_TYPE_ATTR);
                HttpHeaders httpHeaders = new HttpHeaders();
                httpHeaders.add(HttpHeaders.CONTENT_TYPE,
                        originalResponseContentType);

                ClientResponse clientResponse = ClientResponse
                        .create(exchange.getResponse().getStatusCode())
                        .headers(headers -> headers.putAll(httpHeaders))
                        .body(Flux.from(body)).build();

                
                Mono<String> modifiedBody = clientResponse
                        .bodyToMono(String.class)
                        //修改responseBody
                        .flatMap(originalBody -> modifyResponseBody().apply(exchange,originalBody));

                BodyInserter bodyInserter = BodyInserters.fromPublisher(modifiedBody,
                        String.class);
                CachedBodyOutputMessage outputMessage = new CachedBodyOutputMessage(
                        exchange, exchange.getResponse().getHeaders());
                return bodyInserter.insert(outputMessage, new BodyInserterContext())
                        .then(Mono.defer(() -> {
                            Flux<DataBuffer> messageBody = outputMessage.getBody();
                            HttpHeaders headers = getDelegate().getHeaders();
                            if (!headers.containsKey(HttpHeaders.TRANSFER_ENCODING)) {
                                messageBody = messageBody.doOnNext(data -> headers
                                        .setContentLength(data.readableByteCount()));
                            }
                            return getDelegate().writeWith(messageBody);
                        }));
            }

            /**
             * 修改responseBody
             * @return apply 返回Mono<String>，数据是修改后的responseBody
             */
            private BiFunction<ServerWebExchange, String, Mono<String>> modifyResponseBody() {
                return (serverWebExchange,responseBody) -> {
                    String modifyResponseBody = handle(serverWebExchange, responseBody);
                    return Mono.just(modifyResponseBody);
                };
            }

            @Override
            public Mono<Void> writeAndFlushWith(
                    Publisher<? extends Publisher<? extends DataBuffer>> body) {
                return writeWith(Flux.from(body).flatMapSequential(p -> p));
            }
        };
    }

    private String handle(final ServerWebExchange serverWebExchange, final String responseBody) {
        String modifyResponseBody = responseBody;
        ServerHttpRequest request = serverWebExchange.getRequest();
        //这里处理响应体的逻辑
        //modifyResponseBody = ...
        return modifyResponseBody;
    }
}
```
