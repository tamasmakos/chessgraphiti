import { describe, it, expect } from "vitest";
import { parseBestMove, parseEvaluation, buildGoCommand } from "#engine";

// ---------------------------------------------------------------------------
// parseBestMove
// ---------------------------------------------------------------------------

describe("parseBestMove", () => {
  it("parses bestmove with ponder", () => {
    const result = parseBestMove("bestmove e2e4 ponder d7d5");
    expect(result).toEqual({ bestMove: "e2e4", ponder: "d7d5" });
  });

  it("parses bestmove without ponder", () => {
    const result = parseBestMove("bestmove e2e4");
    expect(result).toEqual({ bestMove: "e2e4" });
  });

  it("ponder is undefined when not present", () => {
    const result = parseBestMove("bestmove g1f3");
    expect(result.bestMove).toBe("g1f3");
    expect(result.ponder).toBeUndefined();
  });

  it("handles multi-line UCI output — finds the bestmove line", () => {
    const output = [
      "info depth 20 score cp 35 nodes 184623 pv e2e4 e7e5 g1f3",
      "info depth 21 score cp 30 nodes 250000 pv e2e4 e7e5 g1f3 b8c6",
      "bestmove e2e4 ponder e7e5",
    ].join("\n");

    const result = parseBestMove(output);
    expect(result.bestMove).toBe("e2e4");
    expect(result.ponder).toBe("e7e5");
  });

  it("uses the last bestmove line when multiple are present", () => {
    const output = [
      "bestmove a2a3",
      "bestmove e2e4 ponder d7d5",
    ].join("\n");

    const result = parseBestMove(output);
    expect(result.bestMove).toBe("e2e4");
    expect(result.ponder).toBe("d7d5");
  });

  it("throws when no bestmove line is found", () => {
    expect(() => parseBestMove("info depth 10 score cp 20")).toThrow(
      'No "bestmove" line found',
    );
  });

  it("throws on empty string", () => {
    expect(() => parseBestMove("")).toThrow();
  });

  it("handles promotion moves (e.g., e7e8q)", () => {
    const result = parseBestMove("bestmove e7e8q");
    expect(result.bestMove).toBe("e7e8q");
  });

  it("handles castling notation (e.g., e1g1)", () => {
    const result = parseBestMove("bestmove e1g1 ponder d7d5");
    expect(result.bestMove).toBe("e1g1");
    expect(result.ponder).toBe("d7d5");
  });
});

// ---------------------------------------------------------------------------
// parseEvaluation
// ---------------------------------------------------------------------------

describe("parseEvaluation", () => {
  it("parses centipawn score, depth, nodes, and pv", () => {
    const output = "info depth 20 score cp 35 nodes 184623 pv e2e4 e7e5 g1f3";
    const result = parseEvaluation(output);

    expect(result.score).toBe(35);
    expect(result.depth).toBe(20);
    expect(result.nodes).toBe(184623);
    expect(result.pv).toEqual(["e2e4", "e7e5", "g1f3"]);
    expect(result.mate).toBeUndefined();
  });

  it("parses negative centipawn score", () => {
    const output = "info depth 15 score cp -50 nodes 100000 pv d7d5 e4d5";
    const result = parseEvaluation(output);

    expect(result.score).toBe(-50);
    expect(result.depth).toBe(15);
  });

  it("parses mate score", () => {
    const output = "info depth 30 score mate 3 nodes 500000 pv d1h7 g8h7 f3g5";
    const result = parseEvaluation(output);

    expect(result.mate).toBe(3);
    expect(result.depth).toBe(30);
    expect(result.pv).toEqual(["d1h7", "g8h7", "f3g5"]);
  });

  it("parses negative mate score (being mated)", () => {
    const output = "info depth 25 score mate -2 nodes 300000 pv e1f1 d8d1";
    const result = parseEvaluation(output);

    expect(result.mate).toBe(-2);
  });

  it("uses the last info depth line from multi-line output", () => {
    const output = [
      "info depth 10 score cp 20 nodes 50000 pv e2e4",
      "info depth 15 score cp 35 nodes 100000 pv e2e4 e7e5",
      "info depth 20 score cp 30 nodes 200000 pv e2e4 e7e5 g1f3",
      "bestmove e2e4",
    ].join("\n");

    const result = parseEvaluation(output);
    expect(result.depth).toBe(20);
    expect(result.score).toBe(30);
  });

  it("throws when no info depth line is found", () => {
    expect(() => parseEvaluation("bestmove e2e4")).toThrow(
      'No "info depth" line found',
    );
  });

  it("returns empty pv when no pv in info line", () => {
    const output = "info depth 10 score cp 20 nodes 50000";
    const result = parseEvaluation(output);
    expect(result.pv).toEqual([]);
  });

  it("returns 0 nodes when nodes field is missing", () => {
    const output = "info depth 10 score cp 20 pv e2e4";
    const result = parseEvaluation(output);
    expect(result.nodes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildGoCommand
// ---------------------------------------------------------------------------

describe("buildGoCommand", () => {
  it('builds "go depth N" command', () => {
    expect(buildGoCommand({ depth: 20 })).toBe("go depth 20");
  });

  it('builds "go movetime N" command', () => {
    expect(buildGoCommand({ moveTime: 1000 })).toBe("go movetime 1000");
  });

  it('builds "go depth 20" as default when no options given', () => {
    expect(buildGoCommand({})).toBe("go depth 20");
  });

  it('builds "go nodes N" command', () => {
    expect(buildGoCommand({ nodes: 500000 })).toBe("go nodes 500000");
  });

  it("combines multiple options", () => {
    const cmd = buildGoCommand({ depth: 10, nodes: 500000 });
    expect(cmd).toBe("go depth 10 nodes 500000");
  });

  it("combines depth and movetime", () => {
    const cmd = buildGoCommand({ depth: 15, moveTime: 2000 });
    expect(cmd).toBe("go depth 15 movetime 2000");
  });

  it("combines all three options", () => {
    const cmd = buildGoCommand({ depth: 10, moveTime: 5000, nodes: 1000000 });
    expect(cmd).toBe("go depth 10 movetime 5000 nodes 1000000");
  });

  it("custom depth overrides default", () => {
    expect(buildGoCommand({ depth: 5 })).toBe("go depth 5");
    expect(buildGoCommand({ depth: 1 })).toBe("go depth 1");
  });
});
