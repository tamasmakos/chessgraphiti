import React, { useMemo, useState } from "react";
import type { GraphEdge, GraphNode, GraphSnapshot } from "@yourcompany/chess/types";

import { EvalBar } from "./EvalBar";
import { TraditionalMetricsDashboard } from "./TraditionalMetricsDashboard";

type CentralityMetric = "weighted" | "degree" | "betweenness" | "closeness" | "pagerank" | "none";

interface MetricsCarouselProps {
	graphSnapshot: GraphSnapshot | null;
	centralityMetric: CentralityMetric;
	evaluation: number;
	fen: string;
	mate?: number;
	narrative?: string;
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

/**
 * Compute Newman-Girvan modularity Q for the current partition.
 *
 * We treat directed edges as undirected by summing weights in both directions.
 */
function computeModularity(nodes: GraphNode[], edges: GraphEdge[]): number {
	const ids = nodes.map((n) => n.square);
	if (ids.length === 0) return 0;

	const communityByNode = new Map<string, number>();
	for (const n of nodes) communityByNode.set(n.square, n.communityId);

	// directedWeight[u][v]
	const directed = new Map<string, Map<string, number>>();
	for (const { from, to, weight } of edges) {
		let inner = directed.get(from);
		if (!inner) {
			inner = new Map();
			directed.set(from, inner);
		}
		inner.set(to, (inner.get(to) ?? 0) + weight);
	}

	const directedW = (u: string, v: string): number =>
		directed.get(u)?.get(v) ?? 0;

	// A_ij = w_ij + w_ji (undirected symmetric weight)
	const A = (i: string, j: string): number => {
		if (i === j) return 0;
		return directedW(i, j) + directedW(j, i);
	};

	// k_i = sum_j A_ij, and 2m = sum_i k_i
	const k = new Map<string, number>();
	let m2 = 0;
	for (const i of ids) {
		let sum = 0;
		for (const j of ids) sum += A(i, j);
		k.set(i, sum);
		m2 += sum;
	}

	if (m2 === 0) return 0;

	let Q = 0;
	for (const i of ids) {
		for (const j of ids) {
			if (communityByNode.get(i) !== communityByNode.get(j)) continue;
			const Aij = A(i, j);
			Q += Aij - (k.get(i)! * k.get(j)!) / m2;
		}
	}

	return Q / m2;
}

export function MetricsCarousel({
	graphSnapshot,
	centralityMetric,
	evaluation,
	fen,
	mate,
	narrative,
}: MetricsCarouselProps) {
	const [panel, setPanel] = useState<0 | 1 | 2 | 3>(0);

	const { modularity, communityCount, topNodes } = useMemo(() => {
		if (!graphSnapshot) return { modularity: 0, communityCount: 0, topNodes: [] };
		const modularityScore = computeModularity(graphSnapshot.nodes, graphSnapshot.edges);
		const communities = new Set(graphSnapshot.nodes.map((n) => n.communityId));
		const ranked = [...graphSnapshot.nodes].sort(
			(a, b) => getCentralityValue(b, centralityMetric) - getCentralityValue(a, centralityMetric),
		);

		const slice = centralityMetric === "none" ? ranked.slice(0, 3) : ranked.slice(0, 3);
		const top = slice.map((n) => ({
			square: n.square,
			value: getCentralityValue(n, centralityMetric),
			communityId: n.communityId,
		}));

		return {
			modularity: modularityScore,
			communityCount: communities.size,
			topNodes: top,
		};
	}, [graphSnapshot, centralityMetric]);

	const evalText =
		mate !== undefined
			? `Mate in ${mate}`
			: `Eval: ${(evaluation / 100).toFixed(2)} pawns`;

	return (
		<div className="w-64 max-w-[92vw] bg-slate-900/70 border border-slate-700/60 rounded-xl p-3 shadow-2xl backdrop-blur">
			<div className="flex items-center justify-between mb-2">
				<div className="min-w-0">
					<div className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
						Graphity Vision
					</div>
				</div>

				<div className="flex gap-1">
					<button
						className={`px-2 py-1 text-[10px] rounded-lg border ${
							panel === 0 ? "bg-indigo-600/70 border-indigo-500" : "bg-slate-800/50 border-slate-600"
						}`}
						onClick={() => setPanel(0)}
					>
						Eval
					</button>
					<button
						className={`px-2 py-1 text-[10px] rounded-lg border ${
							panel === 1 ? "bg-indigo-600/70 border-indigo-500" : "bg-slate-800/50 border-slate-600"
						}`}
						onClick={() => setPanel(1)}
					>
						Graph
					</button>
					<button
						className={`px-2 py-1 text-[10px] rounded-lg border ${
							panel === 2 ? "bg-indigo-600/70 border-indigo-500" : "bg-slate-800/50 border-slate-600"
						}`}
						onClick={() => setPanel(2)}
					>
						Centrality
					</button>
					<button
						className={`px-2 py-1 text-[10px] rounded-lg border ${
							panel === 3 ? "bg-indigo-600/70 border-indigo-500" : "bg-slate-800/50 border-slate-600"
						}`}
						onClick={() => setPanel(3)}
					>
						Classic
					</button>
				</div>
			</div>

			{panel === 0 && (
				<div>
					<div className="text-xs text-slate-200 mb-1 font-mono">{evalText}</div>
					<EvalBar score={evaluation} mate={mate} />
				</div>
			)}

			{panel === 1 && (
				<div className="space-y-2">
					<div className="text-xs text-slate-200 font-mono">
						Modularity Q: <span className="text-indigo-200">{modularity.toFixed(3)}</span>
					</div>
					<div className="text-xs text-slate-300 font-mono">
						Communities: <span className="text-indigo-200">{communityCount}</span>
					</div>
					{narrative && (
						<div className="text-[11px] text-slate-300 leading-relaxed border border-slate-700/60 bg-slate-800/40 rounded-lg p-2">
							{narrative}
						</div>
					)}
				</div>
			)}

			{panel === 2 && graphSnapshot && (
				<div className="space-y-2">
					<div className="text-xs text-slate-200 font-mono capitalize">
						Top {centralityMetric === "none" ? "pieces" : centralityMetric}
					</div>
					{topNodes.map((n) => (
						<div
							key={n.square}
							className="flex items-center justify-between gap-3 bg-slate-800/40 border border-slate-700/50 rounded-lg px-2 py-1"
						>
							<span className="text-xs font-mono text-indigo-200">{n.square}</span>
							<span className="text-[11px] font-mono text-slate-200">
								{centralityMetric === "none" ? "—" : n.value.toFixed(3)}
							</span>
						</div>
					))}
				</div>
			)}

			{panel === 3 && (
				<div className="overflow-visible">
					<TraditionalMetricsDashboard fen={fen} />
				</div>
			)}
		</div>
	);
}

