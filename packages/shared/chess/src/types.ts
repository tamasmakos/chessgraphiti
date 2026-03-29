/**
 * Core type definitions for the chess graph analysis pipeline.
 * All types are defined as Zod schemas with inferred TypeScript types
 * to enable runtime validation at API boundaries.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Chess primitives
// ---------------------------------------------------------------------------

export const PieceTypeSchema = z.enum(["p", "n", "b", "r", "q", "k"]);
export type PieceType = z.infer<typeof PieceTypeSchema>;

export const ColorSchema = z.enum(["w", "b"]);
export type Color = z.infer<typeof ColorSchema>;

export const SquareSchema = z.string().regex(/^[a-h][1-8]$/);
export type Square = z.infer<typeof SquareSchema>;

// ---------------------------------------------------------------------------
// Piece information extracted from a FEN position
// ---------------------------------------------------------------------------

export const PieceInfoSchema = z.object({
  square: SquareSchema,
  type: PieceTypeSchema,
  color: ColorSchema,
  value: z.number(),
});
export type PieceInfo = z.infer<typeof PieceInfoSchema>;

// ---------------------------------------------------------------------------
// Graph structures
// ---------------------------------------------------------------------------

export const EdgeTypeSchema = z.enum(["attack", "defense"]);
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

export const GraphEdgeSchema = z.object({
  from: SquareSchema,
  to: SquareSchema,
  weight: z.number(),
  type: EdgeTypeSchema,
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const GraphNodeSchema = z.object({
  square: SquareSchema,
  type: PieceTypeSchema,
  color: ColorSchema,
  value: z.number(),
  communityId: z.number(),
  centralityBetweenness: z.number(),
  centralityDegree: z.number(),
  centralityWeighted: z.number(),
  centralityCloseness: z.number(),
  centralityPageRank: z.number(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

const PositionScoreSchema = z.object({
  white: z.number(),
  black: z.number(),
});

export const GraphMetadataSchema = z.object({
  fen: z.string(),
  ply: z.number(),
  positionFragility: PositionScoreSchema.optional(),
  strategicTension: PositionScoreSchema.optional(),
});
export type GraphMetadata = z.infer<typeof GraphMetadataSchema>;

export const GraphSnapshotSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  metadata: GraphMetadataSchema,
});
export type GraphSnapshot = z.infer<typeof GraphSnapshotSchema>;

// ---------------------------------------------------------------------------
// Attack and defense map types (internal pipeline)
// ---------------------------------------------------------------------------

export interface AttackInfo {
  from: string;
  to: string;
}

/** Map from attacker square to list of squares it attacks. */
export type AttackMap = Map<string, string[]>;

/** Map from defended square to list of defender squares (same color). */
export type DefenseMap = Map<string, string[]>;

// ---------------------------------------------------------------------------
// Engine types (platform-agnostic interface)
// ---------------------------------------------------------------------------

export const SearchOptionsSchema = z.object({
  depth: z.number().optional(),
  moveTime: z.number().optional(),
  nodes: z.number().optional(),
  /**
   * Stockfish strength control via UCI:
   * - We set `Skill Level` and enable `UCI_LimitStrength`.
   */
  skillLevel: z.number().int().min(0).max(20).optional(),
});
export type SearchOptions = z.infer<typeof SearchOptionsSchema>;

export const BestMoveResultSchema = z.object({
  bestMove: z.string(),
  ponder: z.string().optional(),
});
export type BestMoveResult = z.infer<typeof BestMoveResultSchema>;

export const EvaluationResultSchema = z.object({
  score: z.number(),
  mate: z.number().optional(),
  depth: z.number(),
  pv: z.array(z.string()),
  nodes: z.number(),
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

/**
 * Platform-agnostic chess engine interface.
 * Implemented by StockfishWeb (Web Worker WASM) and StockfishNative (React Native).
 */
export interface ChessEngine {
  init(): Promise<void>;
  isReady(): Promise<boolean>;
  setPosition(fen: string, moves?: string[]): Promise<void>;
  getBestMove(options: SearchOptions): Promise<BestMoveResult>;
  getEvaluation(options: SearchOptions): Promise<EvaluationResult>;
  stop(): Promise<void>;
  quit(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Opening trainer types
// ---------------------------------------------------------------------------

export interface OpeningNode {
  san: string;
  name?: string;
  eco?: string;
  children: Map<string, OpeningNode>;
}

export const MoveValidationSchema = z.object({
  valid: z.boolean(),
  hint: z.string().optional(),
  isOpeningMove: z.boolean(),
  openingComplete: z.boolean(),
});
export type MoveValidation = z.infer<typeof MoveValidationSchema>;

export interface OpeningInfo {
  name: string;
  eco?: string;
  moves: string[];
}
