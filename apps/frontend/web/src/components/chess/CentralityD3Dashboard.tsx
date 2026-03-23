/**
 * CentralityD3Dashboard
 *
 * Internal CSS grid (no tabs):
 *  ┌──────────────────────────────────────────────┐
 *  │  Centrality Timeline        [col-span 2, 155h]│
 *  ├───────────────────┬──────────────────────────┤
 *  │  Structural Radar │  Force Dynamics           │
 *  │  [col 1, sq 220h] │  [col 2, 220h]            │
 *  └───────────────────┴──────────────────────────┘
 */
import React, { useMemo, useRef, useEffect } from "react";
import * as d3 from "d3";
import type { GraphSnapshot, GraphNode } from "@yourcompany/chess/types";
import { COMMUNITY_COLORS } from "@yourcompany/chess/constants";

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
}

const METRIC_LABELS: Record<CentralityMetric, string> = {
  weighted: "Weighted Degree",
  degree: "Degree",
  betweenness: "Betweenness",
  closeness: "Closeness",
  pagerank: "PageRank",
  none: "None",
};

export function CentralityD3Dashboard({
  analysisGraphSnapshots,
  analysisIndex,
  centralityMetric,
  onIndexChange,
}: CentralityD3DashboardProps) {
  const hasData = analysisGraphSnapshots.some(Boolean);
  const currentSnapshot = analysisGraphSnapshots[analysisIndex] ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Section label */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
            Topology &amp; Dynamics
          </span>
        </div>
        <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">
          {METRIC_LABELS[centralityMetric]}
        </span>
      </div>

      {/* Timeline — full width */}
      <div className="h-[155px] w-full bg-slate-900/50 border border-slate-800/60 rounded-xl overflow-hidden">
        {hasData ? (
          <CentralityTimelineD3
            snapshots={analysisGraphSnapshots}
            currentIndex={analysisIndex}
            metric={centralityMetric}
            onIndexChange={onIndexChange}
          />
        ) : (
          <EmptyState label="Play moves to build the centrality history" />
        )}
      </div>

      {/* Radar (left) + Force (right) — 2-column, fixed height */}
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
                metric={centralityMetric}
              />
            ) : (
              <EmptyState label="No data" />
            )}
          </div>
        </div>

        {/* Force */}
        <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl overflow-hidden flex flex-col">
          <div className="flex-shrink-0 px-2.5 pt-1.5 pb-0">
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">
              Force Dynamics
            </span>
          </div>
          <div className="flex-1 min-h-0">
            {currentSnapshot ? (
              <CentralityForceD3
                snapshot={currentSnapshot}
                metric={centralityMetric}
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
  metric,
  onIndexChange,
}: {
  snapshots: Array<GraphSnapshot | null>;
  currentIndex: number;
  metric: CentralityMetric;
  onIndexChange?: (index: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    const bySquare = new Map<
      string,
      { square: string; values: number[]; color: string }
    >();

    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i];
      if (!snap) continue;
      for (const node of snap.nodes) {
        if (!bySquare.has(node.square)) {
          const color =
            COMMUNITY_COLORS[node.communityId % COMMUNITY_COLORS.length] ||
            "#ccc";
          bySquare.set(node.square, {
            square: node.square,
            values: new Array(snapshots.length).fill(0),
            color,
          });
        }
        const entry = bySquare.get(node.square);
        if (entry) entry.values[i] = getMetricValue(node, metric);
      }
    }

    const entries = Array.from(bySquare.values())
      .map((e) => ({ ...e, delta: Math.max(...e.values) - Math.min(...e.values) }))
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 6);

    const maxVal = Math.max(...entries.flatMap((e) => e.values), 0.1);
    return { entries, maxVal };
  }, [snapshots, metric]);

  useEffect(() => {
    if (!svgRef.current || data.entries.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const m = { top: 10, right: 42, bottom: 18, left: 30 };
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;

    const x = d3.scaleLinear().domain([0, Math.max(1, snapshots.length - 1)]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, data.maxVal]).range([ih, 0]).nice();
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    // Grid
    g.append("g").selectAll("line.grid")
      .data(y.ticks(4)).join("line")
      .attr("x1", 0).attr("x2", iw)
      .attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
      .attr("stroke", "rgba(51,65,85,0.22)").attr("stroke-width", 1);

    // Y Axis
    g.append("g")
      .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".2f")).tickSize(0).tickPadding(5))
      .call((ax) => ax.select(".domain").remove())
      .call((ax) => ax.selectAll("text").attr("font-size", "8px").attr("fill", "rgba(100,116,139,0.7)").attr("font-family", "monospace"));

    // X Axis
    g.append("g").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).ticks(Math.min(8, snapshots.length)).tickSize(2).tickPadding(3))
      .call((ax) => ax.select(".domain").remove())
      .call((ax) => ax.selectAll("text").attr("font-size", "8px").attr("fill", "rgba(100,116,139,0.5)").attr("font-family", "monospace"));

    // Lines
    const line = d3.line<number>().x((_, i) => x(i)).y((d) => y(d)).curve(d3.curveMonotoneX);
    data.entries.forEach((entry) => {
      g.append("path").datum(entry.values)
        .attr("fill", "none").attr("stroke", entry.color).attr("stroke-width", 1.5)
        .attr("d", line as any).attr("opacity", 0.85)
        .style("filter", `drop-shadow(0 0 2px ${entry.color}44)`);

      const lastVal = entry.values[snapshots.length - 1];
      if (lastVal !== undefined) {
        g.append("text")
          .attr("x", iw + 4).attr("y", y(lastVal)).attr("dy", "0.35em")
          .attr("font-size", "8px").attr("fill", entry.color)
          .attr("font-family", "monospace").attr("font-weight", "bold")
          .text(entry.square);
      }
    });

    // Current step line
    g.append("line")
      .attr("x1", x(currentIndex)).attr("x2", x(currentIndex))
      .attr("y1", 0).attr("y2", ih)
      .attr("stroke", "#6366f1").attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3,2").attr("opacity", 0.85);

    // Click-to-navigate overlay
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
          const lines = data.entries.map((e) =>
            `<span style="color:${e.color}">${e.square}: ${(e.values[step] ?? 0).toFixed(3)}</span>`
          );
          const px = x(step) + m.left;
          const tip = tooltipRef.current;
          tip.style.display = "block";
          tip.style.left = `${Math.min(px + 8, width - 90)}px`;
          tip.style.top = `${m.top}px`;
          tip.innerHTML = `<div style="font-size:9px;font-weight:900;color:#94a3b8;margin-bottom:2px">STEP ${step}</div>${lines.join("<br/>")}`;
        })
        .on("mouseleave", () => {
          if (tooltipRef.current) tooltipRef.current.style.display = "none";
        });
    }
  }, [data, currentIndex, snapshots.length, onIndexChange]);

  if (data.entries.length === 0) return <EmptyState label="Play moves to see centrality history" />;

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
function CentralityRadarD3({ snapshot, metric }: { snapshot: GraphSnapshot; metric: CentralityMetric }) {
  const svgRef = useRef<SVGSVGElement>(null);

  const data = useMemo(() => {
    return [...snapshot.nodes]
      .sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric))
      .slice(0, 3)
      .map((node) => ({
        node,
        name: node.square,
        color: COMMUNITY_COLORS[node.communityId % COMMUNITY_COLORS.length] || "#ccc",
      }));
  }, [snapshot, metric]);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const radius = Math.min(width, height) / 2 - 22;
    const cx = width / 2;
    const cy = height / 2;

    const axes = ["weighted", "degree", "betweenness", "closeness", "pagerank"] as const;
    const axisLabels = ["Wgt", "Deg", "Btw", "Cls", "PR"];
    const angleSlice = (Math.PI * 2) / axes.length;
    const rScale = d3.scaleLinear().domain([0, 1]).range([0, radius]);
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    // Rings
    [0.25, 0.5, 0.75, 1].forEach((d) => {
      g.append("circle").attr("r", rScale(d))
        .attr("fill", "none").attr("stroke", "rgba(51,65,85,0.35)").attr("stroke-dasharray", "2,3");
    });

    // Axes + labels
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
        .text(axisLabels[i] || axis);
    });

    const maxes = {
      weighted: Math.max(...snapshot.nodes.map((n) => n.centralityWeighted), 0.001),
      degree: Math.max(...snapshot.nodes.map((n) => n.centralityDegree), 0.001),
      betweenness: Math.max(...snapshot.nodes.map((n) => n.centralityBetweenness), 0.001),
      closeness: Math.max(...snapshot.nodes.map((n) => n.centralityCloseness), 0.001),
      pagerank: Math.max(...snapshot.nodes.map((n) => n.centralityPageRank), 0.001),
    };

    const radarLine = d3.lineRadial<any>()
      .radius((d: any) => rScale(d.value)).angle((_, i) => i * angleSlice).curve(d3.curveLinearClosed);

    data.forEach((d) => {
      const values = axes.map((axis) => ({
        axis, value: Math.min(1, (d.node[("centrality" + axis.charAt(0).toUpperCase() + axis.slice(1)) as keyof GraphNode] as number) / maxes[axis]),
      }));
      g.append("path").datum(values).attr("d", radarLine)
        .attr("fill", d.color).attr("fill-opacity", 0.12)
        .attr("stroke", d.color).attr("stroke-width", 1.5)
        .style("filter", `drop-shadow(0 0 3px ${d.color}44)`);
      values.forEach((v, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        g.append("circle").attr("r", 2.5)
          .attr("cx", rScale(v.value) * Math.cos(angle)).attr("cy", rScale(v.value) * Math.sin(angle))
          .attr("fill", d.color).attr("stroke", "rgba(15,23,42,0.8)").attr("stroke-width", 1);
      });
    });

    // Legend
    data.forEach((d, i) => {
      const lx = -cx + 8;
      const ly = -cy + 10 + i * 12;
      g.append("circle").attr("cx", lx).attr("cy", ly).attr("r", 3).attr("fill", d.color);
      g.append("text").attr("x", lx + 6).attr("y", ly).attr("dy", "0.35em")
        .attr("font-size", "7px").attr("fill", d.color).attr("font-family", "monospace").text(d.name);
    });
  }, [data, snapshot]);

  return <svg ref={svgRef} className="w-full h-full" />;
}

// ---------------------------------------------------------------------------
// Force
// ---------------------------------------------------------------------------
function CentralityForceD3({ snapshot, metric }: { snapshot: GraphSnapshot; metric: CentralityMetric }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !snapshot) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const nodes = snapshot.nodes.map((n) => ({ ...n, id: n.square }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = snapshot.edges
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, weight: e.weight, type: e.type }));

    const maxW = Math.max(...links.map((l) => Math.abs(l.weight)), 1);

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(38)
        .strength((d) => Math.min(0.7, (Math.log1p(d.weight) / Math.log1p(maxW)) * 0.35)))
      .force("charge", d3.forceManyBody().strength(-100))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(13))
      .alphaDecay(0.055);

    const g = svg.append("g");

    const link = g.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", (d) => d.type === "attack" ? "rgba(244,63,94,0.22)" : "rgba(34,197,94,0.18)")
      .attr("stroke-width", (d) => Math.sqrt(d.weight) * 1.3);

    const node = g.append("g").selectAll("g").data(nodes).join("g")
      .call(
        d3.drag<any, any>()
          .on("start", (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }) as any
      );

    node.append("circle")
      .attr("r", (d) => 5 + getMetricValue(d as any, metric) * 11)
      .attr("fill", (d) => COMMUNITY_COLORS[d.communityId % COMMUNITY_COLORS.length] || "#ccc")
      .attr("stroke", "rgba(15,23,42,0.5)").attr("stroke-width", 1)
      .style("filter", (d) => `drop-shadow(0 0 3px ${COMMUNITY_COLORS[d.communityId % COMMUNITY_COLORS.length] || "#ccc"}33)`);

    node.append("text")
      .attr("dy", "0.35em").attr("text-anchor", "middle")
      .attr("font-size", "6px").attr("font-weight", "bold")
      .attr("fill", "rgba(255,255,255,0.9)").attr("pointer-events", "none")
      .text((d) => d.square);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => isFinite(d.source.x) ? d.source.x : 0)
        .attr("y1", (d: any) => isFinite(d.source.y) ? d.source.y : 0)
        .attr("x2", (d: any) => isFinite(d.target.x) ? d.target.x : 0)
        .attr("y2", (d: any) => isFinite(d.target.y) ? d.target.y : 0);
      node.attr("transform", (d: any) =>
        `translate(${isFinite(d.x) ? d.x : 0},${isFinite(d.y) ? d.y : 0})`);
    });

    return () => { simulation.stop(); };
  }, [snapshot, metric]);

  return <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
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
