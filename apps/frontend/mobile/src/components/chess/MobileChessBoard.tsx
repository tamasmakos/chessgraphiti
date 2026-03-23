import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Chess } from "chess.js";

import type { GraphNode, Square } from "@yourcompany/chess/types";

type Orientation = "white" | "black";

const LIGHT_SQUARE = "#f0d9b5";
const DARK_SQUARE = "#b58863";

const GLYPHS: Record<string, string> = {
	wp: "♙",
	wn: "♘",
	wb: "♗",
	wr: "♖",
	wq: "♕",
	wk: "♔",
	bp: "♟",
	bn: "♞",
	bb: "♝",
	br: "♜",
	bq: "♛",
	bk: "♚",
};

interface MobileChessBoardProps {
	fen: string;
	orientation: Orientation;
	boardSize: number;
	playerColor: "w" | "b";
	interactive: boolean;
	graphNodes?: GraphNode[];
	centralityMetric?: "weighted" | "degree" | "betweenness" | "closeness" | "pagerank" | "none";
	hintToSquare?: string | null;
	squareAlpha?: number;
	onAttemptMove: (from: string, to: string) => void;
}

function squareToCoords(square: string): { file: number; rank: number } {
	const file = square.charCodeAt(0) - 97;
	const rank = Number.parseInt(square[1] ?? "1", 10) - 1;
	return { file, rank };
}

export function MobileChessBoard({
	fen,
	orientation,
	boardSize,
	playerColor,
	interactive,
	graphNodes = [],
	centralityMetric = "degree",
	hintToSquare,
	squareAlpha = 1,
	onAttemptMove,
}: MobileChessBoardProps) {
	const [selectedFrom, setSelectedFrom] = useState<string | null>(null);

	const game = useMemo(() => new Chess(fen), [fen]);
	const turn = game.turn();

	useEffect(() => {
		setSelectedFrom(null);
	}, [fen, playerColor]);

	const squareSize = boardSize / 8;
	const centralityBySquare = useMemo(() => {
		const map = new Map<string, number>();
		let max = 0.0001;

		for (const node of graphNodes) {
			let value = 0;
			switch (centralityMetric) {
				case "weighted":
					value = node.centralityWeighted;
					break;
				case "degree":
					value = node.centralityDegree;
					break;
				case "betweenness":
					value = node.centralityBetweenness;
					break;
				case "closeness":
					value = node.centralityCloseness;
					break;
				case "pagerank":
					value = node.centralityPageRank;
					break;
				case "none":
				default:
					value = 0;
					break;
			}
			map.set(node.square, value);
			max = Math.max(max, value);
		}

		return { map, max };
	}, [graphNodes, centralityMetric]);

	const renderSquare = (square: string, rowIdx: number, colIdx: number) => {
		const piece = game.get(square as Square);
		const { file, rank } = squareToCoords(square);
		const isDark = (file + rank) % 2 === 0;
		const backgroundColor = isDark
			? rgbaFromHex(DARK_SQUARE, squareAlpha)
			: rgbaFromHex(LIGHT_SQUARE, squareAlpha);

		const isSelected = selectedFrom === square;
		const isHint = hintToSquare === square;

		return (
			<Pressable
				key={square}
				style={{
					position: "absolute",
					top: rowIdx * squareSize,
					left: colIdx * squareSize,
					width: squareSize,
					height: squareSize,
					backgroundColor,
					justifyContent: "center",
					alignItems: "center",
					borderWidth: isSelected ? 3 : 0,
					borderColor: isSelected ? "#7c3aed" : "transparent",
				}}
				onPress={() => {
					if (!interactive) return;

					// Only allow user interaction on player's turn.
					if (turn !== playerColor) return;

					if (!selectedFrom) {
						if (piece && piece.color === playerColor) setSelectedFrom(square);
						return;
					}

					if (selectedFrom === square) {
						setSelectedFrom(null);
						return;
					}

					const from = selectedFrom;
					setSelectedFrom(null);
					onAttemptMove(from, square);
				}}
			>
				{isHint && (
					<View
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							backgroundColor: "rgba(52,211,153,0.28)",
						}}
					/>
				)}
				{piece && (() => {
					const value = centralityBySquare.map.get(square) ?? 0;
					const scale =
						centralityMetric === "none"
							? 0.72
							: 0.54 + (value / centralityBySquare.max) * 0.34;
					return (
						<Text style={{ fontSize: squareSize * scale }}>
							{GLYPHS[`${piece.color}${piece.type}`]}
						</Text>
					);
				})()}
			</Pressable>
		);
	};

	function rgbaFromHex(hex: string, alpha: number): string {
		const normalized = hex.replace("#", "");
		const int = parseInt(normalized, 16);
		const r = (int >> 16) & 255;
		const g = (int >> 8) & 255;
		const b = int & 255;
		return `rgba(${r},${g},${b},${alpha})`;
	}

	// Display squares in a deterministic top-left origin with orientation mapping.
	const squares: string[] = [];
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			const file = orientation === "white" ? col : 7 - col;
			const rank = orientation === "white" ? 7 - row : row;
			const sq = String.fromCharCode(97 + file) + String(rank + 1);
			squares.push(sq);
		}
	}

	return (
		<View style={{ width: boardSize, height: boardSize, position: "relative" }}>
			{squares.map((sq, i) => {
				const rowIdx = Math.floor(i / 8);
				const colIdx = i % 8;
				return renderSquare(sq, rowIdx, colIdx);
			})}
		</View>
	);
}

