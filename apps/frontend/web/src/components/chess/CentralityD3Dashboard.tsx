/**
 * CentralityD3Dashboard
 *
 * Internal CSS grid (no tabs):
 *  ┌──────────────────────────────────────────────┐
 *  │  Piece selector + Centrality Timeline [155h]  │
 *  ├───────────────────┬──────────────────────────┤
 *  │  Structural Radar │  Activity Heatmap         │
 *  │  [col 1, 220h]    │  [col 2, 220h]            │
 *  └───────────────────┴──────────────────────────┘
 *
 * Piece filtering:
 *  - Empty selection  → backward-compat top-6 by variance
 *  - Single type/color → 5 separate metric lines, one per centrality axis
 *  - Multi types/colors → 1 average importance line + variance band
 *
 * Force Dynamics replaced with Activity Heatmap:
 *  - Continuous gradient heatmap of square activity for selected pieces
 */
import React, { useMemo, useRef, useEffect } from "react";
import * as d3 from "d3";
import type { GraphSnapshot, GraphNode } from "@yourcompany/chess/types";
import { COMMUNITY_COLORS } from "@yourcompany/chess/constants";
import { PieceTypeSelector } from "./PieceTypeSelector";
import { type PieceSelection, pieceFullLabel } from "./PieceTypeSelector";

type CentralityMetric =
  | "weighted"
  | "degree"
  | "betweenness"
  | "closeness"
  | "pagerank"
  | "none";

interface CentralityD3DashboardProps {
  analysisGraphSnapshots: Array<GraphSnapshot | null>;
  analysisIndex: number;
  centralityMetric: CentralityMetric;
  onIndexChange?: (index: number) => void;
  /** Called whenever the active metric or piece selection changes so the board can sync. */
  onBoardSync?: (metric: Exclude<CentralityMetric, "none">, highlightSquares: Set<string>) => void;
}

const METRIC_LABELS: Record<CentralityMetric, string> = {
  weighted: "Weighted Degree",
  degree: "Degree",
  betweenness: "Betweenness",
  closeness: "Closeness",
  pagerank: "PageRank",
  none: "None",
};

const METRIC_COLORS: Record<Exclude<CentralityMetric, "none">, string> = {
  weighted: "#22d3ee",
  degree: "#facc15",
  betweenness: "#fb7185",
  closeness: "#34d399",
  pagerank: "#a78bfa",
};

const ALL_METRICS = ["weighted", "degree", "betweenness", "closeness", "pagerank"] as const;
const METRIC_SHORT: Record<string, string> = {
  weighted: "Wgt",
  degree: "Deg",
  betweenness: "Btw",
  closeness: "Cls",
  pagerank: "PR",
};

/** Full intuitive names shown in tooltips and labels. */
const METRIC_INTUITIVE: Record<Exclude<CentralityMetric, "none">, string> = {
  weighted: "Attack Power",
  degree: "Connections",
  betweenness: "Bridge Role",
  closeness: "Board Reach",
  pagerank: "Influence",
};

/** Short button labels for the compact metric selector. */
const METRIC_BUTTON: Record<Exclude<CentralityMetric, "none">, string> = {
  weighted: "Power",
  degree: "Links",
  betweenness: "Bridge",
  closeness: "Reach",
  pagerank: "Influence",
};

type ActiveMetric = Exclude<CentralityMetric, "none">;

const ACTIVE_METRIC_OPTIONS: ActiveMetric[] = ["weighted", "degree", "betweenness", "closeness", "pagerank"];

const WHITE_PIECES_COLOR = "#f1f5f9";
const BLACK_PIECES_COLOR = "#818cf8";

function MetricSelector({
  activeMetric,
  onChange,
}: Readonly<{ activeMetric: ActiveMetric; onChange: (m: ActiveMetric) => void }>) {
  return (
    <div className="flex items-center gap-0.5">
      {ACTIVE_METRIC_OPTIONS.map((m) => {
        const isActive = activeMetric === m;
        const label = METRIC_BUTTON[m];
        const color = METRIC_COLORS[m];
        const btnCls = isActive ? "" : "text-slate-600 hover:text-slate-400";
        return (
          <button
            type="button"
            key={m}
            onClick={() => onChange(m)}
            title={METRIC_INTUITIVE[m]}
            className={`px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded transition-colors ${btnCls}`}
            style={isActive ? { color, backgroundColor: `${color}22` } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function getMetricValue(node: GraphNode, metric: CentralityMetric): number {
  switch (metric) {
    case "weighted": return node.centralityWeighted;
    case "degree": return node.centralityDegree;
    case "betweenness": return node.centralityBetweenness;
    case "closeness": return node.centralityCloseness;
    case "pagerank": return node.centralityPageRank;
    default: return 0;
  }
}

function filterNodes(nodes: GraphNode[], selectedPieces: PieceSelection[]): GraphNode[] {
  if (selectedPieces.length === 0) return nodes;
  return nodes.filter((n) =>
    selectedPieces.some((s) => s.type === n.type && s.color === n.color),
  );
}

function selectionColor(selectedPieces: PieceSelection[], nodes: GraphNode[]): string {
  if (selectedPieces.length === 0 || nodes.length === 0) return "#6366f1";
  if (selectedPieces.length === 1) {
    const match = nodes.find(
      (n) => n.type === selectedPieces[0]!.type && n.color === selectedPieces[0]!.color,
    );
    if (match) {
      return COMMUNITY_COLORS[match.communityId % COMMUNITY_COLORS.length] ?? "#6366f1";
    }
  }
  return "#6366f1";
}

export function CentralityD3Dashboard({
  analysisGraphSnapshots,
  analysisIndex,
  centralityMetric,
  onIndexChange,
  onBoardSync,
}: CentralityD3DashboardProps) {
  const [selectedPieces, setSelectedPieces] = React.useState<PieceSelection[]>([]);
  const [activeMetric, setActiveMetric] = React.useState<ActiveMetric>("weighted");

  const hasData = analysisGraphSnapshots.some(Boolean);
  const currentSnapshot = analysisGraphSnapshots[analysisIndex] ?? null;

  // Sync board visualization: metric + highlighted squares follow the filter
  useEffect(() => {
    if (!onBoardSync) return;
    const metric: Exclude<CentralityMetric, "none"> = activeMetric;
    const squares = new Set<string>();
    if (selectedPieces.length > 0 && currentSnapshot) {
      for (const n of currentSnapshot.nodes) {
        if (selectedPieces.some((s) => s.type === n.type && s.color === n.color)) {
          squares.add(n.square);
        }
      }
    }
    onBoardSync(metric, squares);
  }, [activeMetric, selectedPieces, currentSnapshot, onBoardSync]);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Section label + piece selector */}
      <div className="flex items-center justify-between px-0.5 gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
            Topology &amp; Dynamics
          </span>
        </div>
        <div className="flex items-center gap-2">
          <PieceTypeSelector selected={selectedPieces} onChange={setSelectedPieces} snapshot={currentSnapshot} />
          <MetricSelector activeMetric={activeMetric} onChange={setActiveMetric} />
        </div>
      </div>

      {/* Timeline — full width */}
      <div className="h-[155px] w-full bg-slate-900/50 border border-slate-800/60 rounded-xl overflow-hidden">
        {hasData ? (
          <CentralityTimelineD3
            snapshots={analysisGraphSnapshots}
            currentIndex={analysisIndex}
            activeMetric={activeMetric}
            selectedPieces={selectedPieces}
            onIndexChange={onIndexChange}
          />
        ) : (
          <EmptyState label="Play moves to build the centrality history" />
        )}
      </div>

      {/* Radar (left) + Activity Heatmap (right) — 2-column, fixed height */}
      <div className="grid grid-cols-2 gap-1.5" style={{ height: 220 }}>
        {/* Radar */}
        <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl overflow-hidden flex flex-col">
          <div className="flex-shrink-0 px-2.5 pt-1.5 pb-0">
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">
              Structural Radar
            </span>
          </div>
          <div className="flex-1 min-h-0">
            {currentSnapshot ? (
              <CentralityRadarD3
                snapshot={currentSnapshot}
                metric={activeMetric === "all" ? centralityMetric : activeMetric}
                selectedPieces={selectedPieces}
              />
            ) : (
              <EmptyState label="No data" />
            )}
          </div>
        </div>

        {/* Activity Heatmap */}
        <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl overflow-hidden flex flex-col">
          <div className="flex-shrink-0 px-2.5 pt-1.5 pb-0">
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">
              Adjacency Matrix
            </span>
          </div>
          <div className="flex-1 min-h-0">
            {hasData ? (
              <CentralityHeatmapD3
                snapshots={analysisGraphSnapshots}
                analysisIndex={analysisIndex}
                selectedPieces={selectedPieces}
              />
            ) : (
              <EmptyState label="No data" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({ label }: { label: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <p className="text-[10px] text-slate-700 font-medium text-center max-w-[120px] leading-snug">
        {label}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
function CentralityTimelineD3({
  snapshots,
  currentIndex,
  activeMetric,
  selectedPieces,
  onIndexChange,
}: {
  snapshots: Array<GraphSnapshot | null>;
  currentIndex: number;
  activeMetric: ActiveMetric;
  selectedPieces: PieceSelection[];
  onIndexChange?: (index: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    const backgroundSeries: Record<string, number[]> = {};
    for (const m of ALL_METRICS) backgroundSeries[m] = new Array(snapshots.length).fill(0) as number[];
    const whiteMeans = new Array(snapshots.length).fill(0) as number[];
    const whiteStds  = new Array(snapshots.length).fill(0) as number[];
    const blackMeans = new Array(snapshots.length).fill(0) as number[];
    const blackStds  = new Array(snapshots.length).fill(0) as number[];

    const computeBand = (nodes: GraphNode[], metric: ActiveMetric) => {
      if (nodes.length === 0) return { mean: 0, std: 0 };
      const scores = nodes.map((n) => getMetricValue(n, metric));
      const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
      const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
      return { mean, std: Math.sqrt(variance) };
    };

    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i];
      if (!snap) continue;
      const allFiltered = filterNodes(snap.nodes, selectedPieces);
      if (allFiltered.length === 0) continue;
      for (const m of ALL_METRICS) {
        const avg = allFiltered.reduce((s, n) => s + getMetricValue(n, m), 0) / allFiltered.length;
        (backgroundSeries[m] as number[])[i] = avg;
      }
      const wb = computeBand(allFiltered.filter((n) => n.color === "w"), activeMetric);
      const bb = computeBand(allFiltered.filter((n) => n.color === "b"), activeMetric);
      whiteMeans[i] = wb.mean;
      whiteStds[i]  = wb.std;
      blackMeans[i] = bb.mean;
      blackStds[i]  = bb.std;
    }

    const maxVal = Math.max(
      ...ALL_METRICS.flatMap((m) => backgroundSeries[m] as number[]),
      ...whiteMeans.map((mv, i) => mv + (whiteStds[i] ?? 0)),
      ...blackMeans.map((mv, i) => mv + (blackStds[i] ?? 0)),
      0.1,
    );
    return { backgroundSeries, whiteMeans, whiteStds, blackMeans, blackStds, maxVal };
  }, [snapshots, selectedPieces, activeMetric]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const m = { top: 10, right: 46, bottom: 18, left: 30 };
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;

    const x = d3.scaleLinear().domain([0, Math.max(1, snapshots.length - 1)]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, data.maxVal]).range([ih, 0]).nice();
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    g.append("g").selectAll("line.grid")
      .data(y.ticks(4)).join("line")
      .attr("x1", 0).attr("x2", iw)
      .attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
      .attr("stroke", "rgba(51,65,85,0.22)").attr("stroke-width", 1);

    g.append("g")
      .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".2f")).tickSize(0).tickPadding(5))
      .call((ax) => ax.select(".domain").remove())
      .call((ax) => ax.selectAll("text").attr("font-size", "8px").attr("fill", "rgba(100,116,139,0.7)").attr("font-family", "monospace"));

    g.append("g").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(Math.min(8, snapshots.length)).tickSize(2).tickPadding(3))
      .call((ax) => ax.select(".domain").remove())
      .call((ax) => ax.selectAll("text").attr("font-size", "8px").attr("fill", "rgba(100,116,139,0.5)").attr("font-family", "monospace"));

    const line = d3.line<number>().x((_, i) => x(i)).y((d) => y(d)).curve(d3.curveMonotoneX);

    // Background metric lines (faded ghosts)
    ALL_METRICS.forEach((met, mi) => {
      const color = METRIC_COLORS[met];
      const values = data.backgroundSeries[met] as number[];
      const isActive = activeMetric === met;
      g.append("path").datum(values)
        .attr("fill", "none").attr("stroke", color)
        .attr("stroke-width", isActive ? 1 : 0.8)
        .attr("d", line as any)
        .attr("opacity", isActive ? 0.28 : 0.12);
      g.append("circle").attr("cx", 4).attr("cy", 6 + mi * 10).attr("r", 2)
        .attr("fill", color).attr("opacity", isActive ? 0.5 : 0.22);
      g.append("text")
        .attr("x", 8).attr("y", 6 + mi * 10).attr("dy", "0.35em")
        .attr("font-size", "6px").attr("fill", color).attr("font-family", "monospace")
        .attr("opacity", isActive ? 0.55 : 0.22)
        .text(METRIC_BUTTON[met] ?? met);
    });

    // White and black variance bands + mean lines
    const hasWhiteData = data.whiteMeans.some((v) => v > 0);
    const hasBlackData = data.blackMeans.some((v) => v > 0);

    const makeAreaGen = (means: number[], stds: number[]) =>
      d3.area<number>()
        .x((_, i) => x(i))
        .y0((_, i) => y(Math.max(0, (means[i] ?? 0) - (stds[i] ?? 0))))
        .y1((_, i) => y((means[i] ?? 0) + (stds[i] ?? 0)))
        .curve(d3.curveMonotoneX);

    if (hasWhiteData) {
      g.append("path").datum(data.whiteMeans)
        .attr("fill", `${WHITE_PIECES_COLOR}18`).attr("stroke", "none")
        .attr("d", makeAreaGen(data.whiteMeans, data.whiteStds) as any);
      g.append("path").datum(data.whiteMeans)
        .attr("fill", "none").attr("stroke", WHITE_PIECES_COLOR).attr("stroke-width", 2)
        .attr("d", line as any).attr("opacity", 0.9)
        .style("filter", `drop-shadow(0 0 3px ${WHITE_PIECES_COLOR}66)`);
      const lastW = data.whiteMeans[snapshots.length - 1];
      if (lastW !== undefined && lastW > 0) {
        g.append("text")
          .attr("x", iw + 4).attr("y", y(lastW)).attr("dy", "0.35em")
          .attr("font-size", "7px").attr("fill", WHITE_PIECES_COLOR)
          .attr("font-family", "monospace").attr("font-weight", "bold").text("W");
      }
    }

    if (hasBlackData) {
      g.append("path").datum(data.blackMeans)
        .attr("fill", `${BLACK_PIECES_COLOR}18`).attr("stroke", "none")
        .attr("d", makeAreaGen(data.blackMeans, data.blackStds) as any);
      g.append("path").datum(data.blackMeans)
        .attr("fill", "none").attr("stroke", BLACK_PIECES_COLOR).attr("stroke-width", 2)
        .attr("d", line as any).attr("opacity", 0.9)
        .style("filter", `drop-shadow(0 0 3px ${BLACK_PIECES_COLOR}66)`);
      const lastB = data.blackMeans[snapshots.length - 1];
      if (lastB !== undefined && lastB > 0) {
        g.append("text")
          .attr("x", iw + 4).attr("y", y(lastB)).attr("dy", "0.35em")
          .attr("font-size", "7px").attr("fill", BLACK_PIECES_COLOR)
          .attr("font-family", "monospace").attr("font-weight", "bold").text("B");
      }
    }

    g.append("line")
      .attr("x1", x(currentIndex)).attr("x2", x(currentIndex))
      .attr("y1", 0).attr("y2", ih)
      .attr("stroke", "#6366f1").attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3,2").attr("opacity", 0.85);

    if (onIndexChange) {
      svg.append("rect")
        .attr("x", m.left).attr("y", m.top).attr("width", iw).attr("height", ih)
        .attr("fill", "transparent").style("cursor", "crosshair")
        .on("click", (event) => {
          const [mx] = d3.pointer(event);
          const step = Math.round(x.invert(mx - m.left));
          if (step >= 0 && step < snapshots.length) onIndexChange(step);
        })
        .on("mousemove", (event) => {
          if (!tooltipRef.current) return;
          const [mx] = d3.pointer(event);
          const step = Math.round(x.invert(mx - m.left));
          if (step < 0 || step >= snapshots.length) return;

          const wMean = data.whiteMeans[step] ?? 0;
          const wStd  = data.whiteStds[step]  ?? 0;
          const bMean = data.blackMeans[step] ?? 0;
          const bStd  = data.blackStds[step]  ?? 0;
          let content = `<div style="font-size:9px;font-weight:900;color:#94a3b8;margin-bottom:2px">${METRIC_INTUITIVE[activeMetric]} · STEP ${step}</div>`;
          if (wMean > 0) content += `<span style="color:${WHITE_PIECES_COLOR}">White: ${wMean.toFixed(3)} ± ${wStd.toFixed(3)}</span><br/>`;
          if (bMean > 0) content += `<span style="color:${BLACK_PIECES_COLOR}">Black: ${bMean.toFixed(3)} ± ${bStd.toFixed(3)}</span>`;

          const px = x(step) + m.left;
          const tip = tooltipRef.current;
          tip.style.display = "block";
          tip.style.left = `${Math.min(px + 8, width - 90)}px`;
          tip.style.top = `${m.top}px`;
          tip.innerHTML = content;
        })
        .on("mouseleave", () => {
          if (tooltipRef.current) tooltipRef.current.style.display = "none";
        });
    }
  }, [data, currentIndex, snapshots.length, onIndexChange, activeMetric]);

  const isEmpty = data.whiteMeans.every((v) => v === 0) && data.blackMeans.every((v) => v === 0);

  if (isEmpty) return <EmptyState label="Play moves to see centrality history" />;

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
      <div
        ref={tooltipRef}
        className="absolute pointer-events-none bg-slate-900/95 border border-slate-700/80 rounded-lg px-2 py-1.5 text-[10px] font-mono shadow-2xl leading-snug z-10"
        style={{ display: "none" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------
function CentralityRadarD3({
  snapshot,
  metric,
  selectedPieces,
}: {
  snapshot: GraphSnapshot;
  metric: CentralityMetric;
  selectedPieces: PieceSelection[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const radarData = useMemo(() => {
    const filtered = filterNodes(snapshot.nodes, selectedPieces);
    if (filtered.length === 0) {
      return [...snapshot.nodes]
        .sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric))
        .slice(0, 3)
        .map((node) => ({
          label: node.square,
          color: COMMUNITY_COLORS[node.communityId % COMMUNITY_COLORS.length] ?? "#ccc",
          vals: {
            weighted: node.centralityWeighted,
            degree: node.centralityDegree,
            betweenness: node.centralityBetweenness,
            closeness: node.centralityCloseness,
            pagerank: node.centralityPageRank,
          },
        }));
    }

    const avg = {
      weighted: filtered.reduce((s, n) => s + n.centralityWeighted, 0) / filtered.length,
      degree: filtered.reduce((s, n) => s + n.centralityDegree, 0) / filtered.length,
      betweenness: filtered.reduce((s, n) => s + n.centralityBetweenness, 0) / filtered.length,
      closeness: filtered.reduce((s, n) => s + n.centralityCloseness, 0) / filtered.length,
      pagerank: filtered.reduce((s, n) => s + n.centralityPageRank, 0) / filtered.length,
    };

    const color = selectedPieces.length === 1
      ? (selectionColor(selectedPieces, snapshot.nodes))
      : "#6366f1";

    const label = selectedPieces.length === 1
      ? pieceFullLabel(selectedPieces[0]!.color, selectedPieces[0]!.type)
      : `${selectedPieces.length} types`;

    return [{ label, color, vals: avg }];
  }, [snapshot, metric, selectedPieces]);

  useEffect(() => {
    if (!svgRef.current || radarData.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const radius = Math.min(width, height) / 2 - 22;
    const cx = width / 2;
    const cy = height / 2;

    const axes = ALL_METRICS;
    const axisLabels = ["Power", "Links", "Bridge", "Reach", "Influence"];
    const angleSlice = (Math.PI * 2) / axes.length;
    const rScale = d3.scaleLinear().domain([0, 1]).range([0, radius]);
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    const maxes = {
      weighted: Math.max(...snapshot.nodes.map((n) => n.centralityWeighted), 0.001),
      degree: Math.max(...snapshot.nodes.map((n) => n.centralityDegree), 0.001),
      betweenness: Math.max(...snapshot.nodes.map((n) => n.centralityBetweenness), 0.001),
      closeness: Math.max(...snapshot.nodes.map((n) => n.centralityCloseness), 0.001),
      pagerank: Math.max(...snapshot.nodes.map((n) => n.centralityPageRank), 0.001),
    };

    [0.25, 0.5, 0.75, 1].forEach((d) => {
      g.append("circle").attr("r", rScale(d))
        .attr("fill", "none").attr("stroke", "rgba(51,65,85,0.35)").attr("stroke-dasharray", "2,3");
    });

    axes.forEach((axis, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const lx = rScale(1.22) * Math.cos(angle);
      const ly = rScale(1.22) * Math.sin(angle);
      g.append("line").attr("x1", 0).attr("y1", 0)
        .attr("x2", rScale(1) * Math.cos(angle)).attr("y2", rScale(1) * Math.sin(angle))
        .attr("stroke", "rgba(51,65,85,0.4)");
      g.append("text")
        .attr("x", lx).attr("y", ly).attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("font-size", "7px").attr("fill", "rgba(148,163,184,0.7)")
        .attr("font-family", "monospace").attr("font-weight", "bold")
        .text(axisLabels[i] ?? axis);
    });

    const radarLine = d3.lineRadial<{ axis: string; value: number }>()
      .radius((d) => rScale(d.value))
      .angle((_, i) => i * angleSlice)
      .curve(d3.curveLinearClosed);

    radarData.forEach((row) => {
      const values = axes.map((axis) => ({
        axis,
        value: Math.min(1, row.vals[axis] / maxes[axis]),
      }));
      g.append("path").datum(values).attr("d", radarLine)
        .attr("fill", row.color).attr("fill-opacity", 0.15)
        .attr("stroke", row.color).attr("stroke-width", 1.8)
        .style("filter", `drop-shadow(0 0 4px ${row.color}55)`);
      values.forEach((v, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        g.append("circle").attr("r", 2.5)
          .attr("cx", rScale(v.value) * Math.cos(angle))
          .attr("cy", rScale(v.value) * Math.sin(angle))
          .attr("fill", row.color).attr("stroke", "rgba(15,23,42,0.8)").attr("stroke-width", 1);
      });
    });

    radarData.forEach((row, i) => {
      const lx = -cx + 8;
      const ly = -cy + 10 + i * 12;
      g.append("circle").attr("cx", lx).attr("cy", ly).attr("r", 3).attr("fill", row.color);
      g.append("text").attr("x", lx + 6).attr("y", ly).attr("dy", "0.35em")
        .attr("font-size", "7px").attr("fill", row.color).attr("font-family", "monospace").text(row.label);
    });
  }, [radarData, snapshot]);

  return <svg ref={svgRef} className="w-full h-full" />;
}

// ---------------------------------------------------------------------------
// Adjacency Matrix Heatmap
// ---------------------------------------------------------------------------

type PieceKey = string; // e.g. "wp", "bn"
type EdgeMode = "attack" | "defense" | "both";

const MATRIX_KEYS: PieceKey[] = [
  "wp", "wn", "wb", "wr", "wq", "wk",
  "bp", "bn", "bb", "br", "bq", "bk",
];

const MATRIX_SYMBOLS: Record<PieceKey, string> = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

const MATRIX_LABELS: Record<PieceKey, string> = {
  wp: "White Pawn",   wn: "White Knight", wb: "White Bishop",
  wr: "White Rook",   wq: "White Queen",  wk: "White King",
  bp: "Black Pawn",   bn: "Black Knight", bb: "Black Bishop",
  br: "Black Rook",   bq: "Black Queen",  bk: "Black King",
};

function CentralityHeatmapD3({
  snapshots,
  analysisIndex,
  selectedPieces,
}: {
  snapshots: Array<GraphSnapshot | null>;
  analysisIndex: number;
  selectedPieces: PieceSelection[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [edgeMode, setEdgeMode] = React.useState<EdgeMode>("both");

  // Build separate attack/defense matrices; per-piece-type normalization (divide by piece count)
  const matrices = useMemo(() => {
    const attackSum: Record<string, number> = {};
    const attackCnt: Record<string, number> = {};
    const defenseSum: Record<string, number> = {};
    const defenseCnt: Record<string, number> = {};
    const limit = Math.min(analysisIndex + 1, snapshots.length);

    for (let si = 0; si < limit; si++) {
      const snap = snapshots[si];
      if (!snap) continue;

      const bySquare = new Map<string, PieceKey>();
      const pieceCount = new Map<PieceKey, number>();
      for (const node of snap.nodes) {
        const key: PieceKey = `${node.color}${node.type}`;
        bySquare.set(node.square, key);
        pieceCount.set(key, (pieceCount.get(key) ?? 0) + 1);
      }

      for (const edge of snap.edges) {
        const fromKey = bySquare.get(edge.from);
        const toKey = bySquare.get(edge.to);
        if (!fromKey || !toKey) continue;
        const count = pieceCount.get(fromKey) ?? 1;
        const normWeight = edge.weight / count;
        const cell = `${fromKey}|${toKey}`;
        const cellRev = `${toKey}|${fromKey}`;
        if (edge.type === "attack") {
          attackSum[cell] = (attackSum[cell] ?? 0) + normWeight;
          attackCnt[cell] = (attackCnt[cell] ?? 0) + 1;
          attackSum[cellRev] = (attackSum[cellRev] ?? 0) + normWeight;
          attackCnt[cellRev] = (attackCnt[cellRev] ?? 0) + 1;
        } else {
          defenseSum[cell] = (defenseSum[cell] ?? 0) + normWeight;
          defenseCnt[cell] = (defenseCnt[cell] ?? 0) + 1;
          defenseSum[cellRev] = (defenseSum[cellRev] ?? 0) + normWeight;
          defenseCnt[cellRev] = (defenseCnt[cellRev] ?? 0) + 1;
        }
      }
    }

    const buildMatrix = (s: Record<string, number>, c: Record<string, number>) => {
      const raw: Record<string, number> = {};
      for (const key of Object.keys(s)) {
        raw[key] = (s[key] ?? 0) / Math.max(1, c[key] ?? 1);
      }
      const maxVal = Math.max(...Object.values(raw), 0.001);
      const normalized: Record<string, number> = {};
      for (const key of Object.keys(raw)) {
        normalized[key] = (raw[key] ?? 0) / maxVal;
      }
      return { raw, normalized, maxVal };
    };

    return {
      attack: buildMatrix(attackSum, attackCnt),
      defense: buildMatrix(defenseSum, defenseCnt),
    };
  }, [snapshots, analysisIndex]);

  const selectedKeys = useMemo<Set<PieceKey>>(() => {
    if (selectedPieces.length === 0) return new Set(MATRIX_KEYS);
    return new Set(selectedPieces.map((s): PieceKey => `${s.color}${s.type}`));
  }, [selectedPieces]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const N = MATRIX_KEYS.length; // 12
    const labelW = 20;
    const labelH = 20;
    const pad = { top: labelH + 4, left: labelW + 4, right: 6, bottom: 6 };
    const cw = (width - pad.left - pad.right) / N;
    const ch = (height - pad.top - pad.bottom) / N;

    const g = svg.append("g").attr("transform", `translate(${pad.left},${pad.top})`);

    const getVal = (cellKey: string) => {
      if (edgeMode === "attack") return matrices.attack.normalized[cellKey] ?? 0;
      if (edgeMode === "defense") return matrices.defense.normalized[cellKey] ?? 0;
      return ((matrices.attack.normalized[cellKey] ?? 0) + (matrices.defense.normalized[cellKey] ?? 0)) / 2;
    };

    let rgb = "99,102,241";
    if (edgeMode === "attack") rgb = "251,113,133";
    else if (edgeMode === "defense") rgb = "52,211,153";

    let sepStroke = "rgba(99,102,241,0.35)";
    if (edgeMode === "attack") sepStroke = "rgba(251,113,133,0.3)";
    else if (edgeMode === "defense") sepStroke = "rgba(52,211,153,0.3)";

    const sepX = (N / 2) * cw;
    const sepY = (N / 2) * ch;
    g.append("line")
      .attr("x1", sepX - 0.5).attr("x2", sepX - 0.5)
      .attr("y1", -labelH).attr("y2", N * ch)
      .attr("stroke", sepStroke).attr("stroke-width", 1);
    g.append("line")
      .attr("y1", sepY - 0.5).attr("y2", sepY - 0.5)
      .attr("x1", -labelW).attr("x2", N * cw)
      .attr("stroke", sepStroke).attr("stroke-width", 1);

    MATRIX_KEYS.forEach((rowKey, ri) => {
      MATRIX_KEYS.forEach((colKey, ci) => {
        const cellKey = `${rowKey}|${colKey}`;
        const v = getVal(cellKey);
        const rowActive = selectedKeys.has(rowKey);
        const colActive = selectedKeys.has(colKey);
        const bothActive = rowActive && colActive;
        const active = rowActive || colActive;

        let fill = `rgba(30,41,59,${0.2 + v * 0.1})`;
        if (bothActive) fill = `rgba(${rgb},${Math.max(0.06, v * 0.88)})`;
        else if (active) fill = `rgba(${rgb},${Math.max(0.03, v * 0.55)})`;

        g.append("rect")
          .attr("x", ci * cw + 0.5).attr("y", ri * ch + 0.5)
          .attr("width", cw - 1).attr("height", ch - 1)
          .attr("rx", 1)
          .attr("fill", fill)
          .attr("stroke", bothActive && v > 0.3 ? `rgba(${rgb},0.5)` : "rgba(15,23,42,0.0)")
          .attr("stroke-width", 0.5)
          .style("filter", bothActive && v > 0.5 ? `drop-shadow(0 0 2px rgba(${rgb},${v * 0.6}))` : "none");
      });
    });

    MATRIX_KEYS.forEach((key, ci) => {
      const isWhite = key.startsWith("w");
      const active = selectedKeys.has(key);
      const pieceHeaderColor = isWhite ? "#fbbf24" : "#38bdf8";
      const colFill = active ? pieceHeaderColor : "rgba(100,116,139,0.45)";
      g.append("text")
        .attr("x", ci * cw + cw / 2).attr("y", -4)
        .attr("text-anchor", "middle").attr("dominant-baseline", "auto")
        .attr("font-size", `${Math.min(cw * 0.72, 9)}px`)
        .attr("fill", colFill)
        .attr("font-family", "monospace").attr("font-weight", "bold")
        .text(MATRIX_SYMBOLS[key] ?? key);
    });

    MATRIX_KEYS.forEach((key, ri) => {
      const isWhite = key.startsWith("w");
      const active = selectedKeys.has(key);
      const pieceRowColor = isWhite ? "#fbbf24" : "#38bdf8";
      const rowFill = active ? pieceRowColor : "rgba(100,116,139,0.45)";
      g.append("text")
        .attr("x", -3).attr("y", ri * ch + ch / 2)
        .attr("text-anchor", "end").attr("dominant-baseline", "middle")
        .attr("font-size", `${Math.min(ch * 0.72, 9)}px`)
        .attr("fill", rowFill)
        .attr("font-family", "monospace").attr("font-weight", "bold")
        .text(MATRIX_SYMBOLS[key] ?? key);
    });

    g.append("text")
      .attr("x", (N / 4) * cw).attr("y", -labelH)
      .attr("text-anchor", "middle").attr("dominant-baseline", "hanging")
      .attr("font-size", "7px").attr("fill", "rgba(251,191,36,0.45)")
      .attr("font-family", "monospace").attr("font-weight", "black")
      .attr("letter-spacing", "0.08em").text("WHITE →");
    g.append("text")
      .attr("x", (N / 4) * 3 * cw).attr("y", -labelH)
      .attr("text-anchor", "middle").attr("dominant-baseline", "hanging")
      .attr("font-size", "7px").attr("fill", "rgba(56,189,248,0.45)")
      .attr("font-family", "monospace").attr("font-weight", "black")
      .attr("letter-spacing", "0.08em").text("BLACK →");

    type CellDatum = { rowKey: string; colKey: string; ri: number; ci: number; atkRaw: number; defRaw: number };
    const cellData: CellDatum[] = MATRIX_KEYS.flatMap((rowKey, ri) =>
      MATRIX_KEYS.map((colKey, ci) => ({
        rowKey,
        colKey,
        ri,
        ci,
        atkRaw: matrices.attack.raw[`${rowKey}|${colKey}`] ?? 0,
        defRaw: matrices.defense.raw[`${rowKey}|${colKey}`] ?? 0,
      })),
    );

    const tooltipEl = tooltipRef.current;
    g.selectAll<SVGRectElement, CellDatum>("rect.tip")
      .data(cellData)
      .enter()
      .append("rect")
      .attr("class", "tip")
      .attr("x", (d) => d.ci * cw)
      .attr("y", (d) => d.ri * ch)
      .attr("width", cw)
      .attr("height", ch)
      .attr("fill", "transparent")
      .style("cursor", (d) => (d.atkRaw > 0 || d.defRaw > 0 ? "crosshair" : "default"))
      .on("mousemove", (event: MouseEvent, d) => {
        if (!tooltipEl) return;
        tooltipEl.style.display = "block";
        tooltipEl.style.left = `${event.offsetX + 8}px`;
        tooltipEl.style.top = `${event.offsetY - 40}px`;
        tooltipEl.innerHTML = [
          `<span style="color:#94a3b8;font-weight:900">${MATRIX_LABELS[d.rowKey]} → ${MATRIX_LABELS[d.colKey]}</span>`,
          `<span style="color:#f87171">⚔ atk: ${d.atkRaw.toFixed(3)}</span>`,
          `<span style="color:#34d399">🛡 def: ${d.defRaw.toFixed(3)}</span>`,
        ].join("<br/>");
      })
      .on("mouseleave", () => {
        if (tooltipEl) tooltipEl.style.display = "none";
      });
  }, [matrices, edgeMode, selectedKeys]);

  const hasData =
    Object.keys(matrices.attack.raw).length > 0 ||
    Object.keys(matrices.defense.raw).length > 0;
  if (!hasData) return <EmptyState label="Play moves to build the adjacency matrix" />;

  const getModeClass = (m: EdgeMode) => {
    if (edgeMode !== m) return "text-slate-600 hover:text-slate-400";
    if (m === "attack") return "bg-rose-900/40 text-rose-400";
    if (m === "defense") return "bg-emerald-900/40 text-emerald-400";
    return "bg-gradient-to-r from-rose-900/50 to-emerald-900/50 text-indigo-300";
  };

  const getModeLabel = (m: EdgeMode) => {
    if (m === "attack") return "⚔ Atk";
    if (m === "defense") return "🛡 Def";
    return "Both";
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-center gap-0.5 py-0.5">
        {(["attack", "both", "defense"] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => setEdgeMode(m)}
            className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded transition-colors ${getModeClass(m)}`}
          >
            {getModeLabel(m)}
          </button>
        ))}
      </div>
      <div className="relative flex-1 min-h-0">
        <svg ref={svgRef} className="w-full h-full" />
        <div
          ref={tooltipRef}
          className="absolute pointer-events-none bg-slate-900/95 border border-slate-700/80 rounded-md px-2 py-1 text-[9px] font-mono shadow-xl leading-snug z-10"
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}

