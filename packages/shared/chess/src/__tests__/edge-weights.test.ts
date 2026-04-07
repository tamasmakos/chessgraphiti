import { describe, expect, it } from "vitest";
import { buildEdges, computeDefenseWeight, computeSEE } from "../edge-weights.ts";
import type { AttackMap, PieceInfo } from "../types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePiece(square: string, type: string, color: string, value: number): PieceInfo {
  return {
    square,
    type: type as PieceInfo["type"],
    color: color as PieceInfo["color"],
    value,
  };
}

// ---------------------------------------------------------------------------
// computeSEE
// ---------------------------------------------------------------------------

describe("computeSEE", () => {
  it("undefended target: gain is full target value", () => {
    // pawn(1) takes undefended knight(3)
    expect(computeSEE(3, [1], [])).toBe(3);
  });

  it("favorable trade: knight takes queen defended by pawn", () => {
    // gain = 9 - computeSEE(3, [1], []) = 9 - 3 = 6
    expect(computeSEE(9, [3], [1])).toBe(6);
  });

  it("losing trade returns 0: rook takes knight defended by pawn", () => {
    // gain = 3 - computeSEE(5, [1], []) = 3 - 5 = -2 → 0
    expect(computeSEE(3, [5], [1])).toBe(0);
  });

  it("even trade with equal recapturer returns 0", () => {
    // pawn takes pawn defended by pawn: 1 - computeSEE(1, [1], []) = 1 - 1 = 0
    expect(computeSEE(1, [1], [1])).toBe(0);
  });

  it("defender opts not to recapture when doing so would lose material", () => {
    // Pawn(1) + Rook(5) take Knight(3), defended only by Bishop(3).
    // Bishop recaptures pawn (gains 1), but then Rook takes Bishop (bishop loses net 2).
    // Bishop opts not to recapture → pawn takes knight for free.
    // computeSEE(3, [1,5], [3]):
    //   gain = 3 - computeSEE(1, [3], [5])
    //     computeSEE(1, [3], [5]):
    //       gain = 1 - computeSEE(3, [5], []) = 1 - 3 = -2 → 0
    //   gain = 3 - 0 = 3
    expect(computeSEE(3, [1, 5], [3])).toBe(3);
  });

  it("returns 0 when no attackers remain", () => {
    expect(computeSEE(5, [], [3])).toBe(0);
  });

  it("heavy piece can take undefended pawn", () => {
    // queen(9) takes undefended pawn(1) — always profitable if no recapture
    expect(computeSEE(1, [9], [])).toBe(1);
  });

  it("queen losing trade: takes defended pawn with queen recapture available", () => {
    // queen(9) takes pawn(1) defended by queen(9): gain = 1 - 9 = -8 → 0
    expect(computeSEE(1, [9], [9])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeDefenseWeight
// ---------------------------------------------------------------------------

describe("computeDefenseWeight", () => {
  it("knight defending bishop → weight = 3.6", () => {
    const defender = makePiece("b1", "n", "w", 3);
    const target = makePiece("c3", "b", "w", 3);

    const weight = computeDefenseWeight(defender, target);
    expect(weight).toBeCloseTo(3.6); // 3 + 3 * 0.2 = 3.6
  });

  it("rook defending queen → weight = 10", () => {
    const defender = makePiece("d1", "r", "w", 5);
    const target = makePiece("d4", "q", "w", 9);

    const weight = computeDefenseWeight(defender, target);
    expect(weight).toBe(10); // 9 + 5 * 0.2 = 10
  });

  it("pawn defending pawn → weight = 1.2", () => {
    const defender = makePiece("d2", "p", "w", 1);
    const target = makePiece("e3", "p", "w", 1);

    const weight = computeDefenseWeight(defender, target);
    expect(weight).toBeCloseTo(1.2); // 1 + 1 * 0.2 = 1.2
  });

  it("queen defending king → weight = 1001.8", () => {
    const defender = makePiece("d1", "q", "w", 9);
    const target = makePiece("e1", "k", "w", 1000);

    // computeDefenseWeight still calculates a value (used internally)
    // but buildEdges will never emit this edge for visualisation purposes
    const weight = computeDefenseWeight(defender, target);
    expect(weight).toBeCloseTo(1001.8); // 1000 + 9 * 0.2 = 1001.8
  });

  it("weight formula is target.value + defender.value * 0.2", () => {
    const defender = makePiece("a1", "r", "w", 5);
    const target = makePiece("a2", "p", "w", 1);

    const weight = computeDefenseWeight(defender, target);
    expect(weight).toBe(1 + 5 * 0.2); // = 2
  });
});

// ---------------------------------------------------------------------------
// buildEdges
// ---------------------------------------------------------------------------

describe("buildEdges", () => {
  it("creates an attack edge for enemy pieces", () => {
    const whitePawn = makePiece("e4", "p", "w", 1);
    const blackKnight = makePiece("d5", "n", "b", 3);
    const pieces = [whitePawn, blackKnight];

    const attackMap: AttackMap = new Map([
      ["e4", ["d5", "f5"]],
      ["d5", ["c3", "e3", "b4", "f4", "c7", "e7", "b6", "f6"]],
    ]);

    const edges = buildEdges(pieces, attackMap);

    const attackEdge = edges.find((e) => e.from === "e4" && e.to === "d5" && e.type === "attack");
    expect(attackEdge).toBeDefined();
    expect(attackEdge!.weight).toBe(3); // target.value = 3
  });

  it("creates a defense edge for friendly pieces", () => {
    const whiteRook = makePiece("d1", "r", "w", 5);
    const whiteQueen = makePiece("d4", "q", "w", 9);
    const pieces = [whiteRook, whiteQueen];

    const attackMap: AttackMap = new Map([
      ["d1", ["d2", "d3", "d4"]],
      ["d4", ["d1"]],
    ]);

    const edges = buildEdges(pieces, attackMap);

    const defenseEdge = edges.find((e) => e.from === "d1" && e.to === "d4" && e.type === "defense");
    expect(defenseEdge).toBeDefined();
    expect(defenseEdge!.weight).toBe(10); // 9 + 5 * 0.2 = 10
  });

  it("does not create attack edges with weight 0 (losing trade via SEE)", () => {
    const whiteQueen = makePiece("e4", "q", "w", 9);
    const blackPawn = makePiece("d5", "p", "b", 1);
    const blackQueen = makePiece("c6", "q", "b", 9);
    const pieces = [whiteQueen, blackPawn, blackQueen];

    const attackMap: AttackMap = new Map([
      ["e4", ["d5", "f5"]],
      ["d5", []],
      // black queen on c6 attacks d5 — this is how SEE discovers the defender
      ["c6", ["d5"]],
    ]);

    const edges = buildEdges(pieces, attackMap);

    // SEE(1, [9], [9]): white queen gains 1 but black queen recaptures worth 9 → net = -8 → 0
    const attackEdge = edges.find((e) => e.from === "e4" && e.to === "d5" && e.type === "attack");
    expect(attackEdge).toBeUndefined();
  });

  it("buildEdges with a 4-piece position produces correct edge counts and types", () => {
    // White: rook on a1, knight on c3
    // Black: bishop on e5, pawn on d4
    const whiteRook = makePiece("a1", "r", "w", 5);
    const whiteKnight = makePiece("c3", "n", "w", 3);
    const blackBishop = makePiece("e5", "b", "b", 3);
    const blackPawn = makePiece("d4", "p", "b", 1);
    const pieces = [whiteRook, whiteKnight, blackBishop, blackPawn];

    const attackMap: AttackMap = new Map([
      ["a1", ["a2", "a3", "a4", "b1", "c1"]],
      ["c3", ["a2", "a4", "b1", "b5", "d1", "d5", "e2", "e4"]],
      ["e5", ["d4", "f4", "d6", "f6"]], // bishop on e5 attacks diagonals (some)
      ["d4", ["c3", "e3"]], // black pawn attacks c3 and e3
    ]);

    const edges = buildEdges(pieces, attackMap);

    // Attack edges: black pawn d4 attacks white knight c3 (enemy)
    //   weight = max(0, 1 + 3 - 0) = 4 (c3 has no defense)
    // Defense edges: bishop e5 defends pawn d4 (same color)
    //   weight = 1 + 3 * 0.2 = 1.6
    // Also: rook a1 → b1 is not a piece, so no edge

    const attackEdges = edges.filter((e) => e.type === "attack");
    const defenseEdges = edges.filter((e) => e.type === "defense");

    expect(attackEdges.length).toBeGreaterThan(0);
    expect(defenseEdges.length).toBeGreaterThan(0);

    // Verify the d4→c3 attack edge
    const pawnAttacksKnight = attackEdges.find((e) => e.from === "d4" && e.to === "c3");
    expect(pawnAttacksKnight).toBeDefined();
    expect(pawnAttacksKnight!.weight).toBe(3); // target.value = 3

    // Verify the e5→d4 defense edge
    const bishopDefendsPawn = defenseEdges.find((e) => e.from === "e5" && e.to === "d4");
    expect(bishopDefendsPawn).toBeDefined();
    expect(bishopDefendsPawn!.weight).toBeCloseTo(1.6); // 1 + 3 * 0.2
  });

  it("returns empty array for no pieces", () => {
    const edges = buildEdges([], new Map());
    expect(edges).toEqual([]);
  });

  it("does not create a defense edge when the target is a king", () => {
    const rook = makePiece("d1", "r", "w", 5);
    const king = makePiece("e1", "k", "w", 1000);
    const pieces = [rook, king];

    const attackMap: AttackMap = new Map([
      ["d1", ["e1"]],
      ["e1", []],
    ]);

    const edges = buildEdges(pieces, attackMap);

    // No edge should be emitted — king is the target
    expect(edges).toEqual([]);
  });

  it("attack targets that are empty squares produce no edges", () => {
    const piece = makePiece("e4", "p", "w", 1);
    const pieces = [piece];

    // pawn attacks d5 and f5, but no pieces are on those squares
    const attackMap: AttackMap = new Map([["e4", ["d5", "f5"]]]);

    const edges = buildEdges(pieces, attackMap);
    expect(edges).toEqual([]);
  });

  it("all edges have positive weight", () => {
    const whiteRook = makePiece("d1", "r", "w", 5);
    const whiteQueen = makePiece("d4", "q", "w", 9);
    const blackPawn = makePiece("e5", "p", "b", 1);
    const pieces = [whiteRook, whiteQueen, blackPawn];

    const attackMap: AttackMap = new Map([
      ["d1", ["d4"]],
      ["d4", ["e5", "d1"]],
      ["e5", []],
    ]);

    const edges = buildEdges(pieces, attackMap);

    for (const edge of edges) {
      expect(edge.weight).toBeGreaterThan(0);
    }
  });
});
