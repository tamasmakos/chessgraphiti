/**
 * Zustand store for all game state: board position, opening training,
 * engine evaluation, graph analysis, and move-by-move analysis replay.
 *
 * The internal `_game` (chess.js instance) is the source of truth for
 * legal-move validation. Reactive state (`fen`, `pgn`, `history`) is
 * derived from it after every mutation so components never read `_game`
 * directly.
 *
 * @module
 */
import { create } from "zustand";
import { Chess } from "chess.js";
import { buildGraph } from "@yourcompany/chess/graph";
import type { GraphSnapshot } from "@yourcompany/chess/types";
import {
	analyzeCommunityLineage,
	computeNextStepLineage,
	type CommunityLineageAnalysis,
} from "@yourcompany/chess/community-lineage";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STARTING_FEN =
	"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";



/** Default Stockfish strength (UCI Skill Level 0-20). */
const DEFAULT_ENGINE_STRENGTH = 10;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MoveRecord {
	from: string;
	to: string;
	san: string;
	color: "w" | "b";
}

export type GameStatus = "idle" | "playing" | "gameover" | "analysis";

export type CentralityMetric =
	| "weighted"
	| "degree"
	| "betweenness"
	| "closeness"
	| "pagerank"
	| "none";


export interface GameStore {
	// -- Game state --------------------------------------------------------
	fen: string;
	pgn: string;
	history: MoveRecord[];
	playerColor: "w" | "b";
	gameStatus: GameStatus;
	gameOverReason?: string;
	// -- Engine state ------------------------------------------------------
	isEngineThinking: boolean;
	evaluation: number;
	mateIn?: number;
	engineStrength: number;
	engineLines: string[];
	engineType: "stockfish" | "custom";
	customModelPath: string;
	customBookPath: string;
	winProb?: number;
	uncertainty?: number;
	moveRanking?: Array<{ move: string; score: number }>;
	engineSource?: "gnn" | "book";

	// -- Tutor state -------------------------------------------------------
	tutorMode: boolean;
	tutorRanking: Array<{ move: string; score: number }> | null;
	isTutorAnalyzing: boolean;
	tutorWinProb: number | undefined;

	// -- Graph state -------------------------------------------------------
	graphSnapshot: GraphSnapshot | null;
	liveGraphSnapshots: Array<GraphSnapshot | null>;
	liveGraphEnabled: boolean;
	liveLineage: CommunityLineageAnalysis | null;
	centralityMetric: CentralityMetric;

	// -- Analysis state ----------------------------------------------------
	analysisIndex: number;
	analysisFens: string[];
	analysisGraphSnapshots: Array<GraphSnapshot | null>;
	analysisLineage: CommunityLineageAnalysis | null;

	// -- Internal chess.js instance (not serializable, managed internally) -
	_game: Chess;

	// -- Actions -----------------------------------------------------------
	makeMove: (
		from: string,
		to: string,
		promotion?: string,
	) => { success: boolean; san?: string; reason?: string };
	setPlayerColor: (color: "w" | "b") => void;
	newGame: () => void;
	undo: () => void;
	resign: () => void;
	startAnalysis: () => void;
	exitAnalysis: () => void;
	navigateAnalysis: (
		direction: "first" | "prev" | "next" | "last" | number,
	) => void;
	toggleLiveGraph: () => void;
	setCentralityMetric: (metric: CentralityMetric) => void;
	setEvaluation: (score: number, mateIn?: number) => void;
	setEngineThinking: (thinking: boolean) => void;
	setEngineStrength: (strength: number) => void;
	setEngineLines: (lines: string[]) => void;
	setEngineConfig: (type: "stockfish" | "custom", modelPath: string, bookPath: string) => void;
	setEngineSourceData: (
		winProb: number | undefined,
		uncertainty: number | undefined,
		ranking: Array<{ move: string; score: number }> | undefined,
		source: "gnn" | "book" | undefined,
	) => void;
	setTutorMode: (on: boolean) => void;
	setTutorData: (ranking: Array<{ move: string; score: number }>, winProb: number | undefined) => void;
	clearTutorData: () => void;
	setTutorAnalyzing: (analyzing: boolean) => void;
	rebuildGraph: () => void;
}

// ---------------------------------------------------------------------------
// Helpers (pure, not exported — internal to this module)
// ---------------------------------------------------------------------------



/**
 * Run the full graph-analysis pipeline on a FEN, returning `null` on error.
 */
function computeGraph(fen: string): GraphSnapshot | null {
	const result = buildGraph(fen);
	return result.isOk() ? result.value : null;
}

/**
 * Replay the move history from the starting position and collect the FEN
 * after each half-move.  The first entry is always the starting FEN.
 */
function buildAnalysisFens(history: MoveRecord[]): string[] {
	const replay = new Chess();
	const fens = [replay.fen()];
	for (const move of history) {
		replay.move(move.san);
		fens.push(replay.fen());
	}
	return fens;
}

function buildAnalysisState(history: MoveRecord[], targetIndex?: number) {
	const analysisFens = buildAnalysisFens(history);
	const analysisGraphSnapshots = analysisFens.map((fen) => computeGraph(fen));
	const analysisLineage = analyzeCommunityLineage(analysisGraphSnapshots);
	const lastIndex = analysisFens.length - 1;
	const analysisIndex = Math.max(
		0,
		Math.min(lastIndex, targetIndex ?? lastIndex),
	);

	return {
		analysisFens,
		analysisGraphSnapshots,
		analysisLineage,
		analysisIndex,
		fen: analysisFens[analysisIndex] ?? STARTING_FEN,
		graphSnapshot: analysisGraphSnapshots[analysisIndex] ?? null,
	};
}

function buildLiveResumeState(state: GameStore) {
	const currentFen = state._game.fen();
	const graphSnapshot = state.liveGraphEnabled
		? state.analysisGraphSnapshots.at(-1) ?? null
		: null;

	return {
		gameStatus: state.history.length > 0 ? "playing" : "idle",
		fen: currentFen,
		analysisIndex: 0,
		analysisFens: [],
		analysisGraphSnapshots: [],
		analysisLineage: null,
		graphSnapshot,
	};
}

function resolveAnalysisIndex(
	direction: "first" | "prev" | "next" | "last" | number,
	currentIndex: number,
	lastIndex: number,
): number {
	if (typeof direction === "number") {
		return Math.max(0, Math.min(lastIndex, direction));
	}

	switch (direction) {
		case "first":
			return 0;
		case "prev":
			return Math.max(0, currentIndex - 1);
		case "next":
			return Math.min(lastIndex, currentIndex + 1);
		case "last":
			return lastIndex;
	}
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGameStore = create<GameStore>((set, get) => ({
	// -- Game state --------------------------------------------------------
	fen: STARTING_FEN,
	pgn: "",
	history: [],
	playerColor: "w",
	gameStatus: "idle",
	gameOverReason: undefined,
	hoveredSquare: null,

	// -- Engine state ------------------------------------------------------
	isEngineThinking: false,
	evaluation: 0,
	mateIn: undefined,
	engineStrength: DEFAULT_ENGINE_STRENGTH,
	engineLines: [],
	engineType: "stockfish" as const,
	customModelPath: "gateau_distilled.pt",
	customBookPath: "chessgnn.bin",
	winProb: undefined,
	uncertainty: undefined,
	moveRanking: undefined,
	engineSource: undefined,

	// -- Tutor state -------------------------------------------------------
	tutorMode: false,
	tutorRanking: null,
	isTutorAnalyzing: false,
	tutorWinProb: undefined,

	// -- Graph state -------------------------------------------------------
	graphSnapshot: computeGraph(STARTING_FEN),
	liveGraphSnapshots: [],
	liveGraphEnabled: true,
	liveLineage: null,
	centralityMetric: "weighted",

	// -- Analysis state ----------------------------------------------------
	analysisIndex: 0,
	analysisFens: [],
	analysisGraphSnapshots: [],
	analysisLineage: null,

	// -- Internal ----------------------------------------------------------
	_game: new Chess(),

	// =====================================================================
	// Actions
	// =====================================================================

	makeMove: (from, to, promotion) => {
		const state = get();

		// Block moves when game is not active.
		if (state.gameStatus === "gameover" || state.gameStatus === "analysis") {
			return { success: false, reason: "Game is not active" };
		}

		const { _game: game } = state;

		// 1. Attempt the move via chess.js (validates legality).
		let move: ReturnType<typeof game.move>;
		try {
			move = game.move({ from, to, promotion });
		} catch {
			return { success: false, reason: "Invalid move" };
		}
		if (!move) {
			return { success: false, reason: "Invalid move" };
		}

		// 2. Append to history.
		const newHistory: MoveRecord[] = [
			...state.history,
			{
				from: move.from,
				to: move.to,
				san: move.san,
				color: move.color as "w" | "b",
			},
		];

		// 5. Detect game-over conditions.
		let gameStatus: GameStatus =
			state.gameStatus === "idle" ? "playing" : state.gameStatus;
		let gameOverReason: string | undefined;

		if (game.isGameOver()) {
			gameStatus = "gameover";
			if (game.isCheckmate()) {
				gameOverReason = "checkmate";
			} else if (game.isStalemate()) {
				gameOverReason = "stalemate";
			} else if (game.isDraw()) {
				gameOverReason = "draw";
			}
		}

		// 6. Rebuild graph if live analysis is enabled.
		const graphSnapshot = state.liveGraphEnabled
			? computeGraph(game.fen())
			: state.graphSnapshot;
		
		const nextLiveSnapshots = state.liveGraphEnabled 
			? [...state.liveGraphSnapshots, graphSnapshot]
			: [];
		
		const nextLiveLineage = state.liveGraphEnabled && graphSnapshot
			? computeNextStepLineage(
					graphSnapshot, 
					state.graphSnapshot, 
					state.liveLineage
				)
			: state.liveLineage;

		set({
			fen: game.fen(),
			pgn: game.pgn(),
			history: newHistory,
			gameStatus,
			gameOverReason,
			graphSnapshot,
			liveGraphSnapshots: nextLiveSnapshots,
			liveLineage: nextLiveLineage,
		});

		return { success: true, san: move.san };
	},

	setPlayerColor: (color) => set({ playerColor: color }),

	newGame: () => {
		const state = get();
		state._game.reset();

		set({
			fen: STARTING_FEN,
			pgn: "",
			history: [],
			gameStatus: "idle",
			gameOverReason: undefined,
			isEngineThinking: false,
			evaluation: 0,
			mateIn: undefined,
			graphSnapshot: computeGraph(STARTING_FEN),
			liveGraphSnapshots: [computeGraph(STARTING_FEN)],
			liveLineage: null,
			analysisIndex: 0,
			analysisFens: [STARTING_FEN],
			analysisGraphSnapshots: [computeGraph(STARTING_FEN)],
			analysisLineage: null,
		});
	},

	undo: () => {
		const state = get();
		const { _game: game } = state;

		if (state.history.length === 0) return;
		if (state.gameStatus === "analysis") return;

		// Undo two half-moves: the engine's response and the player's move.
		// If only one move has been played (the player hasn't received a
		// response yet), undo just that single move.
		const undone1 = game.undo();
		if (!undone1) return;

		let movesRemoved = 1;
		if (state.history.length > 1) {
			const undone2 = game.undo();
			if (undone2) movesRemoved = 2;
		}

		const newHistory = state.history.slice(0, -movesRemoved);

		const graphSnapshot = state.liveGraphEnabled
			? computeGraph(game.fen())
			: state.graphSnapshot;

		const nextLiveSnapshots = state.liveGraphEnabled 
			? state.liveGraphSnapshots.slice(0, -movesRemoved)
			: [];
			
		// For undo, we can just slice the lineage as well
		const nextLiveLineage = state.liveLineage && state.liveGraphEnabled
			? {
					stableColorByStep: state.liveLineage.stableColorByStep.slice(0, -movesRemoved),
					transitions: state.liveLineage.transitions.slice(0, -movesRemoved),
				}
			: state.liveLineage;

		set({
			fen: game.fen(),
			pgn: game.pgn(),
			history: newHistory,
			gameStatus: newHistory.length === 0 ? "idle" : "playing",
			gameOverReason: undefined,
			graphSnapshot,
			liveGraphSnapshots: nextLiveSnapshots,
			liveLineage: nextLiveLineage,
		});
	},

	resign: () => {
		const state = get();
		if (state.gameStatus !== "playing") return;
		set({
			gameStatus: "gameover",
			gameOverReason: "resignation",
		});
	},

	startAnalysis: () => {
		const state = get();
		if (state.history.length === 0) return;
		const analysisState = buildAnalysisState(state.history);

		set({
			gameStatus: "analysis",
			...analysisState,
		});
	},

	exitAnalysis: () => {
		const state = get();
		if (state.gameStatus !== "analysis") return;

		set(buildLiveResumeState(state));
	},

	navigateAnalysis: (direction) => {
		const state = get();
		if (state.history.length === 0) return;

		if (state.gameStatus !== "analysis") {
			const liveLastIndex = state.history.length;
			const targetIndex = resolveAnalysisIndex(
				direction,
				liveLastIndex,
				liveLastIndex,
			);
			const analysisState = buildAnalysisState(state.history, targetIndex);

			set({
				gameStatus: "analysis",
				...analysisState,
			});
			return;
		}

		const { analysisFens, analysisIndex } = state;
		const lastIndex = analysisFens.length - 1;
		const newIndex = resolveAnalysisIndex(direction, analysisIndex, lastIndex);
		const shouldResumeLivePlay =
			newIndex === lastIndex && state.gameOverReason === undefined;

		if (shouldResumeLivePlay) {
			set(buildLiveResumeState(state));
			return;
		}

		if (newIndex === analysisIndex) return;

		const fen = analysisFens[newIndex]!;
		const graphSnapshot = state.analysisGraphSnapshots[newIndex] ?? null;

		set({ analysisIndex: newIndex, fen, graphSnapshot });
	},



	toggleLiveGraph: () => {
		const state = get();
		const nextEnabled = !state.liveGraphEnabled;

		if (nextEnabled) {
			set({
				liveGraphEnabled: true,
				graphSnapshot: computeGraph(state.fen),
			});
		} else {
			set({ liveGraphEnabled: false, graphSnapshot: null });
		}
	},



	setCentralityMetric: (metric) => set({ centralityMetric: metric }),

	setEvaluation: (score, mateIn) => set({ evaluation: score, mateIn }),

	setEngineThinking: (thinking) => set({ isEngineThinking: thinking }),

	setEngineStrength: (engineStrength) =>
		set({ engineStrength }),

	setEngineLines: (lines) => set({ engineLines: lines }),

	setEngineConfig: (type, modelPath, bookPath) =>
		set({ engineType: type, customModelPath: modelPath, customBookPath: bookPath }),

	setEngineSourceData: (winProb, uncertainty, ranking, source) =>
		set({ winProb, uncertainty, moveRanking: ranking, engineSource: source }),

	setTutorMode: (on) => set({ tutorMode: on, tutorRanking: on ? get().tutorRanking : null, tutorWinProb: on ? get().tutorWinProb : undefined }),

	setTutorData: (ranking, winProb) => set({ tutorRanking: ranking, tutorWinProb: winProb, isTutorAnalyzing: false }),

	clearTutorData: () => set({ tutorRanking: null, tutorWinProb: undefined }),

	setTutorAnalyzing: (analyzing) => set({ isTutorAnalyzing: analyzing }),

	rebuildGraph: () => {
		const state = get();
		const fen =
			state.gameStatus === "analysis"
				? (state.analysisFens[state.analysisIndex] ?? state.fen)
				: state.fen;

		set({ graphSnapshot: computeGraph(fen) });
	},
}));
