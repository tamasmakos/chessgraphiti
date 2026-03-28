import React, { useMemo, useRef, useState, useEffect } from "react";
import { COMMUNITY_COLORS } from "@yourcompany/chess/constants";
import type { CommunityLineageAnalysis } from "@yourcompany/chess/community-lineage";
import type { GraphSnapshot } from "@yourcompany/chess/types";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

interface CommunityLineageGraphProps {
  readonly analysis: CommunityLineageAnalysis;
  readonly currentIndex: number;
  readonly onIndexChange?: (index: number) => void;
  readonly height?: number;
  readonly analysisGraphSnapshots?: Array<GraphSnapshot | null>;
}

const PADDING = { top: 20, right: 30, bottom: 40, left: 30 };
const SPARKLINE_HEIGHT = 12;
const NODE_WIDTH = 12;
const MIXTURE_STRIP = 3; // left strip width showing side composition
const MIN_NODE_HEIGHT = 4;
const HOVER_FLOW_OPACITY = 1;

const WINDOW_OPTIONS = [5, 10, 20, null] as const;
type WindowOption = (typeof WINDOW_OPTIONS)[number];

interface RichNode {
  id: number;
  step: number;
  relStep: number;
  x: number;
  y: number;
  h: number;
  w: number;
  color: string;
  colorIdx: number;
  weight: number;
  importance: number;
  whiteFraction: number;      // 0 = all black, 1 = all white
  attackPressureIn: number;   // 0-1 normalized cross-community attack received
  attackPressureOut: number;  // 0-1 normalized cross-community attack delivered
}

interface FlowLink {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  color: string;
  opacity: number;
  importance: number;
}

interface TooltipData {
  x: number;
  y: number;
  communityId: number;
  step: number;
  weight: number;
  whiteFraction: number;
  attackIn: number;
  attackOut: number;
  color: string;
}

type PerStepMetric = {
  attacks: Map<number, Map<number, number>>;
  totalCrossAttack: number;
  communityMix: Map<number, { white: number; black: number }>;
};

function withAlpha(color: string, a: number): string {
  return color.replace(/[\d.]+\)$/, `${a})`);
}

// ---------------------------------------------------------------------------
// Module-level computation helpers
// ---------------------------------------------------------------------------

function processSnapshot(snap: GraphSnapshot): PerStepMetric {
  const communityBySquare = new Map<string, number>();
  const communityMix = new Map<number, { white: number; black: number }>();
  for (const node of snap.nodes) {
    communityBySquare.set(node.square, node.communityId);
    if (!communityMix.has(node.communityId)) communityMix.set(node.communityId, { white: 0, black: 0 });
    const bucket = communityMix.get(node.communityId)!;
    if (node.color === "w") bucket.white++; else bucket.black++;
  }
  const attacks = new Map<number, Map<number, number>>();
  let totalCrossAttack = 0;
  for (const edge of snap.edges) {
    if (edge.type !== "attack") continue;
    const fromCid = communityBySquare.get(edge.from);
    const toCid = communityBySquare.get(edge.to);
    if (fromCid === undefined || toCid === undefined || fromCid === toCid) continue;
    const inner = attacks.get(fromCid) ?? new Map<number, number>();
    attacks.set(fromCid, inner);
    inner.set(toCid, (inner.get(toCid) ?? 0) + edge.weight);
    totalCrossAttack += edge.weight;
  }
  return { attacks, totalCrossAttack, communityMix };
}

function computeImportanceMap(
  snapshots: Array<GraphSnapshot | null> | undefined,
  numSteps: number,
): Map<number, Map<number, number>> {
  const result = new Map<number, Map<number, number>>();
  if (!snapshots) return result;
  for (let si = 0; si < numSteps; si++) {
    const snap = snapshots[si];
    const stepImp = new Map<number, number>();
    result.set(si, stepImp);
    if (!snap) continue;
    const byCommunity = new Map<number, number[]>();
    for (const n of snap.nodes) {
      const arr = byCommunity.get(n.communityId) ?? [];
      arr.push((n.centralityWeighted + n.centralityDegree + n.centralityBetweenness + n.centralityCloseness + n.centralityPageRank) / 5);
      byCommunity.set(n.communityId, arr);
    }
    for (const [cid, scores] of byCommunity) {
      stepImp.set(cid, scores.reduce((s, v) => s + v, 0) / scores.length);
    }
  }
  return result;
}

function computeAttackNorms(perStepMetrics: Map<number, PerStepMetric>) {
  let maxOut = 0.0001;
  const attackInByStepCid = new Map<string, number>();
  for (const [si, m] of perStepMetrics) {
    for (const [, toMap] of m.attacks) {
      const outTotal = [...toMap.values()].reduce((s, v) => s + v, 0);
      if (outTotal > maxOut) maxOut = outTotal;
      for (const [toCid, w] of toMap) {
        const key = `${si}:${toCid}`;
        attackInByStepCid.set(key, (attackInByStepCid.get(key) ?? 0) + w);
      }
    }
  }
  let maxIn = 0.0001;
  for (const v of attackInByStepCid.values()) { if (v > maxIn) maxIn = v; }
  return { maxCommunityAttackOut: maxOut, maxCommunityAttackIn: maxIn, attackInByStepCid };
}

function getStepCounts(
  si: number,
  communityIds: number[],
  analysis: CommunityLineageAnalysis,
): Map<number, number> {
  const counts = new Map<number, number>();
  if (si === 0) {
    const firstT = analysis.transitions[0];
    if (firstT) {
      for (const link of firstT.links) counts.set(link.fromCommunityId, (counts.get(link.fromCommunityId) ?? 0) + link.overlapWeight);
    } else {
      communityIds.forEach((cid) => counts.set(cid, 4));
    }
  } else {
    const t = analysis.transitions.find((trans) => trans.stepIndex === si);
    if (t) {
      for (const link of t.links) counts.set(link.toCommunityId, (counts.get(link.toCommunityId) ?? 0) + link.overlapWeight);
    } else {
      communityIds.forEach((cid) => counts.set(cid, 4));
    }
  }
  return counts;
}

interface BuildStepNodesParams {
  si: number;
  ri: number;
  stepMap: Record<number, number>;
  analysis: CommunityLineageAnalysis;
  importanceMap: Map<number, Map<number, number>>;
  globalMaxImp: number;
  perStepMetrics: Map<number, PerStepMetric>;
  attackInByStepCid: Map<string, number>;
  maxCommunityAttackIn: number;
  maxCommunityAttackOut: number;
  chartHeight: number;
  stepGap: number;
}

function buildStepNodes(p: BuildStepNodesParams): { nodes: RichNode[]; geometry: Map<number, RichNode> } {
  const communityIds = Object.keys(p.stepMap).map(Number);
  const counts = getStepCounts(p.si, communityIds, p.analysis);
  const totalWeight = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  const scale = p.chartHeight / totalWeight;
  const sortedIds = [...communityIds].sort((a, b) => p.stepMap[a]! - p.stepMap[b]!);
  const stepMetrics = p.perStepMetrics.get(p.si);
  const nodes: RichNode[] = [];
  const geometry = new Map<number, RichNode>();
  let currentY = 0;

  for (const cid of sortedIds) {
    const weight = counts.get(cid) ?? 1;
    const h = Math.max(MIN_NODE_HEIGHT, weight * scale);
    const colorIdx = p.stepMap[cid]!;
    const color = COMMUNITY_COLORS[colorIdx % COMMUNITY_COLORS.length] as string;
    const importance = (p.importanceMap.get(p.si)?.get(cid) ?? 0) / p.globalMaxImp;
    const mix = stepMetrics?.communityMix.get(cid);
    const mixTotal = (mix?.white ?? 0) + (mix?.black ?? 0);
    const whiteFraction = mixTotal > 0 ? (mix?.white ?? 0) / mixTotal : 0.5;
    const attackIn = p.attackInByStepCid.get(`${p.si}:${cid}`) ?? 0;
    const attackPressureIn = Math.min(1, attackIn / p.maxCommunityAttackIn);
    const outMap = stepMetrics?.attacks.get(cid);
    const attackOut = outMap ? [...outMap.values()].reduce((s, v) => s + v, 0) : 0;
    const attackPressureOut = Math.min(1, attackOut / p.maxCommunityAttackOut);

    const node: RichNode = {
      id: cid, step: p.si, relStep: p.ri,
      x: PADDING.left + p.ri * p.stepGap - NODE_WIDTH / 2,
      y: PADDING.top + currentY,
      h, w: NODE_WIDTH, color, colorIdx, weight, importance,
      whiteFraction, attackPressureIn, attackPressureOut,
    };
    nodes.push(node);
    geometry.set(cid, node);
    currentY += h + 2;
  }
  return { nodes, geometry };
}

interface BuildFlowLinksParams {
  si: number;
  ri: number;
  analysis: CommunityLineageAnalysis;
  nodeGeometry: Map<number, RichNode>[];
}

function buildFlowLinksForStep(p: BuildFlowLinksParams): FlowLink[] {
  const transition = p.analysis.transitions.find((t) => t.stepIndex === p.si);
  if (!transition) return [];
  const links: FlowLink[] = [];
  const sourceOffset = new Map<number, number>();
  const targetOffset = new Map<number, number>();
  const sortedLinks = [...transition.links].sort((a, b) => {
    const ay = (p.nodeGeometry[p.ri - 1]?.get(a.fromCommunityId)?.y ?? 0) + (p.nodeGeometry[p.ri]?.get(a.toCommunityId)?.y ?? 0);
    const by = (p.nodeGeometry[p.ri - 1]?.get(b.fromCommunityId)?.y ?? 0) + (p.nodeGeometry[p.ri]?.get(b.toCommunityId)?.y ?? 0);
    return ay - by;
  });
  for (const link of sortedLinks) {
    const source = p.nodeGeometry[p.ri - 1]?.get(link.fromCommunityId);
    const target = p.nodeGeometry[p.ri]?.get(link.toCommunityId);
    if (!source || !target) continue;
    const lw = link.overlapWeight;
    const hSource = (lw / source.weight) * source.h;
    const hTarget = (lw / target.weight) * target.h;
    const y0 = source.y + (sourceOffset.get(link.fromCommunityId) ?? 0) + hSource / 2;
    const y1 = target.y + (targetOffset.get(link.toCommunityId) ?? 0) + hTarget / 2;
    const linkImp = (source.importance + target.importance) / 2;
    links.push({
      id: `link-${p.si}-${link.fromCommunityId}-${link.toCommunityId}`,
      x0: source.x + NODE_WIDTH, y0, x1: target.x, y1,
      width: Math.max(1, (hSource + hTarget) / 2),
      color: source.color,
      opacity: 1,
      importance: linkImp,
    });
    sourceOffset.set(link.fromCommunityId, (sourceOffset.get(link.fromCommunityId) ?? 0) + hSource);
    targetOffset.set(link.toCommunityId, (targetOffset.get(link.toCommunityId) ?? 0) + hTarget);
  }
  return links;
}

function computeNodeFilter(node: RichNode, isCurrent: boolean): string {
  if (node.attackPressureIn > 0.08) {
    return `drop-shadow(0 0 ${3 + node.attackPressureIn * 6}px rgba(251, 146, 60, ${0.5 + node.attackPressureIn * 0.5}))`;
  }
  if (isCurrent) {
    return `drop-shadow(0 0 ${4 + node.importance * 6}px ${node.color})`;
  }
  if (node.importance > 0.6) {
    return `drop-shadow(0 0 3px ${withAlpha(node.color, 0.5)})`;
  }
  return "none";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Custom SVG Alluvial (Sankey-style) diagram to visualise community evolution.
 *
 * Each column is a game move (step). Rect heights are proportional to piece count.
 * Left strip: white/black piece mixture within each community.
 * Orange glow: cross-community attack pressure received.
 * Dot to the right: community is actively attacking other communities.
 * Bottom sparkline: total inter-community attack intensity per step.
 */
export function CommunityLineageGraph({
  analysis,
  currentIndex: currentIndexProp,
  onIndexChange,
  height = 200,
  analysisGraphSnapshots,
}: CommunityLineageGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  const [windowSize, setWindowSize] = useState<WindowOption>(20);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const numTotalSteps = analysis?.stableColorByStep?.length ?? 0;
  const currentIndex = Math.max(0, Math.min(currentIndexProp, numTotalSteps - 1));

  // Windowed step range - ends at currentIndex, extends back by windowSize
  const windowedSteps = useMemo(() => {
    if (numTotalSteps === 0) return [] as number[];
    if (windowSize === null) return Array.from({ length: numTotalSteps }, (_, i) => i);
    const winStart = Math.max(0, currentIndex - windowSize + 1);
    return Array.from({ length: currentIndex - winStart + 1 }, (_, i) => i + winStart);
  }, [windowSize, currentIndex, numTotalSteps]);

  // Per-step metrics: inter-community attacks + side mixture
  const perStepMetrics = useMemo(() => {
    const result = new Map<number, PerStepMetric>();
    if (!analysisGraphSnapshots) return result;
    for (let si = 0; si < analysisGraphSnapshots.length; si++) {
      const snap = analysisGraphSnapshots[si];
      if (!snap) continue;
      result.set(si, processSnapshot(snap));
    }
    return result;
  }, [analysisGraphSnapshots]);

  const { steps, nodes, links, sparklineData } = useMemo(() => {
    const empty = { steps: [] as number[], nodes: [] as RichNode[], links: [] as FlowLink[], sparklineData: [] as { step: number; value: number }[] };
    if (!analysis?.stableColorByStep || numTotalSteps === 0 || windowedSteps.length === 0) return empty;

    const importanceMap = computeImportanceMap(analysisGraphSnapshots, numTotalSteps);
    let globalMaxImp = 0;
    for (const m of importanceMap.values()) for (const v of m.values()) { if (v > globalMaxImp) globalMaxImp = v; }
    if (globalMaxImp < 0.0001) globalMaxImp = 1;

    const { maxCommunityAttackOut, maxCommunityAttackIn, attackInByStepCid } = computeAttackNorms(perStepMetrics);

    const numWindowed = windowedSteps.length;
    const chartWidth = width - PADDING.left - PADDING.right;
    const chartHeight = height - PADDING.top - PADDING.bottom;
    const stepGap = chartWidth / Math.max(1, numWindowed - 1);

    const allNodes: RichNode[] = [];
    const allLinks: FlowLink[] = [];
    const nodeGeometry = Array.from({ length: numWindowed }, () => new Map<number, RichNode>());

    for (let ri = 0; ri < numWindowed; ri++) {
      const si = windowedSteps[ri]!;
      const stepMap = analysis.stableColorByStep[si] ?? {};
      const { nodes: stepNodes, geometry } = buildStepNodes({ si, ri, stepMap, analysis, importanceMap, globalMaxImp, perStepMetrics, attackInByStepCid, maxCommunityAttackIn, maxCommunityAttackOut, chartHeight, stepGap });
      for (const n of stepNodes) allNodes.push(n);
      nodeGeometry[ri] = geometry;
    }

    for (let ri = 1; ri < numWindowed; ri++) {
      const si = windowedSteps[ri]!;
      for (const l of buildFlowLinksForStep({ si, ri, analysis, nodeGeometry })) allLinks.push(l);
    }

    const sparklineData = windowedSteps.map((si) => ({ step: si, value: perStepMetrics.get(si)?.totalCrossAttack ?? 0 }));
    return { steps: windowedSteps, nodes: allNodes, links: allLinks, sparklineData };
  }, [analysis, width, height, windowedSteps, analysisGraphSnapshots, perStepMetrics, numTotalSteps]);

  if (!analysis?.stableColorByStep || numTotalSteps === 0) {
    return (
      <div className="w-full h-[200px] bg-slate-900/40 border border-slate-700/50 rounded-xl flex items-center justify-center text-[10px] text-slate-600 uppercase tracking-widest font-black">
        Awaiting Initial Interaction
      </div>
    );
  }

  const numWindowed = windowedSteps.length;
  const chartWidth = width - PADDING.left - PADDING.right;
  const stepGap = chartWidth / Math.max(1, numWindowed - 1);
  const chartBottom = height - PADDING.bottom;
  const xLabelY = chartBottom + 15;
  const sparklineTopY = xLabelY + 7;
  const maxSparkValue = Math.max(...sparklineData.map((d) => d.value), 0.0001);
  const sparkBarWidth = Math.min(10, Math.max(2, stepGap * 0.55));
  const windowLabel = windowSize === null
    ? `Step ${currentIndex}/${numTotalSteps - 1}`
    : `${currentIndex - (windowedSteps[0] ?? 0)}/${numWindowed - 1} shown`;

  return (
    <div className="w-full space-y-1" ref={containerRef}>
      {/* Header with window selector */}
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-glow-indigo">Molecular Evolution</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={String(opt)}
                type="button"
                onClick={() => setWindowSize(opt)}
                className={`px-1.5 py-0.5 text-[9px] font-mono rounded transition-colors ${
                  windowSize === opt
                    ? "bg-indigo-600/60 text-indigo-100 ring-1 ring-indigo-400/50"
                    : "bg-slate-800/50 text-slate-500 hover:text-slate-300"
                }`}
              >
                {opt === null ? "All" : String(opt)}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-mono text-indigo-400">{windowLabel}</span>
        </div>
      </div>

      {/* Main chart */}
      <div
        className="bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden relative backdrop-blur-sm"
        style={{ height }}
      >
        <svg ref={svgRef} width="100%" height="100%" className="overflow-visible">
          {/* Grid lines */}
          {steps.map((s, ri) => (
            <line
              key={`grid-${s}`}
              x1={PADDING.left + ri * stepGap} y1={PADDING.top}
              x2={PADDING.left + ri * stepGap} y2={chartBottom}
              stroke={s === currentIndex ? "rgba(99, 102, 241, 0.5)" : "rgba(51, 65, 85, 0.3)"}
              strokeWidth={s === currentIndex ? 2 : 1}
              strokeDasharray={s === currentIndex ? "" : "4 4"}
            />
          ))}

          {/* Flows */}
          <g>
            {links.map((link) => (
              <path
                key={link.id}
                d={`M ${link.x0} ${link.y0} C ${(link.x0 + link.x1) / 2} ${link.y0}, ${(link.x0 + link.x1) / 2} ${link.y1}, ${link.x1} ${link.y1}`}
                fill="none"
                stroke={link.color}
                strokeWidth={link.width}
              />
            ))}
          </g>

          {/* Communities */}
          <g>
            {nodes.map((node) => {
              const isCurrent = node.step === currentIndex;
              return (
                <g
                  key={`${node.step}-${node.id}`}
                  className="cursor-pointer"
                  onClick={() => onIndexChange?.(node.step)}
                  onMouseEnter={(e) => {
                    const svgRect = svgRef.current?.getBoundingClientRect();
                    if (!svgRect) return;
                    setTooltip({ x: node.x + svgRect.left + NODE_WIDTH + 6, y: node.y + svgRect.top + node.h / 2, communityId: node.id, step: node.step, weight: node.weight, whiteFraction: node.whiteFraction, attackIn: node.attackPressureIn, attackOut: node.attackPressureOut, color: node.color });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {/* Main community rect */}
                  <rect
                    x={node.x + MIXTURE_STRIP} y={node.y}
                    width={node.w - MIXTURE_STRIP} height={node.h}
                    fill={node.color} rx={2}
                    style={{
                      fillOpacity: 0.65 + node.importance * 0.35,
                      filter: computeNodeFilter(node, isCurrent),
                      stroke: isCurrent ? "white" : "none",
                      strokeWidth: isCurrent ? 1 : 0,
                    }}
                  />
                  {/* Side mixture strip - white on top, dark on bottom */}
                  {node.h >= MIN_NODE_HEIGHT * 2 && (
                    <>
                      <rect x={node.x} y={node.y} width={MIXTURE_STRIP} height={Math.max(1, node.h * node.whiteFraction)} fill="rgba(255,255,255,0.75)" rx={1} />
                      <rect x={node.x} y={node.y + node.h * node.whiteFraction} width={MIXTURE_STRIP} height={Math.max(1, node.h * (1 - node.whiteFraction))} fill="rgba(15,23,42,0.85)" rx={1} />
                    </>
                  )}
                  {/* Aggressor dot - community is actively attacking others */}
                  {node.attackPressureOut > 0.25 && node.h > 6 && (
                    <circle
                      cx={node.x + node.w + 2} cy={node.y + node.h / 2}
                      r={Math.min(3, 1.5 + node.attackPressureOut * 2)}
                      fill={`rgba(251,146,60,${0.4 + node.attackPressureOut * 0.6})`}
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* X-axis step labels */}
          {steps
            .map((s, ri) => ({ s, ri }))
            .filter(({ ri }) => ri % Math.max(1, Math.floor(numWindowed / 7)) === 0 || ri === numWindowed - 1)
            .map(({ s, ri }) => (
              <text
                key={`label-${s}`}
                x={PADDING.left + ri * stepGap} y={xLabelY}
                textAnchor="middle"
                style={{ fontSize: "9px", fill: s === currentIndex ? "#818cf8" : "#475569", fontFamily: "monospace" }}
              >
                {s}
              </text>
            ))}

          {/* Sparkline - inter-community attack intensity per step */}
          {sparklineData.length > 1 && (
            <g>
              <text x={PADDING.left - 4} y={sparklineTopY + SPARKLINE_HEIGHT / 2 + 3} textAnchor="end" style={{ fontSize: "7px", fill: "#475569", fontFamily: "monospace" }}>atk</text>
              {sparklineData.map(({ step: s, value }, ri) => {
                const barH = Math.max(1, (value / maxSparkValue) * SPARKLINE_HEIGHT);
                const t = value / maxSparkValue;
                const fill = s === currentIndex
                  ? "rgba(99,102,241,0.85)"
                  : `rgba(${Math.round(59 + t * 192)},${Math.round(130 - t * 84)},${Math.round(246 - t * 200)},0.7)`;
                return (
                  <rect
                    key={`spark-${s}`}
                    x={PADDING.left + ri * stepGap - sparkBarWidth / 2}
                    y={sparklineTopY + SPARKLINE_HEIGHT - barH}
                    width={sparkBarWidth} height={barH}
                    fill={fill} rx={1}
                  />
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono px-1">
        <span className="flex items-center gap-2.5">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.8) 50%, rgba(15,23,42,0.9) 50%)" }} />
            <span>side mix</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 opacity-80" />
            <span>inter-atk</span>
          </span>




        </span>
        <span className="text-indigo-400 opacity-60 italic">Hover to inspect · Click to navigate</span>
      </div>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-900/95 border border-slate-700/70 rounded-lg px-2.5 py-2 shadow-xl backdrop-blur-sm pointer-events-none min-w-[130px]"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translateY(-50%)" }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-2 h-2 rounded-sm inline-block flex-shrink-0" style={{ background: withAlpha(tooltip.color, 0.9) }} />
            <span className="text-[9px] font-bold text-slate-200 uppercase font-mono">Community {tooltip.communityId}</span>
          </div>
          <div className="space-y-0.5 text-[9px] text-slate-400 font-mono">
            <div>Move <span className="text-indigo-300">{tooltip.step}</span></div>
            <div>Pieces <span className="text-slate-200">{tooltip.weight}</span></div>
            <div className="flex gap-1 items-center">
              <span className="inline-block w-1.5 h-1.5 bg-white/80 rounded-sm" />
              <span className="text-white">{Math.round(tooltip.whiteFraction * 100)}%</span>
              <span className="inline-block w-1.5 h-1.5 bg-slate-800 rounded-sm border border-slate-600" />
              <span>{Math.round((1 - tooltip.whiteFraction) * 100)}%</span>
            </div>
            {tooltip.attackIn > 0.05 && (
              <div className="flex items-center gap-1">
                <span className="text-orange-400">attacked</span>
                <span className="text-orange-300">{Math.round(tooltip.attackIn * 100)}%</span>
              </div>
            )}
            {tooltip.attackOut > 0.05 && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-400">attacking</span>
                <span className="text-yellow-300">{Math.round(tooltip.attackOut * 100)}%</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

