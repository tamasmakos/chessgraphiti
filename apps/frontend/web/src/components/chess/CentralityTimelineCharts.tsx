import React, { useMemo } from "react";
import type { GraphSnapshot, GraphNode } from "@yourcompany/chess/types";
import { COMMUNITY_COLORS } from "@yourcompany/chess/constants";

type CentralityMetric =
	| "weighted"
	| "degree"
	| "betweenness"
	| "closeness"
	| "pagerank"
	| "none";

interface CentralityTimelineChartsProps {
	analysisGraphSnapshots: Array<GraphSnapshot | null>;
	analysisIndex: number;
	centralityMetric: CentralityMetric;
	stableColorByStep?: Array<Record<number, number>>;
	filterPieces?: string[];
}

function getCentralityValue(node: GraphNode, metric: CentralityMetric): number {
	switch (metric) {
		case "weighted":
			return node.centralityWeighted;
		case "degree":
			return node.centralityDegree;
		case "betweenness":
			return node.centralityBetweenness;
		case "closeness":
			return node.centralityCloseness;
		case "pagerank":
			return node.centralityPageRank;
		case "none":
		default:
			return 0;
	}
}

function formatValue(metric: CentralityMetric, v: number): string {
	if (metric === "none") return "—";
	return v.toFixed(3);
}

export function CentralityTimelineCharts({
	analysisGraphSnapshots,
	analysisIndex,
	centralityMetric,
	stableColorByStep = [],
	filterPieces = [],
}: CentralityTimelineChartsProps) {
	const chart = useMemo(() => {
		const bySquare = new Map<string, number[]>();
		const currentSnapshot = analysisGraphSnapshots[analysisIndex] ?? null;
		const currentNodes = currentSnapshot?.nodes ?? [];

		for (let idx = 0; idx < analysisGraphSnapshots.length; idx++) {
			const snap = analysisGraphSnapshots[idx];
			if (!snap) continue;
			for (const node of snap.nodes) {
				if (filterPieces.length > 0 && !filterPieces.includes(node.type)) continue;
				
				let values = bySquare.get(node.square);
				if (!values) {
					values = new Array(analysisGraphSnapshots.length).fill(0);
					bySquare.set(node.square, values);
				}
				values[idx] = getCentralityValue(node, centralityMetric);
			}
		}

		const movement = [...bySquare.entries()].map(([square, values]) => {
			const peak = Math.max(...values);
			const floor = Math.min(...values);
			const delta = peak - floor;
			return { square, delta, values };
		});
		movement.sort((a, b) => b.delta - a.delta);
		const top = movement.slice(0, 3);

		// Build time series per top square.
		const series = top.map((n) => {
			const square = n.square;
			const nodeAtCurrent = currentNodes.find((node) => node.square === square);
			const communityId = nodeAtCurrent?.communityId ?? 0;
			const values = n.values;
			return { square, communityId, values };
		});

		// Normalize across all series for stable y scaling.
		let max = 0;
		for (const s of series) {
			for (const v of s.values) max = Math.max(max, v);
		}
		if (max === 0) max = 1;

		return { series, max };
	}, [analysisGraphSnapshots, centralityMetric, analysisIndex]);

	const w = 320;
	const h = 120;
	const paddingX = 16;
	const paddingY = 18;
	const innerW = w - paddingX * 2;
	const innerH = h - paddingY * 2;

	const timeCount = analysisGraphSnapshots.length;

	const getX = (t: number) => {
		if (timeCount <= 1) return paddingX;
		return paddingX + (t / (timeCount - 1)) * innerW;
	};
	const getY = (v: number) => {
		const ratio = Math.max(0, v) / chart.max;
		return paddingY + innerH - ratio * innerH;
	};

	return (
		<div className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-3">
			<div className="flex items-baseline justify-between gap-3 mb-2">
				<div>
					<div className="text-xs font-bold text-slate-200 uppercase tracking-widest">
						Centrality Timeline
					</div>
					<div className="text-[11px] text-slate-400 font-mono">
						Metric: {centralityMetric}
					</div>
				</div>
				<div className="text-[11px] text-slate-300 font-mono">
					Step {analysisIndex + 1} / {Math.max(analysisGraphSnapshots.length, 1)}
				</div>
			</div>

			<div className="relative">
				<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full">
					{/* Active time cursor */}
					{timeCount > 0 && (
						<line
							x1={getX(analysisIndex)}
							y1={paddingY}
							x2={getX(analysisIndex)}
							y2={paddingY + innerH}
							stroke="rgba(99,102,241,0.7)"
							strokeWidth={2}
						/>
					)}

					{chart.series.map((s) => {
						const points = s.values
							.map((v, t) => `${getX(t).toFixed(1)},${getY(v).toFixed(1)}`)
							.join(" ");

						const stableKey =
							stableColorByStep[analysisIndex]?.[s.communityId] ?? s.communityId;
						const color = COMMUNITY_COLORS[stableKey % COMMUNITY_COLORS.length];

						return (
							<polyline
								key={s.square}
								points={points}
								fill="none"
								stroke={color}
								strokeWidth={2.5}
								strokeLinejoin="round"
								strokeLinecap="round"
							/>
						);
					})}
				</svg>
			</div>

			<div className="mt-3 space-y-1">
				{chart.series.map((s) => {
					const v = s.values[analysisIndex] ?? 0;
					return (
						<div key={s.square} className="flex items-center justify-between gap-3">
							<span className="text-xs font-mono text-slate-200">{s.square}</span>
							<span className="text-xs font-mono text-indigo-200">
								{formatValue(centralityMetric, v)}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

