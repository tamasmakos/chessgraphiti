/**
 * Stockfish WASM Web Worker implementation of the ChessEngine interface.
 *
 * Uses the `stockfish` npm package which bundles Stockfish 16+ with NNUE
 * evaluation as a Web Worker-compatible WASM build.
 */

import { buildGoCommand, parseBestMove, parseEvaluation } from "@yourcompany/chess/engine";
import type {
  BestMoveResult,
  ChessEngine,
  EvaluationResult,
  SearchOptions,
} from "@yourcompany/chess/types";

/**
 * Web-based Stockfish implementation using a Web Worker.
 *
 * Communicates with the Stockfish WASM binary via UCI (Universal Chess Interface)
 * commands sent as messages to a dedicated Worker thread.
 */
export class StockfishWeb implements ChessEngine {
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private pendingRejectors = new Set<(error: Error) => void>();

  async init(): Promise<void> {
    const sources = [
      {
        name: "jsdelivr",
        script: "https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish-nnue-16-single.js",
        wasm: "https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish-nnue-16-single.wasm",
      },
      {
        name: "unpkg",
        script: "https://unpkg.com/stockfish@16.0.0/src/stockfish-nnue-16-single.js",
        wasm: "https://unpkg.com/stockfish@16.0.0/src/stockfish-nnue-16-single.wasm",
      },
    ] as const;

    const errors: string[] = [];

    for (const source of sources) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await this.createWorkerFromSource(source.script, source.wasm);
          await this.sendAndWait("uci", "uciok");
          await this.sendAndWait("isready", "readyok");
          return;
        } catch (error) {
          errors.push(`${source.name} attempt ${attempt}: ${(error as Error).message}`);
          this.cleanupWorker();
        }
      }
    }

    throw new Error(`Stockfish initialization failed after retries. ${errors.join(" | ")}`);
  }

  async isReady(): Promise<boolean> {
    if (!this.worker) return false;
    try {
      await this.sendAndWait("isready", "readyok");
      return true;
    } catch {
      return false;
    }
  }

  async setPosition(fen: string, moves?: string[]): Promise<void> {
    let cmd = `position fen ${fen}`;
    if (moves && moves.length > 0) {
      cmd += ` moves ${moves.join(" ")}`;
    }
    this.send(cmd);
  }

  async getBestMove(options: SearchOptions): Promise<BestMoveResult> {
    if (options.skillLevel !== undefined) {
      // Strength control (UCI): apply before `go`.
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name Skill Level value ${options.skillLevel}`);
    }

    const goCmd = buildGoCommand(options);
    const response = await this.sendAndWait(goCmd, "bestmove");
    return parseBestMove(response);
  }

  async getEvaluation(options: SearchOptions): Promise<EvaluationResult> {
    if (options.skillLevel !== undefined) {
      // Strength control (UCI): apply before `go`.
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name Skill Level value ${options.skillLevel}`);
    }

    const goCmd = buildGoCommand(options);
    const response = await this.sendAndWait(goCmd, "bestmove");
    return parseEvaluation(response);
  }

  async stop(): Promise<void> {
    this.send("stop");
  }

  async quit(): Promise<void> {
    const terminationError = new Error("Stockfish worker terminated");
    for (const reject of this.pendingRejectors) {
      reject(terminationError);
    }
    this.pendingRejectors.clear();
    this.send("quit");
    this.cleanupWorker();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  private async createWorkerFromSource(
    stockfishScriptUrl: string,
    stockfishWasmUrl: string,
  ): Promise<void> {
    // Build the worker script dynamically so the bundled Stockfish JS always
    // uses an absolute WASM URL (required in blob workers).
    const scriptText = await fetch(stockfishScriptUrl).then((r) => {
      if (!r.ok) {
        throw new Error(`Failed to fetch Stockfish worker script: ${r.status} ${r.statusText}`);
      }
      return r.text();
    });

    const patchedScript = scriptText.replaceAll("stockfish-nnue-16-single.wasm", stockfishWasmUrl);
    const blob = new Blob([patchedScript], { type: "text/javascript" });
    this.workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerUrl);
  }

  private cleanupWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
  }

  private sendAndWait(command: string, expectedResponse: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const worker = this.worker;
      if (!worker) {
        reject(new Error("Worker not initialized"));
        return;
      }

      const lines: string[] = [];
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      this.pendingRejectors.add(reject);
      const cleanup = () => {
        worker.removeEventListener("message", handler);
        worker.removeEventListener("error", errorHandler);
        worker.removeEventListener("messageerror", messageErrorHandler);
        this.pendingRejectors.delete(reject);
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };
      const handler = (e: MessageEvent) => {
        const data = String(e.data);
        lines.push(data);
        const parsedLines = data.split(/\r?\n/).map((line) => line.trim());
        const hasExpected = parsedLines.some(
          (line) => line === expectedResponse || line.startsWith(expectedResponse),
        );
        if (hasExpected) {
          cleanup();
          resolve(lines.join("\n"));
        }
      };
      const errorHandler = (e: ErrorEvent) => {
        cleanup();
        reject(
          new Error(
            `Stockfish worker error while waiting for "${expectedResponse}" after "${command}": ${e.message || "unknown worker error"}`,
          ),
        );
      };
      const messageErrorHandler = () => {
        cleanup();
        reject(new Error(`Stockfish worker message deserialization failed after "${command}"`));
      };

      worker.addEventListener("message", handler);
      worker.addEventListener("error", errorHandler);
      worker.addEventListener("messageerror", messageErrorHandler);
      this.send(command);

      // Timeout after 30 seconds to prevent hanging
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for "${expectedResponse}" after "${command}"`));
      }, 30_000);
    });
  }
}
