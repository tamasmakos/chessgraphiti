import { describe, it, expect } from "vitest";
import { buildGraph } from "#graph-algo";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";

// More complex middle-game position (Ruy Lopez Berlin Defense)
const COMPLEX_FEN =
  "r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

// ---------------------------------------------------------------------------
// Performance tests
// ---------------------------------------------------------------------------

describe("pipeline performance", () => {
  it("buildGraph(startingFen) completes in under 200ms", () => {
    // Warm-up run (JIT compilation, module loading, etc.)
    buildGraph(STARTING_FEN);

    const start = performance.now();
    const result = buildGraph(STARTING_FEN);
    const elapsed = performance.now() - start;

    expect(result.isOk()).toBe(true);
    expect(elapsed).toBeLessThan(200);
  });

  it("buildGraph(after e4 e5) completes in under 200ms", () => {
    // Warm-up run
    buildGraph(AFTER_E4_E5);

    const start = performance.now();
    const result = buildGraph(AFTER_E4_E5);
    const elapsed = performance.now() - start;

    expect(result.isOk()).toBe(true);
    expect(elapsed).toBeLessThan(200);
  });

  it("buildGraph(complex position) completes in under 200ms", () => {
    // Warm-up run
    buildGraph(COMPLEX_FEN);

    const start = performance.now();
    const result = buildGraph(COMPLEX_FEN);
    const elapsed = performance.now() - start;

    expect(result.isOk()).toBe(true);
    expect(elapsed).toBeLessThan(200);
  });

  it("10 consecutive buildGraph calls complete in under 500ms total", () => {
    // Warm-up
    buildGraph(STARTING_FEN);

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      const result = buildGraph(STARTING_FEN);
      expect(result.isOk()).toBe(true);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it("pipeline produces consistent results across runs", () => {
    const result1 = buildGraph(STARTING_FEN);
    const result2 = buildGraph(STARTING_FEN);

    expect(result1.isOk()).toBe(true);
    expect(result2.isOk()).toBe(true);

    if (result1.isOk() && result2.isOk()) {
      expect(result1.value.nodes.length).toBe(result2.value.nodes.length);
      expect(result1.value.edges.length).toBe(result2.value.edges.length);
      expect(result1.value.metadata).toEqual(result2.value.metadata);

      // Node squares should be identical
      const squares1 = result1.value.nodes.map((n) => n.square).sort();
      const squares2 = result2.value.nodes.map((n) => n.square).sort();
      expect(squares1).toEqual(squares2);
    }
  });
});
