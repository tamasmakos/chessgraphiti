import type { Square } from "chess.js";
import { Chess } from "chess.js";
import type { MoveRecord } from "../stores/game-store";

/**
 * Maps a board square string to a stable piece identifier.
 */
export type SquareToPieceIdMap = Map<string, string>;

/**
 * Given a starting FEN and a history of subsequent moves, this utility tracks the location
 * of each piece throughout the timeline. This assigns a stable string identity (e.g. "w_P_a2" or "b_N_g8")
 * to pieces so analytical components can group them across time rather than simply by static square.
 *
 * Returns an array of Maps, one for each "snapshot" step (including the initial state).
 * The array's length will be `history.length + 1`.
 */
export function computePieceIdentities(
  startFen: string,
  history: MoveRecord[],
): SquareToPieceIdMap[] {
  const SQUARES: Square[] = [
    "a8",
    "b8",
    "c8",
    "d8",
    "e8",
    "f8",
    "g8",
    "h8",
    "a7",
    "b7",
    "c7",
    "d7",
    "e7",
    "f7",
    "g7",
    "h7",
    "a6",
    "b6",
    "c6",
    "d6",
    "e6",
    "f6",
    "g6",
    "h6",
    "a5",
    "b5",
    "c5",
    "d5",
    "e5",
    "f5",
    "g5",
    "h5",
    "a4",
    "b4",
    "c4",
    "d4",
    "e4",
    "f4",
    "g4",
    "h4",
    "a3",
    "b3",
    "c3",
    "d3",
    "e3",
    "f3",
    "g3",
    "h3",
    "a2",
    "b2",
    "c2",
    "d2",
    "e2",
    "f2",
    "g2",
    "h2",
    "a1",
    "b1",
    "c1",
    "d1",
    "e1",
    "f1",
    "g1",
    "h1",
  ];

  const game = new Chess(startFen);

  // 1. Initial Identity Map
  const mapList: SquareToPieceIdMap[] = [];
  let currentMap = new Map<string, string>();

  for (const sq of SQUARES) {
    const p = game.get(sq);
    if (p) {
      // Create a stable ID: {color}_{type}_{originalSquare}
      // e.g. "w_p_e2" or "b_k_e8"
      const id = `${p.color}_${p.type}_${sq}`;
      currentMap.set(sq, id);
    }
  }

  mapList.push(new Map(currentMap));

  // 2. Step through moves and track identity transplants
  for (const record of history) {
    let moveDetail: ReturnType<typeof game.move>;

    // We use San to do the move purely since we need the exact castling/en-passant consequences
    try {
      moveDetail = game.move(record.san);
    } catch {
      // If history goes out of sync with startFen, we gracefully stop or just copy map forward
      console.warn("Piece tracker encountered invalid run sequence.");
      mapList.push(new Map(currentMap));
      continue;
    }

    if (!moveDetail) {
      mapList.push(new Map(currentMap));
      continue;
    }

    const nextMap = new Map(currentMap);

    // Basic move implementation (transfer piece ID to new square)
    const movingPieceId = nextMap.get(moveDetail.from);
    if (movingPieceId) {
      nextMap.delete(moveDetail.from);

      // If promotion, we maintain piece ID? Or change its symbol?
      // The prompt asks for tracking *the piece*. It's conceptually the same unit.
      // So we keep the same identity even if it promotes.
      nextMap.set(moveDetail.to, movingPieceId);
    }

    // Special moves
    if (moveDetail.flags.includes("e")) {
      // En Passant capture: remove the captured pawn's ID
      // The captured pawn is on the same rank as the 'from' square and the same file as 'to'
      const capturedSq = (moveDetail.to[0] || "") + (moveDetail.from[1] || "");
      nextMap.delete(capturedSq);
    } else if (moveDetail.flags.includes("k") || moveDetail.flags.includes("q")) {
      // Castling: A rook also moved. We need to manually identify it and update its position.
      let rookFrom = "";
      let rookTo = "";
      const rank = moveDetail.color === "w" ? "1" : "8";
      if (moveDetail.flags.includes("k")) {
        rookFrom = "h" + rank;
        rookTo = "f" + rank;
      } else if (moveDetail.flags.includes("q")) {
        rookFrom = "a" + rank;
        rookTo = "d" + rank;
      }

      if (rookFrom && rookTo) {
        const rookId = nextMap.get(rookFrom);
        if (rookId) {
          nextMap.delete(rookFrom);
          nextMap.set(rookTo, rookId);
        }
      }
    }

    currentMap = nextMap;
    mapList.push(new Map(currentMap));
  }

  return mapList;
}

/**
 * Normalizes an array of numbers so its values map from 0 to 1, or returns proportional mapping for non-zero minimums.
 */
export function normalizeSeries(series: number[]): number[] {
  const max = Math.max(...series, 0.0001);
  const min = Math.min(...series);
  const range = max - min;

  if (range === 0) {
    return series.map(() => 0.5); // Flat line in the middle if no variation
  }

  return series.map((val) => (val - min) / range);
}
