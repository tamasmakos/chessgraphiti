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

/** Per-piece-type colors for timeline lines. White pieces are bright; black pieces are muted/cool. */
const PIECE_LINE_COLORS: Record<string, string> = {
  wk: "#f472b6", wq: "#facc15", wr: "#22d3ee", wb: "#34d399", wn: "#fb923c", wp: "#94a3b8",
  bk: "#e879f9", bq: "#c084fc", br: "#818cf8", bb: "#6ee7b7", bn: "#fdba74", bp: "#475569",
};

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

      {/* Timeline (left) + Structural Radar (right) — compact top row */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 165px", height: 185 }}>
        {/* Timeline */}
        <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl overflow-hidden flex flex-col">
          <div className="flex-shrink-0 px-2.5 pt-1.5 pb-0">
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">
              Centrality Timeline
            </span>
          </div>
          <div className="flex-1 min-h-0">
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
        </div>

        {/* Structural Radar */}
        <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl overflow-hidden flex flex-col">
          <div className="flex-shrink-0 px-2.5 pt-1.5 pb-0">
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">
              Radar
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
      </div>

      {/* Adjacency Matrix — full width, primary panel */}
      <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl overflow-hidden flex flex-col" style={{ height: 260 }}>
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

    // One line per color+type (e.g. "wq", "br"). Multiple same-type pieces are averaged.
    const pieceLineVals = new Map<string, number[]>(); // key -> sum per step
    const pieceLineCnts = new Map<string, number[]>(); // key -> count per step

    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i];
      if (!snap) continue;
      const allFiltered = filterNodes(snap.nodes, selectedPieces);
      if (allFiltered.length === 0) continue;
      for (const m of ALL_METRICS) {
        const avg = allFiltered.reduce((s, n) => s + getMetricValue(n, m), 0) / allFiltered.length;
        (backgroundSeries[m] as number[])[i] = avg;
      }
      for (const node of allFiltered) {
        const key = `${node.color}${node.type}`;
        if (!pieceLineVals.has(key)) {
          pieceLineVals.set(key, new Array(snapshots.length).fill(0) as number[]);
          pieceLineCnts.set(key, new Array(snapshots.length).fill(0) as number[]);
        }
        const vals = pieceLineVals.get(key)!;
        const cnts = pieceLineCnts.get(key)!;
        vals[i] = (vals[i] ?? 0) + getMetricValue(node, activeMetric);
        cnts[i] = (cnts[i] ?? 0) + 1;
      }
    }

    const PIECE_TYPE_ORDER: Record<string, number> = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };
    const PIECE_TYPE_NAMES: Record<string, string> = { k: "King", q: "Queen", r: "Rook", b: "Bishop", n: "Knight", p: "Pawn" };
    const pieceLines = [...pieceLineVals.entries()]
      .map(([key, sums]) => {
        const cnts = pieceLineCnts.get(key) ?? [];
        const values = sums.map((s, i) => {
          const c = cnts[i] ?? 0;
          return c > 0 ? s / c : 0;
        });
        const pieceType = key[1] ?? "p";
        const isWhite = key.startsWith("w");
        const label = isWhite ? pieceType.toUpperCase() : pieceType;
        const fullName = `${isWhite ? "White" : "Black"} ${PIECE_TYPE_NAMES[pieceType] ?? pieceType}`;
        return { key, label, fullName, color: PIECE_LINE_COLORS[key] ?? "#6366f1", values };
      })
      .sort((a, b) => {
        const aW = a.key.startsWith("w") ? 0 : 1;
        const bW = b.key.startsWith("w") ? 0 : 1;
        if (aW !== bW) return aW - bW;
        return (PIECE_TYPE_ORDER[a.key[1] ?? ""] ?? 9) - (PIECE_TYPE_ORDER[b.key[1] ?? ""] ?? 9);
      });

    const maxVal = Math.max(
      ...ALL_METRICS.flatMap((m) => backgroundSeries[m] as number[]),
      ...pieceLines.flatMap((pl) => pl.values),
      0.1,
    );
    return { backgroundSeries, pieceLines, maxVal };
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

    // Individual piece-type lines (one per color+type, e.g. wQ, bR)
    for (const pl of data.pieceLines) {
      if (!pl.values.some((v) => v > 0)) continue;
      g.append("path").datum(pl.values)
        .attr("fill", "none")
        .attr("stroke", pl.color)
        .attr("stroke-width", 1.5)
        .attr("d", line as any)
        .attr("opacity", 0.88)
        .style("filter", `drop-shadow(0 0 2px ${pl.color}55)`);

      // Label at the last non-zero data point
      let lastIdx = -1;
      for (let li = pl.values.length - 1; li >= 0; li--) {
        if ((pl.values[li] ?? 0) > 0) { lastIdx = li; break; }
      }
      const lastVal = lastIdx >= 0 ? (pl.values[lastIdx] ?? 0) : 0;
      if (lastVal > 0) {
        g.append("text")
          .attr("x", iw + 4)
          .attr("y", y(lastVal))
          .attr("dy", "0.35em")
          .attr("font-size", "7px")
          .attr("fill", pl.color)
          .attr("font-family", "monospace")
          .attr("font-weight", "bold")
          .text(pl.label);
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

          let content = `<div style="font-size:9px;font-weight:900;color:#94a3b8;margin-bottom:2px">${METRIC_INTUITIVE[activeMetric]} · STEP ${step}</div>`;
          for (const pl of data.pieceLines) {
            const val = pl.values[step] ?? 0;
            if (val > 0) content += `<span style="color:${pl.color}">${pl.fullName}: ${val.toFixed(3)}</span><br/>`;
          }

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

  const isEmpty = data.pieceLines.every((pl) => pl.values.every((v) => v === 0));

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

type PieceKey = string; // e.g. "wp", "wr-a1", "bn-g8"
type EdgeMode = "attack" | "defense" | "both";

// Piece-type letter lookup (uppercase = white, lowercase = black — FEN convention)
const PIECE_SYMBOL: Record<string, string> = {
  wp: "P", wn: "N", wb: "B", wr: "R", wq: "Q", wk: "K",
  bp: "p", bn: "n", bb: "b", br: "r", bq: "q", bk: "k",
};

// Derive a stable matrix key for a node.
// Pawns (type "p") are aggregated by color — all white pawns share "wp".
// Every other piece is uniquely identified by color+type+square, e.g. "wr-a1".
function nodeMatrixKey(color: string, type: string, square: string): string {
  if (type === "p") return `${color}p`;
  return `${color}${type}-${square}`;
}

// Short display label for a matrix key: "Ra1", "ng8", "P", "p" etc.
function matrixKeySymbol(key: string): string {
  if (key.length === 2) {
    // pawn aggregate: "wp" → "P", "bp" → "p"
    return PIECE_SYMBOL[key] ?? key;
  }
  // unique piece: "wr-a1" → "Ra1", "bn-g8" → "ng8"
  const dashIdx = key.indexOf("-");
  if (dashIdx === -1) return key;
  const typeKey = key.slice(0, dashIdx); // "wr"
  const square = key.slice(dashIdx + 1); // "a1"
  return (PIECE_SYMBOL[typeKey] ?? typeKey) + square;
}

// Readable label for tooltip heading
function matrixKeyLabel(key: string): string {
  const colorNames: Record<string, string> = { w: "White", b: "Black" };
  const typeNames: Record<string, string> = {
    p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King",
  };
  if (key.length === 2) {
    return `${colorNames[key[0] ?? ""] ?? ""} ${typeNames[key[1] ?? ""] ?? key}`;
  }
  const dashIdx = key.indexOf("-");
  const typeKey = dashIdx === -1 ? key : key.slice(0, dashIdx);
  const square = dashIdx === -1 ? "" : key.slice(dashIdx + 1);
  const colorPart = colorNames[typeKey[0] ?? ""] ?? "";
  const typePart = typeNames[typeKey[1] ?? ""] ?? typeKey;
  const squarePart = square ? ` (${square})` : "";
  return `${colorPart} ${typePart}${squarePart}`;
}

// Canonical ordering: white first (p n b r q k), then black.
// Within a piece type, sort by square alphabetically (file then rank).
const TYPE_ORDER: Record<string, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };
function sortMatrixKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const aColor = a.startsWith("w") ? 0 : 1;
    const bColor = b.startsWith("w") ? 0 : 1;
    if (aColor !== bColor) return aColor - bColor;
    const aType = a[1];
    const bType = b[1];
    const aOrd = TYPE_ORDER[aType ?? ""] ?? 9;
    const bOrd = TYPE_ORDER[bType ?? ""] ?? 9;
    if (aOrd !== bOrd) return aOrd - bOrd;
    // Same type: sort by square (aggregate pawn row — no dash — comes first)
    return a.localeCompare(b);
  });
}

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

  // Derive the row/col keys from the CURRENT snapshot so they reflect actual pieces.
  // Pawns are aggregated (one row per color); every other piece is a unique square row.
  const matrixKeys = useMemo<string[]>(() => {
    const snap = snapshots[analysisIndex];
    if (!snap) return [];
    const keySet = new Set<string>();
    for (const node of snap.nodes) {
      keySet.add(nodeMatrixKey(node.color, node.type, node.square));
    }
    return sortMatrixKeys([...keySet]);
  }, [snapshots, analysisIndex]);

  // Build attack/defense matrices from the current snapshot only so the matrix
  // reflects exactly the edges visible on the board at analysisIndex.
  const matrices = useMemo(() => {
    const attackRaw: Record<string, number> = {};
    const defenseRaw: Record<string, number> = {};
    const snap = snapshots[analysisIndex];

    if (snap) {
      const squareToKey = new Map<string, string>();
      for (const node of snap.nodes) {
        squareToKey.set(node.square, nodeMatrixKey(node.color, node.type, node.square));
      }

      for (const edge of snap.edges) {
        const fromKey = squareToKey.get(edge.from);
        const toKey = squareToKey.get(edge.to);
        if (!fromKey || !toKey) continue;
        const cell = `${fromKey}|${toKey}`;
        if (edge.type === "attack") {
          attackRaw[cell] = (attackRaw[cell] ?? 0) + edge.weight;
        } else {
          defenseRaw[cell] = (defenseRaw[cell] ?? 0) + edge.weight;
        }
      }
    }

    const buildMatrix = (raw: Record<string, number>) => {
      const maxVal = Math.max(...Object.values(raw), 0.001);
      const normalized: Record<string, number> = {};
      for (const key of Object.keys(raw)) {
        normalized[key] = (raw[key] ?? 0) / maxVal;
      }
      return { raw, normalized, maxVal };
    };

    return {
      attack: buildMatrix(attackRaw),
      defense: buildMatrix(defenseRaw),
    };
  }, [snapshots, analysisIndex]);

  const selectedKeys = useMemo<Set<string>>(() => {
    if (selectedPieces.length === 0) return new Set(matrixKeys);
    // Map PieceSelection (color+type) → all matrixKeys matching that type.
    // Pawns match aggregate key; others match every unique-piece key of that type.
    const selSet = new Set(selectedPieces.map((s) => `${s.color}${s.type}`));
    return new Set(
      matrixKeys.filter((k) => {
        const typeKey = k.length === 2 ? k : k.slice(0, k.indexOf("-"));
        return selSet.has(typeKey);
      }),
    );
  }, [selectedPieces, matrixKeys]);

  // Directional snapshot of actual edges at the current analysis index.
  // Used to populate the per-cell hover tooltip with real weights.
  type EdgeEntry = { from: string; to: string; weight: number };
  const currentEdgeMap = useMemo(() => {
    const snap = snapshots[analysisIndex];
    const map = new Map<string, { attacks: EdgeEntry[]; defenses: EdgeEntry[] }>();
    if (!snap) return map;
    const squareToKey = new Map<string, string>();
    for (const node of snap.nodes) {
      squareToKey.set(node.square, nodeMatrixKey(node.color, node.type, node.square));
    }
    for (const edge of snap.edges) {
      const fromKey = squareToKey.get(edge.from);
      const toKey = squareToKey.get(edge.to);
      if (!fromKey || !toKey) continue;
      const cellKey = `${fromKey}|${toKey}`;
      const existing = map.get(cellKey) ?? { attacks: [], defenses: [] };
      if (edge.type === "attack") {
        existing.attacks.push({ from: edge.from, to: edge.to, weight: edge.weight });
      } else {
        existing.defenses.push({ from: edge.from, to: edge.to, weight: edge.weight });
      }
      map.set(cellKey, existing);
    }
    return map;
  }, [snapshots, analysisIndex]);

  useEffect(() => {
    if (!svgRef.current || matrixKeys.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const N = matrixKeys.length;
    // Label area sized for "Ra1" / "ng8" style letter labels
    const labelW = 32;
    const labelH = 32;
    const pad = { top: labelH + 6, left: labelW + 6, right: 8, bottom: 8 };
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

    // Separator between white and black pieces (first black key index)
    const firstBlackIdx = matrixKeys.findIndex((k) => k.startsWith("b"));
    const sepX = firstBlackIdx > 0 ? firstBlackIdx * cw : N * 0.5 * cw;
    const sepY = firstBlackIdx > 0 ? firstBlackIdx * ch : N * 0.5 * ch;
    g.append("line")
      .attr("x1", sepX - 0.5).attr("x2", sepX - 0.5)
      .attr("y1", -labelH).attr("y2", N * ch)
      .attr("stroke", sepStroke).attr("stroke-width", 1);
    g.append("line")
      .attr("y1", sepY - 0.5).attr("y2", sepY - 0.5)
      .attr("x1", -labelW).attr("x2", N * cw)
      .attr("stroke", sepStroke).attr("stroke-width", 1);

    matrixKeys.forEach((rowKey, ri) => {
      matrixKeys.forEach((colKey, ci) => {
        const cellKey = `${rowKey}|${colKey}`;
        const v = getVal(cellKey);
        const rowActive = selectedKeys.has(rowKey);
        const colActive = selectedKeys.has(colKey);
        const bothActive = rowActive && colActive;
        const active = rowActive || colActive;

        // In "both" mode each cell picks its own color based on the dominant
        // edge type so attack cells are red and defense cells are green.
        const atkN = matrices.attack.normalized[cellKey] ?? 0;
        const defN = matrices.defense.normalized[cellKey] ?? 0;
        let cellRgb = rgb;
        if (edgeMode === "both" && (atkN > 0 || defN > 0)) {
          cellRgb = atkN >= defN ? "251,113,133" : "52,211,153";
        }
        const dominantV = edgeMode === "both" ? Math.max(atkN, defN) : v;

        let fill = `rgba(30,41,59,${0.2 + v * 0.1})`;
        if (bothActive) fill = `rgba(${cellRgb},${Math.max(0.06, dominantV * 0.88)})`;
        else if (active) fill = `rgba(${cellRgb},${Math.max(0.03, dominantV * 0.55)})`;

        g.append("rect")
          .attr("x", ci * cw + 0.5).attr("y", ri * ch + 0.5)
          .attr("width", cw - 1).attr("height", ch - 1)
          .attr("rx", 1)
          .attr("fill", fill)
          .attr("stroke", bothActive && dominantV > 0.3 ? `rgba(${cellRgb},0.5)` : "rgba(15,23,42,0.0)")
          .attr("stroke-width", 0.5)
          .style("filter", bothActive && dominantV > 0.5 ? `drop-shadow(0 0 2px rgba(${cellRgb},${dominantV * 0.6}))` : "none");
      });
    });

    matrixKeys.forEach((key, ci) => {
      const isWhite = key.startsWith("w");
      const active = selectedKeys.has(key);
      const pieceHeaderColor = isWhite ? "#fbbf24" : "#38bdf8";
      const colFill = active ? pieceHeaderColor : "rgba(100,116,139,0.45)";
      g.append("text")
        .attr("x", ci * cw + cw / 2).attr("y", -4)
        .attr("text-anchor", "middle").attr("dominant-baseline", "auto")
        .attr("font-size", `${Math.min(cw * 0.72, 11)}px`)
        .attr("fill", colFill)
        .attr("font-family", "monospace").attr("font-weight", "bold")
        .text(matrixKeySymbol(key));
    });

    matrixKeys.forEach((key, ri) => {
      const isWhite = key.startsWith("w");
      const active = selectedKeys.has(key);
      const pieceRowColor = isWhite ? "#fbbf24" : "#38bdf8";
      const rowFill = active ? pieceRowColor : "rgba(100,116,139,0.45)";
      g.append("text")
        .attr("x", -4).attr("y", ri * ch + ch / 2)
        .attr("text-anchor", "end").attr("dominant-baseline", "middle")
        .attr("font-size", `${Math.min(ch * 0.72, 11)}px`)
        .attr("fill", rowFill)
        .attr("font-family", "monospace").attr("font-weight", "bold")
        .text(matrixKeySymbol(key));
    });

    // White / Black section headers
    const whiteCount = firstBlackIdx > 0 ? firstBlackIdx : Math.floor(N / 2);
    const blackCount = N - whiteCount;
    g.append("text")
      .attr("x", (whiteCount / 2) * cw).attr("y", -labelH)
      .attr("text-anchor", "middle").attr("dominant-baseline", "hanging")
      .attr("font-size", "7px").attr("fill", "rgba(251,191,36,0.45)")
      .attr("font-family", "monospace").attr("font-weight", "black")
      .attr("letter-spacing", "0.08em").text("WHITE →");
    g.append("text")
      .attr("x", (whiteCount + blackCount / 2) * cw).attr("y", -labelH)
      .attr("text-anchor", "middle").attr("dominant-baseline", "hanging")
      .attr("font-size", "7px").attr("fill", "rgba(56,189,248,0.45)")
      .attr("font-family", "monospace").attr("font-weight", "black")
      .attr("letter-spacing", "0.08em").text("BLACK →");

    type CellDatumEdge = { from: string; to: string; weight: number };
    type CellDatum = { rowKey: string; colKey: string; ri: number; ci: number; currentAttacks: CellDatumEdge[]; currentDefenses: CellDatumEdge[] };
    const cellData: CellDatum[] = matrixKeys.flatMap((rowKey, ri) =>
      matrixKeys.map((colKey, ci) => {
        const cellKey = `${rowKey}|${colKey}`;
        const current = currentEdgeMap.get(cellKey);
        return {
          rowKey,
          colKey,
          ri,
          ci,
          currentAttacks: current?.attacks ?? [],
          currentDefenses: current?.defenses ?? [],
        };
      }),
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
      .style("cursor", (d) => (d.currentAttacks.length > 0 || d.currentDefenses.length > 0 ? "crosshair" : "default"))
      .on("mousemove", (event: MouseEvent, d) => {
        if (!tooltipEl) return;
        tooltipEl.style.display = "block";
        tooltipEl.style.left = `${event.offsetX + 8}px`;
        tooltipEl.style.top = `${event.offsetY - 40}px`;
        const lines: string[] = [
          `<span style="color:#94a3b8;font-weight:900">${matrixKeyLabel(d.rowKey)} → ${matrixKeyLabel(d.colKey)}</span>`,
        ];
        for (const e of d.currentAttacks) {
          lines.push(`<span style="color:#f87171">atk ${e.from}→${e.to}: ${e.weight.toFixed(1)}</span>`);
        }
        for (const e of d.currentDefenses) {
          lines.push(`<span style="color:#34d399">def ${e.from}→${e.to}: ${e.weight.toFixed(1)}</span>`);
        }
        if (d.currentAttacks.length === 0 && d.currentDefenses.length === 0) {
          lines.push(`<span style="color:#475569">no active relation</span>`);
        }
        tooltipEl.innerHTML = lines.join("<br/>");
      })
      .on("mouseleave", () => {
        if (tooltipEl) tooltipEl.style.display = "none";
      });
  }, [matrices, edgeMode, selectedKeys, currentEdgeMap, matrixKeys]);

  const hasData =
    matrixKeys.length > 0 &&
    (Object.keys(matrices.attack.raw).length > 0 ||
      Object.keys(matrices.defense.raw).length > 0);
  if (!hasData) return <EmptyState label="Play moves to build the adjacency matrix" />;

  const getModeClass = (m: EdgeMode) => {
    if (edgeMode !== m) return "text-slate-600 hover:text-slate-400";
    if (m === "attack") return "bg-rose-900/40 text-rose-400";
    if (m === "defense") return "bg-emerald-900/40 text-emerald-400";
    return "bg-gradient-to-r from-rose-900/50 to-emerald-900/50 text-indigo-300";
  };

  const getModeLabel = (m: EdgeMode) => {
    if (m === "attack") return "ATK";
    if (m === "defense") return "DEF";
    return "BOTH";
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

