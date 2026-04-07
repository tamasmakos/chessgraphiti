import { describe, expect, it } from "vitest";
import { buildGraph } from "../graph-algo.ts";
import { computePositionFragility, computeStrategicTension } from "../position-metrics.ts";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Scholar's mate threat: queen and bishop bearing down.
const SCHOLARS_MATE_SETUP = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

// ---------------------------------------------------------------------------
// computePositionFragility
// ---------------------------------------------------------------------------

describe("computePositionFragility", () => {
  it("returns values in [0, 1]", () => {
    const result = buildGraph(STARTING_FEN);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const { nodes, edges } = result.value;
    const score = computePositionFragility(nodes, edges);
    expect(score.white).toBeGreaterThanOrEqual(0);
    expect(score.white).toBeLessThanOrEqual(1);
    expect(score.black).toBeGreaterThanOrEqual(0);
    expect(score.black).toBeLessThanOrEqual(1);
  });

  it("at least one side has max score 1.0 when fragility is non-zero", () => {
    const result = buildGraph(SCHOLARS_MATE_SETUP);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const { nodes, edges } = result.value;
    const score = computePositionFragility(nodes, edges);
    expect(Math.max(score.white, score.black)).toBeCloseTo(1, 5);
  });

  it("builds correctly via buildGraph metadata", () => {
    const result = buildGraph(SCHOLARS_MATE_SETUP);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const frag = result.value.metadata.positionFragility;
    expect(frag).toBeDefined();
    expect(frag?.white).toBeGreaterThanOrEqual(0);
    expect(frag?.black).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// computeStrategicTension
// ---------------------------------------------------------------------------

describe("computeStrategicTension", () => {
  it("returns values in [0, 1]", () => {
    const result = buildGraph(STARTING_FEN);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const { nodes, edges } = result.value;
    const score = computeStrategicTension(nodes, edges);
    expect(score.white).toBeGreaterThanOrEqual(0);
    expect(score.white).toBeLessThanOrEqual(1);
    expect(score.black).toBeGreaterThanOrEqual(0);
    expect(score.black).toBeLessThanOrEqual(1);
  });

  it("at least one side has max score 1.0 in an active position", () => {
    const result = buildGraph(SCHOLARS_MATE_SETUP);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const { nodes, edges } = result.value;
    const score = computeStrategicTension(nodes, edges);
    expect(Math.max(score.white, score.black)).toBeCloseTo(1, 5);
  });

  it("builds correctly via buildGraph metadata", () => {
    const result = buildGraph(SCHOLARS_MATE_SETUP);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;
    const tension = result.value.metadata.strategicTension;
    expect(tension).toBeDefined();
    expect(tension?.white).toBeGreaterThanOrEqual(0);
    expect(tension?.black).toBeGreaterThanOrEqual(0);
  });

  it("returns zero for both sides when no attack edges exist", () => {
    const score = computeStrategicTension([], []);
    expect(score.white).toBe(0);
    expect(score.black).toBe(0);
  });
});
