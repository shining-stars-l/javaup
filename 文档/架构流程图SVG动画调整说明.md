# 架构流程图 SVG 动画调整说明

本文档用于维护首页项目介绍图 `架构流程图(pro)(动态).svg` 的动画效果，覆盖以下内容：

- 虚线沿箭头方向流动；
- 指定图标持续悬浮；
- 指定矩形持续呼吸发光；
- 首页图片四边白边、圆角和阴影；
- Draw.io 重新导出后的动画恢复与验证；
- 常见问题定位。

以下命令默认在项目根目录执行：

```bash
cd /Applications/java/idea_work_my/gitee/javaup-optimize
```

## 1. 文件关系

| 文件 | 作用 | 是否由浏览器直接加载 |
| --- | --- | --- |
| `static/img/super-agent/架构图/架构流程图(pro)(动态).svg` | 最终展示的动态 SVG | 是 |
| `static/img/super-agent/架构图/animate-architecture-svg.mjs` | 动画配置及注入脚本 | 否 |
| `src/pages/index.js` | 首页项目数据及图片引用 | 是 |
| `src/pages/index.module.css` | 首页图片外框、白边、圆角和阴影样式 | 是 |

首页当前引用的是：

```js
image: '/img/super-agent/架构图/架构流程图(pro)(动态).svg',
```

`animate-architecture-svg.mjs` 是离线运行的 Node.js ES 模块，不是网页运行时脚本。它会：

1. 读取 `架构流程图(pro)(动态).svg`；
2. 校验需要动画的节点和虚线路径是否存在；
3. 删除 SVG 内旧的 `<style id="nexus-architecture-motion">`；
4. 插入脚本中最新的动画 CSS；
5. 将结果写回同一个 SVG 文件。

浏览器最终只加载生成后的 SVG，不会加载 `.mjs`。因此，动画参数的可维护源是 `.mjs`，SVG 是注入后的展示结果。

> 不建议直接修改 3 MB 以上 SVG 文件内部的动画 CSS。下次运行注入脚本时，`nexus-architecture-motion` 样式会被脚本重新生成，手工修改会被覆盖。

## 2. 标准调整流程

每次调整动画时，按以下顺序操作：

```text
修改 animate-architecture-svg.mjs
        ↓
运行动画注入脚本
        ↓
更新 架构流程图(pro)(动态).svg
        ↓
强制刷新浏览器或重新构建网站
```

修改脚本后执行：

```bash
node 'static/img/super-agent/架构图/animate-architecture-svg.mjs'
```

正常情况下，控制台会显示类似结果：

```text
Injected motion into 架构流程图(pro)(动态).svg: 16 flowing paths, 13 floating icons, 9 glowing nodes.
```

开发环境预览：

```bash
npm run start
```

浏览器中如果仍然显示旧效果，先执行强制刷新：

```text
Command + Shift + R
```

生产构建验证：

```bash
npm run build
npm run serve
```

> 只修改 `.mjs` 不会改变网页效果，必须重新运行注入脚本。只刷新网页但不运行脚本，也不会产生新动画。

## 2.1 参数联动与覆盖关系速查

这份动画样式中既有“所有元素共用的默认参数”，也有“某一组或某几个元素使用的覆盖参数”。调整默认参数时，需要先确认后面是否还有覆盖规则；否则会出现大部分元素已经变快或变强，但少数元素仍保持旧效果的情况。

| 想调整的效果 | 主要参数 | 必须同步检查的参数 | 原因 |
| --- | --- | --- | --- |
| 所有虚线速度 | `nexus-flow-12 0.7s` | `nexus-flow-15 0.875s` | 两种虚线周期不同，两个时长必须保持 `1.25` 倍比例 |
| 虚线方向 | `stroke-dashoffset: -12` | `stroke-dashoffset: -15` | 两种虚线的方向必须同时改变 |
| 六条共享主干的相位 | 任意一条的 `--nexus-flow-delay` | 另外五条相同路径的延迟 | 相位不同会让重叠虚线看起来像实线 |
| 所有图标悬浮速度 | 默认组 `4.8s` | 交错组 `4.2s`、慢速组 `5.4s` | 后两个分组会覆盖默认时长 |
| 所有图标悬浮范围 | `nexus-icon-float` | `nexus-icon-float-alternate` | 两组图标使用不同关键帧 |
| 所有节点发光速度 | 默认 `1.8s` | `bge_rerank`、`asset_raptor` 的 `2.1s` | 这两个节点有单独的时长覆盖规则 |
| 所有节点发光透明度 | 默认光晕变量 | 青、蓝、绿、紫四个颜色分组的光晕变量 | 当前全部 9 个节点都属于颜色分组，分组变量会覆盖默认变量 |
| 所有节点发光范围 | `nexus-node-glow` 中的三个 `drop-shadow` 半径 | 无额外时长参数 | 这一套关键帧由全部发光节点共用 |
| 发光起始相位 | 各颜色组的 `--nexus-glow-delay` | 不需要同步发光时长 | 延迟只改变起点，不改变速度、强度或范围 |
| 新增悬浮图标 | `floatingIconIds` | 按需加入交错组或慢速组，二选一 | 基础数组负责启用动画，分组负责覆盖运动方式 |
| 新增发光节点 | `glowingNodeIds` | 再加入一个颜色分组 | 基础数组负责启用动画，颜色分组负责光晕颜色和相位 |

CSS 按从上到下的顺序应用。后面选择器命中同一个元素时，会覆盖前面的同名属性。例如：

```css
/* 先给全部发光节点设置默认周期 */
${glowingNodes} {
  animation: nexus-node-glow 1.8s ease-in-out infinite;
}

/* 后面再单独覆盖两个节点的 animation-duration */
[data-cell-id="bge_rerank"] > g:first-child > rect,
[data-cell-id="asset_raptor"] > g:first-child > rect {
  animation-duration: 2.1s;
}
```

最终结果是：普通节点使用 `1.8s`，这两个节点使用 `2.1s`。后面的规则只覆盖持续时间，动画名称、缓动函数和无限循环仍来自前面的默认规则。

> 通用规则：每次改参数后，先在脚本中搜索同一个 CSS 属性名，例如 `animation-duration`、`--nexus-glow-strong`，确认后面没有针对某些节点的覆盖值，然后再运行注入脚本。

## 3. 调整虚线流动速度

在 `animate-architecture-svg.mjs` 的 `motionStyle` 中找到：

```css
g[data-cell-id] path[stroke-dasharray="6 6"] {
  animation: nexus-flow-12 0.7s linear infinite;
}

g[data-cell-id] path[stroke-dasharray="7.5 7.5"] {
  animation: nexus-flow-15 0.875s linear infinite;
}
```

其中：

- `0.7s` 是周期为 `12` 的虚线完成一次循环的时间；
- `0.875s` 是周期为 `15` 的虚线完成一次循环的时间；
- 数值越小，流动越快；
- 数值越大，流动越慢。

当前两类虚线的移动速度是一致的，因为：

```text
12 ÷ 0.7 ≈ 17.14
15 ÷ 0.875 ≈ 17.14
```

调整时建议保持两个时长的比例：

```text
第二个时长 = 第一个时长 × 1.25
```

示例：

| 效果 | `nexus-flow-12` | `nexus-flow-15` |
| --- | ---: | ---: |
| 更快 | `0.5s` | `0.625s` |
| 当前 | `0.7s` | `0.875s` |
| 较慢 | `1s` | `1.25s` |

如果只修改一个时长，两种虚线会出现肉眼可见的速度差。

## 4. 调整虚线流动方向

当前关键帧为：

```css
@keyframes nexus-flow-12 {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -12; }
}

@keyframes nexus-flow-15 {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -15; }
}
```

当前负值方向已经与这张图中路径的箭头方向一致。

如果将来重新从 Draw.io 导出后，路径绘制方向发生变化，导致虚线从箭头端向起点倒流，可以把两个终点值的符号同时改为正值：

```css
to { stroke-dashoffset: 12; }
to { stroke-dashoffset: 15; }
```

注意：

- 两个关键帧的符号要一起改；
- `animation-delay` 只能改变动画起始相位，不能改变流动方向；
- `animation-duration` 只能改变速度，不能改变流动方向；
- 方向正确时不要为了调整速度改 `stroke-dashoffset` 的正负号。

## 5. 调整虚线起始相位

脚本中存在以下配置：

```css
[data-cell-id="mode_to_react"],
[data-cell-id="4wgAXTlb2vV4gLFp7L6X-3"] {
  --nexus-flow-delay: -1.4s;
}
```

`--nexus-flow-delay` 用于让不同路径在页面刚打开时处于不同的动画位置，避免所有虚线完全同步，看起来过于机械。

- `0s`：从关键帧起点开始；
- 负值：页面加载时直接进入动画中间位置；
- 修改延迟不会改变速度；
- 修改延迟不会改变方向。

可以调整的当前相位包括：

```css
--nexus-flow-delay: -1.4s;
--nexus-flow-delay: -2.8s;
--nexus-flow-delay: -4.2s;
--nexus-flow-delay: -5.6s;
--nexus-flow-delay: -7s;
```

如果想让动画更整齐，可以让更多独立路径使用相近的值；如果想让画面更有层次，可以继续错开这些值。

### 六条共用主干路径的特殊规则

以下六条“文档解析与知识构建”分支在图中共享一段很长的重叠主干：

```css
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-1"],
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-2"],
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-3"],
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-4"],
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-6"],
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-7"] {
  --nexus-flow-delay: -1.2s;
}
```

这六条路径必须保持完全相同的 `--nexus-flow-delay`。

可以把六条路径一起从 `-1.2s` 改成其他值，例如一起改成 `-0.8s`；但不能分别设置成不同的值。因为它们的主干位置重叠，如果动画相位不同，一条路径的实线段会填补另一条路径的空白段，叠加后就会再次看起来像实线。

> 核心规则：六条可以一起改，不能分开改。

## 6. 选择哪些图标参与悬浮

脚本顶部的 `floatingIconIds` 决定哪些图标悬浮：

```js
const floatingIconIds = [
  "query_understand_icon",
  "retrieval_plan_icon",
  "python_parse_icon",
  "build_dispatch_icon",
  "channel_graph_icon",
  "channel_raptor_icon",
  "hybrid_fusion_icon",
  "bge_rerank_icon",
  "final_evidence_icon",
  "answer_generation_icon",
  "asset_graph_icon",
  "asset_raptor_icon",
  "react_tools_icon",
];
```

操作规则：

- 删除某个字符串：该图标不再悬浮；
- 加入一个新的 `data-cell-id`：该图标参与悬浮；
- 这里应填写图标本身的 ID，而不是外层矩形卡片的 ID；
- 新 ID 必须在 SVG 中只存在一次，否则脚本会停止并报错；
- 新图标应先加入 `floatingIconIds`，再按需加入速度分组。

例如，让 `query_understand_icon` 停止悬浮，只需从数组删除这一项，然后重新运行注入脚本。

### 悬浮速度分组

所有悬浮图标的基础时长为：

```css
animation: nexus-icon-float 4.8s ease-in-out infinite;
```

脚本还定义了两个分组：

```js
const floatingIconsAlternate = selectorList([
  // 反向偏移的一组，当前时长 4.2s
]);

const floatingIconsSlow = selectorList([
  // 较慢的一组，当前时长 5.4s
]);
```

对应 CSS：

```css
/* 默认组 */
animation: nexus-icon-float 4.8s ease-in-out infinite;

/* 交错组 */
animation-name: nexus-icon-float-alternate;
animation-duration: 4.2s;
animation-delay: -1.6s;

/* 慢速组 */
animation-duration: 5.4s;
animation-delay: -2.7s;
```

调整规则与虚线相同：时长越小越快，时长越大越慢。建议各组保留少量差异，画面会比完全同步更自然。

如果要整体调整全部悬浮图标的速度，必须同时检查这三个时长：

```text
默认组：4.8s
交错组：4.2s
慢速组：5.4s
```

只修改默认 `4.8s` 时，交错组和慢速组不会跟着变化，因为它们后面的 `animation-duration` 会覆盖默认时长。可以保持当前相对比例进行换算：

```text
交错组时长 ≈ 默认组时长 × 0.875
慢速组时长 = 默认组时长 × 1.125
```

例如把默认组改成 `4s`，交错组可改成 `3.5s`，慢速组可改成 `4.5s`。

一个图标可以只在 `floatingIconsAlternate` 或 `floatingIconsSlow` 中选择一个分组。不要同时加入两个分组，除非明确希望它使用交错关键帧、但又使用慢速组的持续时间和延迟；因为慢速组写在后面，会覆盖交错组的 `animation-duration` 和 `animation-delay`，但不会覆盖 `animation-name`。

单独修改某几个图标的起始时间，可以调整：

```css
[data-cell-id="hybrid_fusion_icon"],
[data-cell-id="asset_graph_icon"] {
  animation-delay: -3.8s;
}
```

这里的 `animation-delay` 只改变初始相位，不改变悬浮速度。调整三个悬浮时长后，不要求同步修改这些延迟；只有想重新安排图标起伏节奏时才需要调整。

## 7. 调整悬浮距离、旋转和缩放

主要悬浮关键帧为：

```css
@keyframes nexus-icon-float {
  0%, 100% {
    transform: translate(0, 0) rotate(0deg) scale(1);
  }
  36% {
    transform: translate(3px, -12px) rotate(1.2deg) scale(1.045);
  }
  68% {
    transform: translate(-2.2px, -5.5px) rotate(-0.7deg) scale(1.02);
  }
}
```

各参数含义：

```text
translate(水平移动, 垂直移动)
rotate(旋转角度)
scale(缩放倍数)
```

具体调整方法：

- `translateX` 正值向右，负值向左；
- `translateY` 负值向上，正值向下；
- `-12px` 改成 `-15px`，向上漂得更高；
- `-12px` 改成 `-8px`，悬浮幅度更弱；
- `rotate(1.2deg)` 改成 `rotate(2deg)`，摆动更明显；
- `scale(1.045)` 改成 `scale(1.06)`，呼吸放大更明显；
- 不想旋转时，将所有 `rotate(...)` 改成 `rotate(0deg)`；
- 不想缩放时，将所有 `scale(...)` 改成 `scale(1)`。

第二组 `nexus-icon-float-alternate` 使用相反的水平移动和旋转方向，用来避免所有图标同向漂移。调整主关键帧时，建议同时检查这一组：

```css
@keyframes nexus-icon-float-alternate {
  0%, 100% { transform: translate(0, 1px) rotate(0deg) scale(1); }
  42% { transform: translate(-3.2px, -11px) rotate(-1.2deg) scale(1.04); }
  72% { transform: translate(2.4px, -4.5px) rotate(0.8deg) scale(1.018); }
}
```

如果要整体增大或减小所有图标的偏移范围，需要同时修改 `nexus-icon-float` 和 `nexus-icon-float-alternate`。只修改第一组时，交错组中的 6 个图标仍会使用旧的偏移范围。

联动修改建议：

- 修改第一组的最大 `translateY` 后，同步调整第二组最大 `translateY`；
- 修改第一组水平偏移后，同步调整第二组水平偏移，但保留相反方向；
- 修改第一组缩放和旋转幅度时，检查第二组是否仍处于相近强度；
- 关键帧百分比 `36% / 68%` 与 `42% / 72%` 可以不同，不要求完全同步。

如果图标漂出卡片边缘，优先减小 `translateY` 和 `translateX` 的绝对值；如果图标变糊或边缘被裁切，减小 `scale`。

## 8. 选择哪些矩形参与发光

脚本顶部的 `glowingNodeIds` 决定哪些节点发光：

```js
const glowingNodeIds = [
  "python_parse",
  "build_dispatch",
  "hybrid_fusion",
  "bge_rerank",
  "final_evidence",
  "answer_generation",
  "asset_graph",
  "asset_raptor",
  "react_tools",
];
```

操作规则：

- 删除某个字符串：该节点停止发光；
- 加入新的卡片 ID：该节点参与发光；
- 这里填写卡片或节点 ID，不要填写以 `_icon` 结尾的图标 ID；
- 当前选择器只对节点内部第一个分组中的 `rect` 生效；
- 如果新节点不是矩形，虽然 ID 校验可能通过，但发光选择器不会命中，需要根据其 SVG 结构修改选择器。

发光节点按颜色分为：

- `tealGlowNodes`：青绿色；
- `blueGlowNodes`：蓝色；
- `greenGlowNodes`：绿色；
- `purpleGlowNodes`：紫色。

新增节点时，先加入 `glowingNodeIds`，再根据卡片原本的颜色加入一个颜色分组。这样光晕颜色不会和矩形边框冲突。

## 9. 调整发光速度

默认发光时长为：

```css
${glowingNodes} {
  animation: nexus-node-glow 1.8s ease-in-out infinite;
}
```

- `1.8s` 表示普通发光节点每 `1.8` 秒完成一次完整的变亮和变暗；
- 数值越小，呼吸频率越快；
- 数值越大，呼吸频率越慢；
- `ease-in-out` 控制亮暗变化节奏，不决定循环次数。

### 两个节点的单独速度覆盖

`bge_rerank` 和 `asset_raptor` 当前单独使用 `2.1s`：

```css
[data-cell-id="bge_rerank"] > g:first-child > rect,
[data-cell-id="asset_raptor"] > g:first-child > rect {
  animation-duration: 2.1s;
}
```

这段规则的作用是让“BGE 精排”和“摘要树资产”比其他发光节点稍慢一些，避免 9 个卡片完全同频呼吸，让页面更有层次。它位于默认规则后面，因此会覆盖这两个节点从默认 `animation` 简写中得到的 `1.8s`，但不会改变：

- 动画名称 `nexus-node-glow`；
- 缓动函数 `ease-in-out`；
- 无限循环 `infinite`；
- 发光颜色、强度和范围。

当前比例为：

```text
2.1 ÷ 1.8 ≈ 1.17
```

也就是两个特殊节点比普通节点慢约 `17%`。

调整默认发光速度后，有两种处理方式：

1. 希望所有节点完全同速：删除这段特殊覆盖，或者把 `animation-duration` 改成和默认值完全相同；
2. 希望继续保留层次：同步更新特殊时长，并保持“默认时长 × 1.17”的近似比例。

示例：

| 效果 | 默认发光时长 | 两个特殊节点 | 处理方式 |
| --- | ---: | ---: | --- |
| 更快 | `1.4s` | `1.6s` | `1.4 × 1.17 ≈ 1.64`，取整为 `1.6s` |
| 当前 | `1.8s` | `2.1s` | 保持约 `17%` 的速度差 |
| 较慢 | `2.4s` | `2.8s` | `2.4 × 1.17 ≈ 2.81`，取整为 `2.8s` |

> 必须检查：每次修改默认 `nexus-node-glow` 的持续时间后，都要继续向下检查这段 `animation-duration`。只改默认值时，这两个节点仍会使用旧的单独时长。

各颜色分组中的 `--nexus-glow-delay` 用于错开发光时间：

```css
--nexus-glow-delay: -1.8s;
--nexus-glow-delay: -3.5s;
--nexus-glow-delay: -4.6s;
```

这些延迟只改变起始相位，不改变光晕强度和速度。

## 10. 调整发光颜色和透明度

默认光晕变量为：

```css
--nexus-glow-strong: rgba(79, 159, 232, 0.74);
--nexus-glow-soft: rgba(79, 159, 232, 0.4);
```

但当前 9 个发光节点全部又加入了一个颜色分组，颜色分组会覆盖上面的默认变量：

```css
/* 青绿色节点 */
--nexus-glow-strong: rgba(24, 167, 160, 0.74);
--nexus-glow-soft: rgba(24, 167, 160, 0.4);

/* 蓝色节点 */
--nexus-glow-strong: rgba(79, 159, 232, 0.76);
--nexus-glow-soft: rgba(79, 159, 232, 0.41);

/* 绿色节点 */
--nexus-glow-strong: rgba(34, 169, 95, 0.74);
--nexus-glow-soft: rgba(34, 169, 95, 0.4);

/* 紫色节点 */
--nexus-glow-strong: rgba(134, 89, 199, 0.74);
--nexus-glow-soft: rgba(134, 89, 199, 0.4);
```

因此，调整透明度时要区分两种情况：

1. 只调整某一种颜色：只修改对应颜色分组的 `strong` 和 `soft`；
2. 调整全部节点：默认值和青、蓝、绿、紫四组变量都要同步修改。

当前所有节点都有颜色分组，所以只改最上面的默认 `0.74 / 0.4`，页面上的现有节点可能完全看不出变化。默认变量主要用于以后新增到 `glowingNodeIds`、但尚未加入颜色分组的节点。

`rgba(R, G, B, A)` 中：

- 前三个值决定颜色；
- 最后一个 `A` 决定透明度；
- `A` 越接近 `1`，光越明显；
- `A` 越接近 `0`，光越弱。

例如增强蓝色光晕：

```css
--nexus-glow-strong: rgba(79, 159, 232, 0.75);
--nexus-glow-soft: rgba(79, 159, 232, 0.4);
```

降低蓝色光晕：

```css
--nexus-glow-strong: rgba(79, 159, 232, 0.45);
--nexus-glow-soft: rgba(79, 159, 232, 0.2);
```

建议保持 `strong` 的透明度高于 `soft`，并保持每个颜色组的 RGB 与对应矩形颜色接近。

## 11. 调整发光范围和强度

当前发光关键帧为：

```css
@keyframes nexus-node-glow {
  0%, 100% {
    filter: drop-shadow(0 0 3px var(--nexus-glow-soft));
  }
  50% {
    filter:
      drop-shadow(0 0 10px var(--nexus-glow-strong))
      drop-shadow(0 0 25px var(--nexus-glow-soft));
  }
}
```

三个模糊半径的作用：

- `3px`：静止阶段保留的基础光；
- `10px`：呼吸峰值的核心亮光；
- `25px`：呼吸峰值的外层柔光。

这三个半径只在 `nexus-node-glow` 关键帧中定义，全部发光节点共用，没有针对 `bge_rerank` 或 `asset_raptor` 的范围覆盖。因此，只调整发光范围时不需要同步修改 `animation-duration`；反过来，只调整发光速度也不需要修改这三个半径。

如果既要扩大范围又要增强亮度，通常需要同时检查：

- `3px / 10px / 25px`：控制光晕扩散范围；
- `--nexus-glow-strong`：控制核心光亮度；
- `--nexus-glow-soft`：控制外层柔光亮度；
- 四个颜色分组中的透明度覆盖值。

增强效果的示例：

```css
0%, 100% {
  filter: drop-shadow(0 0 3px var(--nexus-glow-soft));
}
50% {
  filter:
    drop-shadow(0 0 10px var(--nexus-glow-strong))
    drop-shadow(0 0 24px var(--nexus-glow-soft));
}
```

减弱效果的示例：

```css
0%, 100% {
  filter: drop-shadow(0 0 1px var(--nexus-glow-soft));
}
50% {
  filter:
    drop-shadow(0 0 5px var(--nexus-glow-strong))
    drop-shadow(0 0 12px var(--nexus-glow-soft));
}
```

光晕过大会与相邻卡片重叠，也会增加浏览器绘制开销。优先小幅调整透明度和模糊半径，不建议一次增加过多。

## 12. 调整首页四边白边

首页针对 Super Agent 架构图使用了专用样式，不会影响其他项目图片：

```css
.superAgentMedia {
  box-sizing: border-box;
  padding: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.showcaseImage.superAgentImage {
  max-height: none;
  border-radius: 10px;
  box-shadow: none;
}
```

`padding: 10px` 决定 SVG 外围四边相同的白边宽度。

常用调整：

```css
/* 四边更窄 */
padding: 6px;

/* 当前 */
padding: 10px;

/* 四边更宽 */
padding: 14px;
```

如果要保持上下左右完全相同，只使用一个值。不要写成：

```css
padding: 8px 16px;
```

因为这种写法表示上下 `8px`、左右 `16px`，会再次出现左右白边比上下宽的现象。

必须保留：

```css
max-height: none;
```

通用 `.showcaseImage` 设置了 `max-height: 92vh`。如果删除 Super Agent 的覆盖规则，超宽架构图可能被高度限制缩小，图片元素横向占位不变，从而产生很宽的左右留白。

如果 `padding` 已经四边相同，页面中仍然出现明显不对称空白，应继续检查：

1. SVG 根节点的 `viewBox` 是否包含多余画布；
2. Draw.io 导出时页面尺寸是否紧贴内容；
3. 浏览器是否仍在使用旧缓存；
4. `.superAgentImage` 的 `max-height: none` 是否被其他高优先级样式覆盖。

## 13. 调整外框圆角和阴影

图片本身的圆角：

```css
.showcaseImage.superAgentImage {
  border-radius: 10px;
}
```

- `6px`：更方正；
- `10px`：当前；
- `16px`：更圆润。

外框阴影：

```css
.superAgentMedia {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}
```

参数依次表示：

```text
水平偏移  垂直偏移  模糊半径  颜色
```

更轻的阴影：

```css
box-shadow: 0 6px 18px rgba(0, 0, 0, 0.07);
```

更明显的阴影：

```css
box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
```

图片自身的 `box-shadow` 当前设置为 `none`，避免与外框阴影叠加成双层阴影。

## 14. 如何查找 `data-cell-id`

列出所有以 `_icon` 结尾的图标 ID：

```bash
rg -o 'data-cell-id="[^"]+_icon"' \
  'static/img/super-agent/架构图/架构流程图(pro)(动态).svg' \
  | sort -u
```

列出 SVG 中全部单元 ID：

```bash
rg -o 'data-cell-id="[^"]+"' \
  'static/img/super-agent/架构图/架构流程图(pro)(动态).svg' \
  | sort -u
```

如果只知道页面上的图形位置，不知道 ID，最直接的方法是：

1. 在浏览器中打开首页；
2. 打开开发者工具；
3. 使用元素选择器选中目标图标或矩形；
4. 向上查找最近的 `<g data-cell-id="...">`；
5. 将该 ID 加入对应数组。

命名建议：

- 卡片节点使用 `python_parse` 这一类语义 ID；
- 卡片内图标使用 `python_parse_icon` 这一类带 `_icon` 后缀的 ID；
- Draw.io 自动生成的随机 ID 可以使用，但后续维护难度更高。

如果重新编辑 Draw.io 图，尽量保留已有对象 ID。ID 改变后，脚本会因为找不到预期节点而报错，这种校验可以避免悄悄丢失动画。

## 15. 推荐效果预设

下表不是必须同时修改的固定方案，只是便于快速选择一个整体强度。

| 参数 | 轻柔 | 当前 | 更强 |
| --- | ---: | ---: | ---: |
| 虚线周期 `12` | `1.4s` | `0.7s` | `0.5s` |
| 虚线周期 `15` | `1.75s` | `0.875s` | `0.625s` |
| 默认悬浮时长 | `5.6s` | `4.8s` | `3.8s` |
| 交错悬浮时长 | `5s` | `4.2s` | `3.4s` |
| 慢速悬浮时长 | `6.2s` | `5.4s` | `4.4s` |
| 主要上浮距离 | `-8px` | `-12px` | `-15px` |
| 主要缩放峰值 | `1.025` | `1.045` | `1.06` |
| 默认发光时长 | `3s` | `1.8s` | `1.3s` |
| 两个特殊节点发光时长 | `3.5s` | `2.1s` | `1.5s` |
| 核心光晕 | `7px` | `10px` | `13px` |
| 外层光晕 | `18px` | `25px` | `32px` |
| 强光透明度参考 | `0.55` | `0.74` | `0.82` |
| 柔光透明度参考 | `0.26` | `0.40` | `0.48` |

建议一次只调整一类效果，然后刷新观察：

1. 先调虚线速度和方向；
2. 再调悬浮距离和速度；
3. 最后调发光透明度和半径；
4. 确认动画后再调页面白边。

这样出现问题时更容易定位是哪一组参数造成的。

应用整套预设时，不能只修改表格中的某一个“默认值”。需要按照第 2.1 节的联动规则同步更新：

- 两种虚线时长；
- 三个悬浮速度分组；
- 两套悬浮关键帧；
- 默认发光时长和两个特殊节点时长；
- 默认光晕透明度和四个颜色分组透明度。

## 16. “减少动态效果”设置

脚本中包含：

```css
@media (prefers-reduced-motion: reduce) {
  g[data-cell-id] path[stroke-dasharray],
  /* 悬浮图标选择器 */
  /* 发光节点选择器 */ {
    animation: none !important;
  }
}
```

当 macOS 或浏览器启用了“减少动态效果”时，虚线流动、图标悬浮和矩形发光都会停止。这是无障碍支持，不是动画代码失效。

如果页面完全没有动画，请检查：

```text
系统设置 → 辅助功能 → 显示 → 减少动态效果
```

关闭后重新加载页面验证。正式页面建议保留这段媒体查询，不要为了测试永久删除。

## 17. Draw.io 重新导出后的处理

如果在 Draw.io 中继续修改布局并重新导出 SVG：

1. 使用不带 Draw.io 内置流动动画的干净 SVG 作为源文件；
2. 导出并覆盖 `架构流程图(pro)(动态).svg`；
3. 确认需要动画的对象 ID 没有变化；
4. 重新运行 `animate-architecture-svg.mjs`；
5. 执行 XML 校验和页面预览。

脚本会主动拒绝包含以下 Draw.io 动画标记的 SVG：

```text
ge-flow-animation
flowAnimation=1
```

这是为了避免 Draw.io 自带动画和自定义动画同时生效，造成速度、方向或样式冲突。

脚本当前还会校验：

- 每个悬浮图标 ID 必须刚好出现一次；
- 每个发光节点 ID 必须刚好出现一次；
- `stroke-dasharray="6 6"` 或 `"7.5 7.5"` 的流程路径总数必须为 `16`。

如果新增或删除了流程线，报错类似：

```text
Expected 16 dashed process paths, found 17.
```

此时应先确认新增路径确实需要流动，再更新脚本中的期望数量。不要在未核对图形的情况下只为消除错误而修改数字。

## 18. 常见问题排查

### 18.1 修改参数后页面没有变化

按顺序检查：

1. 是否修改了正确的 `animate-architecture-svg.mjs`；
2. 是否运行了动画注入命令；
3. 命令是否成功输出 `Injected motion...`；
4. 首页是否仍引用 `架构流程图(pro)(动态).svg`；
5. 是否执行了 `Command + Shift + R`；
6. 是否启用了“减少动态效果”。

### 18.2 虚线流动方向反了

只调整两个关键帧终点的正负号：

```css
stroke-dashoffset: -12;
stroke-dashoffset: -15;
```

改为：

```css
stroke-dashoffset: 12;
stroke-dashoffset: 15;
```

不要通过交换箭头位置或乱改延迟来修正方向。

### 18.3 某段虚线又变成实线

优先检查“文档解析与知识构建”的六条共享主干路径。确认它们：

- 都保留 `stroke-dasharray`；
- 使用完全相同的 `--nexus-flow-delay`；
- 没有同时叠加 Draw.io 自带流动动画；
- 没有一部分使用 `6 6`、另一部分使用不一致的虚线周期。

### 18.4 某个图标不悬浮

检查：

- ID 是否加入 `floatingIconIds`；
- 填写的是图标 ID，而不是卡片 ID；
- SVG 中是否存在对应 `data-cell-id`；
- 图标是否被其他高优先级样式覆盖了 `transform`；
- 是否重新运行了注入脚本。

### 18.5 某个卡片不发光

检查：

- ID 是否加入 `glowingNodeIds`；
- 填写的是卡片 ID，而不是 `_icon` ID；
- 该节点内部是否使用 `> g:first-child > rect` 结构；
- 光晕透明度是否过低；
- 是否重新运行了注入脚本。

### 18.6 只有两个节点的发光速度没有变化

如果修改默认 `nexus-node-glow` 后，只有 `bge_rerank` 和 `asset_raptor` 仍然保持原速度，检查脚本后面的覆盖规则：

```css
[data-cell-id="bge_rerank"] > g:first-child > rect,
[data-cell-id="asset_raptor"] > g:first-child > rect {
  animation-duration: 2.1s;
}
```

解决方式：

- 要统一速度：将 `2.1s` 改成默认时长，或者删除这一段；
- 要保留层次：按“默认时长 × 1.17”同步换算特殊时长。

### 18.7 动画太弱

按以下顺序增强，通常不需要全部一起改：

1. 悬浮：先把 `translateY` 从 `-12px` 调为 `-14px`；
2. 发光：先把强光透明度从 `0.74` 调为 `0.82`；
3. 发光：再把核心光晕从 `10px` 调为 `12px`；
4. 呼吸：把默认发光时长从 `1.8s` 调为 `1.4s`，并把两个特殊节点从 `2.1s` 调为约 `1.6s`；
5. 流动：把 `0.7s / 0.875s` 调为 `0.5s / 0.625s`。

### 18.8 动画太强或画面太乱

按以下顺序减弱：

1. 减少 `floatingIconIds` 中参与悬浮的图标数量；
2. 把上浮距离从 `-12px` 调为 `-8px`；
3. 把缩放峰值从 `1.045` 调为 `1.025`；
4. 降低光晕透明度；
5. 减小 `drop-shadow` 半径；
6. 延长动画时长。

### 18.9 首页左右白边仍比上下宽

检查：

1. `.superAgentMedia` 是否使用单值 `padding`；
2. `.superAgentImage` 是否保留 `max-height: none`；
3. SVG 自身 `viewBox` 左右是否包含空白画布；
4. 是否错误地给图片设置了固定高度；
5. 是否显示了浏览器缓存中的旧 CSS。

## 19. 验证命令

检查注入脚本语法：

```bash
node --check 'static/img/super-agent/架构图/animate-architecture-svg.mjs'
```

重新注入动画：

```bash
node 'static/img/super-agent/架构图/animate-architecture-svg.mjs'
```

检查 SVG 是否是合法 XML：

```bash
xmllint --noout 'static/img/super-agent/架构图/架构流程图(pro)(动态).svg'
```

检查动画样式是否已经写入 SVG。使用 `-o` 只输出匹配到的标签，避免把单行存储的大型 SVG 全部打印到终端：

```bash
rg -o '<style id="nexus-architecture-motion"[^>]*>' \
  'static/img/super-agent/架构图/架构流程图(pro)(动态).svg'
```

检查首页引用：

```bash
rg -n '架构流程图\(pro\)\(动态\)\.svg' src/pages/index.js
```

执行生产构建：

```bash
npm run build
```

## 20. 最终检查清单

每次交付前确认：

- [ ] 所有虚线都沿箭头方向流动；
- [ ] 两种虚线速度一致；
- [ ] 六条共享主干路径使用相同相位，重叠处仍为虚线；
- [ ] 悬浮图标没有漂出卡片或被裁切；
- [ ] 发光节点颜色与卡片配色一致；
- [ ] 发光不会遮挡文字或相邻节点；
- [ ] 修改默认发光速度后，已同步检查两个特殊节点的 `animation-duration`；
- [ ] 修改整体发光透明度后，已同步检查青、蓝、绿、紫四个颜色分组；
- [ ] 首页上下左右白边相同；
- [ ] 首页没有双层阴影；
- [ ] 开启“减少动态效果”后动画会停止；
- [ ] `node --check` 通过；
- [ ] `xmllint --noout` 通过；
- [ ] `npm run build` 通过；
- [ ] 强制刷新后能看到最新效果。
