---
slug: /tech-sharing/spring-tx-source/spring-part-6
---

# Spring事务执行流程分析_6

执行案例中的`bookService.addUser(user);`会调用到`JdkDynamicAopProxy#invoke`方法

## JdkDynamicAopProxy#invoke

```java
public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    Object oldProxy = null;
    boolean setProxyContext = false;

    TargetSource targetSource = this.advised.targetSource;
    Object target = null;

    try {
        //省略相关代码

        Object retVal;

        // 有时候目标对象内部的自我调用将无法实施切面中的增强则需要通过此属性暴露代理
        if (this.advised.exposeProxy) {
            // Make invocation available if necessary.
            oldProxy = AopContext.setCurrentProxy(proxy);
            setProxyContext = true;
        }

        // Get as late as possible to minimize the time we "own" the target,
        // in case it comes from a pool.
        target = targetSource.getTarget();
        Class<?> targetClass = (target != null ? target.getClass() : null);

        // 获取当前方法的拦截器链
        List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);
        if (chain.isEmpty()) {
            Object[] argsToUse = AopProxyUtils.adaptArgumentsIfNecessary(method, args);
            // 如果没有发现任何拦截器那么直接调用切点方法
            retVal = AopUtils.invokeJoinpointUsingReflection(target, method, argsToUse);
        }
        else {
            // We need to create a method invocation...
            // 将拦截器封装在ReflectiveMethodInvocation，以便于使用其proceed进行处理
            MethodInvocation invocation =
                    new ReflectiveMethodInvocation(proxy, target, method, args, targetClass, chain);
            // Proceed to the joinpoint through the interceptor chain.
            // 执行拦截器链
            retVal = invocation.proceed();
        }

        // Massage return value if necessary.
        // 获取返回类型
        Class<?> returnType = method.getReturnType();
        if (retVal != null && retVal == target &&
                returnType != Object.class && returnType.isInstance(proxy) &&
                !RawTargetAccess.class.isAssignableFrom(method.getDeclaringClass())) {
            // Special case: it returned "this" and the return type of the method
            // is type-compatible. Note that we can't help if the target sets
            // a reference to itself in another returned object.
            retVal = proxy;
        }
        // 返回结果
        else if (retVal == null && returnType != Void.TYPE && returnType.isPrimitive()) {
            throw new AopInvocationException(
                    "Null return value from advice does not match primitive return type for: " + method);
        }
        return retVal;
    }
    finally {
        if (target != null && !targetSource.isStatic()) {
            // Must have come from TargetSource.
            targetSource.releaseTarget(target);
        }
        if (setProxyContext) {
            // Restore old proxy.
            AopContext.setCurrentProxy(oldProxy);
        }
    }
}
```

获取当前方法的拦截器链`List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);`此方法的逻辑和上一篇笔记结尾处的`AbstractAdvisorAutoProxyCreator#findAdvisorsThatCanApply`大致相同。

:::info 里面具体逻辑：

遍历Advisors集合，
在遍历Advisors集合的过程中，遍历这个bean的所有方法，
优先方法上解析的事务注解的属性，会去找父类或者接口的方法，如果存在解析事务注解的属性并放入
AbstractFallbackTransactionAttributeSource的this.attributeCache.put(cacheKey, txAttr);缓存中。
cacheKey：MethodClassKey类型 ， public void com.test.tx.annotation.service.impl.BookService.addUser(com.test.tx.entity.User) on class com.test.tx.annotation.service.impl.BookService
txAttr：RuleBasedTransactionAttribute类型， PROPAGATION_REQUIRED,ISOLATION_DEFAULT
将该Advisors放入符合条件的新Advisors

如果没有，再尝试声明该方法的类上搞得注解属性，会去父类或者接口找，如果存在解析事务注解的属性并放入
AbstractFallbackTransactionAttributeSource的this.attributeCache.put(cacheKey, txAttr);缓存中。
cacheKey：MethodClassKey类型 ， public void com.test.tx.annotation.service.impl.BookService.addUser(com.test.tx.entity.User) on class com.test.tx.annotation.service.impl.BookService
txAttr：RuleBasedTransactionAttribute类型， PROPAGATION_REQUIRED,ISOLATION_DEFAULT
将该Advisors放入符合条件的新Advisors

将新Advisors集合返回，如果以上都不符合返回的就是空的
:::

如果返回chain 集合存在的话，则执行`ReflectiveMethodInvocation#proceed`

### ReflectiveMethodInvocation#proceed

```java
/**
 * 递归获取通知，然后执行
 * @return
 * @throws Throwable
 */
@Override
@Nullable
public Object proceed() throws Throwable {
    // We start with an index of -1 and increment early.
    // 从索引为-1的拦截器开始调用，并按序递增，如果拦截器链中的拦截器迭代调用完毕，开始调用target的函数，这个函数是通过反射机制完成的
    // 具体实现在AopUtils.invokeJoinpointUsingReflection方法中
    if (this.currentInterceptorIndex == this.interceptorsAndDynamicMethodMatchers.size() - 1) {
        return invokeJoinpoint();
    }

    // 获取下一个要执行的拦截器，沿着定义好的interceptorOrInterceptionAdvice链进行处理
    Object interceptorOrInterceptionAdvice =
            this.interceptorsAndDynamicMethodMatchers.get(++this.currentInterceptorIndex);
    if (interceptorOrInterceptionAdvice instanceof InterceptorAndDynamicMethodMatcher) {
        // Evaluate dynamic method matcher here: static part will already have
        // been evaluated and found to match.
        // 这里对拦截器进行动态匹配的判断，这里是对pointcut触发进行匹配的地方，如果和定义的pointcut匹配，那么这个advice将会得到执行
        InterceptorAndDynamicMethodMatcher dm =
                (InterceptorAndDynamicMethodMatcher) interceptorOrInterceptionAdvice;
        Class<?> targetClass = (this.targetClass != null ? this.targetClass : this.method.getDeclaringClass());
        if (dm.methodMatcher.matches(this.method, targetClass, this.arguments)) {
            return dm.interceptor.invoke(this);
        }
        else {
            // Dynamic matching failed.
            // Skip this interceptor and invoke the next in the chain.
            // 如果不匹配，那么proceed会被递归调用，知道所有的拦截器都被运行过位置
            return proceed();
        }
    }
    else {
        // It's an interceptor, so we just invoke it: The pointcut will have
        // been evaluated statically before this object was constructed.
        // 普通拦截器，直接调用拦截器，将this作为参数传递以保证当前实例中调用链的执行
        return ((MethodInterceptor) interceptorOrInterceptionAdvice).invoke(this);
    }
}
```

开始调用集合`interceptorsAndDynamicMethodMatchers`中的元素，首先第一个元素就是`ExposeInvocationInterceptor`，调用`invoke`方法

### ExposeInvocationInterceptor#invoke

```java
public Object invoke(MethodInvocation mi) throws Throwable {
	MethodInvocation oldInvocation = invocation.get();
	invocation.set(mi);
	try {
		return mi.proceed();
	}
	finally {
		invocation.set(oldInvocation);
	}
}
```

这里的mi就是上一个方法传入的this，也就是ReflectiveMethodInvocation，所以执行mi.proceed()还是回到`ReflectiveMethodInvocation#proceed`，这时调用集合`interceptorsAndDynamicMethodMatchers`的第二个元素，  执行
`TransactionInterceptor#invoke`

### TransactionInterceptor#invoke

```java
public Object invoke(MethodInvocation invocation) throws Throwable {
	// Work out the target class: may be {@code null}.
	// The TransactionAttributeSource should be passed the target class
	// as well as the method, which may be from an interface.
	// 获取我们的代理对象的class属性
	Class<?> targetClass = (invocation.getThis() != null ? AopUtils.getTargetClass(invocation.getThis()) : null);

	// Adapt to TransactionAspectSupport's invokeWithinTransaction...
	// 以实物的方式调用目标方法
	// 在这埋了一个钩子函数 用来回调目标方法的
	return invokeWithinTransaction(invocation.getMethod(), targetClass, invocation::proceed);
}
```

### TransactionAspectSupport#invokeWithinTransaction

```java
protected Object invokeWithinTransaction(Method method, @Nullable Class<?> targetClass,
        final InvocationCallback invocation) throws Throwable {

    // If the transaction attribute is null, the method is non-transactional.
    // 获取我们的事务属性源对象
    TransactionAttributeSource tas = getTransactionAttributeSource();
    // 通过事务属性源对象获取到当前方法的事务属性信息
    final TransactionAttribute txAttr = (tas != null ? tas.getTransactionAttribute(method, targetClass) : null);
    // 获取我们配置的事务管理对象
    final TransactionManager tm = determineTransactionManager(txAttr);

    if (this.reactiveAdapterRegistry != null && tm instanceof ReactiveTransactionManager) {
        ReactiveTransactionSupport txSupport = this.transactionSupportCache.computeIfAbsent(method, key -> {
            if (KotlinDetector.isKotlinType(method.getDeclaringClass()) && KotlinDelegate.isSuspend(method)) {
                throw new TransactionUsageException(
                        "Unsupported annotated transaction on suspending function detected: " + method +
                        ". Use TransactionalOperator.transactional extensions instead.");
            }
            ReactiveAdapter adapter = this.reactiveAdapterRegistry.getAdapter(method.getReturnType());
            if (adapter == null) {
                throw new IllegalStateException("Cannot apply reactive transaction to non-reactive return type: " +
                        method.getReturnType());
            }
            return new ReactiveTransactionSupport(adapter);
        });
        return txSupport.invokeWithinTransaction(
                method, targetClass, invocation, txAttr, (ReactiveTransactionManager) tm);
    }

    PlatformTransactionManager ptm = asPlatformTransactionManager(tm);
    // 获取连接点的唯一标识，类名+方法名
    final String joinpointIdentification = methodIdentification(method, targetClass, txAttr);

    // 声明式事务处理
    if (txAttr == null || !(ptm instanceof CallbackPreferringPlatformTransactionManager)) {
        // Standard transaction demarcation with getTransaction and commit/rollback calls.
        // 创建TransactionInfo 创建事务
        TransactionInfo txInfo = createTransactionIfNecessary(ptm, txAttr, joinpointIdentification);

        Object retVal;
        try {
            // This is an around advice: Invoke the next interceptor in the chain.
            // This will normally result in a target object being invoked.
            // 执行被增强方法
            retVal = invocation.proceedWithInvocation();
        }
        catch (Throwable ex) {
            // target invocation exception
            // 异常回滚
            completeTransactionAfterThrowing(txInfo, ex);
            throw ex;
        }
        finally {
            //清除事务信息，恢复线程私有的老的事务信息
            cleanupTransactionInfo(txInfo);
        }

        if (retVal != null && vavrPresent && VavrDelegate.isVavrTry(retVal)) {
            // Set rollback-only in case of Vavr failure matching our rollback rules...
            TransactionStatus status = txInfo.getTransactionStatus();

            if (status != null && txAttr != null) {
                retVal = VavrDelegate.evaluateTryFailure(retVal, txAttr, status);
            }
        }

        //成功后提交，会进行资源储量，连接释放，恢复挂起事务等操作
        commitTransactionAfterReturning(txInfo);
        return retVal;
    }

    else {
        // 编程式事务处理
        Object result;
        final ThrowableHolder throwableHolder = new ThrowableHolder();

        // It's a CallbackPreferringPlatformTransactionManager: pass a TransactionCallback in.
        try {
            result = ((CallbackPreferringPlatformTransactionManager) ptm).execute(txAttr, status -> {
                TransactionInfo txInfo = prepareTransactionInfo(ptm, txAttr, joinpointIdentification, status);
                try {
                    Object retVal = invocation.proceedWithInvocation();
                    if (retVal != null && vavrPresent && VavrDelegate.isVavrTry(retVal)) {
                        // Set rollback-only in case of Vavr failure matching our rollback rules...
                        retVal = VavrDelegate.evaluateTryFailure(retVal, txAttr, status);
                    }
                    return retVal;
                }
                catch (Throwable ex) {
                    if (txAttr.rollbackOn(ex)) {
                        // A RuntimeException: will lead to a rollback.
                        if (ex instanceof RuntimeException) {
                            throw (RuntimeException) ex;
                        }
                        else {
                            throw new ThrowableHolderException(ex);
                        }
                    }
                    else {
                        // A normal return value: will lead to a commit.
                        throwableHolder.throwable = ex;
                        return null;
                    }
                }
                finally {
                    cleanupTransactionInfo(txInfo);
                }
            });
        }
        catch (ThrowableHolderException ex) {
            throw ex.getCause();
        }
        catch (TransactionSystemException ex2) {
            if (throwableHolder.throwable != null) {
                logger.error("Application exception overridden by commit exception", throwableHolder.throwable);
                ex2.initApplicationException(throwableHolder.throwable);
            }
            throw ex2;
        }
        catch (Throwable ex2) {
            if (throwableHolder.throwable != null) {
                logger.error("Application exception overridden by commit exception", throwableHolder.throwable);
            }
            throw ex2;
        }

        // Check result state: It might indicate a Throwable to rethrow.
        if (throwableHolder.throwable != null) {
            throw throwableHolder.throwable;
        }
        return result;
    }
}
```

分析`createTransactionIfNecessary`这一行，开始创建事务

### TransactionAspectSupport#createTransactionIfNecessary

```java
protected TransactionInfo createTransactionIfNecessary(@Nullable PlatformTransactionManager tm,
    @Nullable TransactionAttribute txAttr, final String joinpointIdentification) {

// If no name specified, apply method identification as transaction name.
// 如果没有名称指定则使用方法唯一标识，并使用DelegatingTransactionAttribute封装txAttr
if (txAttr != null && txAttr.getName() == null) {
    txAttr = new DelegatingTransactionAttribute(txAttr) {
        @Override
        public String getName() {
            return joinpointIdentification;
        }
    };
}

TransactionStatus status = null;
if (txAttr != null) {
    if (tm != null) {
        // 获取TransactionStatus事务状态信息
        status = tm.getTransaction(txAttr);
    }
    else {
        if (logger.isDebugEnabled()) {
            logger.debug("Skipping transactional joinpoint [" + joinpointIdentification +
                    "] because no transaction manager has been configured");
        }
    }
}
// 根据指定的属性与status准备一个TransactionInfo
return prepareTransactionInfo(tm, txAttr, joinpointIdentification, status);
```

注意一下这几个接口的结构：

```java
public interface TransactionStatus extends TransactionExecution, SavepointManager, Flushable {

	/**
	 * Return whether this transaction internally carries a savepoint,
	 * that is, has been created as nested transaction based on a savepoint.
	 * <p>This method is mainly here for diagnostic purposes, alongside
	 * {@link #isNewTransaction()}. For programmatic handling of custom
	 * savepoints, use the operations provided by {@link SavepointManager}.
	 * @see #isNewTransaction()
	 * @see #createSavepoint()
	 * @see #rollbackToSavepoint(Object)
	 * @see #releaseSavepoint(Object)
	 */
	boolean hasSavepoint();

	/**
	 * Flush the underlying session to the datastore, if applicable:
	 * for example, all affected Hibernate/JPA sessions.
	 * <p>This is effectively just a hint and may be a no-op if the underlying
	 * transaction manager does not have a flush concept. A flush signal may
	 * get applied to the primary resource or to transaction synchronizations,
	 * depending on the underlying resource.
	 */
	@Override
	void flush();

}
```

```java
public interface TransactionExecution {

	/**
	 * Return whether the present transaction is new; otherwise participating
	 * in an existing transaction, or potentially not running in an actual
	 * transaction in the first place.
	 */
	boolean isNewTransaction();

	/**
	 * Set the transaction rollback-only. This instructs the transaction manager
	 * that the only possible outcome of the transaction may be a rollback, as
	 * alternative to throwing an exception which would in turn trigger a rollback.
	 */
	void setRollbackOnly();

	/**
	 * Return whether the transaction has been marked as rollback-only
	 * (either by the application or by the transaction infrastructure).
	 */
	boolean isRollbackOnly();

	/**
	 * Return whether this transaction is completed, that is,
	 * whether it has already been committed or rolled back.
	 */
	boolean isCompleted();

}
```

回到`TransactionAspectSupport#createTransactionIfNecessary`方法，分析`tm.getTransaction(txAttr);`这一行，作用是获取TransactionStatus事务状态信息

### AbstractPlatformTransactionManager#getTransaction

```java
public final TransactionStatus getTransaction(@Nullable TransactionDefinition definition)
        throws TransactionException {

    // Use defaults if no transaction definition given.
    // 如果没有事务定义信息则使用默认的事务管理器定义信息
    TransactionDefinition def = (definition != null ? definition : TransactionDefinition.withDefaults());

    // 获取事务(重要 里面涉及到了ThreadLocal的结构)
    Object transaction = doGetTransaction();
    boolean debugEnabled = logger.isDebugEnabled();

    // 判断当前线程是否存在事务，判断依据为当前线程记录的连接不为空且连接中的transactionActive属性不为空
    if (isExistingTransaction(transaction)) {
        // Existing transaction found -> check propagation behavior to find out how to behave.
        // 当前线程已经存在事务
        return handleExistingTransaction(def, transaction, debugEnabled);
    }

    // Check definition settings for new transaction.
    // 事务超时设置验证
    if (def.getTimeout() < TransactionDefinition.TIMEOUT_DEFAULT) {
        throw new InvalidTimeoutException("Invalid transaction timeout", def.getTimeout());
    }

    // No existing transaction found -> check propagation behavior to find out how to proceed.
    // 如果当前线程不存在事务，但是PropagationBehavior却被声明为PROPAGATION_MANDATORY抛出异常
    if (def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_MANDATORY) {
        throw new IllegalTransactionStateException(
                "No existing transaction found for transaction marked with propagation 'mandatory'");
    }
    // PROPAGATION_REQUIRED，PROPAGATION_REQUIRES_NEW，PROPAGATION_NESTED都需要新建事务
    else if (def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRED ||
            def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW ||
            def.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NESTED) {
        //没有当前事务的话，REQUIRED，REQUIRES_NEW，NESTED挂起的是空事务，然后创建一个新事务
        SuspendedResourcesHolder suspendedResources = suspend(null);
        if (debugEnabled) {
            logger.debug("Creating new transaction with name [" + def.getName() + "]: " + def);
        }
        try {
            //开启事务
            return startTransaction(def, transaction, debugEnabled, suspendedResources);
        }
        catch (RuntimeException | Error ex) {
            // 恢复挂起的事务
            resume(null, suspendedResources);
            throw ex;
        }
    }
    else {
        // Create "empty" transaction: no actual transaction, but potentially synchronization.
        if (def.getIsolationLevel() != TransactionDefinition.ISOLATION_DEFAULT && logger.isWarnEnabled()) {
            logger.warn("Custom isolation level specified but no actual transaction initiated; " +
                    "isolation level will effectively be ignored: " + def);
        }
        boolean newSynchronization = (getTransactionSynchronization() == SYNCHRONIZATION_ALWAYS);
        return prepareTransactionStatus(def, null, true, newSynchronization, debugEnabled, null);
    }
}
```

获取事务`DataSourceTransactionManager#doGetTransaction`，`DataSourceTransactionObject` :数据源事务对象，代表一个连接持有器，用作事务管理器的事务对象

```java
private static class DataSourceTransactionObject extends JdbcTransactionObjectSupport {
	private boolean newConnectionHolder;

	private boolean mustRestoreAutoCommit;
	/**
       * 省略
       */
}
```

JdbcTransactionObjectSupport:

```java
public abstract class JdbcTransactionObjectSupport implements SavepointManager, SmartTransactionObject {

	private static final Log logger = LogFactory.getLog(JdbcTransactionObjectSupport.class);


	@Nullable
	private ConnectionHolder connectionHolder;

	@Nullable
	private Integer previousIsolationLevel;

	private boolean readOnly = false;

	private boolean savepointAllowed = false;


	/**
	 * Set the ConnectionHolder for this transaction object.
	 */
	public void setConnectionHolder(@Nullable ConnectionHolder connectionHolder) {
		this.connectionHolder = connectionHolder;
	}

	/**
	 * Return the ConnectionHolder for this transaction object.
	 */
	public ConnectionHolder getConnectionHolder() {
		Assert.state(this.connectionHolder != null, "No ConnectionHolder available");
		return this.connectionHolder;
	}

	/**
	 * Check whether this transaction object has a ConnectionHolder.
	 */
	public boolean hasConnectionHolder() {
		return (this.connectionHolder != null);
	}

	/**
	 * Set the previous isolation level to retain, if any.
	 */
	public void setPreviousIsolationLevel(@Nullable Integer previousIsolationLevel) {
		this.previousIsolationLevel = previousIsolationLevel;
	}

	/**
	 * Return the retained previous isolation level, if any.
	 */
	@Nullable
	public Integer getPreviousIsolationLevel() {
		return this.previousIsolationLevel;
	}

	/**
	 * Set the read-only status of this transaction.
	 * The default is {@code false}.
	 * @since 5.2.1
	 */
	public void setReadOnly(boolean readOnly) {
		this.readOnly = readOnly;
	}

	/**
	 * Return the read-only status of this transaction.
	 * @since 5.2.1
	 */
	public boolean isReadOnly() {
		return this.readOnly;
	}

	/**
	 * Set whether savepoints are allowed within this transaction.
	 * The default is {@code false}.
	 */
	public void setSavepointAllowed(boolean savepointAllowed) {
		this.savepointAllowed = savepointAllowed;
	}

	/**
	 * Return whether savepoints are allowed within this transaction.
	 */
	public boolean isSavepointAllowed() {
		return this.savepointAllowed;
	}

	@Override
	public void flush() {
		// no-op
	}


	//---------------------------------------------------------------------
	// Implementation of SavepointManager
	//---------------------------------------------------------------------

	/**
	 * This implementation creates a JDBC 3.0 Savepoint and returns it.
	 * @see java.sql.Connection#setSavepoint
	 */
	@Override
	public Object createSavepoint() throws TransactionException {
		ConnectionHolder conHolder = getConnectionHolderForSavepoint();
		try {
			if (!conHolder.supportsSavepoints()) {
				throw new NestedTransactionNotSupportedException(
						"Cannot create a nested transaction because savepoints are not supported by your JDBC driver");
			}
			if (conHolder.isRollbackOnly()) {
				throw new CannotCreateTransactionException(
						"Cannot create savepoint for transaction which is already marked as rollback-only");
			}
			return conHolder.createSavepoint();
		}
		catch (SQLException ex) {
			throw new CannotCreateTransactionException("Could not create JDBC savepoint", ex);
		}
	}

	/**
	 * 内部就是获取连接对象，然后调用rollback回滚到保存点，然后重置连接持有器的回滚标记为false
	 *
	 * This implementation rolls back to the given JDBC 3.0 Savepoint.
	 * @see java.sql.Connection#rollback(java.sql.Savepoint)
	 */
	@Override
	public void rollbackToSavepoint(Object savepoint) throws TransactionException {
		ConnectionHolder conHolder = getConnectionHolderForSavepoint();
		try {
			// 回滚到保存点
			conHolder.getConnection().rollback((Savepoint) savepoint);
			// 重置回滚标记，不需要回滚
			conHolder.resetRollbackOnly();
		}
		catch (Throwable ex) {
			throw new TransactionSystemException("Could not roll back to JDBC savepoint", ex);
		}
	}

	/**
	 * JDBC连接释放保存点
	 *
	 * This implementation releases the given JDBC 3.0 Savepoint.
	 * @see java.sql.Connection#releaseSavepoint
	 */
	@Override
	public void releaseSavepoint(Object savepoint) throws TransactionException {
		ConnectionHolder conHolder = getConnectionHolderForSavepoint();
		try {
			conHolder.getConnection().releaseSavepoint((Savepoint) savepoint);
		}
		catch (Throwable ex) {
			logger.debug("Could not explicitly release JDBC savepoint", ex);
		}
	}

	protected ConnectionHolder getConnectionHolderForSavepoint() throws TransactionException {
		if (!isSavepointAllowed()) {
			throw new NestedTransactionNotSupportedException(
					"Transaction manager does not allow nested transactions");
		}
		if (!hasConnectionHolder()) {
			throw new TransactionUsageException(
					"Cannot create nested transaction when not exposing a JDBC transaction");
		}
		return getConnectionHolder();
	}

}
```

### DataSourceTransactionManager#doGetTransaction

```java
/**
 * 创建一个DataSourceTransactionObject当作事务，设置是否允许保存点，然后获取连接持有器ConnectionHolder
 * 里面会存放JDBC的连接，设置给DataSourceTransactionObject,当然第一次是空的
 *
 * @return
 */
@Override
protected Object doGetTransaction() {
	// 创建一个数据源事务对象
	DataSourceTransactionObject txObject = new DataSourceTransactionObject();
	// 是否允许当前事务设置保持点
	txObject.setSavepointAllowed(isNestedTransactionAllowed());
	/**
	 * TransactionSynchronizationManager 事务同步管理器对象（该类中都是局部线程变量）
	 * 用来保存当前事务的信息，我们第一次从这里去线程变量获取 事务连接持有器对象 通过数据源为key去获取
	 * 由于第一次进来开始事务 我们的事务同步管理器中没有被存放，所以此时获取出来的conHolder为null
	 * */
       //obtainDataSource()方法返回的是DataSourceTransactionManager中的dataSource，案例中配置的DruidDataSource
	ConnectionHolder conHolder =
			(ConnectionHolder) TransactionSynchronizationManager.getResource(obtainDataSource());
	// 非新创建连接则写false
	txObject.setConnectionHolder(conHolder, false);
	//返回事务对象
	return txObject;
}
```

### TransactionSynchronizationManager#getResource

```java
public static Object getResource(Object key) {
    Object actualKey = TransactionSynchronizationUtils.unwrapResourceIfNecessary(key);
    Object value = doGetResource(actualKey);
    if (value != null && logger.isTraceEnabled()) {
        logger.trace("Retrieved value [" + value + "] for key [" + actualKey + "] bound to thread [" +
                Thread.currentThread().getName() + "]");
    }
    return value;
}
```

### TransactionSynchronizationManager#doGetResource

```java
private static Object doGetResource(Object actualKey) {
    // 线程私有事务资源
    //private static final ThreadLocal<Map<Object, Object>> resources = new NamedThreadLocal<>("Transactional resources");
    //第一次进来获得是空的
    Map<Object, Object> map = resources.get();
    if (map == null) {
        return null;
    }
    Object value = map.get(actualKey);
    // Transparently remove ResourceHolder that was marked as void...
    if (value instanceof ResourceHolder && ((ResourceHolder) value).isVoid()) {
        map.remove(actualKey);
        // Remove entire ThreadLocal if empty...
        if (map.isEmpty()) {
            resources.remove();
        }
        value = null;
    }
    return value;
}
```

执行完回到`AbstractPlatformTransactionManager#getTransaction`方法中，执行完了`Object transaction = doGetTransaction()`因为第一次进入事务，所以`connectionHolder`为空
![](/img/technologySharing/spring/transaction.png)

接下来进行事务的开启
### AbstractPlatformTransactionManager#startTransaction

```java
private TransactionStatus startTransaction(TransactionDefinition definition, Object transaction,
            boolean debugEnabled, @Nullable SuspendedResourcesHolder suspendedResources) {

        // 是否需要新同步
        boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
        // 创建新的事务
        DefaultTransactionStatus status = newTransactionStatus(
                definition, transaction, true, newSynchronization, debugEnabled, suspendedResources);
        // 开启事务
        doBegin(transaction, definition);
        // 新同步事务的设置，针对于当前线程的设置
        prepareSynchronization(status, definition);
        return status;
}
```

接下来开始创建新的事务`TransactionStatus`

### AbstractPlatformTransactionManager#newTransactionStatus

```java
/**
 * 通过给定的参数创建事务状态
 * Create a TransactionStatus instance for the given arguments.
 */
protected DefaultTransactionStatus newTransactionStatus(
                TransactionDefinition definition, @Nullable Object transaction, boolean newTransaction,
                boolean newSynchronization, boolean debug, @Nullable Object suspendedResources) {

        // 是否需要新同步，只要有新同步且当前无同步激活事务
        boolean actualNewSynchronization = newSynchronization &&
                        !TransactionSynchronizationManager.isSynchronizationActive();
        return new DefaultTransactionStatus(
                        transaction, newTransaction, actualNewSynchronization,
                        definition.isReadOnly(), debug, suspendedResources);
}
```

### DefaultTransactionStatus#DefaultTransactionStatus

```java
public DefaultTransactionStatus(
		@Nullable Object transaction, boolean newTransaction, boolean newSynchronization,
		boolean readOnly, boolean debug, @Nullable Object suspendedResources) {
	//创建事务
	this.transaction = transaction;
	//是否需要新事务
	this.newTransaction = newTransaction;
	//是否需要新同步
	this.newSynchronization = newSynchronization;
	//是否只读
	this.readOnly = readOnly;
	//是否要debug
	this.debug = debug;
	//是否有挂起的连接资源
	this.suspendedResources = suspendedResources;
}
```

开始进行开启连接和事务

### DataSourceTransactionManager#doBegin

```java
/**
 * 开启连接和事务
 * @param transaction the transaction object returned by {@code doGetTransaction}
 * @param definition a TransactionDefinition instance, describing propagation
 * behavior, isolation level, read-only flag, timeout, and transaction name
 */
@Override
protected void doBegin(Object transaction, TransactionDefinition definition) {
        //强制转化事务对象
        DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
        Connection con = null;

        try {
                // 判断事务对象有没有数据库连接持有器
                // 第一次进入当前事务没有连接资源
                if (!txObject.hasConnectionHolder() ||
                                txObject.getConnectionHolder().isSynchronizedWithTransaction()) {
                        // 通过数据源获取一个数据库连接对象
                        Connection newCon = obtainDataSource().getConnection();
                        if (logger.isDebugEnabled()) {
                                logger.debug("Acquired Connection [" + newCon + "] for JDBC transaction");
                        }
                        //把我们的数据库连接包装成一个ConnectionHolder对象，然后设置到我们的txObject对象中去
                        txObject.setConnectionHolder(new ConnectionHolder(newCon), true);
                }

                //标记当前的连接是一个同步事务
                txObject.getConnectionHolder().setSynchronizedWithTransaction(true);
                con = txObject.getConnectionHolder().getConnection();

                // 设置隔离级别，默认是用数据库默认的
                Integer previousIsolationLevel = DataSourceUtils.prepareConnectionForTransaction(con, definition);
                // 设置先前隔离级别
                txObject.setPreviousIsolationLevel(previousIsolationLevel);
                // 设置是否只读
                txObject.setReadOnly(definition.isReadOnly());

                // Switch to manual commit if necessary. This is very expensive in some JDBC drivers,
                // so we don't want to do it unnecessarily (for example if we've explicitly
                // configured the connection pool to set it already).
                // 关闭自动提交
                if (con.getAutoCommit()) {
                        //设置需要恢复自动提交
                        txObject.setMustRestoreAutoCommit(true);
                        if (logger.isDebugEnabled()) {
                                logger.debug("Switching JDBC Connection [" + con + "] to manual commit");
                        }
                        // 关闭自动提交
                        con.setAutoCommit(false);
                }

                // 判断事务是否需要设置为只读事务
                prepareTransactionalConnection(con, definition);
                //标记激活事务
                txObject.getConnectionHolder().setTransactionActive(true);
                //设置事务超时时间
                int timeout = determineTimeout(definition);
                if (timeout != TransactionDefinition.TIMEOUT_DEFAULT) {
                        txObject.getConnectionHolder().setTimeoutInSeconds(timeout);
                }

                // Bind the connection holder to the thread.
                //是新事务的话就绑定到线程私有
                if (txObject.isNewConnectionHolder()) {
                        // 将当前获取到的连接绑定到当前线程
                        TransactionSynchronizationManager.bindResource(obtainDataSource(), txObject.getConnectionHolder());
                }
        }

        catch (Throwable ex) {
                if (txObject.isNewConnectionHolder()) {
                        DataSourceUtils.releaseConnection(con, obtainDataSource());
                        txObject.setConnectionHolder(null, false);
                }
                throw new CannotCreateTransactionException("Could not open JDBC Connection for transaction", ex);
        }
}
```

新同步事务的设置，针对于当前线程的设置

### AbstractPlatformTransactionManager#prepareSynchronization

```java
/**
 * 设置各种线程私有变量的状态
 *
 * Initialize transaction synchronization as appropriate.
 */
protected void prepareSynchronization(DefaultTransactionStatus status, TransactionDefinition definition) {
	if (status.isNewSynchronization()) {
		//绑定事务激活
		TransactionSynchronizationManager.setActualTransactionActive(status.hasTransaction());
		//当前事务的隔离级别
		TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(
				definition.getIsolationLevel() != TransactionDefinition.ISOLATION_DEFAULT ?
						definition.getIsolationLevel() : null);
		//是否为只读事务
		TransactionSynchronizationManager.setCurrentTransactionReadOnly(definition.isReadOnly());
		//事务的名称
		TransactionSynchronizationManager.setCurrentTransactionName(definition.getName());
		TransactionSynchronizationManager.initSynchronization();
	}
}
```

执行到这里创建了一个事务和线程绑定，回到开始创建事务`TransactionAspectSupport#createTransactionIfNecessary`里面的获取TransactionStatus事务状态信息`status = tm.getTransaction(txAttr)`执行完毕，接下来执行`TransactionAspectSupport#prepareTransactionInfo`根据指定的属性与status准备一个TransactionInfo

### TransactionAspectSupport#prepareTransactionInfo

```java
/**
 * 创建一个TransactionInfo,然后把事务管理器，事务注解属性，方法标识符，事务状态设置进入，然后绑定到当前线程私有变量里
 *
 * Prepare a TransactionInfo for the given attribute and status object.
 * @param txAttr the TransactionAttribute (may be {@code null})
 * @param joinpointIdentification the fully qualified method name
 * (used for monitoring and logging purposes)
 * @param status the TransactionStatus for the current transaction
 * @return the prepared TransactionInfo object
 */
protected TransactionInfo prepareTransactionInfo(@Nullable PlatformTransactionManager tm,
		@Nullable TransactionAttribute txAttr, String joinpointIdentification,
		@Nullable TransactionStatus status) {

	// 创建事务信息
	TransactionInfo txInfo = new TransactionInfo(tm, txAttr, joinpointIdentification);
	if (txAttr != null) {
		// We need a transaction for this method...
		if (logger.isTraceEnabled()) {
			logger.trace("Getting transaction for [" + txInfo.getJoinpointIdentification() + "]");
		}
		// The transaction manager will flag an error if an incompatible tx already exists.
		// 设置新事务状态
		txInfo.newTransactionStatus(status);
	}
	else {
		// The TransactionInfo.hasTransaction() method will return false. We created it only
		// to preserve the integrity of the ThreadLocal stack maintained in this class.
		if (logger.isTraceEnabled()) {
			logger.trace("No need to create transaction for [" + joinpointIdentification +
					"]: This method is not transactional.");
		}
	}

	// We always bind the TransactionInfo to the thread, even if we didn't create
	// a new transaction here. This guarantees that the TransactionInfo stack
	// will be managed correctly even if no transaction was created by this aspect.
	// 事务信息绑定到当前线程
	txInfo.bindToThread();
	return txInfo;
}
```

事务信息绑定到当前线程(保存旧的事务信息用于恢复)`TransactionAspectSupport.TransactionInfo#bindToThread`

### TransactionAspectSupport.TransactionInfo#bindToThread

```java
private void bindToThread() {
	// Expose current TransactionStatus, preserving any existing TransactionStatus
	// for restoration after this transaction is complete.
	this.oldTransactionInfo = transactionInfoHolder.get();
	transactionInfoHolder.set(this);
}
```

执行完这里位置，开始创建事务`TransactionAspectSupport#createTransactionIfNecessary`执行完毕。回到
`TransactionAspectSupport#invokeWithinTransaction`开始执行真正的方法逻辑`retVal = invocation.proceedWithInvocation();`然后会回到`ReflectiveMethodInvocation#proceed`

### ReflectiveMethodInvocation#proceed

```java
// 从索引为-1的拦截器开始调用，并按序递增，如果拦截器链中的拦截器迭代调用完毕，开始调用target的函数，这个函数是通过反射机制完成的
// 具体实现在AopUtils.invokeJoinpointUsingReflection方法中
if (this.currentInterceptorIndex == this.interceptorsAndDynamicMethodMatchers.size() - 1) {
	return invokeJoinpoint();
}
```

这时 集合`interceptorsAndDynamicMethodMatchers`的元素都执行完毕，if这个条件已经满足了，执行`invokeJoinpoint();`执行`bookService#update`方法，执行完后回到`TransactionAspectSupport#invokeWithinTransaction`，开始执行真正的方法逻辑 `retVal = invocation.proceedWithInvocation()`执行完毕

## 事务信息的清除

### TransactionAspectSupport#cleanupTransactionInfo

```java
/**
 * 清除事务信息
 *
 */
protected void cleanupTransactionInfo(@Nullable TransactionInfo txInfo) {
    if (txInfo != null) {
        txInfo.restoreThreadLocalStatus();
    }
}
```

### TransactionInfo#restoreThreadLocalStatus

```java
private void restoreThreadLocalStatus() {
    // Use stack to restore old transaction TransactionInfo.
    // Will be null if none was set.
    //恢复旧的事务信息
    transactionInfoHolder.set(this.oldTransactionInfo);
}
```

成功后提交，会进行资源储量，连接释放，恢复挂起事务等操作

## 事务提交

### TransactionAspectSupport#commitTransactionAfterReturning

```java
/**
 * 调用事务管理器的提交方法
 *
 * Execute after successful completion of call, but not after an exception was handled.
 * Do nothing if we didn't create a transaction.
 * @param txInfo information about the current transaction
 */
protected void commitTransactionAfterReturning(@Nullable TransactionInfo txInfo) {
    if (txInfo != null && txInfo.getTransactionStatus() != null) {
        if (logger.isTraceEnabled()) {
            logger.trace("Completing transaction for [" + txInfo.getJoinpointIdentification() + "]");
        }
        txInfo.getTransactionManager().commit(txInfo.getTransactionStatus());
    }
}
```

### AbstractPlatformTransactionManager#commit

```java
/**
 * 提交事务，就算没有异常，但是提交的时候也可能会回滚，因为有内层事务可能会标记回滚。所以这里先判断是否状态是否需要本地回滚，
 * 也就是设置回滚标记为全局回滚，不会进行回滚，再判断是否需要全局回滚，就是真的执行回滚。但是这里如果是发现有全局回滚，还要进行提交，就会报异常
 *
 * This implementation of commit handles participating in existing
 * transactions and programmatic rollback requests.
 * Delegates to {@code isRollbackOnly}, {@code doCommit}
 * and {@code rollback}.
 * @see org.springframework.transaction.TransactionStatus#isRollbackOnly()
 * @see #doCommit
 * @see #rollback
 */
@Override
public final void commit(TransactionStatus status) throws TransactionException {
    if (status.isCompleted()) {
        throw new IllegalTransactionStateException(
                "Transaction is already completed - do not call commit or rollback more than once per transaction");
    }

    DefaultTransactionStatus defStatus = (DefaultTransactionStatus) status;
    // 如果在事务链中已经被标记回滚，那么不会尝试提交事务，直接回滚
    if (defStatus.isLocalRollbackOnly()) {
        if (defStatus.isDebug()) {
            logger.debug("Transactional code has requested rollback");
        }
        // 不可预期的回滚
        processRollback(defStatus, false);
        return;
    }

    // 设置了全局回滚
    if (!shouldCommitOnGlobalRollbackOnly() && defStatus.isGlobalRollbackOnly()) {
        if (defStatus.isDebug()) {
            logger.debug("Global transaction is marked as rollback-only but transactional code requested commit");
        }
        // 可预期的回滚，可能会报异常
        processRollback(defStatus, true);
        return;
    }

    // 处理事务提交
    processCommit(defStatus);
}
```

接下来进行处理事务的提交

### AbstractPlatformTransactionManager#processCommit

```java
/**
 * 处理提交，先处理保存点，然后处理新事务，如果不是新事务不会真正提交，要等外层是新事务的才提交，
 * 最后根据条件执行数据清除,线程的私有资源解绑，重置连接自动提交，隔离级别，是否只读，释放连接，恢复挂起事务等
 *
 * Process an actual commit.
 * Rollback-only flags have already been checked and applied.
 * @param status object representing the transaction
 * @throws TransactionException in case of commit failure
 */
private void processCommit(DefaultTransactionStatus status) throws TransactionException {
    try {
        boolean beforeCompletionInvoked = false;

        try {
            boolean unexpectedRollback = false;
            // 预留
            prepareForCommit(status);
            // 添加的TransactionSynchronization中的对应方法的调用
            triggerBeforeCommit(status);
            // 提交完成前回调
            triggerBeforeCompletion(status);
            beforeCompletionInvoked = true;

            // 有保存点
            if (status.hasSavepoint()) {
                if (status.isDebug()) {
                    logger.debug("Releasing transaction savepoint");
                }
                //是否有全局回滚标记
                unexpectedRollback = status.isGlobalRollbackOnly();
                // 如果存在保存点则清除保存点信息
                status.releaseHeldSavepoint();
            }
            //当前状态是新事务
            else if (status.isNewTransaction()) {
                if (status.isDebug()) {
                    logger.debug("Initiating transaction commit");
                }
                unexpectedRollback = status.isGlobalRollbackOnly();
                // 如果是独立的事务则直接提交
                doCommit(status);
            }
            else if (isFailEarlyOnGlobalRollbackOnly()) {
                unexpectedRollback = status.isGlobalRollbackOnly();
            }

            // Throw UnexpectedRollbackException if we have a global rollback-only
            // marker but still didn't get a corresponding exception from commit.
            // 有全局回滚标记就报异常
            if (unexpectedRollback) {
                throw new UnexpectedRollbackException(
                        "Transaction silently rolled back because it has been marked as rollback-only");
            }
        }
        catch (UnexpectedRollbackException ex) {
            // can only be caused by doCommit
            triggerAfterCompletion(status, TransactionSynchronization.STATUS_ROLLED_BACK);
            throw ex;
        }
        catch (TransactionException ex) {
            // can only be caused by doCommit
            if (isRollbackOnCommitFailure()) {
                doRollbackOnCommitException(status, ex);
            }
            else {
                triggerAfterCompletion(status, TransactionSynchronization.STATUS_UNKNOWN);
            }
            throw ex;
        }
        catch (RuntimeException | Error ex) {
            if (!beforeCompletionInvoked) {
                triggerBeforeCompletion(status);
            }
            // 提交过程中出现异常则回滚
            doRollbackOnCommitException(status, ex);
            throw ex;
        }

        // Trigger afterCommit callbacks, with an exception thrown there
        // propagated to callers but the transaction still considered as committed.
        try {
            // 提交后回调
            triggerAfterCommit(status);
        }
        finally {
            // 提交后清除线程私有同步状态
            triggerAfterCompletion(status, TransactionSynchronization.STATUS_COMMITTED);
        }

    }
    finally {
        //根据条件，完成后数据清除,和线程的私有资源解绑，重置连接自动提交，隔离级别，是否只读，释放连接，恢复挂起事务等
        cleanupAfterCompletion(status);
    }
}
```

下面就是进行真正的提交操作

### DataSourceTransactionManager#doCommit

```java
/**
 * 获取JDBC的连接提交
 * @param status the status representation of the transaction
 */
@Override
protected void doCommit(DefaultTransactionStatus status) {
	DataSourceTransactionObject txObject = (DataSourceTransactionObject) status.getTransaction();
	Connection con = txObject.getConnectionHolder().getConnection();
	if (status.isDebug()) {
		logger.debug("Committing JDBC transaction on Connection [" + con + "]");
	}
	try {
		// JDBC连接提交
		con.commit();
	}
	catch (SQLException ex) {
		throw new TransactionSystemException("Could not commit JDBC transaction", ex);
	}
}
```

当JDBC连接提交后，`doCommit`执行完毕，回到`processCommit`中，执行`cleanupAfterCompletion`作用是根据条件，完成一系列清除的操作

### AbstractPlatformTransactionManager#cleanupAfterCompletion

```java
/**
 * 回滚后的处理工作，如果是新的事务同步状态的话，要把线程的同步状态清除了，
 * 如果是新事务的话，进行数据清除,线程的私有资源解绑，重置连接自动提交，隔离级别，是否只读，释放连接等。
 * 如果有挂起的事务，还要把这个事务给恢复，其实就是把属性设置回去
 *
 * Clean up after completion, clearing synchronization if necessary,
 * and invoking doCleanupAfterCompletion.
 * @param status object representing the transaction
 * @see #doCleanupAfterCompletion
 */
private void cleanupAfterCompletion(DefaultTransactionStatus status) {
    // 设置完成状态
    status.setCompleted();
    if (status.isNewSynchronization()) {
        // 线程同步状态清除
        TransactionSynchronizationManager.clear();
    }
    // 如果是新事务的话，进行数据清除，线程的私有资源解绑，重置连接自动提交，隔离级别，是否只读，释放连接等
    if (status.isNewTransaction()) {
        doCleanupAfterCompletion(status.getTransaction());
    }
    // 有挂起的事务要恢复
    if (status.getSuspendedResources() != null) {
        if (status.isDebug()) {
            logger.debug("Resuming suspended transaction after completion of inner transaction");
        }
        Object transaction = (status.hasTransaction() ? status.getTransaction() : null);
        // 结束之前事务的挂起状态
        resume(transaction, (SuspendedResourcesHolder) status.getSuspendedResources());
    }
}
```
