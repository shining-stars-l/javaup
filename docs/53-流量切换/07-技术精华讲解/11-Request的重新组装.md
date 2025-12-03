---
slug: /link-flow/tech-highlights/request-reassembly
---

import PaidCTA from '@site/src/components/PaidCTA';

# Request的重新组装

在操作request的时候，有一种很常见的方式，就是从自定义的过滤器中从request中取出数据然后使用
```java
@Slf4j
public class TraceIdFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        String traceId = request.getHeader("traceId");
        log.info("traceId:{}",traceId);
        filterChain.doFilter(request, response);
    }
}
```
<br/>

网上的一些帖子和在项目中大家都会看到这种用法，如果后续业务中还需要request的话，可能会这么取request
```java
public ServletRequestAttributes getRequestAttributes() {
    RequestAttributes requestAttributes = RequestContextHolder.getRequestAttributes();
    if (requestAttributes == null) {
        return null;
    }
    return (ServletRequestAttributes) requestAttributes;
}
```
```java
public String getHeadValue(String name) {
    RequestAttributes requestAttributes = RequestContextHolder.getRequestAttributes();
    if (requestAttributes == null) {
        return null;
    }
    HttpServletRequest request = ((ServletRequestAttributes) requestAttributes).getRequest();
    return request.getHeader(name);
}
```
**RequestContextHolder** 是Spring中提供的，当Spring判断当请求执行完后，会从 **RequestContextHolder** 中把这次请求的 **request** 给清除掉，
这就带来一个问题，如果子线程用的也是这个 **request** 的话，逻辑还没执行完，主线程直接给清掉了，那子线程的 **request** 不也跟着没有了吗？

所以需要将 **request** 重组成一个新的，传递给子线程使用，可以看下在 link-flow 中的过滤器是怎么做的

# Request的重组
```java
@Order(HIGHEST_PRECEDENCE)
public class RequestParamContextFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        RequestAttributes requestAttributes = RequestContextHolder.getRequestAttributes();
        if (requestAttributes != null) {
            requestAttributes = ServiceRequestEnhanceOperation.enhanceRequestAttributes(requestAttributes);
        }
        BaseParameterHolder.setParameter(WorkConstant.REQUEST_ATTRIBUTES, requestAttributes);
        Map<String,Object> newMap = new HashMap<>(BaseParameterHolder.getParameterMap().size());
        newMap.putAll(BaseParameterHolder.getParameterMap());
        TtlParameterHolder.setParameterMap(newMap);
        try {
            filterChain.doFilter(request, response);
        }finally {
            BaseParameterHolder.removeParameter(WorkConstant.REQUEST_ATTRIBUTES);
            TtlParameterHolder.removeParameterMap();
        }
    }
}
```

<PaidCTA />