import React, { useCallback, useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { Chess } from "chess.js";
import type { GraphSnapshot } from "@yourcompany/chess/types";
import { buildGraph } from "@yourcompany/chess/graph";

import { MobileChessBoard } from "#components/chess/MobileChessBoard";
import { MobileCommunityTiles } from "#components/chess/MobileCommunityTiles";

type PlayerColor = "w" | "b";
type CentralityMetric =
	| "weighted"
	| "degree"
	| "betweenness"
	| "closeness"
	| "pagerank"
	| "none";

const STARTING_FEN =
	"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function pickRandom<T>(items: T[]): T | null {
	if (items.length === 0) return null;
	return items[Math.floor(Math.random() * items.length)];
}

function getGameOverReason(game: Chess): string | undefined {
	if (!game.isGameOver()) return undefined;
	if (game.isCheckmate()) return "checkmate";
	if (game.isStalemate()) return "stalemate";
	if (game.isDraw()) return "draw";
	return undefined;
}

export default function TrainScreen() {
	const windowWidth = Dimensions.get("window").width;
	const boardSize = Math.min(windowWidth - 40, 360);
	const squareAlpha = 0.65;

	const [playerColor, setPlayerColor] = useState<PlayerColor>("w");
	const [liveGraphEnabled, setLiveGraphEnabled] = useState<boolean>(true);
	const [centralityMetric, setCentralityMetric] = useState<CentralityMetric>("degree");

	const [fen, setFen] = useState<string>(STARTING_FEN);
	const gameRef = useRef(new Chess(STARTING_FEN));

	const [moveHistory, setMoveHistory] = useState<{ san: string; color: PlayerColor }[]>([]);

	const [gameStatus, setGameStatus] = useState<"playing" | "gameover">("playing");
	const [gameOverReason, setGameOverReason] = useState<string | undefined>(undefined);

	const [graphSnapshot, setGraphSnapshot] = useState<GraphSnapshot | null>(null);

	const orientation = playerColor === "w" ? ("white" as const) : ("black" as const);

	const hintToSquare = useMemo(() => {
		if (mode !== "learn") return null;
		if (gameStatus !== "playing") return null;
		if (!currentOpeningNode || currentOpeningNode.children.size === 0) return null;

		const turnColor = fen.split(" ")[1] as PlayerColor | undefined;
		if (!turnColor || turnColor !== playerColor) return null;

		const firstChild = currentOpeningNode.children.values().next();
		if (firstChild.done) return null;

		const nextSan = firstChild.value.san;

		try {
			const temp = new Chess(fen);
			const move = temp.move(nextSan);
			if (!move) return null;
			return move.to;
		} catch {
			return null;
		}
	}, [fen, mode, gameStatus, playerColor, currentOpeningNode]);

	const newGame = useCallback(() => {
		const game = gameRef.current;
		game.reset();
		setFen(game.fen());
		setMoveHistory([]);
		setGameStatus("playing");
		setGameOverReason(undefined);

		if (liveGraphEnabled) {
			const result = buildGraph(game.fen());
			if (result.isOk()) setGraphSnapshot(result.value);
		} else {
			setGraphSnapshot(null);
		}
	}, [liveGraphEnabled]);

	// Apply the player's move, then apply a single "opponent" move.
	const attemptMove = useCallback(
		(from: string, to: string) => {
			if (gameStatus !== "playing") return;

			const game = gameRef.current;

			let move;
			try {
				move = game.move({ from, to, promotion: "q" });
			} catch {
				move = null;
			}

			if (!move) return;

			// Update history with the player's move.
			const nextHistory = [...moveHistory, { san: move.san, color: move.color as PlayerColor }];

			// One opponent move (random legal).
			if (!game.isGameOver()) {
				let opponentMove = null;
				const legal = game.moves();
				const randomSan = pickRandom(legal);
				if (randomSan) opponentMove = game.move(randomSan);

				if (opponentMove) {
					nextHistory.push({
						san: opponentMove.san,
						color: opponentMove.color as PlayerColor,
					});
				}}
							style={{
								flex: 1,
								paddingVertical: 10,
								backgroundColor: playerColor === "w" ? "#4f46e5" : "#111827",
								borderRadius: 12,
								alignItems: "center",
							}}
						>
							<Text style={{ color: "#fff", fontWeight: "700" }}>Play White</Text>
						</Pressable>
						<Pressable
							onPress={() => {
								setPlayerColor("b");
								setTimeout(newGame, 0);
							}}
							style={{
								flex: 1,
								paddingVertical: 10,
								backgroundColor: playerColor === "b" ? "#4f46e5" : "#111827",
								borderRadius: 12,
								alignItems: "center",
							}}
						>
							<Text style={{ color: "#fff", fontWeight: "700" }}>Play Black</Text>
						</Pressable>
					</View>

					<View style={{ backgroundColor: "#111827", borderRadius: 12, padding: 12, gap: 8 }}>
						<Text style={{ color: "#cbd5e1", fontSize: 12, fontWeight: "700" }}>
							Piece Size Metric
						</Text>
						<ScrollView horizontal showsHorizontalScrollIndicator={false}>
							<View style={{ flexDirection: "row", gap: 8 }}>
								{([
									["weighted", "Impact"],
									["degree", "Activity"],
									["betweenness", "Bridge"],
									["closeness", "Closeness"],
									["pagerank", "PageRank"],
									["none", "Uniform"],
								] as Array<[CentralityMetric, string]>).map(([value, label]) => {
									const active = centralityMetric === value;
									return (
										<Pressable
											key={value}
											onPress={() => setCentralityMetric(value)}
											style={{
												paddingVertical: 8,
												paddingHorizontal: 10,
												borderRadius: 999,
												backgroundColor: active ? "#4f46e5" : "#0f172a",
											}}
										>
											<Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
												{label}
											</Text>
										</Pressable>
									);
								})}
							</View>
						</ScrollView>
					</View>

					<View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
						<Pressable
							onPress={() => setLiveGraphEnabled((v) => !v)}
							style={{
								flex: 1,
								paddingVertical: 10,
								backgroundColor: liveGraphEnabled ? "#4f46e5" : "#0f172a",
								borderRadius: 12,
								alignItems: "center",
								marginRight: 8,
							}}
						>
							<Text style={{ color: "#fff", fontWeight: "700" }}>Graphity Vision</Text>
						</Pressable>
						<Pressable
							onPress={newGame}
							style={{
								flex: 1,
								paddingVertical: 10,
								backgroundColor: "#111827",
								borderRadius: 12,
								alignItems: "center",
								borderWidth: 1,
								borderColor: "#334155",
							}}
						>
							<Text style={{ color: "#fff", fontWeight: "700" }}>New Game</Text>
						</Pressable>
					</View>
				</View>
			</ScrollView>
		</View>
	);
}

