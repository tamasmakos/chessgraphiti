import { describe, expect, it } from "vitest";
import { analyzeCommunityLineage, computeNextStepLineage } from "../community-lineage.ts";
import type { GraphSnapshot, GraphNode } from "../types.ts";

function node(square: string, communityId: number): GraphNode {
  return {
    square: square as GraphNode["square"],
    type: "p",
    color: "w",
    value: 1,
    communityId,
    centralityBetweenness: 0,
    centralityDegree: 0,
    centralityWeighted: 0,
    centralityCloseness: 0,
    centralityPageRank: 0,
  };
}

function snapshot(nodes: GraphNode[]): GraphSnapshot {
  return {
    nodes,
    edges: [],
    metadata: { fen: "test", ply: 0 },
  };
}

describe("analyzeCommunityLineage", () => {
  it("keeps stable color identity when same community members get renumbered", () => {
    const s0 = snapshot([node("a1", 0), node("a2", 0), node("h7", 1), node("h8", 1)]);
    const s1 = snapshot([node("a1", 4), node("a2", 4), node("h7", 9), node("h8", 9)]);

    const result = analyzeCommunityLineage([s0, s1]);
    const step0 = result.stableColorByStep[0] ?? {};
    const step1 = result.stableColorByStep[1] ?? {};

    expect(step0[0]).toBeDefined();
    expect(step0[1]).toBeDefined();
    expect(step1[4]).toBe(step0[0]);
    expect(step1[9]).toBe(step0[1]);
  });

  it("detects split and merge events between consecutive snapshots", () => {
    const s0 = snapshot([node("a1", 0), node("a2", 0), node("a3", 0), node("h8", 1)]);
    // community 0 splits into 3 and 4
    const s1 = snapshot([node("a1", 3), node("a2", 3), node("a3", 4), node("h8", 1)]);
    // communities 3 and 4 merge into 8
    const s2 = snapshot([node("a1", 8), node("a2", 8), node("a3", 8), node("h8", 1)]);

    const result = analyzeCommunityLineage([s0, s1, s2]);
    const transition1 = result.transitions.find((t) => t.stepIndex === 1);
    const transition2 = result.transitions.find((t) => t.stepIndex === 2);

    expect(transition1).toBeDefined();
    expect(transition2).toBeDefined();
    expect(transition1?.events.some((e) => e.type === "split")).toBe(true);
    expect(transition2?.events.some((e) => e.type === "merge")).toBe(true);
  });

  it("computes continuity/churn metrics and narrative text", () => {
    const s0 = snapshot([node("a1", 0), node("a2", 0), node("h8", 1)]);
    const s1 = snapshot([node("a1", 0), node("a2", 2), node("h8", 1)]);

    const result = analyzeCommunityLineage([s0, s1]);
    const transition = result.transitions[0];

    expect(transition).toBeDefined();
    expect(transition?.metrics.continuity).toBeGreaterThanOrEqual(0);
    expect(transition?.metrics.continuity).toBeLessThanOrEqual(1);
    expect(transition?.metrics.churn).toBeGreaterThanOrEqual(0);
    expect(transition?.metrics.churn).toBeLessThanOrEqual(1);
    expect(transition?.narrative.length).toBeGreaterThan(10);
  });
});

describe("computeNextStepLineage", () => {
  it("incrementally adds steps while maintaining color stability", () => {
    const s0 = snapshot([node("a1", 0), node("h8", 1)]);
    const lineage0 = computeNextStepLineage(s0, null, null);
    
    expect(lineage0.stableColorByStep).toHaveLength(1);
    const color0 = lineage0.stableColorByStep[0]?.[0];
    const color1 = lineage0.stableColorByStep[0]?.[1];

    const s1 = snapshot([node("a1", 5), node("h8", 6)]);
    const lineage1 = computeNextStepLineage(s1, s0, lineage0);
    
    expect(lineage1.stableColorByStep).toHaveLength(2);
    expect(lineage1.stableColorByStep[1]?.[5]).toBe(color0);
    expect(lineage1.stableColorByStep[1]?.[6]).toBe(color1);
    expect(lineage1.transitions).toHaveLength(1);
  });
});
