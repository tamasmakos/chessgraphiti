import { ok, type Result } from "neverthrow";
import type { GraphSnapshot } from "#types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SquareInfluence {
  whiteWeight: number;
  blackWeight: number;
  whiteCommId: number;
  blackCommId: number;
  hasKnightInfluence: boolean;
}

export type InfluenceMap = Map<string, SquareInfluence>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KNIGHT_MOVES: ReadonlyArray<readonly [number, number]> = [
  [1, 2], [1, -2], [-1, 2], [-1, -2],
  [2, 1], [2, -1], [-2, 1], [-2, -1],
];

const ROOK_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
];

const BISHOP_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const QUEEN_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const KING_MOVES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const BLEED_FACTOR = 0.28;

const BASE_WEIGHT: Record<string, number> = {
  r: 1,
  b: 0.9,
  q: 1,
  k: 0.65,
  p: 0.45,
  n: 0.7,
};

interface PieceCtx {
  color: "w" | "b";
  commId: number;
  centralityScalar: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function squareToCoords(sq: string): [number, number] {
  return [(sq.codePointAt(0) ?? 97) - 97, Number.parseInt(sq[1] ?? "1", 10) - 1];
}

function coordsToSquare(file: number, rank: number): string {
  return String.fromCodePoint(97 + file) + (rank + 1);
}

function getOrCreate(map: InfluenceMap, sq: string): SquareInfluence {
  let entry = map.get(sq);
  if (!entry) {
    entry = { whiteWeight: 0, blackWeight: 0, whiteCommId: -1, blackCommId: -1, hasKnightInfluence: false };
    map.set(sq, entry);
  }
  return entry;
}

function addInfluence(
  map: InfluenceMap,
  sq: string,
  weight: number,
  isKnight: boolean,
  ctx: PieceCtx,
): void {
  const entry = getOrCreate(map, sq);
  if (ctx.color === "w") {
    if (weight > entry.whiteWeight) entry.whiteCommId = ctx.commId;
    entry.whiteWeight += weight;
  } else {
    if (weight > entry.blackWeight) entry.blackCommId = ctx.commId;
    entry.blackWeight += weight;
  }
  if (isKnight) entry.hasKnightInfluence = true;
}

function applyRayInfluence(
  map: InfluenceMap,
  file: number,
  rank: number,
  dirs: ReadonlyArray<readonly [number, number]>,
  baseWeight: number,
  ctx: PieceCtx,
  occupied: Set<string>,
): void {
  for (const [df, dr] of dirs) {
    let f = file + df;
    let r = rank + dr;
    let step = 1;
    let bleedFactor = 1;
    while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
      const target = coordsToSquare(f, r);
      const linearFalloff = 1 - step / 9;
      const weight = baseWeight * ctx.centralityScalar * linearFalloff * bleedFactor;
      if (weight > 0.001) {
        addInfluence(map, target, weight, false, ctx);
      }
      if (occupied.has(target)) {
        bleedFactor *= BLEED_FACTOR;
        if (bleedFactor < 0.02) break;
      }
      f += df;
      r += dr;
      step++;
    }
  }
}

function applyStepInfluence(
  map: InfluenceMap,
  file: number,
  rank: number,
  moves: ReadonlyArray<readonly [number, number]>,
  baseWeight: number,
  ctx: PieceCtx,
  isKnight: boolean,
): void {
  for (const [df, dr] of moves) {
    const f = file + df;
    const r = rank + dr;
    if (f < 0 || f > 7 || r < 0 || r > 7) continue;
    addInfluence(map, coordsToSquare(f, r), baseWeight * ctx.centralityScalar, isKnight, ctx);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function computeInfluenceField(snapshot: GraphSnapshot): Result<InfluenceMap, Error> {
  const map: InfluenceMap = new Map();
  const occupied = new Set(snapshot.nodes.map((n) => n.square));

  const maxBetweenness = snapshot.nodes.reduce(
    (max, n) => Math.max(max, n.centralityBetweenness),
    0.0001,
  );

  for (const node of snapshot.nodes) {
    const [file, rank] = squareToCoords(node.square);
    const baseW = BASE_WEIGHT[node.type] ?? 0.5;
    const ctx: PieceCtx = {
      color: node.color,
      commId: node.communityId,
      centralityScalar: 1 + (node.centralityBetweenness / maxBetweenness) * 0.4,
    };

    switch (node.type) {
      case "r":
        applyRayInfluence(map, file, rank, ROOK_DIRS, baseW, ctx, occupied);
        break;
      case "b":
        applyRayInfluence(map, file, rank, BISHOP_DIRS, baseW, ctx, occupied);
        break;
      case "q":
        applyRayInfluence(map, file, rank, QUEEN_DIRS, baseW, ctx, occupied);
        break;
      case "k":
        applyStepInfluence(map, file, rank, KING_MOVES, baseW, ctx, false);
        break;
      case "n":
        applyStepInfluence(map, file, rank, KNIGHT_MOVES, baseW, ctx, true);
        break;
      case "p": {
        const dr = ctx.color === "w" ? 1 : -1;
        const pawnMoves: ReadonlyArray<readonly [number, number]> = [[-1, dr], [1, dr]];
        applyStepInfluence(map, file, rank, pawnMoves, baseW, ctx, false);
        break;
      }
      default:
        break;
    }
  }

  for (const entry of map.values()) {
    entry.whiteWeight = Math.min(entry.whiteWeight, 1.4);
    entry.blackWeight = Math.min(entry.blackWeight, 1.4);
  }

  return ok(map);
}
