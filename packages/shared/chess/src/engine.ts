/**
 * UCI (Universal Chess Interface) response parsing utilities and command builders.
 *
 * These are platform-agnostic pure functions used by both the Web Worker (WASM)
 * and React Native (native binary) Stockfish implementations. No Web Worker,
 * DOM, or Node-specific APIs are used here.
 */
import type { BestMoveResult, EvaluationResult, SearchOptions } from "#types";

/**
 * Parse a UCI "bestmove" response line.
 *
 * @example
 * ```ts
 * parseBestMove("bestmove e2e4 ponder d7d5");
 * // => { bestMove: "e2e4", ponder: "d7d5" }
 *
 * parseBestMove("bestmove e2e4");
 * // => { bestMove: "e2e4" }
 * ```
 *
 * @param output - Raw UCI output (may contain multiple lines; only the
 *   "bestmove" line is parsed)
 * @returns Parsed best move and optional ponder move
 * @throws {Error} If no "bestmove" line is found in the output
 */
export function parseBestMove(output: string): BestMoveResult {
	const lines = output.trim().split("\n");
	const bestMoveLine = lines.findLast((line) => line.startsWith("bestmove"));

	if (!bestMoveLine) {
		throw new Error('No "bestmove" line found in UCI output');
	}

	const tokens = bestMoveLine.split(/\s+/);
	const bestMove = tokens[1];

	if (!bestMove) {
		throw new Error("Malformed bestmove line: missing move token");
	}

	const ponderIndex = tokens.indexOf("ponder");
	const ponder =
		ponderIndex !== -1 ? tokens[ponderIndex + 1] : undefined;

	return ponder ? { bestMove, ponder } : { bestMove };
}

/**
 * Parse the last UCI "info depth ..." line to extract evaluation details.
 *
 * Extracts:
 * - `score cp <n>` or `score mate <n>` for the evaluation
 * - `depth <n>` for the search depth
 * - `pv <move1> <move2> ...` for the principal variation
 * - `nodes <n>` for the node count
 *
 * @example
 * ```ts
 * parseEvaluation("info depth 20 score cp 35 nodes 184623 pv e2e4 e7e5 g1f3");
 * // => { score: 35, depth: 20, pv: ["e2e4", "e7e5", "g1f3"], nodes: 184623 }
 * ```
 *
 * @param output - Raw UCI output containing one or more "info" lines
 * @returns Parsed evaluation result from the deepest info line
 * @throws {Error} If no parseable "info depth" line is found
 */
export function parseEvaluation(output: string): EvaluationResult {
	const lines = output.trim().split("\n");
	const infoLine = lines.findLast(
		(line) => line.startsWith("info") && line.includes("depth"),
	);

	if (!infoLine) {
		throw new Error('No "info depth" line found in UCI output');
	}

	const tokens = infoLine.split(/\s+/);

	// --- depth ---
	const depthIdx = tokens.indexOf("depth");
	const depth = depthIdx !== -1 ? Number(tokens[depthIdx + 1]) : 0;

	// --- score (cp or mate) ---
	const scoreIdx = tokens.indexOf("score");
	let score = 0;
	let mate: number | undefined;

	if (scoreIdx !== -1) {
		const scoreType = tokens[scoreIdx + 1];
		const scoreValue = Number(tokens[scoreIdx + 2]);

		if (scoreType === "cp") {
			score = scoreValue;
		} else if (scoreType === "mate") {
			mate = scoreValue;
			// Represent mate score as a large centipawn value (sign indicates side)
			score = scoreValue > 0 ? 100_000 - scoreValue : -100_000 - scoreValue;
		}
	}

	// --- nodes ---
	const nodesIdx = tokens.indexOf("nodes");
	const nodes = nodesIdx !== -1 ? Number(tokens[nodesIdx + 1]) : 0;

	// --- pv (principal variation, all tokens after "pv" until end or next keyword) ---
	const pvIdx = tokens.indexOf("pv");
	const pv: string[] = [];

	if (pvIdx !== -1) {
		// Known UCI info keywords that would terminate the PV token sequence
		const infoKeywords = new Set([
			"depth",
			"seldepth",
			"multipv",
			"score",
			"nodes",
			"nps",
			"hashfull",
			"tbhits",
			"time",
			"currmove",
			"currmovenumber",
			"string",
			"refutation",
			"currline",
			"bmc",
		]);

		for (let i = pvIdx + 1; i < tokens.length; i++) {
			const token = tokens[i];
			if (token !== undefined && !infoKeywords.has(token)) {
				pv.push(token);
			} else {
				break;
			}
		}
	}

	const result: EvaluationResult = { score, depth, pv, nodes };

	if (mate !== undefined) {
		result.mate = mate;
	}

	return result;
}

/**
 * Build a UCI "go" command string from search options.
 *
 * At least one search constraint should be specified. If none are provided,
 * defaults to `go depth 20`.
 *
 * @example
 * ```ts
 * buildGoCommand({ depth: 15 });
 * // => "go depth 15"
 *
 * buildGoCommand({ moveTime: 2000 });
 * // => "go movetime 2000"
 *
 * buildGoCommand({ depth: 10, nodes: 500000 });
 * // => "go depth 10 nodes 500000"
 *
 * buildGoCommand({});
 * // => "go depth 20"
 * ```
 *
 * @param options - Search constraints (depth, moveTime, nodes)
 * @returns A complete UCI "go" command string
 */
export function buildGoCommand(options: SearchOptions): string {
	const parts: string[] = ["go"];

	if (options.depth !== undefined) {
		parts.push("depth", String(options.depth));
	}

	if (options.moveTime !== undefined) {
		parts.push("movetime", String(options.moveTime));
	}

	if (options.nodes !== undefined) {
		parts.push("nodes", String(options.nodes));
	}

	// Default to depth 20 if no constraints were specified
	if (parts.length === 1) {
		parts.push("depth", "20");
	}

	return parts.join(" ");
}
