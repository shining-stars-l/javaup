import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultSvgPath = path.join(scriptDirectory, "架构流程图(pro)(动态).svg");
const svgPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : defaultSvgPath;

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

const selectorList = (ids, suffix = "") =>
  ids.map((id) => `[data-cell-id="${id}"]${suffix}`).join(",\n");

const floatingIcons = selectorList(floatingIconIds);
const floatingIconsAlternate = selectorList([
  "retrieval_plan_icon",
  "build_dispatch_icon",
  "channel_raptor_icon",
  "bge_rerank_icon",
  "answer_generation_icon",
  "asset_raptor_icon",
]);
const floatingIconsSlow = selectorList([
  "query_understand_icon",
  "python_parse_icon",
  "channel_graph_icon",
  "final_evidence_icon",
  "asset_graph_icon",
  "react_tools_icon",
]);

const glowingNodes = selectorList(glowingNodeIds, " > g:first-child > rect");
const tealGlowNodes = selectorList(
  ["python_parse", "build_dispatch"],
  " > g:first-child > rect",
);
const blueGlowNodes = selectorList(
  ["hybrid_fusion", "bge_rerank", "answer_generation"],
  " > g:first-child > rect",
);
const greenGlowNodes = selectorList(
  ["final_evidence"],
  " > g:first-child > rect",
);
const purpleGlowNodes = selectorList(
  ["asset_graph", "asset_raptor", "react_tools"],
  " > g:first-child > rect",
);

const motionStyle = `<style id="nexus-architecture-motion" type="text/css">
/* Slow process flow. Durations are proportional to each dash period. */
g[data-cell-id] path[stroke-dasharray="6 6"] {
  animation: nexus-flow-12 0.7s linear infinite;
  animation-delay: var(--nexus-flow-delay, 0s);
  will-change: stroke-dashoffset;
}

g[data-cell-id] path[stroke-dasharray="7.5 7.5"] {
  animation: nexus-flow-15 0.875s linear infinite;
  animation-delay: var(--nexus-flow-delay, 0s);
  will-change: stroke-dashoffset;
}

[data-cell-id="mode_to_react"],
[data-cell-id="4wgAXTlb2vV4gLFp7L6X-3"] {
  --nexus-flow-delay: -1.4s;
}

[data-cell-id="mode_to_clarification"],
[data-cell-id="4wgAXTlb2vV4gLFp7L6X-7"] {
  --nexus-flow-delay: -2.8s;
}

[data-cell-id="clarification_loop"],
[data-cell-id="4wgAXTlb2vV4gLFp7L6X-11"] {
  --nexus-flow-delay: -4.2s;
}

[data-cell-id="decision_success"],
[data-cell-id="4wgAXTlb2vV4gLFp7L6X-6"] {
  --nexus-flow-delay: -5.6s;
}

[data-cell-id="react_mode_to_tools"] {
  --nexus-flow-delay: -7s;
}

/* These six branches share a long trunk. Keep their dash phases aligned so
   the overlapping trunk remains visibly dashed instead of appearing solid. */
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-1"],
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-2"],
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-3"],
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-4"],
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-6"],
[data-cell-id="HzX0HN1OuRPQ_ER2HMen-7"] {
  --nexus-flow-delay: -1.2s;
}

@keyframes nexus-flow-12 {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -12; }
}

@keyframes nexus-flow-15 {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -15; }
}

/* Selected capability icons drift independently from their cards. */
${floatingIcons} {
  animation: nexus-icon-float 4.8s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform;
}

${floatingIconsAlternate} {
  animation-name: nexus-icon-float-alternate;
  animation-duration: 4.2s;
  animation-delay: -1.6s;
}

${floatingIconsSlow} {
  animation-duration: 5.4s;
  animation-delay: -2.7s;
}

[data-cell-id="hybrid_fusion_icon"],
[data-cell-id="asset_graph_icon"] {
  animation-delay: -3.8s;
}

[data-cell-id="asset_raptor_icon"],
[data-cell-id="react_tools_icon"] {
  animation-delay: -1.2s;
}

@keyframes nexus-icon-float {
  0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
  36% { transform: translate(3px, -12px) rotate(1.2deg) scale(1.045); }
  68% { transform: translate(-2.2px, -5.5px) rotate(-0.7deg) scale(1.02); }
}

@keyframes nexus-icon-float-alternate {
  0%, 100% { transform: translate(0, 1px) rotate(0deg) scale(1); }
  42% { transform: translate(-3.2px, -11px) rotate(-1.2deg) scale(1.04); }
  72% { transform: translate(2.4px, -4.5px) rotate(0.8deg) scale(1.018); }
}

/* Low-opacity breathing glow on the main processing hubs. */
${glowingNodes} {
  --nexus-glow-strong: rgba(79, 159, 232, 0.74);
  --nexus-glow-soft: rgba(79, 159, 232, 0.4);
  animation: nexus-node-glow 1.8s ease-in-out infinite;
  animation-delay: var(--nexus-glow-delay, 0s);
  will-change: filter;
}

${tealGlowNodes} {
  --nexus-glow-strong: rgba(24, 167, 160, 0.74);
  --nexus-glow-soft: rgba(24, 167, 160, 0.4);
}

${blueGlowNodes} {
  --nexus-glow-strong: rgba(79, 159, 232, 0.76);
  --nexus-glow-soft: rgba(79, 159, 232, 0.41);
  --nexus-glow-delay: -1.8s;
}

${greenGlowNodes} {
  --nexus-glow-strong: rgba(34, 169, 95, 0.74);
  --nexus-glow-soft: rgba(34, 169, 95, 0.4);
  --nexus-glow-delay: -3.5s;
}

${purpleGlowNodes} {
  --nexus-glow-strong: rgba(134, 89, 199, 0.74);
  --nexus-glow-soft: rgba(134, 89, 199, 0.4);
  --nexus-glow-delay: -4.6s;
}

[data-cell-id="bge_rerank"] > g:first-child > rect,
[data-cell-id="asset_raptor"] > g:first-child > rect {
  animation-duration: 2.1s;
}

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

@media (prefers-reduced-motion: reduce) {
  g[data-cell-id] path[stroke-dasharray],
  ${floatingIcons},
  ${glowingNodes} {
    animation: none !important;
  }
}
</style>`;

let svg = fs.readFileSync(svgPath, "utf8");

if (/ge-flow-animation|flowAnimation=1/.test(svg)) {
  throw new Error(
    "The input contains Draw.io flowAnimation markup. Use the clean first SVG as the source.",
  );
}

for (const id of [...floatingIconIds, ...glowingNodeIds]) {
  const matches =
    svg.match(new RegExp(`<g\\s+data-cell-id="${id}"(?:\\s|>)`, "g")) ?? [];
  if (matches.length !== 1) {
    throw new Error(`Expected one rendered SVG node for ${id}, found ${matches.length}.`);
  }
}

const dashedPathCount = (
  svg.match(/<path\b[^>]*\bstroke-dasharray="(?:6 6|7\.5 7\.5)"/g) ?? []
).length;
if (dashedPathCount !== 16) {
  throw new Error(`Expected 16 dashed process paths, found ${dashedPathCount}.`);
}

svg = svg.replace(
  /\n?<style id="nexus-architecture-motion"[\s\S]*?<\/style>\n?/,
  "",
);

const svgStart = svg.indexOf("<svg");
const svgOpenEnd = svg.indexOf(">", svgStart);
if (svgStart < 0 || svgOpenEnd < 0) {
  throw new Error("Unable to locate the root SVG element.");
}

svg = `${svg.slice(0, svgOpenEnd + 1)}\n${motionStyle}\n${svg.slice(svgOpenEnd + 1)}`;
fs.writeFileSync(svgPath, svg, "utf8");

console.log(
  `Injected motion into ${path.basename(svgPath)}: ${dashedPathCount} flowing paths, ` +
    `${floatingIconIds.length} floating icons, ${glowingNodeIds.length} glowing nodes.`,
);
