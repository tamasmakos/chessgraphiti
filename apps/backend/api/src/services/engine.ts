import { err, ok, type Result } from "neverthrow";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseBestMove, parseEvaluation, buildGoCommand } from "@yourcompany/chess/engine";
import { SearchOptionsSchema } from "@yourcompany/chess/types";
import type { EvaluationResult } from "@yourcompany/chess/types";

export const getBestMoveInputSchema = z.object({
	fen: z.string().min(1),
	options: SearchOptionsSchema,
	modelPath: z.string().min(1).refine((v) => v === path.basename(v), "Path traversal not allowed"),
	bookPath: z.string().refine((v) => v === path.basename(v), "Path traversal not allowed").optional(),
});
export type GetBestMoveInput = z.infer<typeof getBestMoveInputSchema>;

export const analyzePositionInputSchema = z.object({
	fen: z.string().min(1),
	modelPath: z.string().min(1).refine((v) => v === path.basename(v), "Path traversal not allowed"),
	bookPath: z.string().refine((v) => v === path.basename(v), "Path traversal not allowed").optional(),
	depth: z.number().int().min(1).max(30).optional().default(18),
});
export type AnalyzePositionInput = z.infer<typeof analyzePositionInputSchema>;

export type EngineBestMoveResult = EvaluationResult & {
	bestMove: string;
	winProb?: number;
	uncertainty?: number;
	ranking?: Array<{ move: string; score: number }>;
	source?: "gnn" | "book";
};

export class EnginePathError extends Error {
	constructor(message = "Path outside allowed directory") {
		super(message);
		this.name = "EnginePathError";
	}
}

export class EngineTimeoutError extends Error {
	constructor(message = "Engine timed out") {
		super(message);
		this.name = "EngineTimeoutError";
	}
}

export class EngineExecutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EngineExecutionError";
	}
}

// Holds a persistent UCI subprocess to avoid per-request cold-start model loading.
type ProcState =
	| { phase: "starting"; resolve: (v: Result<void, Error>) => void }
	| { phase: "idle" }
	| { phase: "busy"; resolve: (v: Result<EngineBestMoveResult, Error>) => void };

interface PersistentProc {
	proc: ChildProcess;
	send: (cmd: string) => void;
	state: ProcState;
	modelPath: string;
	bookPath: string | undefined;
	lastInfoLine: string;
	winProb: number | undefined;
	uncertainty: number | undefined;
	ranking: Array<{ move: string; score: number }> | undefined;
	source: "gnn" | "book" | undefined;
}

export class EngineService {
	private readonly modelsDir: string;
	private readonly booksDir: string;
	private readonly engineScript: string;
	// Startup timeout (model load): generous to handle PyTorch cold start.
	private readonly startupTimeoutMs: number;
	// Per-request timeout (inference only, model already loaded).
	private readonly requestTimeoutMs: number;

	private engine: PersistentProc | null = null;
	// Serialises requests so only one is in-flight at a time.
	private queue: Promise<Result<EngineBestMoveResult, Error>> = Promise.resolve(ok({ bestMove: "", score: 0, depth: 0, pv: [], nodes: 0 }));

	constructor(
		modelsDir: string,
		booksDir: string,
		engineScript: string,
		startupTimeoutMs = 120_000,
		requestTimeoutMs = 30_000,
	) {
		this.modelsDir = path.resolve(modelsDir);
		this.booksDir = path.resolve(booksDir);
		this.engineScript = path.resolve(engineScript);
		this.startupTimeoutMs = startupTimeoutMs;
		this.requestTimeoutMs = requestTimeoutMs;
	}

	private resolveSecurePath(filename: string, allowedDir: string): Result<string, EnginePathError> {
		if (path.basename(filename) !== filename) {
			return err(new EnginePathError(`Path traversal not allowed: ${filename}`));
		}
		return ok(path.join(allowedDir, filename));
	}

	private killEngine() {
		if (!this.engine) return;
		try {
			this.engine.proc.stdin?.end();
			this.engine.proc.stdout?.destroy();
			this.engine.proc.stderr?.destroy();
			this.engine.proc.kill();
		} catch {
			// ignore
		}
		this.engine = null;
	}

	private spawnEngine(modelPath: string, bookPath: string | undefined): Promise<Result<void, Error>> {
		this.killEngine();

		const args = [this.engineScript, "--model", modelPath];
		if (bookPath) {
			args.push("--book", bookPath);
		} else {
			args.push("--no-book");
		}

		const proc = spawn("python", args, { stdio: ["pipe", "pipe", "pipe"], cwd: path.dirname(this.engineScript) });

		const send = (cmd: string) => {
			try {
				proc.stdin?.write(`${cmd}\n`);
			} catch {
				// stdin may be closed
			}
		};

		return new Promise<Result<void, Error>>((resolve) => {
			const engine: PersistentProc = {
				proc,
				send,
				state: { phase: "starting", resolve },
				modelPath,
				bookPath,
				lastInfoLine: "",
				winProb: undefined,
				uncertainty: undefined,
				ranking: undefined,
				source: undefined,
			};
			this.engine = engine;

			const startupTimer = setTimeout(() => {
				if (engine.state.phase === "starting") {
					this.killEngine();
					resolve(err(new EngineTimeoutError("Engine timed out during startup (model load)")));
				}
			}, this.startupTimeoutMs);

			proc.on("error", (e) => {
				clearTimeout(startupTimer);
				if (engine.state.phase === "starting") {
					this.engine = null;
					resolve(err(new EngineExecutionError(e.message)));
				} else if (engine.state.phase === "busy") {
					const { resolve: req } = engine.state;
					this.engine = null;
					req(err(new EngineExecutionError(e.message)));
				}
			});

			proc.on("exit", () => {
				clearTimeout(startupTimer);
				if (this.engine === engine) this.engine = null;
				if (engine.state.phase === "starting") {
					resolve(err(new EngineExecutionError("Engine process exited during startup")));
				} else if (engine.state.phase === "busy") {
					engine.state.resolve(err(new EngineExecutionError("Engine process exited unexpectedly")));
				}
			});

			const rl = createInterface({ input: proc.stdout as NodeJS.ReadableStream });

			rl.on("line", (line) => {
				const trimmed = line.trim();

				if (engine.state.phase === "starting") {
					if (trimmed === "uciok") {
						send("isready");
					} else if (trimmed === "readyok") {
						clearTimeout(startupTimer);
						engine.state.resolve(ok(undefined));
						engine.state = { phase: "idle" };
					}
					return;
				}

				if (engine.state.phase !== "busy") return;

				// Accumulate info lines during a request.
				if (trimmed.startsWith("info string ")) {
					applyInfoString(trimmed, engine);
				} else if (trimmed.startsWith("info ")) {
					engine.lastInfoLine = trimmed;
				} else if (trimmed.startsWith("bestmove ")) {
					const { resolve: req } = engine.state;
					engine.state = { phase: "idle" };
					req(parseBestMoveResult(trimmed, engine));
				}
			});

			send("uci");
		});
	}

	private async ensureEngine(modelPath: string, bookPath: string | undefined): Promise<Result<void, Error>> {
		if (this.engine?.state.phase !== "starting" && this.engine?.modelPath === modelPath && this.engine?.bookPath === bookPath) {
			return ok(undefined);
		}
		return this.spawnEngine(modelPath, bookPath);
	}

	async listFiles(): Promise<Result<{ models: string[]; books: string[] }, Error>> {
		try {
			const [modelFiles, bookFiles] = await Promise.all([
				readdir(this.modelsDir).catch(() => [] as string[]),
				readdir(this.booksDir).catch(() => [] as string[]),
			]);
			return ok({
				models: modelFiles.filter((f) => f.endsWith(".pt")),
				books: bookFiles.filter((f) => f.endsWith(".bin")),
			});
		} catch (e) {
			return err(new EngineExecutionError(`Failed to list engine files: ${(e as Error).message}`));
		}
	}

	async analyzePosition(input: AnalyzePositionInput): Promise<Result<EngineBestMoveResult, Error>> {
		return this.getBestMove({
			fen: input.fen,
			modelPath: input.modelPath,
			bookPath: input.bookPath,
			options: { depth: input.depth },
		});
	}

	async getBestMove(input: GetBestMoveInput): Promise<Result<EngineBestMoveResult, Error>> {
		const modelResult = this.resolveSecurePath(input.modelPath, this.modelsDir);
		if (modelResult.isErr()) return err(modelResult.error);

		let resolvedBookPath: string | undefined;
		if (input.bookPath) {
			const bookResult = this.resolveSecurePath(input.bookPath, this.booksDir);
			if (bookResult.isErr()) return err(bookResult.error);
			resolvedBookPath = bookResult.value;
		}

		// Serialise through the queue so only one UCI exchange is in-flight.
		this.queue = this.queue.then(() =>
			this.runRequest(input.fen, modelResult.value, resolvedBookPath, input.options),
		);
		return this.queue;
	}

	private async runRequest(
		fen: string,
		modelPath: string,
		bookPath: string | undefined,
		options: GetBestMoveInput["options"],
	): Promise<Result<EngineBestMoveResult, Error>> {
		const ensureResult = await this.ensureEngine(modelPath, bookPath);
		if (ensureResult.isErr()) return err(ensureResult.error);

		const engine = this.engine;
		if (engine?.state.phase !== "idle") {
			return err(new EngineExecutionError("Engine in unexpected state"));
		}

		// Reset per-request state.
		engine.lastInfoLine = "";
		engine.winProb = undefined;
		engine.uncertainty = undefined;
		engine.ranking = undefined;
		engine.source = undefined;

		return new Promise<Result<EngineBestMoveResult, Error>>((resolve) => {
			engine.state = { phase: "busy", resolve };

			const timer = setTimeout(() => {
				if (engine.state.phase === "busy") {
					engine.state = { phase: "idle" };
					// Kill so we don't get stale output on the next request.
					this.killEngine();
					resolve(err(new EngineTimeoutError()));
				}
			}, this.requestTimeoutMs);

			// Wrap resolve to always clear the timer.
			const origResolve = engine.state.resolve;
			engine.state.resolve = (v) => {
				clearTimeout(timer);
				origResolve(v);
			};

			engine.send(`position fen ${fen}`);
			engine.send(buildGoCommand(options));
		});
	}
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function applyInfoString(trimmed: string, engine: PersistentProc): void {
	if (trimmed.startsWith("info string winprob ")) {
		const val = Number(trimmed.slice("info string winprob ".length));
		if (!Number.isNaN(val)) engine.winProb = val;
	} else if (trimmed.startsWith("info string uncertainty ")) {
		const val = Number(trimmed.slice("info string uncertainty ".length));
		if (!Number.isNaN(val)) engine.uncertainty = val;
	} else if (trimmed.startsWith("info string ranking ")) {
		engine.ranking = trimmed
			.slice("info string ranking ".length)
			.split(",")
			.flatMap((part) => {
				const colonIdx = part.lastIndexOf(":");
				if (colonIdx === -1) return [];
				const move = part.slice(0, colonIdx);
				const score = Number(part.slice(colonIdx + 1));
				return Number.isNaN(score) || !move ? [] : [{ move, score }];
			});
	} else if (trimmed.startsWith("info string source ")) {
		const val = trimmed.slice("info string source ".length).trim();
		if (val === "gnn" || val === "book") engine.source = val;
	}
}

function parseBestMoveResult(line: string, engine: PersistentProc): Result<EngineBestMoveResult, Error> {
	let parsed: { bestMove: string };
	try {
		parsed = parseBestMove(line);
	} catch (e) {
		return err(new EngineExecutionError(`Failed to parse bestmove: ${(e as Error).message}`));
	}

	let evalResult: EvaluationResult;
	try {
		evalResult = engine.lastInfoLine
			? parseEvaluation(engine.lastInfoLine)
			: { score: 0, depth: 0, pv: [parsed.bestMove], nodes: 0 };
	} catch {
		evalResult = { score: 0, depth: 0, pv: [parsed.bestMove], nodes: 0 };
	}

	const pv = evalResult.pv.length > 0 ? evalResult.pv : [parsed.bestMove];
	return ok({
		bestMove: parsed.bestMove,
		score: evalResult.score,
		mate: evalResult.mate,
		depth: evalResult.depth,
		pv,
		nodes: evalResult.nodes,
		winProb: engine.winProb,
		uncertainty: engine.uncertainty,
		ranking: engine.ranking,
		source: engine.source,
	});
}
