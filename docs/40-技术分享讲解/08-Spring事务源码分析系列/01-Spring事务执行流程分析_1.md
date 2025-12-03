---
slug: /tech-sharing/spring-tx-source/spring-part-1
---

# Spring事务执行流程分析_1

## tx.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xmlns:aop="http://www.springframework.org/schema/aop"
       xmlns:tx="http://www.springframework.org/schema/tx"
       xmlns:p="http://www.springframework.org/schema/p"
       xmlns:context="http://www.springframework.org/schema/context"
       xsi:schemaLocation="http://www.springframework.org/schema/beans
        http://www.springframework.org/schema/beans/spring-beans.xsd
        http://www.springframework.org/schema/context
        http://www.springframework.org/schema/context/spring-context.xsd
        http://www.springframework.org/schema/aop
        http://www.springframework.org/schema/aop/spring-aop.xsd
        http://www.springframework.org/schema/tx
        http://www.springframework.org/schema/tx/spring-tx.xsd">
    
    <bean id="dataSource" class="com.alibaba.druid.pool.DruidDataSource">
        <property name="username" value="root"></property>
        <property name="password" value="root"></property>
        <property name="url" value="jdbc:mysql://localhost:3306/tes?serverTimezone=UTC"></property>
        <property name="driverClassName" value="com.mysql.jdbc.Driver"></property>
    </bean>

    <bean id="jdbcTemplate" class="org.springframework.jdbc.core.JdbcTemplate">
        <constructor-arg name="dataSource"  ref="dataSource"></constructor-arg>
    </bean>

    <bean id="transactionManager" class="org.springframework.jdbc.datasource.DataSourceTransactionManager">
        <property name="dataSource" ref="dataSource"></property>
    </bean>

    <bean id="bookService" class="com.test.tx.service.BookService">
        <property name="bookDao" ref="bookDao"></property>
    </bean>

    <bean id="bookDao" class="com.test.tx.dao.BookDao">
        <property name="jdbcTemplate" ref="jdbcTemplate"></property>
    </bean>

    <aop:config>
        <aop:pointcut id="txPoint" expression="execution(* com.test.tx.*.*.*(..))"></aop:pointcut>
        <aop:advisor advice-ref="myAdvice" pointcut-ref="txPoint"></aop:advisor>
    </aop:config>

    <tx:advice id="myAdvice" transaction-manager="transactionManager">
        <tx:attributes>
            <tx:method name="*"/>
            <tx:method name="update" propagation="REQUIRED"></tx:method>
            <tx:method name="checkout" propagation="REQUIRED"></tx:method>
        </tx:attributes>
    </tx:advice>
</beans>
```

BookService

```java
public class BookService {

    public BookDao bookDao;

    public BookDao getBookDao() {
        return bookDao;
    }

    public void setBookDao(BookDao bookDao) {
        this.bookDao = bookDao;
    }

    public void checkout(User user){

    }

    public void addUser(User user) {
        bookDao.addUser(user);
    }
}
```

BookDao

```java
public class BookDao {

    private JdbcTemplate jdbcTemplate;

    public void addUser(User user){
        String sql = "INSERT INTO user VALUES (?,?,?,?,?)";
        jdbcTemplate.update(sql,user.getId(),user.getName(),user.getPassword(),user.getAge(),user.getDeleteFlag());
    }

    public JdbcTemplate getJdbcTemplate() {
        return jdbcTemplate;
    }

    public void setJdbcTemplate(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }
}
```

Test

```java
public static void main(String[] args) {
	ApplicationContext ac = new ClassPathXmlApplicationContext("tx.xml");
    BookService bookService = ac.getBean(BookService.class);
    User user  = new User();
    user.setId(3);
    user.setName("sss");
    user.setPassword("123");
    user.setAge(12);
    user.setDeleteFlag(1);
    bookService.addUser(user);
}
```

## 注解分析案例

TransactionConfig

```java
@Configuration
@EnableTransactionManagement
public class TransactionConfig {
    private String driverClassName = "com.mysql.jdbc.Driver";
    private String url = "jdbc:mysql://localhost:3306/tes?serverTimezone=UTC";
    private String username = "root";
    private String password = "root";

    @Bean
    public DataSource dataSource(){
        DruidDataSource dataSource = new DruidDataSource();
        dataSource.setDriverClassName(driverClassName);
        dataSource.setUrl(url);
        dataSource.setUsername(username);
        dataSource.setPassword(password);
        return dataSource;
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }

    @Bean
    public PlatformTransactionManager transactionManager(DataSource dataSource) {
        return new DataSourceTransactionManager(dataSource);
    }

    @Bean
    public BookDao bookDao(){
        return new BookDao();
    }

    @Bean
    public IBookService bookService(){
        return new BookService();
    }

    @Bean
    public AccountDao accountDao(){
        return new AccountDao();
    }

    @Bean
    public IAccountService accountService(){
        return new AccountService();
    }
}
```

BookService

```java
public class BookService implements IBookService {

    @Autowired
    public BookDao bookDao;

    @Autowired
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
    @Transactional
    public void addUser(User user) {
        bookDao.addUser(user);
        //int i = 1 / 0;
    }

    @Override
    @Transactional
    public void addUserV2(User user) {
        bookDao.addUser(user);
        Account account = new Account();
        account.setId(user.getId());
        accountService.addAccount(account);
    }
}
```

AccountService

```java
public class AccountService implements IAccountService {

    @Autowired
    public AccountDao accountDao;

    @Override
    @Transactional
    public void addAccount(Account account) {
        accountDao.addAccount(account);
    }

    public AccountDao getAccountDao() {
        return accountDao;
    }

    public void setAccountDao(AccountDao accountDao) {
        this.accountDao = accountDao;
    }
}
```

AnnotationTransactionTest

```java
public class AnnotationTransactionTest {

    public static void main(String[] args) {
        AnnotationConfigApplicationContext annotationConfigApplicationContext = new AnnotationConfigApplicationContext(TransactionConfig.class);
        IBookService bookService = annotationConfigApplicationContext.getBean(IBookService.class);
        User user  = new User();
        user.setId(3);
        user.setName("sss");
        user.setPassword("123");
        user.setAge(12);
        user.setDeleteFlag(1);
        bookService.addUser(user);

    }
}
```

其他代码和xml相同，省略

**后续的spring事务流程中都会以此案例为基准进行分析**
