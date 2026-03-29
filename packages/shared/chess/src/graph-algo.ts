/**
 * Main graph analysis pipeline.
 *
 * Converts a chess position (FEN string) into a weighted directed graph
 * with community detection and centrality metrics attached to each node.
 *
 * Pipeline: parsePieces -> computeAttackMap -> buildEdges (SEE) ->
 *           detectCommunities -> computeCentrality -> GraphSnapshot
 *
 * @module
 */
import { Chess } from "chess.js";
import { fromThrowable, ok, err, type Result } from "neverthrow";

import type {
  PieceInfo,
  GraphNode,
  GraphEdge,
  GraphSnapshot,
  AttackMap,
  DefenseMap,
} from "#types";
import { PIECE_VALUES, PIECE_DIRECTIONS, SQUARES } from "#constants";
import { buildEdges } from "#edge-weights";
import { detectCommunities } from "#community";
import {
  computeBetweennessCentrality,
  computeDegreeCentrality,
  computeWeightedDegreeCentrality,
  computeClosenessCentrality,
  computePageRankCentrality,
} from "#centrality";
import {
  computePositionFragility,
  computeStrategicTension,
} from "#position-metrics";

// ---------------------------------------------------------------------------
// Step 1: Parse pieces from FEN
// ---------------------------------------------------------------------------

/**
 * Extract all pieces and their positions from a FEN string.
 *
 * Uses chess.js to parse the FEN and iterate over all 64 squares,
 * collecting pieces with their type, color, and material value.
 */
export function parsePieces(fen: string): PieceInfo[] {
  const game = new Chess(fen);
  const pieces: PieceInfo[] = [];

  for (const square of SQUARES) {
    const piece = game.get(square as "a1");
    if (piece) {
      const value = PIECE_VALUES[piece.type];
      if (value !== undefined) {
        pieces.push({
          square,
          type: piece.type,
          color: piece.color,
          value,
        });
      }
    }
  }

  return pieces;
}

// ---------------------------------------------------------------------------
// Step 2: Compute attack map (pseudo-legal ray-casting)
// ---------------------------------------------------------------------------

/**
 * Parse a square string into file (0-7) and rank (0-7) indices.
 */
function squareToCoords(square: string): [number, number] {
  const file = square.charCodeAt(0) - 97;
  const rank = Number.parseInt(square[1]!, 10) - 1;
  return [file, rank];
}

/**
 * Convert file and rank indices back to a square string.
 */
function coordsToSquare(file: number, rank: number): string {
  return String.fromCharCode(97 + file) + (rank + 1);
}

/**
 * Get all squares a piece attacks from a given position.
 *
 * This uses custom ray-casting per piece type rather than chess.js `moves()`
 * because we need PSEUDO-LEGAL attacks -- including squares behind pinned
 * pieces and x-ray attacks. chess.js filters for legality which would miss
 * critical graph edges.
 *
 * The implementation matches the MVP's `getAttacks()` (lines 679-710) but
 * refactored into pure functions.
 *
 * @param square - The square the piece is on
 * @param fen - The full FEN string for board state
 * @returns Array of squares this piece attacks
 */
export function getAttackedSquares(square: string, fen: string): string[] {
  const game = new Chess(fen);
  const piece = game.get(square as "a1");
  if (!piece) return [];

  const [file, rank] = squareToCoords(square);
  const attacks: string[] = [];

  /**
   * Check a single square. Returns true if the ray should stop
   * (i.e., we hit any piece -- rays are blocked after the first piece).
   */
  const checkSquare = (f: number, r: number): boolean => {
    if (f < 0 || f > 7 || r < 0 || r > 7) return true;
    const target = coordsToSquare(f, r);
    attacks.push(target);
    return game.get(target as "a1") != null;
  };

  if (piece.type === "p") {
    // Pawns attack diagonally forward only
    const dir = piece.color === "w" ? 1 : -1;
    if (file - 1 >= 0) checkSquare(file - 1, rank + dir);
    if (file + 1 <= 7) checkSquare(file + 1, rank + dir);
  } else if (piece.type === "n" || piece.type === "k") {
    // Knights and kings are steppers -- check each direction once
    const directions = PIECE_DIRECTIONS[piece.type];
    if (directions) {
      for (const dir of directions) {
        checkSquare(file + dir[0], rank + dir[1]);
      }
    }
  } else {
    // Sliding pieces (rook, bishop, queen) -- cast rays until blocked
    const directions = PIECE_DIRECTIONS[piece.type];
    if (directions) {
      for (const dir of directions) {
        for (let i = 1; i < 8; i++) {
          if (checkSquare(file + dir[0] * i, rank + dir[1] * i)) break;
        }
      }
    }
  }

  return attacks;
}

/**
 * Compute the attack map for the entire board.
 *
 * For each piece, determines all squares it can attack (pseudo-legal).
 * Returns a Map from each piece's square to its list of attacked squares.
 */
export function computeAttackMap(fen: string, pieces: PieceInfo[]): AttackMap {
  const attackMap: AttackMap = new Map();

  for (const piece of pieces) {
    const attacked = getAttackedSquares(piece.square, fen);
    attackMap.set(piece.square, attacked);
  }

  return attackMap;
}

// ---------------------------------------------------------------------------
// Step 3: Compute defense map
// ---------------------------------------------------------------------------

/**
 * Compute the defense map for the entire board.
 *
 * For each piece on the board, finds all same-color pieces that can attack
 * its square (i.e., pieces that defend it). Returns a Map from each
 * defended square to its list of defender squares.
 *
 * A piece "defends" another if:
 * 1. They are the same color
 * 2. The defender's attack rays reach the defended piece's square
 */
export function computeDefenseMap(
  fen: string,
  pieces: PieceInfo[],
  attackMap: AttackMap,
): DefenseMap {
  const defenseMap: DefenseMap = new Map();
  const pieceBySquare = new Map<string, PieceInfo>();
  for (const p of pieces) {
    pieceBySquare.set(p.square, p);
  }

  for (const piece of pieces) {
    const defenders: string[] = [];

    for (const candidate of pieces) {
      if (candidate.square === piece.square) continue;
      if (candidate.color !== piece.color) continue;

      // Check if the candidate's attack map includes this piece's square
      const candidateAttacks = attackMap.get(candidate.square) ?? [];
      if (candidateAttacks.includes(piece.square)) {
        defenders.push(candidate.square);
      }
    }

    if (defenders.length > 0) {
      defenseMap.set(piece.square, defenders);
    }
  }

  return defenseMap;
}

// ---------------------------------------------------------------------------
// Step 4: Build graph nodes with community and centrality data
// ---------------------------------------------------------------------------

/**
 * Convert PieceInfo array into GraphNode array with placeholder community
 * and centrality values (to be filled in by subsequent pipeline stages).
 */
function buildNodes(pieces: PieceInfo[]): GraphNode[] {
  return pieces.map((p) => ({
    square: p.square,
    type: p.type,
    color: p.color,
    value: p.value,
    communityId: 0,
    centralityBetweenness: 0,
    centralityDegree: 0,
    centralityWeighted: 0,
    centralityCloseness: 0,
    centralityPageRank: 0,
  }));
}

/**
 * Extract the half-move (ply) count from a FEN string.
 * The ply count is computed from the fullmove number and active color.
 */
function fenToPly(fen: string): number {
  const parts = fen.split(" ");
  const fullmove = Number.parseInt(parts[5] ?? "1", 10);
  const activeColor = parts[1] ?? "w";
  return (fullmove - 1) * 2 + (activeColor === "b" ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Build a complete graph snapshot from a FEN position.
 *
 * This is the main entry point for the graph analysis pipeline. It:
 * 1. Parses pieces from the FEN
 * 2. Computes pseudo-legal attack maps
 * 3. Builds weighted directed edges using SEE (defenses derived from attack map)
 * 4. Detects communities via Leiden algorithm
 * 5. Computes centrality metrics (betweenness, degree, weighted, closeness)
 * 6. Returns a complete GraphSnapshot
 *
 * @param fen - A valid FEN string
 * @returns Result containing the GraphSnapshot or an error
 */
export function buildGraph(fen: string): Result<GraphSnapshot, Error> {
  try {
    // Step 1: Parse pieces
    const pieces = parsePieces(fen);

    // Step 2: Compute attack map
    const attackMap = computeAttackMap(fen, pieces);

    // Step 3: Build edges (SEE derives defender pools from the attack map)
    const edges = buildEdges(pieces, attackMap);

    // Step 4: Build nodes
    const nodes = buildNodes(pieces);

    // Step 5: Community detection (Leiden)
    const communities = detectCommunities(nodes, edges);
    for (const node of nodes) {
      node.communityId = communities.get(node.square) ?? 0;
    }

    // Step 6: Centrality metrics
    const betweenness = computeBetweennessCentrality(nodes, edges);
    const degree = computeDegreeCentrality(nodes, edges);
    const weighted = computeWeightedDegreeCentrality(nodes, edges);
    const closeness = computeClosenessCentrality(nodes, edges);
    const pageRank = computePageRankCentrality(nodes, edges);

    for (const node of nodes) {
      node.centralityBetweenness = betweenness.get(node.square) ?? 0;
      node.centralityDegree = degree.get(node.square) ?? 0;
      node.centralityWeighted = weighted.get(node.square) ?? 0;
      node.centralityCloseness = closeness.get(node.square) ?? 0;
      node.centralityPageRank = pageRank.get(node.square) ?? 0;
    }

    // Step 7: Apply piece-value weighting.
    // Scale each centrality score by (pieceValue / maxPieceValue) so that
    // high-value pieces (queens, rooks) contribute proportionally more than
    // pawns. The king is capped at the queen's value to avoid distorting the
    // scale — a king's "value" is a sentinel (1000) not a material signal.
    const MAX_PIECE_WEIGHT = 9; // queen value — reference ceiling
    for (const node of nodes) {
      const weight = Math.min(node.value, MAX_PIECE_WEIGHT) / MAX_PIECE_WEIGHT;
      node.centralityBetweenness *= weight;
      node.centralityDegree      *= weight;
      node.centralityWeighted    *= weight;
      node.centralityCloseness   *= weight;
      node.centralityPageRank    *= weight;
    }

    // Step 8: Position-level metrics
    const positionFragility = computePositionFragility(nodes, edges);
    const strategicTension = computeStrategicTension(nodes, edges);

    return ok({
      nodes,
      edges,
      metadata: {
        fen,
        ply: fenToPly(fen),
        positionFragility,
        strategicTension,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(`Failed to build graph: ${message}`));
  }
}
