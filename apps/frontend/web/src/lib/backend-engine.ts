import type {
  BestMoveResult,
  ChessEngine,
  EvaluationResult,
  SearchOptions,
} from "@yourcompany/chess/types";

export type RichEvaluationResult = EvaluationResult & {
  winProb?: number;
  uncertainty?: number;
  ranking?: Array<{ move: string; score: number }>;
  source?: "gnn" | "book";
};

export type BackendBestMoveFn = (input: {
  fen: string;
  options: SearchOptions;
  modelPath: string;
  bookPath?: string;
}) => Promise<RichEvaluationResult & { bestMove: string }>;

export class BackendEngineClient implements ChessEngine {
  private currentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  constructor(
    private readonly callBestMove: BackendBestMoveFn,
    private readonly modelPath: string,
    private readonly bookPath: string | undefined,
  ) {}

  init(): Promise<void> {
    return Promise.resolve();
  }

  isReady(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async setPosition(fen: string): Promise<void> {
    this.currentFen = fen;
  }

  async getEvaluation(options: SearchOptions): Promise<RichEvaluationResult> {
    return await this.callBestMove({
      fen: this.currentFen,
      options,
      modelPath: this.modelPath,
      bookPath: this.bookPath,
    });
  }

  async getBestMove(options: SearchOptions): Promise<BestMoveResult> {
    const result = await this.callBestMove({
      fen: this.currentFen,
      options,
      modelPath: this.modelPath,
      bookPath: this.bookPath,
    });
    return { bestMove: result.bestMove, ponder: result.pv[1] };
  }

  stop(): Promise<void> {
    return Promise.resolve();
  }

  quit(): Promise<void> {
    return Promise.resolve();
  }
}
