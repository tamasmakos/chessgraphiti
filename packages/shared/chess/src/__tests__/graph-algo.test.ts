import { describe, expect, it } from "vitest";
import {
  buildGraph,
  computeAttackMap,
  computeDefenseMap,
  getAttackedSquares,
  parsePieces,
} from "../graph-algo.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";

// ---------------------------------------------------------------------------
// parsePieces
// ---------------------------------------------------------------------------

describe("parsePieces", () => {
  it("starting position returns exactly 32 pieces", () => {
    const pieces = parsePieces(STARTING_FEN);
    expect(pieces).toHaveLength(32);
  });

  it("starting position has 16 white and 16 black pieces", () => {
    const pieces = parsePieces(STARTING_FEN);
    const white = pieces.filter((p) => p.color === "w");
    const black = pieces.filter((p) => p.color === "b");
    expect(white).toHaveLength(16);
    expect(black).toHaveLength(16);
  });

  it("starting position has 8 pawns per side", () => {
    const pieces = parsePieces(STARTING_FEN);
    const whitePawns = pieces.filter((p) => p.color === "w" && p.type === "p");
    const blackPawns = pieces.filter((p) => p.color === "b" && p.type === "p");
    expect(whitePawns).toHaveLength(8);
    expect(blackPawns).toHaveLength(8);
  });

  it("king values are 1000 (not 4)", () => {
    const pieces = parsePieces(STARTING_FEN);
    const whiteKing = pieces.find((p) => p.type === "k" && p.color === "w");
    const blackKing = pieces.find((p) => p.type === "k" && p.color === "b");

    expect(whiteKing).toBeDefined();
    expect(blackKing).toBeDefined();
    expect(whiteKing!.value).toBe(1000);
    expect(blackKing!.value).toBe(1000);
  });

  it("pieces have correct material values", () => {
    const pieces = parsePieces(STARTING_FEN);
    const queen = pieces.find((p) => p.type === "q" && p.color === "w");
    const rook = pieces.find((p) => p.type === "r" && p.color === "w" && p.square === "a1");
    const knight = pieces.find((p) => p.type === "n" && p.color === "w" && p.square === "b1");
    const pawn = pieces.find((p) => p.type === "p" && p.color === "w" && p.square === "a2");

    expect(queen?.value).toBe(9);
    expect(rook?.value).toBe(5);
    expect(knight?.value).toBe(3);
    expect(pawn?.value).toBe(1);
  });

  it("after 1.e4, pawn is on e4 not e2", () => {
    const pieces = parsePieces(AFTER_E4);
    const e2pawn = pieces.find((p) => p.square === "e2");
    const e4pawn = pieces.find((p) => p.square === "e4");
    expect(e2pawn).toBeUndefined();
    expect(e4pawn).toBeDefined();
    expect(e4pawn!.type).toBe("p");
    expect(e4pawn!.color).toBe("w");
  });

  it("position with only two kings returns 2 pieces", () => {
    const twoKingsFen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
    const pieces = parsePieces(twoKingsFen);
    expect(pieces).toHaveLength(2);
    expect(pieces.every((p) => p.type === "k")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getAttackedSquares
// ---------------------------------------------------------------------------

describe("getAttackedSquares", () => {
  it("rook on e4 attacks adjacent squares in all four ray directions", () => {
    // Rook on e4 with an adjacent black piece on e5 to verify attack
    const fen = "4k3/8/8/4p3/4R3/8/8/4K3 w - - 0 1";
    const attacked = getAttackedSquares("e4", fen);

    // Rook attacks in 4 directions — verifies ray-casting starts correctly
    expect(attacked).toContain("e5"); // up (black pawn)
    expect(attacked).toContain("e3"); // down
    expect(attacked).toContain("f4"); // right
    expect(attacked).toContain("d4"); // left
    expect(attacked.length).toBeGreaterThanOrEqual(4);
  });

  it("knight on d4 attacks all 8 possible squares", () => {
    const fen = "7k/8/8/8/3N4/8/8/K7 w - - 0 1";
    const attacked = getAttackedSquares("d4", fen);

    // Knight on d4 should attack: c2, e2, b3, f3, b5, f5, c6, e6
    expect(attacked).toContain("c2");
    expect(attacked).toContain("e2");
    expect(attacked).toContain("b3");
    expect(attacked).toContain("f3");
    expect(attacked).toContain("b5");
    expect(attacked).toContain("f5");
    expect(attacked).toContain("c6");
    expect(attacked).toContain("e6");
    expect(attacked).toHaveLength(8);
  });

  it("white pawn on e4 attacks f5 and d5 diagonals", () => {
    const attacked = getAttackedSquares("e4", AFTER_E4);
    expect(attacked).toContain("d5");
    expect(attacked).toContain("f5");
    expect(attacked).toHaveLength(2);
  });

  it("black pawn on e7 attacks d6 and f6 (downward diagonals)", () => {
    const attacked = getAttackedSquares("e7", STARTING_FEN);
    expect(attacked).toContain("d6");
    expect(attacked).toContain("f6");
  });

  it("knight on b1 in starting position attacks a3 and c3", () => {
    const attacked = getAttackedSquares("b1", STARTING_FEN);
    expect(attacked).toContain("a3");
    expect(attacked).toContain("c3");
  });

  it("knight on b1 attacks d2 (own piece) — pseudo-legal attacks include friendly squares", () => {
    const attacked = getAttackedSquares("b1", STARTING_FEN);
    expect(attacked).toContain("d2");
  });

  it("rook on a1 in starting position is blocked by pawn on a2", () => {
    const attacked = getAttackedSquares("a1", STARTING_FEN);
    // Rook can see a2 (the pawn), but the pawn blocks further movement
    expect(attacked).toContain("a2");
    expect(attacked).not.toContain("a3");
    // Rook can also see b1 (the knight)
    expect(attacked).toContain("b1");
  });

  it("empty square returns empty array", () => {
    const attacked = getAttackedSquares("e4", STARTING_FEN);
    expect(attacked).toEqual([]);
  });

  it("king on d5 attacks all 8 surrounding squares", () => {
    const fen = "4k3/8/8/3K4/8/8/8/8 w - - 0 1";
    const attacked = getAttackedSquares("d5", fen);
    expect(attacked).toHaveLength(8);
    expect(attacked).toContain("c4");
    expect(attacked).toContain("c5");
    expect(attacked).toContain("c6");
    expect(attacked).toContain("d4");
    expect(attacked).toContain("d6");
    expect(attacked).toContain("e4");
    expect(attacked).toContain("e5");
    expect(attacked).toContain("e6");
  });

  it("bishop attacks along diagonal directions", () => {
    // Bishop on c1 — verifies diagonal ray-casting
    const fen = "4k3/8/8/8/8/8/8/2B1K3 w - - 0 1";
    const attacked = getAttackedSquares("c1", fen);
    // Bishop from c1 attacks diagonally: d2 (up-right) and b2 (up-left)
    // (down diagonals are off-board from rank 1)
    expect(attacked).toContain("d2");
    expect(attacked).toContain("b2");
    expect(attacked.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// computeAttackMap
// ---------------------------------------------------------------------------

describe("computeAttackMap", () => {
  it("starting position attack map has 32 entries (one per piece)", () => {
    const pieces = parsePieces(STARTING_FEN);
    const attackMap = computeAttackMap(STARTING_FEN, pieces);
    expect(attackMap.size).toBe(32);
  });

  it("pawns in starting position attack diagonal squares ahead", () => {
    const pieces = parsePieces(STARTING_FEN);
    const attackMap = computeAttackMap(STARTING_FEN, pieces);

    // Interior white pawns attack 2 diagonal squares
    const e2Attacks = attackMap.get("e2");
    expect(e2Attacks).toBeDefined();
    expect(e2Attacks).toContain("d3");
    expect(e2Attacks).toContain("f3");

    // Edge pawn on a-file only attacks 1 square
    const a2Attacks = attackMap.get("a2");
    expect(a2Attacks).toBeDefined();
    expect(a2Attacks).toHaveLength(1);
    expect(a2Attacks).toContain("b3");
  });

  it("after 1.e4, pawn on e4 attacks d5 and f5", () => {
    const pieces = parsePieces(AFTER_E4);
    const attackMap = computeAttackMap(AFTER_E4, pieces);

    const e4Attacks = attackMap.get("e4");
    expect(e4Attacks).toBeDefined();
    expect(e4Attacks).toContain("d5");
    expect(e4Attacks).toContain("f5");
  });

  it("each piece has an entry in the attack map", () => {
    const pieces = parsePieces(STARTING_FEN);
    const attackMap = computeAttackMap(STARTING_FEN, pieces);

    for (const piece of pieces) {
      expect(attackMap.has(piece.square)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// computeDefenseMap
// ---------------------------------------------------------------------------

describe("computeDefenseMap", () => {
  it("returns a Map", () => {
    const pieces = parsePieces(STARTING_FEN);
    const attackMap = computeAttackMap(STARTING_FEN, pieces);
    const defenseMap = computeDefenseMap(STARTING_FEN, pieces, attackMap);
    expect(defenseMap).toBeInstanceOf(Map);
  });

  it("in starting position, d2 pawn is defended by at least the king on e1", () => {
    const pieces = parsePieces(STARTING_FEN);
    const attackMap = computeAttackMap(STARTING_FEN, pieces);
    const defenseMap = computeDefenseMap(STARTING_FEN, pieces, attackMap);

    const d2Defenders = defenseMap.get("d2");
    expect(d2Defenders).toBeDefined();
    expect(d2Defenders!.length).toBeGreaterThan(0);
  });

  it("pieces with no defenders are not in the defense map", () => {
    const fen = "4k3/8/8/3N4/8/8/8/4K3 w - - 0 1";
    const pieces = parsePieces(fen);
    const attackMap = computeAttackMap(fen, pieces);
    const defenseMap = computeDefenseMap(fen, pieces, attackMap);

    // Knight on d5 is not defended by the king on e1 (too far away)
    const d5Defenders = defenseMap.get("d5");
    expect(d5Defenders).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildGraph — full pipeline
// ---------------------------------------------------------------------------

describe("buildGraph", () => {
  it("starting position returns ok() Result with 32 nodes", () => {
    const result = buildGraph(STARTING_FEN);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.nodes).toHaveLength(32);
    }
  });

  it("starting position graph has edges (defense edges at minimum)", () => {
    const result = buildGraph(STARTING_FEN);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.edges.length).toBeGreaterThan(0);
    }
  });

  it("after 1.e4 e5, both center pawns appear and edges exist", () => {
    const result = buildGraph(AFTER_E4_E5);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const e4 = result.value.nodes.find((n) => n.square === "e4");
      const e5 = result.value.nodes.find((n) => n.square === "e5");
      expect(e4).toBeDefined();
      expect(e5).toBeDefined();
      expect(e4!.color).toBe("w");
      expect(e5!.color).toBe("b");
      expect(result.value.edges.length).toBeGreaterThan(0);
    }
  });

  it("invalid FEN returns err() result", () => {
    const result = buildGraph("totally-not-a-valid-fen");
    expect(result.isErr()).toBe(true);
  });

  it("empty string FEN returns err() result", () => {
    const result = buildGraph("");
    expect(result.isErr()).toBe(true);
  });

  it("metadata contains correct FEN and ply", () => {
    const result = buildGraph(STARTING_FEN);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.metadata.fen).toBe(STARTING_FEN);
      expect(result.value.metadata.ply).toBe(0);
    }
  });

  it("after 1.e4, ply is 1 (black to move)", () => {
    const result = buildGraph(AFTER_E4);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.metadata.ply).toBe(1);
    }
  });

  it("after 1.e4 e5, ply is 2 (white to move, move 2)", () => {
    const result = buildGraph(AFTER_E4_E5);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.metadata.ply).toBe(2);
    }
  });

  it("nodes have centrality and community fields populated", () => {
    const result = buildGraph(STARTING_FEN);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      for (const node of result.value.nodes) {
        expect(typeof node.communityId).toBe("number");
        expect(typeof node.centralityBetweenness).toBe("number");
        expect(typeof node.centralityDegree).toBe("number");
        expect(typeof node.centralityWeighted).toBe("number");
        expect(typeof node.centralityCloseness).toBe("number");
        expect(node.communityId).toBeGreaterThanOrEqual(0);
        expect(node.centralityBetweenness).toBeGreaterThanOrEqual(0);
        expect(node.centralityDegree).toBeGreaterThanOrEqual(0);
        expect(node.centralityWeighted).toBeGreaterThanOrEqual(0);
        expect(node.centralityCloseness).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("edges have valid type field (attack or defense)", () => {
    const result = buildGraph(STARTING_FEN);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      for (const edge of result.value.edges) {
        expect(["attack", "defense"]).toContain(edge.type);
        expect(edge.weight).toBeGreaterThan(0);
      }
    }
  });

  it("edge from and to reference valid node squares", () => {
    const result = buildGraph(AFTER_E4_E5);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const nodeSquares = new Set(result.value.nodes.map((n) => n.square));
      for (const edge of result.value.edges) {
        expect(nodeSquares.has(edge.from)).toBe(true);
        expect(nodeSquares.has(edge.to)).toBe(true);
      }
    }
  });

  it("performance: buildGraph completes in < 50ms for starting position", () => {
    const start = performance.now();
    const result = buildGraph(STARTING_FEN);
    const elapsed = performance.now() - start;

    expect(result.isOk()).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });
});
