import { describe, it, expect } from "vitest";
import {
  computeAttackWeight,
  computeDefenseWeight,
  buildEdges,
} from "../edge-weights.ts";
import type { PieceInfo, AttackMap, DefenseMap } from "../types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePiece(
  square: string,
  type: string,
  color: string,
  value: number,
): PieceInfo {
  return {
    square,
    type: type as PieceInfo["type"],
    color: color as PieceInfo["color"],
    value,
  };
}

// ---------------------------------------------------------------------------
// computeAttackWeight
// ---------------------------------------------------------------------------

describe("computeAttackWeight", () => {
  it("pawn attacking undefended knight → weight = 3", () => {
    const attacker = makePiece("e4", "p", "w", 1);
    const target = makePiece("d5", "n", "b", 3);
    const pieces = [attacker, target];

    const weight = computeAttackWeight(attacker, target, [], pieces);
    expect(weight).toBe(3); // target.value = 3
  });

  it("knight attacking queen defended by rook → weight = 15", () => {
    const attacker = makePiece("f5", "n", "w", 3);
    const target = makePiece("d6", "q", "b", 9);
    const defender = makePiece("d8", "r", "b", 5);
    const pieces = [attacker, target, defender];

    const weight = computeAttackWeight(attacker, target, ["d8"], pieces);
    expect(weight).toBe(15); // 9 + (9 - 3) = 15
  });

  it("pawn attacking pawn defended by queen → weight = 1", () => {
    const attacker = makePiece("e4", "p", "w", 1);
    const target = makePiece("d5", "p", "b", 1);
    const defender = makePiece("d8", "q", "b", 9);
    const pieces = [attacker, target, defender];

    const weight = computeAttackWeight(attacker, target, ["d8"], pieces);
    expect(weight).toBe(1); // 1 + (1 - 1) = 1
  });

  it("favorable trade evaluated correctly regardless of defender sum", () => {
    const attacker = makePiece("e4", "p", "w", 1);
    const target = makePiece("d5", "n", "b", 3);
    const d1 = makePiece("c6", "r", "b", 5);
    const d2 = makePiece("e6", "b", "b", 3);
    const pieces = [attacker, target, d1, d2];

    const weight = computeAttackWeight(attacker, target, ["c6", "e6"], pieces);
    expect(weight).toBe(5); // 3 + (3 - 1) = 5
  });

  it("bishop attacking undefended rook → weight = 5", () => {
    const attacker = makePiece("b2", "b", "w", 3);
    const target = makePiece("g7", "r", "b", 5);
    const pieces = [attacker, target];

    const weight = computeAttackWeight(attacker, target, [], pieces);
    expect(weight).toBe(5); // target.value = 5
  });

  it("returns full weight for nonexistent defender squares (graceful fallback)", () => {
    const attacker = makePiece("e4", "p", "w", 1);
    const target = makePiece("d5", "n", "b", 3);
    const pieces = [attacker, target];

    // "z9" doesn't correspond to any piece → its value defaults to 0
    const weight = computeAttackWeight(attacker, target, ["z9"], pieces);
    expect(weight).toBe(5); // 3 + (3 - 1) = 5
  });

  it("losing trade (queen attacks defended rook) returns weight 0", () => {
    const attacker = makePiece("f5", "q", "w", 9);
    const target = makePiece("d7", "r", "b", 5);
    const d1 = makePiece("d8", "k", "b", 1000);
    const d2 = makePiece("e7", "p", "b", 1);
    const pieces = [attacker, target, d1, d2];

    const weight = computeAttackWeight(attacker, target, ["d8", "e7"], pieces);
    expect(weight).toBe(0); // losing trade, weight is 0
  });

  it("queen attacking undefended king → weight = 1000", () => {
    const attacker = makePiece("d1", "q", "w", 9);
    const target = makePiece("d8", "k", "b", 1000);
    const pieces = [attacker, target];

    const weight = computeAttackWeight(attacker, target, [], pieces);
    expect(weight).toBe(1000); // target.value = 1000
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
    const defenseMap: DefenseMap = new Map();

    const edges = buildEdges(pieces, attackMap, defenseMap);

    const attackEdge = edges.find(
      (e) => e.from === "e4" && e.to === "d5" && e.type === "attack",
    );
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
    const defenseMap: DefenseMap = new Map();

    const edges = buildEdges(pieces, attackMap, defenseMap);

    const defenseEdge = edges.find(
      (e) => e.from === "d1" && e.to === "d4" && e.type === "defense",
    );
    expect(defenseEdge).toBeDefined();
    expect(defenseEdge!.weight).toBe(10); // 9 + 5 * 0.2 = 10
  });

  it("does not create attack edges with weight 0", () => {
    const whiteQueen = makePiece("e4", "q", "w", 9);
    const blackPawn = makePiece("d5", "p", "b", 1);
    const blackQueen = makePiece("c6", "q", "b", 9);
    const pieces = [whiteQueen, blackPawn, blackQueen];

    const attackMap: AttackMap = new Map([
      ["e4", ["d5", "f5"]],
      ["d5", []],
      ["c6", []],
    ]);
    const defenseMap: DefenseMap = new Map([
      ["d5", ["c6"]], // black queen defends black pawn
    ]);

    const edges = buildEdges(pieces, attackMap, defenseMap);

    // Losing trade: weight = 0, no attack edge created
    const attackEdge = edges.find(
      (e) => e.from === "e4" && e.to === "d5" && e.type === "attack",
    );
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

    // Knight on c3 attacks d5, e4, e2, d1, b1, a2, a4, b5 — and d4 is not there,
    // but also attacks squares like d5. Let's say it attacks e4 and d5 only for simplicity,
    // plus b5 where blackBishop... let's use a realistic scenario:
    // Knight c3 attacks: a2, a4, b1, b5, d1, d5, e2, e4
    // Rook a1 attacks: a2..a8, b1..h1 (let's say a2, a3, ..., b1, c1, d1)
    const attackMap: AttackMap = new Map([
      ["a1", ["a2", "a3", "a4", "b1", "c1"]],
      ["c3", ["a2", "a4", "b1", "b5", "d1", "d5", "e2", "e4"]],
      ["e5", ["d4", "f4", "d6", "f6"]], // bishop on e5 attacks diagonals (some)
      ["d4", ["c3", "e3"]], // black pawn attacks c3 and e3
    ]);

    // Black pawn on d4 defended by bishop on e5 (e5 attacks d4)
    const defenseMap: DefenseMap = new Map([
      ["d4", ["e5"]],
    ]);

    const edges = buildEdges(pieces, attackMap, defenseMap);

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
    const pawnAttacksKnight = attackEdges.find(
      (e) => e.from === "d4" && e.to === "c3",
    );
    expect(pawnAttacksKnight).toBeDefined();
    expect(pawnAttacksKnight!.weight).toBe(3); // target.value = 3

    // Verify the e5→d4 defense edge
    const bishopDefendsPawn = defenseEdges.find(
      (e) => e.from === "e5" && e.to === "d4",
    );
    expect(bishopDefendsPawn).toBeDefined();
    expect(bishopDefendsPawn!.weight).toBeCloseTo(1.6); // 1 + 3 * 0.2
  });

  it("returns empty array for no pieces", () => {
    const edges = buildEdges([], new Map(), new Map());
    expect(edges).toEqual([]);
  });

  it("attack targets that are empty squares produce no edges", () => {
    const piece = makePiece("e4", "p", "w", 1);
    const pieces = [piece];

    // pawn attacks d5 and f5, but no pieces are on those squares
    const attackMap: AttackMap = new Map([["e4", ["d5", "f5"]]]);
    const defenseMap: DefenseMap = new Map();

    const edges = buildEdges(pieces, attackMap, defenseMap);
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
    const defenseMap: DefenseMap = new Map();

    const edges = buildEdges(pieces, attackMap, defenseMap);

    for (const edge of edges) {
      expect(edge.weight).toBeGreaterThan(0);
    }
  });
});
