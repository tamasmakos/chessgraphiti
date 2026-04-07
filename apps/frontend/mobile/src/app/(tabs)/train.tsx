import { buildGraph } from "@yourcompany/chess/graph";
import type { GraphSnapshot } from "@yourcompany/chess/types";
import { Chess } from "chess.js";
import { useCallback, useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, Text, View, ScrollView } from "react-native";


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

	return (
		<View style={{ flex: 1, backgroundColor: "#020617" }}>
			<ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
				<View style={{ padding: 20, paddingTop: 60 }}>
					<View style={{ marginBottom: 24 }}>
						<Text style={{ color: "#fff", fontSize: 28, fontWeight: "800", letterSpacing: -0.5 }}>
							Graphiti <Text style={{ color: "#4f46e5" }}>Vision</Text>
						</Text>
						<Text style={{ color: "#94a3b8", fontSize: 14, marginTop: 4 }}>
							Calm Base Layer • Structural Intelligence
						</Text>
					</View>

					<View style={{ 
						width: boardSize, 
						height: boardSize, 
						backgroundColor: "#1e293b", 
						borderRadius: 16,
						alignSelf: "center",
						marginBottom: 24,
						justifyContent: "center",
						alignItems: "center",
						borderWidth: 1,
						borderColor: "#334155"
					}}>
						<Text style={{ color: "#475569" }}>[ Mobile Chess Board ]</Text>
					</View>

					{/* Calm Control Layer */}
					<View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
						<Pressable
							onPress={() => {
								setPlayerColor("w");
								setTimeout(newGame, 0);
							}}
							style={{
								flex: 1,
								paddingVertical: 12,
								backgroundColor: playerColor === "w" ? "#4f46e5" : "#0f172a",
								borderRadius: 14,
								alignItems: "center",
								borderWidth: 1,
								borderColor: playerColor === "w" ? "#6366f1" : "#1e293b"
							}}
						>
							<Text style={{ color: "#fff", fontWeight: "700" }}>White</Text>
						</Pressable>
						<Pressable
							onPress={() => {
								setPlayerColor("b");
								setTimeout(newGame, 0);
							}}
							style={{
								flex: 1,
								paddingVertical: 12,
								backgroundColor: playerColor === "b" ? "#4f46e5" : "#0f172a",
								borderRadius: 14,
								alignItems: "center",
								borderWidth: 1,
								borderColor: playerColor === "b" ? "#6366f1" : "#1e293b"
							}}
						>
							<Text style={{ color: "#fff", fontWeight: "700" }}>Black</Text>
						</Pressable>
					</View>

					<View style={{ backgroundColor: "#0f172a", borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: "#1e293b" }}>
						<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
							<Text style={{ color: "#94a3b8", fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>
								Graph Metrics
							</Text>
							<View style={{ backgroundColor: liveGraphEnabled ? "#4f46e520" : "#0f172a", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
								<Text style={{ color: liveGraphEnabled ? "#818cf8" : "#475569", fontSize: 10, fontWeight: "800" }}>
									{liveGraphEnabled ? "LIVE" : "OFF"}
								</Text>
							</View>
						</View>
						
						<ScrollView horizontal showsHorizontalScrollIndicator={false}>
							<View style={{ flexDirection: "row", gap: 10 }}>
								{([
									["weighted", "Impact"],
									["degree", "Activity"],
									["betweenness", "Bridge"],
									["closeness", "Closeness"],
									["pagerank", "PageRank"],
								] as Array<[CentralityMetric, string]>).map(([value, label]) => {
									const active = centralityMetric === value;
									return (
										<Pressable
											key={value}
											onPress={() => setCentralityMetric(value)}
											style={{
												paddingVertical: 10,
												paddingHorizontal: 14,
												borderRadius: 12,
												backgroundColor: active ? "#4f46e5" : "#1e293b",
											}}
										>
											<Text style={{ color: active ? "#fff" : "#94a3b8", fontSize: 13, fontWeight: "700" }}>
												{label}
											</Text>
										</Pressable>
									);
								})}
							</View>
						</ScrollView>
					</View>

					<View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16, gap: 12 }}>
						<Pressable
							onPress={() => setLiveGraphEnabled((v) => !v)}
							style={{
								flex: 1.5,
								paddingVertical: 14,
								backgroundColor: liveGraphEnabled ? "#4f46e5" : "#0f172a",
								borderRadius: 14,
								alignItems: "center",
								borderWidth: 1,
								borderColor: liveGraphEnabled ? "#6366f1" : "#1e293b"
							}}
						>
							<Text style={{ color: "#fff", fontWeight: "700" }}>
								{liveGraphEnabled ? "Disable Graphiti" : "Enable Graphiti"}
							</Text>
						</Pressable>
						<Pressable
							onPress={newGame}
							style={{
								flex: 1,
								paddingVertical: 14,
								backgroundColor: "#0f172a",
								borderRadius: 14,
								alignItems: "center",
								borderWidth: 1,
								borderColor: "#1e293b",
							}}
						>
							<Text style={{ color: "#94a3b8", fontWeight: "700" }}>Reset</Text>
						</Pressable>
					</View>
				</View>
			</ScrollView>
		</View>
	);
}

