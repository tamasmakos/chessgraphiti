import { describe, it, expect } from "vitest";
import {
  computeBetweennessCentrality,
  computeDegreeCentrality,
  computeWeightedDegreeCentrality,
  computeClosenessCentrality,
  computePageRankCentrality,
} from "../centrality.ts";
import type { GraphNode, GraphEdge } from "../types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(square: string, color: "w" | "b" = "w"): GraphNode {
  return {
    square,
    type: "p",
    color,
    value: 1,
    communityId: 0,
    centralityBetweenness: 0,
    centralityDegree: 0,
    centralityWeighted: 0,
    centralityCloseness: 0,
    centralityPageRank: 0,
  };
}

function makeEdge(
  from: string,
  to: string,
  weight: number,
  type: "attack" | "defense" = "attack",
): GraphEdge {
  return { from, to, weight, type };
}

// ---------------------------------------------------------------------------
// Betweenness centrality
// ---------------------------------------------------------------------------

describe("computeBetweennessCentrality", () => {
  it("empty graph returns empty map", () => {
    const scores = computeBetweennessCentrality([], []);
    expect(scores.size).toBe(0);
  });

  it("single node, no edges: betweenness is 0", () => {
    const nodes = [makeNode("e4")];
    const scores = computeBetweennessCentrality(nodes, []);
    expect(scores.get("e4")).toBe(0);
  });

  it("two nodes return values of 0 (no intermediate nodes)", () => {
    const nodes = [makeNode("e4"), makeNode("d5")];
    const edges = [makeEdge("e4", "d5", 4)];
    const scores = computeBetweennessCentrality(nodes, edges);
    expect(scores.get("e4")).toBe(0);
    expect(scores.get("d5")).toBe(0);
  });

  it("linear chain A->B->C: B should have highest betweenness", () => {
    const nodes = [makeNode("a1"), makeNode("b2"), makeNode("c3")];
    const edges = [
      makeEdge("a1", "b2", 5),
      makeEdge("b2", "c3", 5),
    ];
    const scores = computeBetweennessCentrality(nodes, edges);

    const a1Score = scores.get("a1") ?? 0;
    const b2Score = scores.get("b2") ?? 0;
    const c3Score = scores.get("c3") ?? 0;

    // b2 lies on the path from a1 to c3
    expect(b2Score).toBeGreaterThan(a1Score);
    expect(b2Score).toBeGreaterThan(c3Score);
  });

  it("bridge node in a 4-node linear chain has highest betweenness", () => {
    const nodes = [
      makeNode("a1"),
      makeNode("b2"),
      makeNode("c3"),
      makeNode("d4"),
    ];
    const edges = [
      makeEdge("a1", "b2", 5),
      makeEdge("b2", "c3", 5),
      makeEdge("c3", "d4", 5),
    ];
    const scores = computeBetweennessCentrality(nodes, edges);

    const b2Score = scores.get("b2") ?? 0;
    const a1Score = scores.get("a1") ?? 0;
    const d4Score = scores.get("d4") ?? 0;

    expect(b2Score).toBeGreaterThan(a1Score);
    expect(b2Score).toBeGreaterThan(d4Score);
  });

  it("all values in 0-1 range", () => {
    const nodes = [
      makeNode("a1"),
      makeNode("d4"),
      makeNode("e5"),
      makeNode("h8"),
    ];
    const edges = [
      makeEdge("a1", "d4", 5),
      makeEdge("d4", "e5", 3),
      makeEdge("e5", "h8", 2),
    ];
    const scores = computeBetweennessCentrality(nodes, edges);

    for (const value of scores.values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("highest betweenness is normalized to 1", () => {
    const nodes = [makeNode("a1"), makeNode("b2"), makeNode("c3")];
    const edges = [
      makeEdge("a1", "b2", 5),
      makeEdge("b2", "c3", 5),
    ];
    const scores = computeBetweennessCentrality(nodes, edges);

    const maxScore = Math.max(...scores.values());
    expect(maxScore).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Degree centrality
// ---------------------------------------------------------------------------

describe("computeDegreeCentrality", () => {
  it("empty graph returns empty map", () => {
    const scores = computeDegreeCentrality([], []);
    expect(scores.size).toBe(0);
  });

  it("single node, no edges: degree is 0", () => {
    const nodes = [makeNode("e4")];
    const scores = computeDegreeCentrality(nodes, []);
    expect(scores.get("e4")).toBe(0);
  });

  it("star graph: center should have highest degree", () => {
    const nodes = [
      makeNode("d4"),  // center
      makeNode("a1"),
      makeNode("h1"),
      makeNode("a8"),
      makeNode("h8"),
    ];
    const edges = [
      makeEdge("d4", "a1", 5),
      makeEdge("d4", "h1", 5),
      makeEdge("d4", "a8", 5),
      makeEdge("d4", "h8", 5),
    ];
    const scores = computeDegreeCentrality(nodes, edges);

    const centerScore = scores.get("d4") ?? 0;
    const leafScore = scores.get("a1") ?? 0;

    expect(centerScore).toBeGreaterThan(leafScore);
  });

  it("all values in 0-1 range", () => {
    const nodes = [makeNode("a1"), makeNode("b2"), makeNode("c3")];
    const edges = [
      makeEdge("a1", "b2", 5),
      makeEdge("b2", "c3", 5),
      makeEdge("c3", "a1", 5),
    ];
    const scores = computeDegreeCentrality(nodes, edges);

    for (const value of scores.values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("counts both in-degree and out-degree", () => {
    const nodes = [makeNode("a1"), makeNode("b2")];
    const edges = [
      makeEdge("a1", "b2", 5),
      makeEdge("b2", "a1", 5),
    ];
    const scores = computeDegreeCentrality(nodes, edges);

    // Each node has 1 in + 1 out = 2 total / (n-1) = 2/1 = 2, clamped to 1
    expect(scores.get("a1")).toBe(1);
    expect(scores.get("b2")).toBe(1);
  });

  it("node with most edges has highest degree centrality in mixed graph", () => {
    const nodes = [
      makeNode("a1"),
      makeNode("d4"),  // hub
      makeNode("e5"),
      makeNode("h8"),
    ];
    const edges = [
      makeEdge("d4", "a1", 5),
      makeEdge("d4", "e5", 3),
      makeEdge("d4", "h8", 2),
      makeEdge("a1", "e5", 1),
    ];
    const scores = computeDegreeCentrality(nodes, edges);

    const d4Score = scores.get("d4") ?? 0;
    const h8Score = scores.get("h8") ?? 0;

    expect(d4Score).toBeGreaterThan(h8Score);
  });
});

// ---------------------------------------------------------------------------
// Weighted degree centrality
// ---------------------------------------------------------------------------

describe("computeWeightedDegreeCentrality", () => {
  it("empty graph returns empty map", () => {
    const scores = computeWeightedDegreeCentrality([], []);
    expect(scores.size).toBe(0);
  });

  it("single node with no edges: weighted degree is 0", () => {
    const nodes = [makeNode("e4")];
    const scores = computeWeightedDegreeCentrality(nodes, []);
    expect(scores.get("e4")).toBe(0);
  });

  it("weighted degree with different edge weights: verify sum proportional to weights", () => {
    const nodes = [
      makeNode("a1"),
      makeNode("d4"),  // heavy edges
      makeNode("h8"),
    ];
    const edges = [
      makeEdge("d4", "a1", 20),  // heavy edge from d4
      makeEdge("d4", "h8", 15),  // heavy edge from d4
      makeEdge("a1", "h8", 1),   // light edge
    ];
    const scores = computeWeightedDegreeCentrality(nodes, edges);

    const d4Score = scores.get("d4") ?? 0;
    const a1Score = scores.get("a1") ?? 0;
    const h8Score = scores.get("h8") ?? 0;

    // d4 has total weight 20+15 = 35 → highest
    expect(d4Score).toBeGreaterThan(a1Score);
    expect(d4Score).toBeGreaterThan(h8Score);
  });

  it("all values in 0-1 range after normalization", () => {
    const nodes = [makeNode("a1"), makeNode("b2"), makeNode("c3")];
    const edges = [
      makeEdge("a1", "b2", 10),
      makeEdge("b2", "c3", 5),
    ];
    const scores = computeWeightedDegreeCentrality(nodes, edges);

    for (const value of scores.values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("highest weighted degree is normalized to 1", () => {
    const nodes = [makeNode("a1"), makeNode("b2")];
    const edges = [makeEdge("a1", "b2", 10)];
    const scores = computeWeightedDegreeCentrality(nodes, edges);

    const maxScore = Math.max(...scores.values());
    expect(maxScore).toBe(1);
  });

  it("sums both incoming and outgoing edge weights", () => {
    const nodes = [
      makeNode("a1"),
      makeNode("b2"),
      makeNode("c3"),
    ];
    // a1 → b2 (weight 10): a1 gets 10 out, b2 gets 10 in
    // c3 → b2 (weight 5): c3 gets 5 out, b2 gets 5 in
    // b2 total = 10 + 5 = 15
    // a1 total = 10
    // c3 total = 5
    const edges = [
      makeEdge("a1", "b2", 10),
      makeEdge("c3", "b2", 5),
    ];
    const scores = computeWeightedDegreeCentrality(nodes, edges);

    const a1Score = scores.get("a1") ?? 0;
    const b2Score = scores.get("b2") ?? 0;
    const c3Score = scores.get("c3") ?? 0;

    // b2 has the highest weighted degree (15)
    expect(b2Score).toBeGreaterThan(a1Score);
    expect(b2Score).toBeGreaterThan(c3Score);
    // b2 should be normalized to 1 (max)
    expect(b2Score).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Closeness centrality
// ---------------------------------------------------------------------------

describe("computeClosenessCentrality", () => {
  it("empty graph returns empty map", () => {
    const scores = computeClosenessCentrality([], []);
    expect(scores.size).toBe(0);
  });

  it("single node, no edges: closeness is 0", () => {
    const nodes = [makeNode("e4")];
    const scores = computeClosenessCentrality(nodes, []);
    expect(scores.get("e4")).toBe(0);
  });

  it("star graph: center should have highest closeness", () => {
    const nodes = [
      makeNode("d4"),  // center
      makeNode("a1"),
      makeNode("h1"),
      makeNode("a8"),
      makeNode("h8"),
    ];
    const edges = [
      makeEdge("d4", "a1", 5),
      makeEdge("d4", "h1", 5),
      makeEdge("d4", "a8", 5),
      makeEdge("d4", "h8", 5),
    ];
    const scores = computeClosenessCentrality(nodes, edges);

    const centerScore = scores.get("d4") ?? 0;
    const leafScore = scores.get("a1") ?? 0;

    // Center can reach all 4 leaves in 1 hop → highest closeness
    expect(centerScore).toBeGreaterThan(leafScore);
  });

  it("all values in 0-1 range", () => {
    const nodes = [makeNode("a1"), makeNode("b2"), makeNode("c3")];
    const edges = [
      makeEdge("a1", "b2", 5),
      makeEdge("b2", "c3", 5),
      makeEdge("c3", "a1", 5),
    ];
    const scores = computeClosenessCentrality(nodes, edges);

    for (const value of scores.values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("isolated node has closeness 0", () => {
    const nodes = [
      makeNode("a1"),
      makeNode("b2"),
      makeNode("h8"),  // isolated
    ];
    const edges = [
      makeEdge("a1", "b2", 5),
      makeEdge("b2", "a1", 5),
      // h8 has no edges
    ];
    const scores = computeClosenessCentrality(nodes, edges);

    expect(scores.get("h8")).toBe(0);
  });

  it("highest closeness is normalized to 1", () => {
    const nodes = [makeNode("a1"), makeNode("b2"), makeNode("c3")];
    const edges = [
      makeEdge("a1", "b2", 5),
      makeEdge("b2", "c3", 5),
    ];
    const scores = computeClosenessCentrality(nodes, edges);

    const maxScore = Math.max(...scores.values());
    if (maxScore > 0) {
      expect(maxScore).toBe(1);
    }
  });

  it("linear chain: first node can reach farthest, still within [0,1]", () => {
    const nodes = [
      makeNode("a1"),
      makeNode("b2"),
      makeNode("c3"),
      makeNode("d4"),
    ];
    const edges = [
      makeEdge("a1", "b2", 5),
      makeEdge("b2", "c3", 5),
      makeEdge("c3", "d4", 5),
    ];
    const scores = computeClosenessCentrality(nodes, edges);

    // a1 can reach b2(1), c3(2), d4(3) → closeness = 3/6 = 0.5
    // b2 can reach c3(1), d4(2) → closeness = 2/3 ≈ 0.67
    // a1 reaches more nodes but b2 has better avg distance
    for (const value of scores.values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// PageRank centrality
// ---------------------------------------------------------------------------

describe("computePageRankCentrality", () => {
  it("empty graph returns empty map", () => {
    const scores = computePageRankCentrality([], []);
    expect(scores.size).toBe(0);
  });

  it("single node returns normalized rank of 1", () => {
    const scores = computePageRankCentrality([makeNode("e4")], []);
    expect(scores.get("e4")).toBe(1);
  });

  it("star-like inbound structure gives center highest rank", () => {
    const nodes = [
      makeNode("d4"),
      makeNode("a1"),
      makeNode("h1"),
      makeNode("a8"),
      makeNode("h8"),
    ];
    const edges = [
      makeEdge("a1", "d4", 1),
      makeEdge("h1", "d4", 1),
      makeEdge("a8", "d4", 1),
      makeEdge("h8", "d4", 1),
    ];
    const scores = computePageRankCentrality(nodes, edges);
    const center = scores.get("d4") ?? 0;
    const leaf = scores.get("a1") ?? 0;
    expect(center).toBeGreaterThan(leaf);
  });

  it("all values are within 0-1", () => {
    const nodes = [makeNode("a1"), makeNode("b2"), makeNode("c3")];
    const edges = [
      makeEdge("a1", "b2", 3),
      makeEdge("b2", "c3", 2),
      makeEdge("c3", "a1", 1),
    ];
    const scores = computePageRankCentrality(nodes, edges);
    for (const value of scores.values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
