---
slug: /link-flow/tech-highlights/request-concepts
---

import PaidCTA from '@site/src/components/PaidCTA';

# Request的相关概念解释

在 **link-flow** 中，会经常看见  **HttpServletRequest**、**ServletRequestAttributes**、**RequestContextHolder** 这三个东西，有的小伙伴可能不知道这都是干什么的，代码看的也是不清楚，所以本章节介绍一下这三者的作用

## HttpServletRequest 的详细说明
**1. 定义和层次结构：**

+ **接口来源：** **HttpServletRequest** 属于 Servlet API，由 javax.servlet.http 包提供。
+ **继承关系：** 它继承自 **ServletRequest** 接口，除了继承基本的请求处理方法外，还增加了专门针对 HTTP 协议的方法。

**2. 主要功能和方法：**

+ **请求参数处理：**
    - `getParameter(String name)`：获取请求中提交的单个参数。
    - `getParameterValues(String name)`：获取某个参数的所有值（例如，复选框提交多个选项时）。
    - `getParameterMap()`：返回所有参数及其对应的值的 Map。
+ **请求头信息：**
    - `getHeader(String name)`：获取指定名称的 HTTP 请求头。
    - `getHeaders(String name)`：当请求头中存在多个相同名称的头时，可通过此方法遍历所有值。
+ **请求路径与 URL：**
    - `getRequestURI()`：返回请求的资源路径，不包括协议和主机部分。
    - `getContextPath()`：获取 web 应用的上下文路径。
    - `getServletPath()`：返回调用的 Servlet 路径。
+ **会话管理：**
    - `getSession()`：获取与当前请求关联的 HttpSession 对象。如果不存在，则创建一个新的会话。
    - `getCookies()`：获取客户端发送的所有 Cookie 对象。
+ **其他辅助功能：**
    - `getMethod()`：返回 HTTP 请求的方法（如 GET、POST、PUT、DELETE 等）。
    - `getRemoteAddr()`：获取发起请求的客户端的 IP 地址。
    - `getProtocol()`：获取使用的协议版本（例如 HTTP/1.1）。

**3. 使用场景：**

+ **表单数据提交：** 当用户在网页上提交表单时，**HttpServletRequest** 用于获取表单中的数据。
+ **RESTful 接口：** 在构建 RESTful API 时，可以使用 **HttpServletRequest** 来获取 URL 参数、路径变量以及请求体中的 JSON 数据（通常结合 InputStream 或 Reader 来解析请求体）。
+ **文件上传：** 通过解析请求头和请求体，可以处理多部分表单数据，从而实现文件上传。

---

## ServletRequestAttributes 的详细说明
**1. 定义和作用：**

+ **所在包：** 属于 Spring 框架中的 `org.springframework.web.context.request` 包。
+ **封装目的：** 将 Servlet API 中的 **HttpServletRequest** 以及相关的 **HttpServletResponse** 封装成 Spring 的 **RequestAttributes** 对象，使得在整个 Spring MVC 体系中能够以统一的方式访问请求级别的数据。

**2. 主要功能：**

+ **属性存储与访问：**
    - 通过 `setAttribute(String name, Object value, int scope)` 与 `getAttribute(String name, int scope)` 方法管理请求范围内（scope 为 REQUEST）的数据。
    - 除了 REQUEST 级别，还支持 SESSION 级别的数据存取。
+ **生命周期管理：**
    - 当请求处理结束后，Spring 会自动清除 **ServletRequestAttributes** 中存储的数据，避免内存泄露。
+ **与线程的关联：**
    - **ServletRequestAttributes** 通常会与当前线程绑定，这样在同一请求的处理过程中，任何地方都可以通过 **RequestContextHolder** 获取到相应的属性信息。

**3. 使用示例：**  
假设在拦截器或控制器之外的某个工具类中，需要获取当前请求中的某个属性，可以这样写：

```java
ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
if (attributes != null) {
    HttpServletRequest request = attributes.getRequest();
    Object someAttr = request.getAttribute("someKey");
    // 处理 someAttr...
}
```

这种封装让代码不必每次都传递 **HttpServletRequest** 对象，简化了跨层调用时对请求数据的访问。

---

## RequestContextHolder 的详细说明
**1. 定义和原理：**

+ **所在包：** 也在 Spring 的 `org.springframework.web.context.request` 包中。
+ **工作原理：** **RequestContextHolder** 主要利用 Java 的 **ThreadLocal** 机制，将当前线程的请求上下文**（RequestAttributes）**保存起来，从而在同一线程的不同组件中随时获取到当前请求的信息。

**2. 主要功能：**

+ **全局静态访问：**
    - `getRequestAttributes()` 方法可以在任何地方（只要在当前线程中）获取当前绑定的 **RequestAttributes** 对象。
    - 这对于那些不在控制器或拦截器中的代码来说非常方便，比如在业务层或工具类中获取当前请求信息。
+ **绑定与清理：**
    - Spring 框架会在每次请求开始时通过过滤器（如 RequestContextFilter）或监听器（如 RequestContextListener）绑定当前的 **RequestAttributes** 到 **ThreadLocal **中。
    - 请求结束后，再调用 `resetRequestAttributes()` 清理当前线程绑定的数据，防止内存泄露和数据错乱。
+ **跨线程传递：**
    - 注意：由于 **RequestContextHolder** 基于 **ThreadLocal**，默认情况下只在同一线程内有效。如果存在异步处理或线程池调用，可能需要额外的处理（例如手动传递或借助 Spring 的异步支持）。

**3. 使用场景和优势：**

+ **避免参数传递：** 在许多 Spring 应用中，不需要在每个方法中传递 **HttpServletRequest** 对象，通过 **RequestContextHolder** 能直接获取当前请求，减少方法参数的耦合。
+ **代码解耦：** 业务逻辑和控制层分离，业务逻辑层无需依赖 Servlet API，只需通过 **RequestContextHolder** 获取相关数据。
+ **统一管理请求上下文：** 任何组件都可以通过统一的方式访问当前请求的信息，这对于日志记录、用户认证、权限控制等都有帮助。

---

## 三者之间的关系
1. **HttpServletRequest** 是 Java EE 标准的一部分，直接用于表示 HTTP 请求。
2. **ServletRequestAttributes** 则是 Spring 对 HttpServletRequest（以及 HttpServletResponse）的一层封装，使其符合 Spring 的 RequestAttributes 接口规范。
3. **RequestContextHolder** 则利用 ThreadLocal 存储和管理当前线程的 RequestAttributes，方便在整个 Spring 应用中统一访问请求相关的数据。

这种设计思路既利用了 Servlet API 的原生功能，又通过 Spring 框架的封装实现了解耦和便捷访问，适用于复杂的 web 应用开发场景。


