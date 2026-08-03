---
slug: /super-agent/document-upload-parsing/python-routing-and-document-mind-execution
title: "Python 解析路由与 Document Mind 执行：Python文档解析、OCR详解"
sidebar_label: "Python 解析路由与 Document Mind 执行"
pagination_label: "Python 解析路由与 Document Mind 执行"
description: "按 parse_document 的真实执行顺序讲解 Base64 解码、文件类型归一化、本地解析与阿里云 Document Mind 路由，以及云任务提交、轮询、分页取回和 layout 标准化。内容进一步围绕Python文档解析、NativeTextParser、AliyunDocMindParser、OCR、云…"
keywords: [Python文档解析, parse_document, NativeTextParser, AliyunDocMindParser, OCR, layout, Document Mind, 云解析, 文件类型路由]
---

# Python 解析路由与 Document Mind 执行

Python 收到的请求包含文件名、MIME、Java 文件类型和 Base64 内容。它不会对所有格式套同一个解析器，而是先按文件类型做固定路由，再让两条路线在统一 blocks/artifacts 协议处汇合。

## 两条解析路线

| 路线 | 文件类型 | provider | 主要能力 |
| --- | --- | --- | --- |
| 本地轻量解析 | TXT、MD、HTML | `native_text` | 文本解码、CommonMark/GFM、HTML 块提取 |
| 云文档解析 | PDF、DOCX、XLSX、PNG、JPG、JPEG、BMP、GIF | `aliyun_docmind` | OCR、版面、阅读顺序、表格、图片、Markdown |

![Python 按文件类型路由到 NativeTextParser 或 AliyunDocMindParser 的解析流程图](/img/nexus-agent-pro/讲解/37-文档上传与异步解析/05-Python解析路由与DocumentMind执行.drawio.png)

## parse_document 先恢复原始输入

主函数开头：

```python
def parse_document(request: DocumentParseRequest) -> DocumentParseResponse:
    """把一个跨语言解析请求转换为稳定的统一响应。

    执行顺序固定为：恢复字节 → 确定类型 → 拒绝不支持格式 → 选择 parser →
    执行 provider → 规范 blocks → 组装正文、统计、trace 和 artifacts。
    任何一步失败都会抛出 HTTPException 或原始异常，不返回“半成功”响应。
    """
    # 只用单调时钟统计当前请求总耗时；它不会进入业务时间字段。
    started = time.perf_counter()

    # ---------- 1. 恢复跨语言输入 ----------
    # Java 在 JSON 中传 Base64；严格解码可以在进入 parser 前挡住损坏或被截断的内容。
    content = _decode_content(request.content_base64)

    # 文件类型解析会综合 Java fileType、文件名后缀和 MIME，并统一成大写规范值。
    file_type = _resolve_file_type(request.file_name, request.file_type, request.mime_type)

    # ---------- 2. 先处理有明确升级路径的旧 Office 格式 ----------
    # 这里故意给出比“不支持”更具体的操作建议，不会尝试用新格式解析器硬读旧格式。
    if file_type == "XLS":
        raise HTTPException(status_code=422, detail="XLS 解析未启用，请先转为 XLSX 后上传。")
    if file_type == "DOC":
        raise HTTPException(status_code=422, detail="DOC 解析未启用，请先转为 DOCX 后上传。")

    # ---------- 3. 使用确定性类型表选择 parser ----------
    parser = _parser_for_file_type(file_type)

    # 返回 None 说明既不属于本地文本集合，也不属于 Document Mind 集合；解析在产生副作用前终止。
    if parser is None:
        raise HTTPException(status_code=422, detail=f"不支持的文件类型: {file_type or 'UNKNOWN'}")
```

`_decode_content()` 使用严格 Base64 校验：

```python
def _decode_content(content_base64: str) -> bytes:
    """严格恢复 Java 请求中的二进制内容，并把输入问题映射成可读的 422。"""
    # 空字符串不是合法的“空文件成功”，而是跨语言请求缺少必需内容。
    if not content_base64:
        raise HTTPException(status_code=422, detail="contentBase64 不能为空。")
    try:
        # validate=True 会拒绝非法字符和错误 padding；默认宽松解码可能悄悄忽略脏字符。
        return base64.b64decode(content_base64, validate=True)
    except Exception as exception:
        # 用 from exception 保留底层解码原因，同时给 Java 返回稳定、可理解的业务细节。
        raise HTTPException(status_code=422, detail="contentBase64 不是合法 Base64。") from exception
```

不是合法 Base64 时直接 422，不会拿错误字节继续做 OCR。

文件类型优先采用 Java 明确传来的 `fileType`；它为空时才看后缀，最后才用 `text/*` MIME 兜底 TXT。这样 Java/Python 正常情况下使用同一类型，独立调用 Python 时仍有推断能力。

### DOC 和 XLS 是显式拒绝，不是自动降级

代码对旧 Office 格式专门返回 422。它没有偷偷把 DOC 当 DOCX，也没有把 XLS 当 XLSX，更不会回退成乱码文本。用户需要先转换格式后重新上传。

## 固定类型路由

```python
def _parser_for_file_type(file_type: str):
    """按规范文件类型返回唯一 parser；不做试错式 fallback。"""
    # 纯文本类格式本地解析，避免无意义地依赖 OCR、网络和外部云服务。
    if file_type in NATIVE_TEXT_FILE_TYPES:
        return _native_text_parser()

    # 需要版面、表格、图片或 OCR 识别的格式固定交给阿里云 Document Mind。
    if file_type in ALIYUN_DOCMIND_FILE_TYPES:
        return _parser()

    # 调用方据此返回 422；这里不偷偷选一个“看起来可能能用”的 parser。
    return None
```

这是确定性路由，不是“先云解析，失败后试本地”，也不是由 LLM 猜解析器。这样同一种文件在相同配置下会走同一 provider，解析 trace 和产物更容易复现。

## 轻量文本路线

`NativeTextParser.parse()` 再按三种格式分支：

```python
def parse(self, content: bytes, file_type: str, request: DocumentParseRequest) -> DocMindParseResult:
    """执行无需外部云服务的确定性文本解析。"""
    # Markdown 必须优先保留语法事实，不能先转成纯文本再尝试恢复标题和表格关系。
    if file_type == "MD":
        # 先按候选编码解码 bytes，再建立包含 source hash 和 UTF-8 span 的无损语法树。
        syntax = parse_markdown_syntax(_decode_text(content), "SOURCE_MARKDOWN")

        # 扁平 blocks 是 Java 业务视图；syntax 仍一并返回，供 Java 二次校验和结构投影。
        blocks = markdown_syntax_to_blocks(syntax, self.provider_name)
        return DocMindParseResult(blocks=blocks, markdown_syntax=syntax)
    elif file_type == "TXT":
        # 普通文本按编码候选解码、空行切段和标题启发式生成 blocks。
        blocks = _parse_plain_text(content, parser_name=self.provider_name)
    elif file_type == "HTML":
        # HTML 走结构化标签解析，不把标签原文当成普通文本，也不发送给 OCR。
        blocks = _parse_html(content)
    else:
        # 这是 parser 内部的防御边界：即使上层路由未来写错，也不能静默解析未知格式。
        raise HTTPException(status_code=422, detail=f"native_text 当前不支持文件类型: {file_type or 'UNKNOWN'}")

    # TXT/HTML 没有 SOURCE_MARKDOWN 契约，只返回统一 blocks；后续汇合逻辑完全相同。
    return DocMindParseResult(blocks=blocks)
```

- Markdown 保留完整语法树、源码 hash 和 source span，下一篇详细展开。
- TXT 先尝试 UTF-8、UTF-8 BOM 和 GB18030，再按空行拆段，并用标题启发式标成 `TITLE/TEXT`。
- HTML 使用 `_HtmlBlockParser` 提取结构块，不把 HTML 交给 OCR。

本地路线不要求阿里云 SDK 和凭证。即使 Document Mind 没配置，Markdown/TXT/HTML 仍然可以解析。

## Document Mind 路线先检查可用性

`AliyunDocMindParser.parse()` 在发云请求前检查类型、SDK 和访问凭证：

```python
def parse(self, content: bytes, file_type: str, request: DocumentParseRequest) -> DocMindParseResult:
    """同步编排一次 Document Mind 异步供应商任务，并返回统一解析事实。"""
    # 第一层校验 provider 能力表，防止上层路由错误地把本 provider 不支持的类型传进来。
    if file_type not in self.supported_file_types:
        raise HTTPException(status_code=422, detail=f"阿里云 Document Mind 当前不支持文件类型: {file_type or 'UNKNOWN'}")

    # 第二层校验运行条件：is_available() 只检查 SDK 能否导入，
    # 以及 AccessKeyId/AccessKeySecret 两项凭证是否存在；不可用时返回 503。
    if not self.is_available():
        raise HTTPException(status_code=503, detail=f"阿里云 Document Mind 不可用: {self.unavailable_reason()}")

    # trace 先记录不依赖供应商响应的输入事实；后面会继续追加 jobId、耗时、轮询和批次数。
    trace: dict[str, Any] = {
        "providerName": self.provider_name,
        "providerVersion": self.provider_version,
        "fileType": file_type,
        "fileName": request.file_name,
        "fileSizeBytes": len(content or b""),
    }

    # _client() 在通过可用性校验后创建/取得 SDK client；凭证不会写入 trace。
    client = self._client()

    # 注意两层异步：供应商接口是 submit/poll 异步模型，但当前 Python HTTP 请求会同步编排到最终结果。
    # 完整顺序是：提交拿 jobId → 轮询终态 → 分页拉 layout → 规范化为 blocks/artifacts。
```

云解析不可用时返回 503，**不会回退到 native_text**。这是为了避免 PDF/DOCX 在缺 OCR/layout 能力时被粗暴压成低质量文本，还让上层误以为解析成功。

## 第一步：提交云解析任务

```python
# 没有原文件名时构造一个可提交的安全兜底名；扩展名仍使用已规范化的 file_type。
safe_file_name = file_name or f"document.{file_type.lower()}"

# BytesIO 把内存 bytes 包装成 SDK 需要的文件流；with 结束后立即释放流对象。
with BytesIO(content) as file_stream:
    # 提交请求同时携带文件、格式和增强选项；这些选项会直接影响供应商输出契约。
    submit_request = docmind_models.SubmitDocParserJobAdvanceRequest(
        file_url_object=file_stream,
        file_name=safe_file_name,
        file_name_extension=self._file_extension(safe_file_name, file_type),
        formula_enhancement=self._formula_enhancement(),
        llm_enhancement=self._llm_enhancement(),
        enhancement_mode=self._enhancement_mode() if self._llm_enhancement() else None,
        output_format=self._output_formats(),
        output_html_table=self._output_html_table(),
        need_header_footer=self._need_header_footer(),
        page_index=self._page_index() or None,
    )
    try:
        # 这一步只“创建云任务”，正常响应还必须检查业务 code 并提取 jobId，尚未取得解析结果。
        response = client.submit_doc_parser_job_advance(submit_request, self._runtime_options(util_models))
    except Exception as exception:
        # SDK、鉴权、网络或供应商可用性错误属于上游服务不可用，统一映射为 503。
        raise HTTPException(status_code=503, detail=f"阿里云 Document Mind 提交解析任务失败: {exception}") from exception

# with 结束后内存流已关闭，但 SDK 响应已经在 response 中；下面开始校验供应商业务协议。
body = _tea_model_to_map(getattr(response, "body", response))

# HTTP/SDK 调用没抛错不等于业务成功；非成功 code 统一映射为上游坏响应 502。
code = str(body.get("Code") or body.get("code") or "")
if code and code not in {"200", "OK", "Success", "success"}:
    raise HTTPException(status_code=502, detail=f"阿里云 Document Mind 提交失败: {body.get('Message') or body.get('message') or code}")

# jobId 是后续轮询和分页取结果的唯一关联键，同时兼容 Data/data 两种字段风格。
job_id = _deep_get(body, "Data", "Id") or _deep_get(body, "data", "id")
if not job_id:
    # 供应商即使返回成功 code，没有 jobId 也无法继续，不能当作半成功。
    raise HTTPException(status_code=502, detail="阿里云 Document Mind 提交成功但未返回 jobId。")
return str(job_id)
```

当前 `rag-tools.yaml` 默认打开：

- `llmEnhancement: true`；
- `enhancementMode: VLM`；
- `formulaEnhancement: true`；
- `outputHtmlTable: true`；
- 输出 `markdown,visualLayoutInfo`。

SDK 返回后，代码检查业务 code，并从 `Data.Id` 取 `jobId`。提交响应没有 jobId 时即使 HTTP 成功也会判为 502，因为后面无法轮询。

## 第二步：同步轮询云任务

```python
# deadline 使用单调时钟，系统时间被校准不会让轮询提前结束或无限延长。
deadline = time.monotonic() + self._timeout_seconds()

# last_payload 在超时时进入错误详情，帮助看清供应商最后停在哪个状态。
last_payload: dict[str, Any] = {}
poll_count = 0

# Python HTTP 请求会在这里同步等待云任务；相对用户上传请求的异步性由外层 Java Kafka 任务提供。
while time.monotonic() < deadline:
    try:
        # 每轮只查询同一个 jobId，不重新提交任务，避免重复计费和产生多个供应商作业。
        response = client.query_doc_parser_status(docmind_models.QueryDocParserStatusRequest(id=job_id))
    except Exception as exception:
        raise HTTPException(status_code=503, detail=f"阿里云 Document Mind 查询解析状态失败: {exception}") from exception

    # 计数在请求成功后增加，用于 trace 判断实际发生了多少次有效轮询。
    poll_count += 1

    # Tea SDK 模型先转换成普通 dict，后面的大小写兼容和 artifact JSON 才能统一处理。
    payload = _tea_model_to_map(getattr(response, "body", response))
    last_payload = payload

    # 同时兼容供应商不同版本可能返回的 Data/data 和 Status/status。
    status = str(_deep_get(payload, "Data", "Status") or _deep_get(payload, "data", "status") or "").lower()
    code = str(payload.get("Code") or payload.get("code") or "")

    # HTTP/SDK 调用成功但业务 code 失败属于上游坏响应，不能继续当作“仍在处理中”。
    if code and code not in {"200", "OK", "Success", "success"}:
        raise HTTPException(status_code=502, detail=f"阿里云 Document Mind 状态查询失败: {payload.get('Message') or payload.get('message') or code}")

    # 多组拼写被归一到成功终态；一旦成功立即返回最后 payload 和累计轮询次数。
    if status in {"success", "finished", "finish", "succeeded", "completed", "complete"}:
        return payload, poll_count

    # 明确失败终态不能继续轮询到超时，否则会掩盖供应商已经给出的失败原因。
    if status in {"fail", "failed", "error"}:
        raise HTTPException(status_code=502, detail=f"阿里云 Document Mind 解析失败: {payload.get('Message') or payload.get('message') or status}")

    # 只有非终态才睡眠，控制供应商查询频率；成功/失败不会额外等待一个间隔。
    time.sleep(self._poll_interval_seconds())

# 到达 deadline 仍无终态属于网关等待超时，返回 504，并保留 jobId 与最后状态用于排障。
raise HTTPException(status_code=504, detail=f"阿里云 Document Mind 解析超时: jobId={job_id}, lastStatus={last_payload}")
```

默认供应商超时 600 秒、轮询间隔 3 秒。成功状态和失败状态都兼容了多种拼写；到 deadline 仍没有终态，返回 504，并把最后一次状态放进错误信息。

## 第三步：分页拉取 layout

Document Mind 的结果可能很多，不能只取第一页：

```python
# 累积所有批次的 layout；Java 只接收合并后的统一结果，不处理供应商分页。
all_layouts: list[dict[str, Any]] = []

# 第一批 payload 还包含 Markdown、元数据等非 layout 字段，最终要以它为载体合并全量结果。
first_payload: dict[str, Any] | None = None

# step_size 是每次窗口大小；max_result_pages 则提供硬上限，防止供应商异常分页导致无限请求。
step_size = self._layout_step_size()
result_batch_count = 0

# layout_num 是窗口起点；空页或不足一个窗口都表示结果已经取完。
for layout_num in range(0, self._max_result_pages() * step_size, step_size):
    # 同一个 jobId 按 [layout_num, layout_num + step_size) 窗口取结果。
    get_request = docmind_models.GetDocParserResultRequest(
        id=job_id,
        layout_num=layout_num,
        layout_step_size=step_size,
    )
    try:
        response = client.get_doc_parser_result(get_request)
    except Exception as exception:
        # 传输/SDK 失败说明当前批次没有可靠取得，不能返回之前批次组成的半份文档。
        raise HTTPException(status_code=503, detail=f"阿里云 Document Mind 拉取解析结果失败: {exception}") from exception

    payload = _tea_model_to_map(getattr(response, "body", response))

    # 只保存第一份完整 payload，后续批次主要贡献额外 layouts。
    if first_payload is None:
        first_payload = payload
    code = str(payload.get("Code") or payload.get("code") or "")
    if code and code not in {"200", "OK", "Success", "success"}:
        raise HTTPException(status_code=502, detail=f"阿里云 Document Mind 结果查询失败: {payload.get('Message') or payload.get('message') or code}")
    data = _docmind_data(payload)
    layouts = _extract_docmind_layouts(data)

    # 空窗口是正常结束信号，不算供应商失败。
    if not layouts:
        break

    # 只有实际拿到 layout 的批次才计数并合并。
    result_batch_count += 1
    all_layouts.extend(layouts)

    # 不足 step_size 说明这是最后一页；继续请求只会得到空窗口。
    if len(layouts) < step_size:
        break
```

传输或 SDK 调用异常返回 503；HTTP 调用成功但供应商业务 code 失败则返回 502。循环的正常终止条件有两个：返回空 layout，或当前批次小于窗口大小。最后把所有 layout 合并回第一份响应 payload，供标准化和原始 artifact 留档使用。

## 第四步：layout 映射为统一 block

`_result_to_blocks()` 优先使用 layout，因为它保留页码、bbox、表格和阅读顺序：

```python
# 先从大小写可能不同的供应商 payload 中取得标准 data 区域。
data = _docmind_data(result_payload)

# Markdown 是可复现产物和 layout 缺失时的兜底事实；layouts 是版面投影的首选来源。
markdown = _extract_docmind_markdown(data)
layouts = _extract_docmind_layouts(data)
warnings: list[str] = []

# 优先保留供应商 layout，因为它携带页码、bbox、表格单元格和阅读顺序。
# 只有完全没有 layout、但仍有 Markdown 时，才从供应商 Markdown 建基础 blocks。
if not layouts and markdown:
    # sourceKind 明确标成 PROVIDER_MARKDOWN，不能冒充用户上传的原始 Markdown。
    syntax = parse_markdown_syntax(markdown, "PROVIDER_MARKDOWN")
    return markdown_syntax_to_blocks(syntax, self.provider_name), syntax, warnings

blocks: list[DocumentBlock] = []
for index, layout in enumerate(layouts, start=1):
    # index 从 1 开始，给没有稳定供应商编号的 layout 提供确定性阅读顺序。
    block = _docmind_layout_to_block(layout, index)

    # 无正文、无表格、无法识别类型的 layout 可能返回 None；不能把空壳 block 交给 Java。
    if block is not None:
        blocks.append(block)

    # 只要映射出至少一个 block，就坚持使用 layout 路线，不再混入 Markdown 造成重复内容。
if blocks:
    return blocks, None, warnings

# 第二种兜底情况：供应商虽返回了 layouts，但每个 layout 都因无正文、表格或图片说明而无法映射。
# 此时如果仍有 Markdown，会记录 warning 后用 PROVIDER_MARKDOWN 建基础 blocks。
if markdown:
    warnings.append("阿里云 Document Mind 未返回可映射 layout，已使用 markdown 生成基础 block。")
    syntax = parse_markdown_syntax(markdown, "PROVIDER_MARKDOWN")
    return markdown_syntax_to_blocks(syntax, self.provider_name), syntax, warnings

# layout 和 Markdown 都交付不出可用文本时，才把本次云解析判为 422，不返回空 blocks 伪装成功。
raise HTTPException(status_code=422, detail="阿里云 Document Mind 未返回可用文本或 layout。")
```

Markdown 兜底有两个入口：原始 layout 列表本来就是空，或者 layout 列表不空但全部无法映射成 block。第二种情况会多一条 warning。两条路线生成的语法契约都标记为 `PROVIDER_MARKDOWN`，不会冒充用户上传的原始 Markdown。如果 layout 和 Markdown 都交付不出可用内容，Python 直接返回 422。

单个 layout 映射时会提取：

- `TITLE/TABLE/FIGURE/IMAGE/FORMULA/CODE/HEADER/FOOTER/TEXT` 类型；
- 正文或 caption；
- 表格 HTML 和二维行列；
- 页码、bbox 和 bbox 来源；
- 置信度、原始 layout 类型；
- 表格单元格的行列号、坐标、rowSpan/columnSpan 和 bbox。

这些内容先进入标准 `DocumentBlock`，后面 Java 不需要理解供应商原始字段名。

## 云端原始响应也保留下来

供应商结果标准化后，Python还会生成 `ALIYUN_DOCMIND_JSON`：

```python
# 原始供应商响应也作为 artifact 返回，便于 Java 侧留档和复现解析问题。
# artifact type 和文件后缀都显式标注 aliyun-docmind，避免用户把它误认成规范化 blocks JSON。
artifacts = [
    _artifact(
        "ALIYUN_DOCMIND_JSON",
        f"{_base_name(request.file_name)}.aliyun-docmind.json",
        "application/json;charset=UTF-8",
        # ensure_ascii=False 保留中文可读性；indent=2 便于预览接口直接展示和人工排障。
        json.dumps(response_payload, ensure_ascii=False, indent=2).encode("utf-8"),
        # provider 身份跟随 artifact 保存，后续即使实现切换也能知道这份原始响应来自谁。
        parser_name=self.provider_name,
        parser_version=self.provider_version,
    )
]
```

这样排查“Java 投影错了还是供应商识别错了”时，不必重新调用云服务才能看到当时的原始响应。`jobId`、提交/轮询/取结果耗时、轮询次数和批次数也进入 trace。

## 两条路线在哪里汇合

无论本地还是云解析，最后都回到：

```python
# ---------- provider 分支在这里结束 ----------
# parser_result 可能来自 native_text，也可能来自 aliyun_docmind，但从此统一使用 DocMindParseResult 契约。
parser_result = parser.parse(content, file_type, request)

# Markdown 路线可能额外返回无损语法事实；其他格式通常为 None。
markdown_syntax = parser_result.markdown_syntax

# ---------- 统一 block 后处理 ----------
# 规范 blockNo、类型、正文和 metadata，使 Java 不需要知道每个 provider 的字段差异。
normalized_blocks = _normalize_blocks(parser_result.blocks)

# 在每个 block 上写入实际 provider 身份，而不是 Java 侧的预计 parseMode。
_stamp_parser_metadata(normalized_blocks, parser)

# 为表格及其相邻文本补充上下文，帮助后续 Java 表格投影和切块保持语义。
_apply_table_context(normalized_blocks)
```

:::info 把错误码和失败位置一起记住

这条链不是遇到任何问题都返回一个“解析失败”：

| 状态码 | 典型位置 | 含义 |
| --- | --- | --- |
| `422` | Base64、格式路由、旧 Office 格式 | 调用输入不满足解析契约，换参数或转换文件后再试 |
| `503` | SDK、凭证、提交、轮询网络、分页网络 | Python 当前无法正常使用外部解析服务 |
| `502` | 供应商业务 code、失败终态、坏响应 | Python 已联系到供应商，但供应商返回了失败或不可用结果 |
| `504` | 轮询超过 deadline | 云任务在允许时间内没有进入成功或失败终态 |

Java 最终都会进入 `handleParseRoute()` 的失败收尾，但 Python 日志和 HTTP detail 能告诉我们失败发生在哪一层。排障时不能只看 Java 最外层的“调用 Python 失败”。

:::

从这里往后不再区分两个 provider 的基本处理：都规范 blockNo、sectionPath、canonicalPath、weighted content、trace 和 artifacts。下一篇就从这个汇合点继续，并重点讲 Markdown 为什么多出一份 `markdown-syntax.v1`。
