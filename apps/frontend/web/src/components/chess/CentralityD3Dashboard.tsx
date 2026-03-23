import React, { useMemo, useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import type { GraphSnapshot, GraphNode } from "@yourcompany/chess/types";
import { COMMUNITY_COLORS } from "@yourcompany/chess/constants";

type CentralityMetric = "weighted" | "degree" | "betweenness" | "closeness" | "pagerank" | "none";

interface CentralityD3DashboardProps {
	analysisGraphSnapshots: Array<GraphSnapshot | null>;
	analysisIndex: number;
	centralityMetric: CentralityMetric;
	onIndexChange?: (index: number) => void;
}

export function CentralityD3Dashboard({
	analysisGraphSnapshots,
	analysisIndex,
	centralityMetric,
	onIndexChange,
}: CentralityD3DashboardProps) {
	// const [activeChart, setActiveChart] = useState<"radar" | "timeline" | "force">("timeline"); // Removed as per instruction

	return (
		<div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm shadow-2xl transition-all duration-300 hover:border-slate-600/50">
			<div className="flex items-center justify-between mb-4">
				<div className="flex items-center gap-2">
					<div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
					<h3 className="text-[10px] font-black text-slate-200 uppercase tracking-widest">Topology & Dynamics</h3>
				</div>
				{/* Tab switcher removed as per instruction */}
			</div>

			<div className="flex flex-col gap-4">
				{/* 1. Timeline - Full Width */}
				<div className="h-[140px] w-full border-b border-slate-800/50 pb-2">
					<CentralityTimelineD3
						snapshots={analysisGraphSnapshots}
						currentIndex={analysisIndex}
						metric={centralityMetric}
						onIndexChange={onIndexChange}
					/>
				</div>

				{/* 2. Radar & Force - Side-by-Side */}
				<div className="h-[200px] grid grid-cols-2 gap-4">
					<div className="border-r border-slate-800/50 pr-2">
						<div className="text-[8px] font-black text-slate-500 uppercase mb-2 tracking-taper">Structural Radar</div>
						<CentralityRadarD3
							snapshot={analysisGraphSnapshots[analysisIndex] ?? null}
							metric={centralityMetric}
						/>
					</div>
					<div>
						<div className="text-[8px] font-black text-slate-500 uppercase mb-2 tracking-taper">Force Dynamics</div>
						<CentralityForceD3
							snapshot={analysisGraphSnapshots[analysisIndex] ?? null}
							metric={centralityMetric}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

// --- D3 Timeline Sub-component ---
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

	const data = useMemo(() => {
		const bySquare = new Map<string, { square: string; values: number[]; color: string }>();
		
		// Get top 5 pieces by movement delta across the whole game
		for (let i = 0; i < snapshots.length; i++) {
			const snap = snapshots[i];
			if (!snap) continue;
			for (const node of snap.nodes) {
				if (!bySquare.has(node.square)) {
					const color = COMMUNITY_COLORS[node.communityId % COMMUNITY_COLORS.length] || "#ccc";
					bySquare.set(node.square, { square: node.square, values: new Array(snapshots.length).fill(0), color });
				}
				const entry = bySquare.get(node.square);
				if (entry) {
					entry.values[i] = getMetricValue(node, metric);
				}
			}
		}

		const entries = Array.from(bySquare.values())
			.map(e => ({ ...e, delta: Math.max(...e.values) - Math.min(...e.values) }))
			.sort((a, b) => b.delta - a.delta)
			.slice(0, 5);

		// Global max for scaling
		const maxVal = Math.max(...entries.flatMap(e => e.values), 0.1);

		return { entries, maxVal };
	}, [snapshots, metric]);

	useEffect(() => {
		if (!svgRef.current || data.entries.length === 0) return;

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		const width = svgRef.current.clientWidth;
		const height = svgRef.current.clientHeight;
		const margin = { top: 10, right: 10, bottom: 25, left: 35 };
		const innerWidth = width - margin.left - margin.right;
		const innerHeight = height - margin.top - margin.bottom;

		const x = d3.scaleLinear().domain([0, snapshots.length - 1]).range([0, innerWidth]);
		const y = d3.scaleLinear().domain([0, data.maxVal]).range([innerHeight, 0]).nice();

		const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

		// Grid lines - reduced opacity for better timeline visibility
		g.append("g")
			.attr("class", "grid")
			.attr("stroke", "rgba(51, 65, 85, 0.08)")
			.call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(() => ""));

		// Axes
		g.append("g")
			.attr("transform", `translate(0,${innerHeight})`)
			.call(d3.axisBottom(x).ticks(Math.min(10, snapshots.length)).tickSize(0).tickPadding(8))
			.attr("color", "rgba(148, 163, 184, 0.5)")
			.select(".domain").remove();

		g.append("g")
			.call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".1f")))
			.attr("color", "rgba(148, 163, 184, 0.5)")
			.select(".domain").remove();

		const line = d3.line<number>()
			.x((d: number, i: number) => x(i))
			.y((d: number) => y(d))
			.curve(d3.curveMonotoneX);

		// Draw lines
		const pathGroup = g.append("g").attr("class", "lines");
		
		data.entries.forEach((entry) => {
			pathGroup.append("path")
				.datum(entry.values)
				.attr("fill", "none")
				.attr("stroke", entry.color)
				.attr("stroke-width", 2)
				.attr("d", line as any)
				.style("filter", `drop-shadow(0 0 2px ${entry.color}44)`)
				.attr("opacity", 0.7);

			// Square label at the end of the line
			const lastVal = entry.values[snapshots.length - 1];
			g.append("text")
				.attr("x", innerWidth + 2)
				.attr("y", (y(lastVal) ?? 0) as number)
				.attr("dy", "0.35em")
				.attr("font-size", "8px")
				.attr("fill", entry.color)
				.attr("font-family", "monospace")
				.text(entry.square);
		});

		// Focus bar (current step)
		g.append("line")
			.attr("x1", x(currentIndex))
			.attr("x2", x(currentIndex))
			.attr("y1", 0)
			.attr("y2", innerHeight)
			.attr("stroke", "#6366f1")
			.attr("stroke-width", 2)
			.attr("stroke-dasharray", "4,2");

		// Invisible overlay for tooltips and clicking
		svg.append("rect")
			.attr("width", width)
			.attr("height", height)
			.attr("fill", "transparent")
			.on("mousemove", (event: any) => {
				const [mx] = d3.pointer(event);
				const step = Math.round(x.invert(mx - margin.left));
				if (step >= 0 && step < snapshots.length && onIndexChange) {
					// We could show a tooltip here or just allow click
				}
			})
			.on("click", (event: any) => {
				const [mx] = d3.pointer(event);
				const step = Math.round(x.invert(mx - margin.left));
				if (step >= 0 && step < snapshots.length && onIndexChange) {
					onIndexChange(step);
				}
			});

	}, [data, currentIndex, snapshots.length, onIndexChange]);

	if (data.entries.length === 0) {
		return (
			<div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-slate-700/50 rounded-xl bg-slate-900/20 p-8 text-center group">
				<div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-3 group-hover:bg-indigo-500/10 transition-colors">
					<span className="text-xl">📈</span>
				</div>
				<h4 className="text-[11px] font-black text-slate-300 uppercase tracking-widest mb-1">No Timeline Data</h4>
				<p className="text-[10px] text-slate-500 max-w-[180px] leading-tight font-medium">
					Make a few moves to build the topological history of this game.
				</p>
			</div>
		);
	}

	return <svg ref={svgRef} className="w-full h-full cursor-crosshair overflow-visible" />;
}

// --- D3 Radar Sub-component ---
function CentralityRadarD3({
	snapshot,
	metric
}: {
	snapshot: GraphSnapshot | null;
	metric: CentralityMetric;
}) {
	const svgRef = useRef<SVGSVGElement>(null);

	const data = useMemo(() => {
		if (!snapshot) return [];
		// Get top 3 pieces by current metric
		const top = [...snapshot.nodes]
			.sort((a, b) => getMetricValue(b, metric) - getMetricValue(a, metric))
			.slice(0, 3);

		return top.map(node => ({
			name: node.square,
			color: COMMUNITY_COLORS[node.communityId % COMMUNITY_COLORS.length],
			weighted: node.centralityWeighted,
			degree: node.centralityDegree,
			betweenness: node.centralityBetweenness,
			closeness: node.centralityCloseness,
			pagerank: node.centralityPageRank
		}));
	}, [snapshot, metric]);

	useEffect(() => {
		if (!svgRef.current || data.length === 0) return;

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		const width = svgRef.current.clientWidth;
		const height = svgRef.current.clientHeight;
		const radius = Math.min(width, height) / 2 - 30;
		const centerX = width / 2;
		const centerY = height / 2;

		const axes = ["weighted", "degree", "betweenness", "closeness", "pagerank"];
		const angleSlice = (Math.PI * 2) / axes.length;

		const rScale = d3.scaleLinear().domain([0, 1]).range([0, radius]); // Assuming normalized values

		const g = svg.append("g").attr("transform", `translate(${centerX},${centerY})`);

		// Draw background circles
		[0.2, 0.4, 0.6, 0.8, 1].forEach(d => {
			g.append("circle")
				.attr("r", rScale(d))
				.attr("fill", "none")
				.attr("stroke", "rgba(71, 85, 105, 0.3)")
				.attr("stroke-dasharray", "2,2");
		});

		// Draw axis lines and labels
		axes.forEach((axis, i) => {
			const x = rScale(1.1) * Math.cos(angleSlice * i - Math.PI / 2);
			const y = rScale(1.1) * Math.sin(angleSlice * i - Math.PI / 2);

			g.append("line")
				.attr("x1", 0)
				.attr("y1", 0)
				.attr("x2", rScale(1) * Math.cos(angleSlice * i - Math.PI / 2))
				.attr("y2", rScale(1) * Math.sin(angleSlice * i - Math.PI / 2))
				.attr("stroke", "rgba(71, 85, 105, 0.5)");

			g.append("text")
				.attr("x", x)
				.attr("y", y)
				.attr("text-anchor", "middle")
				.attr("alignment-baseline", "middle")
				.attr("font-size", "7px")
				.attr("fill", "rgba(148, 163, 184, 0.8)")
				.attr("font-family", "monospace")
				.attr("font-weight", "bold")
				.text(axis.toUpperCase().substring(0, 3));
		});

		// Max values for normalization of each axis
		const maxes = {
			weighted: Math.max(...snapshot!.nodes.map(n => n.centralityWeighted), 0.1),
			degree: Math.max(...snapshot!.nodes.map(n => n.centralityDegree), 0.1),
			betweenness: Math.max(...snapshot!.nodes.map(n => n.centralityBetweenness), 0.1),
			closeness: Math.max(...snapshot!.nodes.map(n => n.centralityCloseness), 0.1),
			pagerank: Math.max(...snapshot!.nodes.map(n => n.centralityPageRank), 0.1),
		};

		// Draw blobs
		const radarLine = d3.lineRadial<any>()
			.radius((d: any) => rScale(d.value))
			.angle((d: any, i: number) => i * angleSlice)
			.curve(d3.curveLinearClosed);

		data.forEach((d) => {
			const values = axes.map(axis => ({
				axis,
				value: (d[axis as keyof typeof d] as number) / (maxes[axis as keyof typeof maxes] || 1)
			}));

			g.append("path")
				.datum(values)
				.attr("d", radarLine)
				.attr("fill", d.color || "#ccc")
				.attr("fill-opacity", 0.15)
				.attr("stroke", d.color || "#ccc")
				.attr("stroke-width", 2)
				.style("filter", `drop-shadow(0 0 3px ${d.color}66)`)
				.append("title")
				.text(d.name);

			// Draw dots for each point
			values.forEach((v, i) => {
				g.append("circle")
					.attr("r", 2.5)
					.attr("cx", rScale(v.value) * Math.cos(angleSlice * i - Math.PI / 2))
					.attr("cy", rScale(v.value) * Math.sin(angleSlice * i - Math.PI / 2))
					.attr("fill", d.color || "#ccc")
					.attr("stroke", "white")
					.attr("stroke-width", 0.5);
			});
		});

	}, [data, snapshot]);

	return <svg ref={svgRef} className="w-full h-full" />;
}

// --- Centrality Force Directed Graph View ---
function CentralityForceD3({
	snapshot,
	metric
}: {
	snapshot: GraphSnapshot | null;
	metric: CentralityMetric;
}) {
	const svgRef = useRef<SVGSVGElement>(null);

	useEffect(() => {
		if (!svgRef.current || !snapshot) return;

		const svg = d3.select(svgRef.current);
		svg.selectAll("*").remove();

		const width = svgRef.current.clientWidth;
		const height = svgRef.current.clientHeight;

		const nodes = snapshot.nodes.map(n => ({ ...n, id: n.square }));
		// Filter links to ensure both source and target exist in nodes
		const nodeIds = new Set(nodes.map(n => n.id));
		const links = snapshot.edges
			.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
			.map(e => ({ source: e.from, target: e.to, weight: e.weight, type: e.type }));

		// Max weight for normalization
		const maxWeight = Math.max(...links.map(l => Math.abs(l.weight)), 1);

		const simulation = d3.forceSimulation(nodes as any)
			.force("link", d3.forceLink(links)
				.id((d: any) => d.id)
				.distance(50)
				.strength(d => Math.min(1.0, (Math.log1p(d.weight) / Math.log1p(maxWeight)) * 0.5)) // Normalized strength
			)
			.force("charge", d3.forceManyBody().strength(-150))
			.force("center", d3.forceCenter(width / 2, height / 2))
			.force("collision", d3.forceCollide().radius(20))
			.alphaDecay(0.05); // Settle slightly faster

		const g = svg.append("g");

		// Draw links
		const link = g.append("g")
			.selectAll("line")
			.data(links)
			.join("line")
			.attr("stroke", d => d.type === 'attack' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(34, 197, 94, 0.2)')
			.attr("stroke-width", d => Math.sqrt(d.weight) * 2);

		// Draw nodes
		const node = g.append("g")
			.selectAll("g")
			.data(nodes)
			.join("g")
			.call(d3.drag<any, any>()
				.on("start", (event, d) => {
					if (!event.active) simulation.alphaTarget(0.3).restart();
					d.fx = d.x;
					d.fy = d.y;
				})
				.on("drag", (event, d) => {
					d.fx = event.x;
					d.fy = event.y;
				})
				.on("end", (event, d) => {
					if (!event.active) simulation.alphaTarget(0);
					d.fx = null;
					d.fy = null;
				}) as any);

		node.append("circle")
			.attr("r", d => 6 + getMetricValue(d as any, metric) * 15)
			.attr("fill", d => COMMUNITY_COLORS[d.communityId % COMMUNITY_COLORS.length] || "#ccc")
			.attr("stroke", "#1e293b")
			.attr("stroke-width", 1.5)
			.style("filter", d => `drop-shadow(0 0 3px ${COMMUNITY_COLORS[d.communityId % COMMUNITY_COLORS.length] || "#ccc"}44)`);

		node.append("text")
			.attr("dy", "0.35em")
			.attr("text-anchor", "middle")
			.attr("font-size", "7px")
			.attr("font-weight", "bold")
			.attr("fill", "white")
			.attr("pointer-events", "none")
			.text(d => d.square);

		simulation.on("tick", () => {
			link
				.attr("x1", (d: any) => isFinite(d.source.x) ? d.source.x : 0)
				.attr("y1", (d: any) => isFinite(d.source.y) ? d.source.y : 0)
				.attr("x2", (d: any) => isFinite(d.target.x) ? d.target.x : 0)
				.attr("y2", (d: any) => isFinite(d.target.y) ? d.target.y : 0);

			node.attr("transform", (d: any) => {
				const x = isFinite(d.x) ? d.x : 0;
				const y = isFinite(d.y) ? d.y : 0;
				return `translate(${x},${y})`;
			});
		});

		return () => {
			simulation.stop();
		};
	}, [snapshot, metric]);

	return <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}

// --- Utils ---
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
