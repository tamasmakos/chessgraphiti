import React, { useMemo } from "react";
import type { GraphNode } from "@yourcompany/chess/types";
import { COMMUNITY_COLORS } from "@yourcompany/chess/constants";
import { View } from "react-native";

type CentralityMetric = "weighted" | "degree" | "betweenness" | "closeness" | "pagerank" | "none";

interface MobileCommunityTilesProps {
	nodes: GraphNode[];
	boardSize: number;
	orientation: "white" | "black";
	centralityMetric?: CentralityMetric;
}

export function MobileCommunityTiles({
	nodes,
	boardSize,
	orientation,
	centralityMetric = "degree",
}: MobileCommunityTilesProps) {
	const squareSize = boardSize / 8;

	const tiles = useMemo(() => {
		const getCentralityValue = (node: GraphNode): number => {
			switch (centralityMetric) {
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
		};
		const values = nodes.map((n) => getCentralityValue(n));
		const max = Math.max(...values, 0.0001);

		return nodes.map((node) => {
			const file = node.square.charCodeAt(0) - 97;
			const rank = Number.parseInt(node.square[1] ?? "1", 10) - 1;

			const squareLeft =
				orientation === "white" ? file * squareSize : (7 - file) * squareSize;
			const squareTop =
				orientation === "white" ? (7 - rank) * squareSize : rank * squareSize;

			const value = getCentralityValue(node);
			const ratio = centralityMetric === "none" ? 0 : value / max;
			const opacity = centralityMetric === "none" ? 0.28 : 0.2 + ratio * 0.2;

			return {
				key: node.square,
				left: squareLeft,
				top: squareTop,
				width: squareSize,
				height: squareSize,
				color: COMMUNITY_COLORS[node.communityId % COMMUNITY_COLORS.length],
				opacity,
			};
		});
	}, [nodes, squareSize, orientation, centralityMetric]);

	return (
		<View
			pointerEvents="none"
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				width: boardSize,
				height: boardSize,
				zIndex: 5,
			}}
		>
			{tiles.map((tile) => (
				<View
					key={tile.key}
					style={{
						position: "absolute",
						left: tile.left,
						top: tile.top,
						width: tile.width,
						height: tile.height,
						backgroundColor: tile.color,
						opacity: tile.opacity,
					}}
				/>
			))}
		</View>
	);
}

