---
slug: /tech-sharing/spring-tx-source/spring-part-2
---

# Spring事务执行流程分析_2

org.springframework.context.support.AbstractApplicationContext#refresh ->
org.springframework.context.support.AbstractApplicationContext#obtainFreshBeanFactory ->
org.springframework.context.support.AbstractRefreshableApplicationContext#refreshBeanFactory ->
org.springframework.beans.factory.xml.XmlBeanDefinitionReader#doLoadBeanDefinitions

## XmlBeanDefinitionReader#doLoadBeanDefinitions

```java
try {
	// 此处获取xml文件的document对象，这个解析过程是由documentLoader完成的,从String[] -string-Resource[]- resource,最终开始将resource读取成一个document文档，根据文档的节点信息封装成一个个的BeanDefinition对象
	Document doc = doLoadDocument(inputSource, resource);
	int count = registerBeanDefinitions(doc, resource);
	if (logger.isDebugEnabled()) {
		logger.debug("Loaded " + count + " bean definitions from " + resource);
	}
	return count;
}
catch (BeanDefinitionStoreException ex) {
	throw ex;
}
```

## 解析标签 DefaultBeanDefinitionDocumentReader#parseBeanDefinitions

```java
protected void parseBeanDefinitions(Element root, BeanDefinitionParserDelegate delegate) {
	if (delegate.isDefaultNamespace(root)) {
		NodeList nl = root.getChildNodes();
		for (int i = 0; i < nl.getLength(); i++) {
			Node node = nl.item(i);
			if (node instanceof Element) {
				Element ele = (Element) node;
				if (delegate.isDefaultNamespace(ele)) {
					parseDefaultElement(ele, delegate);
				}
				else {
					delegate.parseCustomElement(ele);
				}
			}
		}
	}
	else {
		delegate.parseCustomElement(root);
	}
}
```

当读到xml中aop开头的标签时，会执行`delegate.parseCustomElement(ele)`来解析标签

### 选择对应的解析器来进行解析

BeanDefinitionParserDelegate#parseCustomElement(Element, BeanDefinition) ->
BeanDefinitionParser#parse(Element element, ParserContext parserContext)

```java
public BeanDefinition parse(Element element, ParserContext parserContext) {
	CompositeComponentDefinition compositeDef =
			new CompositeComponentDefinition(element.getTagName(), parserContext.extractSource(element));
	parserContext.pushContainingComponent(compositeDef);
	//注册自动代理模式创建器，AspectJAwareAdvisorAutoProxyCreator
	configureAutoProxyCreator(parserContext, element);
	//解析aop:config子节点下的aop:pointcut/aop:advice/aop:aspect
	List<Element> childElts = DomUtils.getChildElements(element);
	for (Element elt: childElts) {
		String localName = parserContext.getDelegate().getLocalName(elt);
		if (POINTCUT.equals(localName)) {
			parsePointcut(elt, parserContext);
		}
		else if (ADVISOR.equals(localName)) {
			parseAdvisor(elt, parserContext);
		}
		else if (ASPECT.equals(localName)) {
			parseAspect(elt, parserContext);
		}
	}

	parserContext.popAndRegisterContainingComponent();
	return null;
}
```

注意这行`configureAutoProxyCreator(parserContext, element);` 作用是注册自动代理模式创建器，AspectJAwareAdvisorAutoProxyCreator

```java
private void configureAutoProxyCreator(ParserContext parserContext, Element element) {
	AopNamespaceUtils.registerAspectJAutoProxyCreatorIfNecessary(parserContext, element);
}
```

```java
public static void registerAspectJAutoProxyCreatorIfNecessary(
		ParserContext parserContext, Element sourceElement) {
	//注册名为internalAutoProxyCreator的beanDefinition，其中的class为AspectJAwareAdvisorAutoProxyCreator
	BeanDefinition beanDefinition = AopConfigUtils.registerAspectJAutoProxyCreatorIfNecessary(
			parserContext.getRegistry(), parserContext.extractSource(sourceElement));
	//如果指定proxy-target-class=true,则使用CGLIB代理，否则是用JDK代理
	//其实其为AspectJAwareAdvisorAutoProxyCreator类的proxyTargetClass属性
	useClassProxyingIfNecessary(parserContext.getRegistry(), sourceElement);
	//注册到spring的bean工厂中，再次校验是否已注册
	registerComponentIfNecessary(beanDefinition, parserContext);
}
```

分析这行`AopConfigUtils.registerAspectJAutoProxyCreatorIfNecessary`，其作用是注册对象，注册名为`internalAutoProxyCreator的beanDefinition`，其中的class为`AspectJAwareAdvisorAutoProxyCreator`

### AopConfigUtils#registerAspectJAutoProxyCreatorIfNecessary(BeanDefinitionRegistry, Object)

```java
public static BeanDefinition registerAspectJAutoProxyCreatorIfNecessary(
		BeanDefinitionRegistry registry, @Nullable Object source) {

	return registerOrEscalateApcAsRequired(AspectJAwareAdvisorAutoProxyCreator.class, registry, source);
}
```

```java
private static BeanDefinition registerOrEscalateApcAsRequired(
		Class<?> cls, BeanDefinitionRegistry registry, @Nullable Object source) {

	Assert.notNull(registry, "BeanDefinitionRegistry must not be null");

	// 如果已经存在了自动代理创建器且存在的自动代理创建器与现在不一致，那么需要根据优先级来判断到底需要使用哪个
	if (registry.containsBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME)) {
		BeanDefinition apcDefinition = registry.getBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME);
		if (!cls.getName().equals(apcDefinition.getBeanClassName())) {
			int currentPriority = findPriorityForClass(apcDefinition.getBeanClassName());
			int requiredPriority = findPriorityForClass(cls);
			if (currentPriority < requiredPriority) {
				// 改变bean所对应的className的属性
				apcDefinition.setBeanClassName(cls.getName());
			}
		}
		// 如果已经存在自动代理创建器并且与将要创建的一致，那么无须再次创建
		return null;
	}

	RootBeanDefinition beanDefinition = new RootBeanDefinition(cls);
	beanDefinition.setSource(source);
	beanDefinition.getPropertyValues().add("order", Ordered. HIGHEST_PRECEDENCE);
	beanDefinition.setRole(BeanDefinition.ROLE_INFRASTRUCTURE);
   	//AUTO_PROXY_CREATOR_BEAN_NAME = org.springframework.aop.config.internalAutoProxyCreator
	registry.registerBeanDefinition(AUTO_PROXY_CREATOR_BEAN_NAME, beanDefinition);
	return beanDefinition;
}
```

到这里已经注册了名为`internalAutoProxyCreator的beanDefinition`，其中的类型为`AspectJAwareAdvisorAutoProxyCreator`

回到`BeanDefinitionParser#parse`方法中开始解析`pointcut、advisor、aspect` 分别在在`parsePointcut、parseAdvisor、parseAspect`方法中解析

### 解析pointcut标签 ConfigBeanDefinitionParser#parsePointcut

```java
private AbstractBeanDefinition parsePointcut(Element pointcutElement, ParserContext parserContext) {
	//切入点的唯一标识
	String id = pointcutElement.getAttribute(ID);
	//获取切入点的表达式
	String expression = pointcutElement.getAttribute(EXPRESSION);

	AbstractBeanDefinition pointcutDefinition = null;

	try {
		//采用栈保存切入点
		this.parseState.push(new PointcutEntry(id));
		//创建切入点bean对象
		//beanClass为AspectJExpressionPointcut，并且设置属性expression到该beanClass中
		pointcutDefinition = createPointcutDefinition(expression);
		pointcutDefinition.setSource(parserContext.extractSource(pointcutElement));

		String pointcutBeanName = id;
		if (StringUtils.hasText(pointcutBeanName)) {
			//注册bean对象
			parserContext.getRegistry().registerBeanDefinition(pointcutBeanName, pointcutDefinition);
		}
		else {
			pointcutBeanName = parserContext.getReaderContext().registerWithGeneratedName(pointcutDefinition);
		}

		parserContext.registerComponent(
				new PointcutComponentDefinition(pointcutBeanName, pointcutDefinition, expression));
	}
	finally {
		this.parseState.pop();
	}

	return pointcutDefinition;
}
```

解析pointcut标签，注册了txPoint对象

### ConfigBeanDefinitionParser#createPointcutDefinition

```java
protected AbstractBeanDefinition createPointcutDefinition(String expression) {
	RootBeanDefinition beanDefinition = new RootBeanDefinition(AspectJExpressionPointcut.class);
	beanDefinition.setScope(BeanDefinition.SCOPE_PROTOTYPE);
	beanDefinition.setSynthetic(true);
	beanDefinition.getPropertyValues().add(EXPRESSION, expression);
	return beanDefinition;
}
```

然后回到`parsePointcut`方法接着执行注册bean功能，这时注册了`name为txPoint，class为AspectJExpressionPointcut`的对象。

然后回到`BeanDefinitionParser#parse`方法中，继续解析parseAdvisor

### 解析parseAdvisor ConfigBeanDefinitionParser#parseAdvisor

```java
private void parseAdvisor(Element advisorElement, ParserContext parserContext) {
	//解析	<aop:advisor>节点，最终创建的beanClass为DefaultBeanFactoryPointcutAdvisor
	//另外advice-ref属性必须定义，其与内部属性adviceBeanName对应
	AbstractBeanDefinition advisorDef = createAdvisorBeanDefinition(advisorElement, parserContext);
	String id = advisorElement.getAttribute(ID);

	try {
		//注册到bean工厂
		this.parseState.push(new AdvisorEntry(id));
		String advisorBeanName = id;
		if (StringUtils.hasText(advisorBeanName)) {
			parserContext.getRegistry().registerBeanDefinition(advisorBeanName, advisorDef);
		}
		else {
			advisorBeanName = parserContext.getReaderContext().registerWithGeneratedName(advisorDef);
		}

		//解析point-cut属性并赋值到DefaultBeanFactoryPointcutAdvisor#pointcut内部属性
		Object pointcut = parsePointcutProperty(advisorElement, parserContext);
		if (pointcut instanceof BeanDefinition) {
			advisorDef.getPropertyValues().add(POINTCUT, pointcut);
			parserContext.registerComponent(
					new AdvisorComponentDefinition(advisorBeanName, advisorDef, (BeanDefinition) pointcut));
		}
		else if (pointcut instanceof String) {
			advisorDef.getPropertyValues().add(POINTCUT, new RuntimeBeanReference((String) pointcut));
			parserContext.registerComponent(
					new AdvisorComponentDefinition(advisorBeanName, advisorDef));
		}
	}
	finally {
		this.parseState.pop();
	}
}
```

### ConfigBeanDefinitionParser#createAdvisorBeanDefinition

```java
private AbstractBeanDefinition createAdvisorBeanDefinition(Element advisorElement, ParserContext parserContext) {
	RootBeanDefinition advisorDefinition = new RootBeanDefinition(DefaultBeanFactoryPointcutAdvisor.class);
	advisorDefinition.setSource(parserContext.extractSource(advisorElement));

	String adviceRef = advisorElement.getAttribute(ADVICE_REF);
	if (!StringUtils.hasText(adviceRef)) {
		parserContext.getReaderContext().error(
				"'advice-ref' attribute contains empty value.", advisorElement, this.parseState.snapshot());
	}
	else {
		advisorDefinition.getPropertyValues().add(
				ADVICE_BEAN_NAME, new RuntimeBeanNameReference(adviceRef));
	}

	if (advisorElement.hasAttribute(ORDER_PROPERTY)) {
		advisorDefinition.getPropertyValues().add(
				ORDER_PROPERTY, advisorElement.getAttribute(ORDER_PROPERTY));
	}

	return advisorDefinition;
}
```

然后回到`parseAdvisor`方法解析`advice-ref="myAdvice" pointcut-ref="txPoint"`标签。
到这里注册了`beanClass为DefaultBeanFactoryPointcutAdvisor`的对象
此时

```xml
<aop:config>
    <aop:pointcut id="txPoint" expression="execution(* com.test.tx.*.*.*(..))"></aop:pointcut>
    <aop:advisor advice-ref="myAdvice" pointcut-ref="txPoint"></aop:advisor>
</aop:config>
```

的解析已完成。

然后回到`DefaultBeanDefinitionDocumentReader#parseBeanDefinitions`继续循环解析

```xml
<tx:advice id="myAdvice" transaction-manager="transactionManager">
    <tx:attributes>
        <tx:method name="*"/>
    </tx:attributes>
</tx:advice>
```

选择对应的解析器来进行解析

### 解析advice标签 AbstractBeanDefinitionParser#parse

```java
public final BeanDefinition parse(Element element, ParserContext parserContext) {
   	//解析标签 此时是tx:advice
	AbstractBeanDefinition definition = parseInternal(element, parserContext);
	if (definition != null && !parserContext.isNested()) {
		try {
			String id = resolveId(element, definition, parserContext);
			if (!StringUtils.hasText(id)) {
				parserContext.getReaderContext().error(
						"Id is required for element '" + parserContext.getDelegate().getLocalName(element)
								+ "' when used as a top-level tag", element);
			}
			String[] aliases = null;
			if (shouldParseNameAsAliases()) {
				String name = element.getAttribute(NAME_ATTRIBUTE);
				if (StringUtils.hasLength(name)) {
					aliases = StringUtils.trimArrayElements(StringUtils.commaDelimitedListToStringArray(name));
				}
			}
			// 将AbstractBeanDefinition转换为BeanDefinitionHolder并注册
			BeanDefinitionHolder holder = new BeanDefinitionHolder(definition, id, aliases);
			registerBeanDefinition(holder, parserContext.getRegistry());
			if (shouldFireEvents()) {
				// 通知监听器进行处理
				BeanComponentDefinition componentDefinition = new BeanComponentDefinition(holder);
				postProcessComponentDefinition(componentDefinition);
				parserContext.registerComponent(componentDefinition);
			}
		}
		catch (BeanDefinitionStoreException ex) {
			String msg = ex.getMessage();
			parserContext.getReaderContext().error((msg != null ? msg : ex.toString()), element);
			return null;
		}
	}
	return definition;
}
```

### AbstractSingleBeanDefinitionParser#parseInternal

```java
protected final AbstractBeanDefinition parseInternal(Element element, ParserContext parserContext) {
	BeanDefinitionBuilder builder = BeanDefinitionBuilder.genericBeanDefinition();
	String parentName = getParentName(element);
	if (parentName != null) {
		builder.getRawBeanDefinition().setParentName(parentName);
	}
	// 获取自定义标签中的class，此时会调用自定义解析器
   	//beanClass为class org.springframework.transaction.interceptor.TransactionInterceptor
	Class<?> beanClass = getBeanClass(element);
	if (beanClass != null) {
		builder.getRawBeanDefinition().setBeanClass(beanClass);
	}
	else {
		// 若子类没有重写getBeanClass方法则尝试检查子类是否重写getBeanClassName方法
		String beanClassName = getBeanClassName(element);
		if (beanClassName != null) {
			builder.getRawBeanDefinition().setBeanClassName(beanClassName);
		}
	}
	builder.getRawBeanDefinition().setSource(parserContext.extractSource(element));
	BeanDefinition containingBd = parserContext.getContainingBeanDefinition();
	if (containingBd != null) {
		// Inner bean definition must receive same scope as containing bean.
		// 若存在父类则使用父类的scope属性
		builder.setScope(containingBd.getScope());
	}
	if (parserContext.isDefaultLazyInit()) {
		// Default-lazy-init applies to custom bean definitions as well.
		// 配置延迟加载
		builder.setLazyInit(true);
	}
	// 调用子类重写的doParse方法进行解析
	doParse(element, parserContext, builder);
	return builder.getBeanDefinition();
}
```

开始解析tx:advice标签的内部标签

### TxAdviceBeanDefinitionParser#doParse

```java
protected void doParse(Element element, ParserContext parserContext, BeanDefinitionBuilder builder) {
	builder.addPropertyReference("transactionManager", TxNamespaceHandler.getTransactionManagerName(element));
	//ATTRIBUTES_ELEMENT = attributes   获取<tx:attributes>标签
	List<Element> txAttributes = DomUtils.getChildElementsByTagName(element, ATTRIBUTES_ELEMENT);
	if (txAttributes.size() > 1) {
		parserContext.getReaderContext().error(
				"Element <attributes> is allowed at most once inside element <advice>", element);
	}
	else if (txAttributes.size() == 1) {
		// Using attributes source.
		Element attributeSourceElement = txAttributes.get(0);
           //解析<tx:attributes>内部的标签
		RootBeanDefinition attributeSourceDefinition = parseAttributeSource(attributeSourceElement, parserContext);
		builder.addPropertyValue("transactionAttributeSource", attributeSourceDefinition);
	}
	else {
		// Assume annotations source.
		builder.addPropertyValue("transactionAttributeSource",
				new RootBeanDefinition("org.springframework.transaction.annotation.AnnotationTransactionAttributeSource"));
	}
}
```

解析tx:attributes内部的标签，tx:method标签，设置method标签对应的隔离级别，传播行为，超时时间，是否只读。如果标签没有显示指定则为默认。

### TxAdviceBeanDefinitionParser#parseAttributeSource

```java
private RootBeanDefinition parseAttributeSource(Element attrEle, ParserContext parserContext) {
	List<Element> methods = DomUtils.getChildElementsByTagName(attrEle, METHOD_ELEMENT);
	ManagedMap<TypedStringValue, RuleBasedTransactionAttribute> transactionAttributeMap =
			new ManagedMap<>(methods.size());
	transactionAttributeMap.setSource(parserContext.extractSource(attrEle));

	for (Element methodEle : methods) {
		String name = methodEle.getAttribute(METHOD_NAME_ATTRIBUTE);
		TypedStringValue nameHolder = new TypedStringValue(name);
		nameHolder.setSource(parserContext.extractSource(methodEle));

		RuleBasedTransactionAttribute attribute = new RuleBasedTransactionAttribute();
		String propagation = methodEle.getAttribute(PROPAGATION_ATTRIBUTE);
		String isolation = methodEle.getAttribute(ISOLATION_ATTRIBUTE);
		String timeout = methodEle.getAttribute(TIMEOUT_ATTRIBUTE);
		String readOnly = methodEle.getAttribute(READ_ONLY_ATTRIBUTE);
		if (StringUtils.hasText(propagation)) {
			attribute.setPropagationBehaviorName(RuleBasedTransactionAttribute.PREFIX_PROPAGATION + propagation);
		}
		if (StringUtils.hasText(isolation)) {
			attribute.setIsolationLevelName(RuleBasedTransactionAttribute.PREFIX_ISOLATION + isolation);
		}
		if (StringUtils.hasText(timeout)) {
			try {
				attribute.setTimeout(Integer.parseInt(timeout));
			}
			catch (NumberFormatException ex) {
				parserContext.getReaderContext().error("Timeout must be an integer value: [" + timeout + "]", methodEle);
			}
		}
		if (StringUtils.hasText(readOnly)) {
			attribute.setReadOnly(Boolean.parseBoolean(methodEle.getAttribute(READ_ONLY_ATTRIBUTE)));
		}

		List<RollbackRuleAttribute> rollbackRules = new ArrayList<>(1);
		if (methodEle.hasAttribute(ROLLBACK_FOR_ATTRIBUTE)) {
			String rollbackForValue = methodEle.getAttribute(ROLLBACK_FOR_ATTRIBUTE);
			addRollbackRuleAttributesTo(rollbackRules, rollbackForValue);
		}
		if (methodEle.hasAttribute(NO_ROLLBACK_FOR_ATTRIBUTE)) {
			String noRollbackForValue = methodEle.getAttribute(NO_ROLLBACK_FOR_ATTRIBUTE);
			addNoRollbackRuleAttributesTo(rollbackRules, noRollbackForValue);
		}
		attribute.setRollbackRules(rollbackRules);

		transactionAttributeMap.put(nameHolder, attribute);
	}
	//注册了class为NameMatchTransactionAttributeSource的对象
	RootBeanDefinition attributeSourceDefinition = new RootBeanDefinition(NameMatchTransactionAttributeSource.class);
	attributeSourceDefinition.setSource(parserContext.extractSource(attrEle));
	attributeSourceDefinition.getPropertyValues().add("nameMap", transactionAttributeMap);
	return attributeSourceDefinition;
}
```

`AbstractBeanDefinitionParser#parse`方法继续执行
到这里

```xml
<tx:advice id="myAdvice" transaction-manager="transactionManager">
    <tx:attributes>
        <tx:method name="*"/>
    </tx:attributes>
</tx:advice>
```

标签解析完成

### 主要注册了bean(还是beanDefinition的类型)：

1. AspectJAwareAdvisorAutoProxyCreator
2. AspectJExpressionPointcut  标签元素pointcut的bean
3. DefaultBeanFactoryPointcutAdvisor  标签元素advisor的bean
4. TransactionInterceptor
5. NameMatchTransactionAttributeSource
6. BeanDefinitionHolder包含AbstractBeanDefinition 标签元素tx:advice的bean

### 到目前位置beanFactory中的beanDefinitionMap中所有注册的元素
![](/img/technologySharing/spring/beanFactory中的beanDefinitionMap中所有注册的元素.png)