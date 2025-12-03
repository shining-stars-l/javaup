---
slug: /tech-sharing/spring-tx-source/spring-part-7
---

# Spring事务执行流程分析_7

如果update方法中调用了其他的service类的方法，那么这个service类的方法同样也要加上事务，那么以上的逻辑也是要执行一遍，但是这时是在一个线程中，所以在取数据源连接时就会直接取到上一个service方法的连接了。

下面改为在BookService中添加一个addUserV2方法里面有调用其它service类

```java
public class BookService implements IBookService {

    public BookDao bookDao;

    public IAccountService accountService;

    public BookDao getBookDao() {
        return bookDao;
    }

    public void setBookDao(BookDao bookDao) {
        this.bookDao = bookDao;
    }

    public IAccountService getAccountService() {
        return accountService;
    }

    public void setAccountService(IAccountService accountService) {
        this.accountService = accountService;
    }

    @Override
    public void addUser(User user) {
        bookDao.addUser(user);
        //int i = 1 / 0;
    }

    @Override
    public void addUserV2(User user) {
        bookDao.addUser(user);
        Account account = new Account();
        account.setId(user.getId());
        accountService.addAccount(account);
    }
}
```

## 执行链路

### JdkDynamicAopProxy#invoke

`addUserV2`中`accountService#addAccount(account);`之前的逻辑和上述分析的过程相同，下面来分析当执行到`accountService.addAccount(account);`时的过程。

同样`JdkDynamicAopProxy#invoke` -> `ReflectiveMethodInvocation#proceed`

执行`interceptorsAndDynamicMethodMatchers`集合中的元素

第一个元素执行 `ExposeInvocationInterceptor#invoke`

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

然后回到第二个元素执行`TransactionInterceptor#invoke`

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
        // 创建TransactionInfo
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

开始进入创建事务的逻辑

### TransactionAspectSupport#createTransactionIfNecessary

```java
protected TransactionInfo createTransactionIfNecessary(@Nullable PlatformTransactionManager tm,
		@Nullable TransactionAttribute txAttr, final String joinpointIdentification) {

	// If no name specified, apply method identification as transaction name.
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
			status = tm.getTransaction(txAttr);
		}
		else {
			if (logger.isDebugEnabled()) {
				logger.debug("Skipping transactional joinpoint [" + joinpointIdentification +
						"] because no transaction manager has been configured");
			}
		}
	}
	return prepareTransactionInfo(tm, txAttr, joinpointIdentification, status);
}
```

### AbstractPlatformTransactionManager#getTransaction

```java
public final TransactionStatus getTransaction(@Nullable TransactionDefinition definition)
        throws TransactionException {

    // Use defaults if no transaction definition given.
    // 如果没有事务定义信息则使用默认的事务管理器定义信息
    TransactionDefinition def = (definition != null ? definition : TransactionDefinition.withDefaults());

    // 获取事务
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
    ConnectionHolder conHolder =
            (ConnectionHolder) TransactionSynchronizationManager.getResource(obtainDataSource());
    // 非新创建连接则写false
    txObject.setConnectionHolder(conHolder, false);
    //返回事务对象
    return txObject;
}
```

因为booService的addUserV2已经在同一个线程中设置了conHolder，所以这时可以直接获得到conHolder
然后执行完返回，再执行isExistingTransaction判断返回结果是true

### DataSourceTransactionManager#isExistingTransaction

```java
/**
 * 之前获取了事务，但是是创建的，如果要判断是否有事务存在就要看是否有JDBC连接，事务是否是激活的，当前第一次是没有连接持有器的
 * 如果是第二次以后的话是存在的
 * @param transaction the transaction object returned by doGetTransaction
 * @return
 */
@Override
protected boolean isExistingTransaction(Object transaction) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
    return (txObject.hasConnectionHolder() && txObject.getConnectionHolder().isTransactionActive());
}
```

返回true后执行

### AbstractPlatformTransactionManager#handleExistingTransaction

```java
private TransactionStatus handleExistingTransaction(
        TransactionDefinition definition, Object transaction, boolean debugEnabled)
        throws TransactionException {

    /**
     * 判断当前的事务行为是不是PROPAGATION_NEVER
     * 表示为不支持事务，但是当前又存在一个事务，所以抛出异常
     * */
    if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NEVER) {
        throw new IllegalTransactionStateException(
                "Existing transaction found for transaction marked with propagation 'never'");
    }

    /**
     * 判断当前的事务属性不支持事务，PROPAGATION_NOT_SUPPORTED，所以需要先挂起已经存在的事务。
     * */
    if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NOT_SUPPORTED) {
        if (debugEnabled) {
            logger.debug("Suspending current transaction");
        }
        // 挂起当前事务
        Object suspendedResources = suspend(transaction);
        boolean newSynchronization = (getTransactionSynchronization() == SYNCHRONIZATION_ALWAYS);
        // 创建一个新的非事务状态(保存了上一个存在事务状态的属性)
        return prepareTransactionStatus(
                definition, null, false, newSynchronization, debugEnabled, suspendedResources);
    }

    /**
     * 当前的事务属性是PROPAGATION_REQUIRES_NEW表示需要新开启一个事务状态
     * */
    if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW) {
        if (debugEnabled) {
            logger.debug("Suspending current transaction, creating new transaction with name [" +
                    definition.getName() + "]");
        }
        //挂起当前事务并返回挂起的资源持有器
        SuspendedResourcesHolder suspendedResources = suspend(transaction);
        try {
            //创建一个新的非事务状态（保存了上也给存在事务状态的属性）
            return startTransaction(definition, transaction, debugEnabled, suspendedResources);
        }
        catch (RuntimeException | Error beginEx) {
            resumeAfterBeginException(transaction, suspendedResources, beginEx);
            throw beginEx;
        }
    }

    // 嵌套事务
    if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NESTED) {
        // 不允许就报异常
        if (!isNestedTransactionAllowed()) {
            throw new NestedTransactionNotSupportedException(
                    "Transaction manager does not allow nested transactions by default - " +
                    "specify 'nestedTransactionAllowed' property with value 'true'");
        }
        if (debugEnabled) {
            logger.debug("Creating nested transaction with name [" + definition.getName() + "]");
        }
        //嵌套事务的处理
        if (useSavepointForNestedTransaction()) {
            // Create savepoint within existing Spring-managed transaction,
            // through the SavepointManager API implemented by TransactionStatus.
            // Usually uses JDBC 3.0 savepoints. Never activates Spring synchronization.
            // 如果没有可以使用保存点的方式控制事务回滚，那么在嵌入式事务的建立初始简历保存点
            DefaultTransactionStatus status =
                    prepareTransactionStatus(definition, transaction, false, false, debugEnabled, null);
            //为事务设置一个回退点
            status.createAndHoldSavepoint();
            return status;
        }
        else {
            // Nested transaction through nested begin and commit/rollback calls.
            // Usually only for JTA: Spring synchronization might get activated here
            // in case of a pre-existing JTA transaction.
            // 有些情况是不能使用保存点操作
            return startTransaction(definition, transaction, debugEnabled, null);
        }
    }

    // Assumably PROPAGATION_SUPPORTS or PROPAGATION_REQUIRED.
    if (debugEnabled) {
        logger.debug("Participating in existing transaction");
    }
    if (isValidateExistingTransaction()) {
        if (definition.getIsolationLevel() != TransactionDefinition.ISOLATION_DEFAULT) {
            Integer currentIsolationLevel = TransactionSynchronizationManager.getCurrentTransactionIsolationLevel();
            if (currentIsolationLevel == null || currentIsolationLevel != definition.getIsolationLevel()) {
                Constants isoConstants = DefaultTransactionDefinition.constants;
                throw new IllegalTransactionStateException("Participating transaction with definition [" +
                        definition + "] specifies isolation level which is incompatible with existing transaction: " +
                        (currentIsolationLevel != null ?
                                isoConstants.toCode(currentIsolationLevel, DefaultTransactionDefinition.PREFIX_ISOLATION) :
                                "(unknown)"));
            }
        }
        if (!definition.isReadOnly()) {
            if (TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
                throw new IllegalTransactionStateException("Participating transaction with definition [" +
                        definition + "] is not marked as read-only but existing transaction is");
            }
        }
    }
    boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
    return prepareTransactionStatus(definition, transaction, false, newSynchronization, debugEnabled, null);
}
```

### AbstractPlatformTransactionManager#prepareTransactionStatus

```java
protected final DefaultTransactionStatus prepareTransactionStatus(
		TransactionDefinition definition, @Nullable Object transaction, boolean newTransaction,
		boolean newSynchronization, boolean debug, @Nullable Object suspendedResources) {

   	//执行到这里，newTransaction为false
	DefaultTransactionStatus status = newTransactionStatus(
			definition, transaction, newTransaction, newSynchronization, debug, suspendedResources);
	prepareSynchronization(status, definition);
	return status;
}
```

执行完回到`TransactionAspectSupport#createTransactionIfNecessary`，这时`AbstractPlatformTransactionManager#getTransaction`执行完，开始执行根据指定的属性与status准备一个TransactionInfo

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

执行到这里返回`TransactionAspectSupport#createTransactionIfNecessary`执行完毕，回到`TransactionAspectSupport#invokeWithinTransaction`，执行被增强方法`retVal = invocation.proceedWithInvocation();`，`(accountService.addAccount(account);)`执行完执行`TransactionAspectSupport#cleanupTransactionInfo`

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

进行事务提交

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

处理事务提交`processCommit(defStatus)`

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

由于这时不是新的事务所以不会执行doCommit，到这里accountService.addAccount(account)执行完毕。回到bookService的addUserV2方法中来，注意以下清除事务信息和提交事务的代码和上述虽然还是相同，但是这时方法已经是bookService.addUserV2

`TransactionAspectSupport#invokeWithinTransaction` ->
`TransactionAspectSupport#cleanupTransactionInfo`(清除事务信息，恢复线程私有的老的事务信息)

### TransactionAspectSupport#cleanupTransactionInfo

```java
/**
 * 清除事务信息
 *
 * Reset the TransactionInfo ThreadLocal.
 * <p>Call this in all cases: exception or normal return!
 * @param txInfo information about the current transaction (may be {@code null})
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
  		//这时oldTransactionInfo为null	
	transactionInfoHolder.set(this.oldTransactionInfo);
}
```

成功后提交，会进行资源储量，连接释放，恢复挂起事务等操作

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

提交事务

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

处理事务提交

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

真正的提交事务

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

根据条件，完成后数据清除,和线程的私有资源解绑，重置连接自动提交，隔离级别，是否只读，释放连接，恢复挂起事务等

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
