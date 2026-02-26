---
slug: /damai-ai/assistant/function-adaptive
---

# Function深度适配

import VipInline from '@site/src/components/VipInline';

上一章节实现了推荐节目演唱会的功能后，此章节实现其余的功能

## 根据条件查询节目
org.javaup.ai.ai.function.AiProgram

```java
@Tool(description = "根据条件查询节目")
public List<ProgramSearchVo> selectProgramList(@ToolParam(description = "查询的条件", required = true) ProgramSearchFunctionDto programSearchFunctionDto){
    return programCall.search(programSearchFunctionDto);
}
```

参数

```java
@Data
public class ProgramSearchFunctionDto {

    @ToolParam(required = false, description = "节目演出城市")
    private String cityName;

    @ToolParam(required = false, description = "节目艺人或者节目明星")
    private String actor;

    @ToolParam(required = false, description = "节目演出时间")
    private Date showTime;
}
```



org.javaup.ai.ai.function.call.ProgramCall

```java
public List<ProgramSearchVo> search(ProgramSearchFunctionDto programSearchFunctionDto){
    LambdaEsQueryWrapper<ProgramSearchVo> wrapper = EsWrappers.lambdaQuery(ProgramSearchVo.class)
            .eq(StringUtil.isNotEmpty(programSearchFunctionDto.getCityName()), ProgramSearchVo::getAreaName, programSearchFunctionDto.getCityName())
            .eq(StringUtil.isNotEmpty(programSearchFunctionDto.getActor()), ProgramSearchVo::getActor, programSearchFunctionDto.getActor())
            .ge(Objects.nonNull(programSearchFunctionDto.getShowTime()), ProgramSearchVo::getShowTime, programSearchFunctionDto.getShowTime());
    return programMapper.selectList(wrapper);
}
```

## 根据条件查询节目和演唱会的详情
```java
@Tool(description = "根据条件查询节目和演唱会的详情")
public ProgramDetailVo detail(@ToolParam(description = "查询的条件", required = true) ProgramSearchFunctionDto programSearchFunctionDto){
    return selectTicketCategory(programSearchFunctionDto);
}
```

参数

```java
@Data
public class ProgramSearchFunctionDto {

    @ToolParam(required = false, description = "节目演出城市")
    private String cityName;

    @ToolParam(required = false, description = "节目艺人或者节目明星")
    private String actor;

    @ToolParam(required = false, description = "节目演出时间")
    private Date showTime;
}
```

```java
public ProgramDetailVo selectTicketCategory(@ToolParam(description = "查询的条件", required = true) ProgramSearchFunctionDto programSearchFunctionDto){
    //从es中查询节目
    List<ProgramSearchVo> programSearchVoList = programCall.search(programSearchFunctionDto);
    if (CollectionUtil.isEmpty(programSearchVoList)) {
        return null;
    }
    //如果查询到多个节目，默认取第一个
    ProgramSearchVo programSearchVo = programSearchVoList.get(0);
    ProgramDetailDto programDetailDto = new ProgramDetailDto();
    programDetailDto.setId(programSearchVo.getId());
    //调用大麦系统查询节目详情
    ProgramDetailResultVo programDetailResultVo = programCall.detail(programDetailDto);
    if (Objects.isNull(programDetailResultVo.getData())) {
        return null;
    }
    ProgramDetailVo programDetailVo = programDetailResultVo.getData();
    TicketCategoryListByProgramDto ticketCategoryListByProgramDto = new TicketCategoryListByProgramDto();
    ticketCategoryListByProgramDto.setProgramId(programDetailVo.getId());
    //调用大麦系统查询节目对应的票档信息
    List<TicketCategoryDetailVo> ticketCategoryDetailVoList = ticketCategoryCall.selectListByProgram(ticketCategoryListByProgramDto);
    Map<Long, TicketCategoryDetailVo> ticketCategoryDetailMap = ticketCategoryDetailVoList.stream()
            .collect(Collectors.toMap(TicketCategoryDetailVo::getId,
                    ticketCategoryDetailVo -> ticketCategoryDetailVo,
                    (v1, v2) -> v2));
    for (TicketCategoryVo ticketCategoryVo : programDetailVo.getTicketCategoryVoList()) {
        TicketCategoryDetailVo ticketCategoryDetailVo = ticketCategoryDetailMap.get(ticketCategoryVo.getId());
        if (Objects.nonNull(ticketCategoryDetailVo)) {
            //余票数
            ticketCategoryVo.setRemainNumber(ticketCategoryDetailVo.getRemainNumber());
            //总票
            ticketCategoryVo.setTotalNumber(ticketCategoryDetailVo.getTotalNumber());
        }
    }
    return programDetailVo;
}
```



当时在大麦项目中，存储到 ElasticSearch 中的节目数据只是保留了主页和分页显示需要的数据，所以要想查询节目详情就不能直接从 ElasticSearch 查询了，要调用大麦项目的节目详情方法，用http调用就可以了

```java
public ProgramDetailResultVo detail(ProgramDetailDto programDetailDto) {
    String result = HttpRequest.post(PROGRAM_DETAIL_URL)
            .header("no_verify", "true")
            .body(JSON.toJSONString(programDetailDto))
            .timeout(20000)
            .execute().body();
    ProgramDetailResultVo programDetailResultVo = JSON.parseObject(result, ProgramDetailResultVo.class);
    if (!Objects.equals(programDetailResultVo.getCode(), BaseCode.SUCCESS.getCode())) {
        throw new RuntimeException("调用大麦系统查询节目失败");
    }
    return programDetailResultVo;
}
```



获得了详情后，还需要去大麦项目调用对应的票档信息

```java
@Component
public class TicketCategoryCall {

    public List<TicketCategoryDetailVo> selectListByProgram(TicketCategoryListByProgramDto ticketCategoryListByProgramDto) {
        String result = HttpRequest.post(TICKET_LIST_URL)
                .header("no_verify", "true")
                .body(JSON.toJSONString(ticketCategoryListByProgramDto))
                .timeout(20000)
                .execute().body();
        TicketCategoryListResultVo ticketCategoryListResultVo = JSON.parseObject(result, TicketCategoryListResultVo.class);
        if (!Objects.equals(ticketCategoryListResultVo.getCode(), BaseCode.SUCCESS.getCode())) {
            throw new RuntimeException("调用大麦系统查询票档信息失败");
        }
        if (CollectionUtil.isEmpty(ticketCategoryListResultVo.getData())) {
            throw new RuntimeException("票档信息不存在");
        }
        return ticketCategoryListResultVo.getData();
    }
}
```

## 根据条件查询节目和演唱会的票档信息
```java
@Tool(description = "根据条件查询节目和演唱会的票档信息")
public ProgramDetailVo selectTicketCategory(@ToolParam(description = "查询的条件", required = true) ProgramSearchFunctionDto programSearchFunctionDto){
    //从es中查询节目
    List<ProgramSearchVo> programSearchVoList = programCall.search(programSearchFunctionDto);
    if (CollectionUtil.isEmpty(programSearchVoList)) {
        return null;
    }
    //如果查询到多个节目，默认取第一个
    ProgramSearchVo programSearchVo = programSearchVoList.get(0);
    ProgramDetailDto programDetailDto = new ProgramDetailDto();
    programDetailDto.setId(programSearchVo.getId());
    //调用大麦系统查询节目详情
    ProgramDetailResultVo programDetailResultVo = programCall.detail(programDetailDto);
    if (Objects.isNull(programDetailResultVo.getData())) {
        return null;
    }
    ProgramDetailVo programDetailVo = programDetailResultVo.getData();
    TicketCategoryListByProgramDto ticketCategoryListByProgramDto = new TicketCategoryListByProgramDto();
    ticketCategoryListByProgramDto.setProgramId(programDetailVo.getId());
    //调用大麦系统查询节目对应的票档信息
    List<TicketCategoryDetailVo> ticketCategoryDetailVoList = ticketCategoryCall.selectListByProgram(ticketCategoryListByProgramDto);
    Map<Long, TicketCategoryDetailVo> ticketCategoryDetailMap = ticketCategoryDetailVoList.stream()
            .collect(Collectors.toMap(TicketCategoryDetailVo::getId,
                    ticketCategoryDetailVo -> ticketCategoryDetailVo,
                    (v1, v2) -> v2));
    for (TicketCategoryVo ticketCategoryVo : programDetailVo.getTicketCategoryVoList()) {
        TicketCategoryDetailVo ticketCategoryDetailVo = ticketCategoryDetailMap.get(ticketCategoryVo.getId());
        if (Objects.nonNull(ticketCategoryDetailVo)) {
            //余票数
            ticketCategoryVo.setRemainNumber(ticketCategoryDetailVo.getRemainNumber());
            //总票
            ticketCategoryVo.setTotalNumber(ticketCategoryDetailVo.getTotalNumber());
        }
    }
    return programDetailVo;
}
```

在查询项目中已经讲解过了，这里就不再赘述了



## 生成订单
参数：

```java
@Data
public class CreateOrderFunctionDto {
    
    @ToolParam(required = true, description = "节目演出城市")
    private String cityName;
    
    @ToolParam(required = true, description = "节目艺人或者节目明星")
    private String actor;
    
    @ToolParam(required = false, description = "节目演出时间")
    private Date showTime;
    
    @ToolParam(required = true, description = "用户手机号")
    private String mobile;
    
    @ToolParam(required = true, description = "购票人证件号码列表")
    private List<String> ticketUserNumberList;;
    
    @ToolParam(required = true, description = "节目的票档价位")
    private BigDecimal ticketCategoryPrice;
    
    @ToolParam(required = true, description = "节目的票档购买数量")
    private Integer ticketCount;
}
```

```java
@Tool(description = "生成用户购买节目的订单，返回订单号")
public CreateOrderVo createOrder(@ToolParam(description = "查询的条件", required = true) CreateOrderFunctionDto createOrderFunctionDto){
    ProgramSearchFunctionDto programSearchFunctionDto = new ProgramSearchFunctionDto();
    BeanUtils.copyProperties(createOrderFunctionDto, programSearchFunctionDto);
    //查询节目
    ProgramDetailVo programDetailVo = selectTicketCategory(programSearchFunctionDto);
    if (Objects.isNull(programDetailVo)) {
        throw new RuntimeException("没有查询到节目，请检查查询条件是否正确");
    }
    //调用大麦系统查询用户信息
    UserDetailVo userDetailVo = userCall.userDetail(createOrderFunctionDto.getMobile());
    if (Objects.isNull(userDetailVo)) {
        throw new RuntimeException("用户信息不存在");
    }
    //调用大麦系统查询购票人信息
    List<TicketUserVo> ticketUserVoList = userCall.ticketUserList(userDetailVo.getId());
    if (CollectionUtil.isEmpty(ticketUserVoList)) {
        throw new RuntimeException("购票人信息不存在");
    }
    List<TicketUserVo> ticketUserVoFilterList = new ArrayList<>();
    for (final TicketUserVo ticketUserVo : ticketUserVoList) {
        for (final String number : createOrderFunctionDto.getTicketUserNumberList()) {
            String ticketUserNumberFirst = StringUtil.getFirstN(ticketUserVo.getIdNumber(),4);
            String ticketUserNumberLast = StringUtil.getLastN(ticketUserVo.getIdNumber(),4);
            
            String paramNumberFirst = StringUtil.getFirstN(number,4);
            String paramNumberLast = StringUtil.getLastN(number,4);
            //如果购票人身份证号的前4位和后4位与传入的购票人信息一致，则认为是同一个人
            if (ticketUserNumberFirst.equals(paramNumberFirst) && ticketUserNumberLast.equals(paramNumberLast)) {
                ticketUserVoFilterList.add(ticketUserVo);
            }
        }
    }
    //如果购票人信息不完整，则抛出异常
    if (ticketUserVoFilterList.size() != createOrderFunctionDto.getTicketUserNumberList().size()) {
        throw new RuntimeException("购票人信息不完整，请检查购票人信息是否正确");
    }
    Long ticketCategoryId = null;
    for (final TicketCategoryVo ticketCategoryVo : programDetailVo.getTicketCategoryVoList()) {
        //如果传入的票档价格与节目对应的票档价格一致，那就就用此票档生成订单
        if (createOrderFunctionDto.getTicketCategoryPrice().compareTo(ticketCategoryVo.getPrice()) == 0) {
            ticketCategoryId = ticketCategoryVo.getId();
            break;
        }
    }
    if (Objects.isNull(ticketCategoryId)) {
        throw new RuntimeException("没有查询到对应的票档信息");
    }
    //调用大麦系统创建订单
    ProgramOrderCreateDto programOrderCreateDto = new ProgramOrderCreateDto();
    programOrderCreateDto.setProgramId(programDetailVo.getId());
    programOrderCreateDto.setUserId(userDetailVo.getId());
    programOrderCreateDto.setTicketUserIdList(ticketUserVoFilterList.stream().map(TicketUserVo::getId).collect(Collectors.toList()));
    programOrderCreateDto.setTicketCategoryId(ticketCategoryId);
    programOrderCreateDto.setTicketCount(createOrderFunctionDto.getTicketCount());
    String orderNumber = orderCall.createOrder(programOrderCreateDto);
    CreateOrderVo createOrderVo = new CreateOrderVo();
    createOrderVo.setOrderNumber(orderNumber);
    createOrderVo.setOrderListAddress(ORDER_LIST_ADDRESS);
    return createOrderVo;
}
```



生成订单的代码注释写的非常详细了，流程也并不复杂


<VipInline />