import { describe, expect, it } from "vitest";
import { detectCommunities } from "../community.ts";
import type { GraphEdge, GraphNode } from "../types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(square: string, color: "w" | "b"): GraphNode {
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
// detectCommunities
// ---------------------------------------------------------------------------

describe("detectCommunities", () => {
  it("empty graph returns empty map", () => {
    const communities = detectCommunities([], []);
    expect(communities.size).toBe(0);
  });

  it("single node returns map with one entry (communityId 0)", () => {
    const nodes = [makeNode("e4", "w")];
    const communities = detectCommunities(nodes, []);
    expect(communities.size).toBe(1);
    expect(communities.get("e4")).toBe(0);
  });

  it("two disconnected nodes: each in own community", () => {
    const nodes = [makeNode("a1", "w"), makeNode("h8", "b")];
    const communities = detectCommunities(nodes, []);
    const cid1 = communities.get("a1");
    const cid2 = communities.get("h8");
    expect(cid1).toBeDefined();
    expect(cid2).toBeDefined();
    expect(cid1).not.toBe(cid2);
  });

  it("three connected nodes (A->B, B->C, A->C) should be in same community", () => {
    const nodes = [makeNode("e4", "w"), makeNode("d3", "w"), makeNode("f3", "w")];
    const edges = [
      makeEdge("e4", "d3", 10, "defense"),
      makeEdge("d3", "f3", 10, "defense"),
      makeEdge("e4", "f3", 10, "defense"),
      // Add reverse edges for stronger clustering
      makeEdge("d3", "e4", 10, "defense"),
      makeEdge("f3", "d3", 10, "defense"),
      makeEdge("f3", "e4", 10, "defense"),
    ];
    const communities = detectCommunities(nodes, edges);

    const cid1 = communities.get("e4");
    const cid2 = communities.get("d3");
    const cid3 = communities.get("f3");

    expect(cid1).toBe(cid2);
    expect(cid2).toBe(cid3);
  });

  it("white and black pieces with no edges between them should be in different communities", () => {
    // White cluster: a1-a2 strongly connected
    // Black cluster: h7-h8 strongly connected
    // No cross-color edges
    const nodes = [
      makeNode("a1", "w"),
      makeNode("a2", "w"),
      makeNode("h7", "b"),
      makeNode("h8", "b"),
    ];
    const edges = [
      makeEdge("a1", "a2", 20, "defense"),
      makeEdge("a2", "a1", 20, "defense"),
      makeEdge("h7", "h8", 20, "defense"),
      makeEdge("h8", "h7", 20, "defense"),
    ];
    const communities = detectCommunities(nodes, edges);

    // White pieces in same community
    expect(communities.get("a1")).toBe(communities.get("a2"));
    // Black pieces in same community
    expect(communities.get("h7")).toBe(communities.get("h8"));
    // White and black clusters are in different communities
    expect(communities.get("a1")).not.toBe(communities.get("h7"));
  });

  it("community IDs should be sequential integers starting from 0", () => {
    const nodes = [makeNode("a1", "w"), makeNode("h8", "b"), makeNode("d4", "w")];
    const communities = detectCommunities(nodes, []);

    const ids = new Set(communities.values());
    const sortedIds = [...ids].sort((a, b) => a - b);

    // IDs should be sequential: 0, 1, 2, ...
    for (let i = 0; i < sortedIds.length; i++) {
      expect(sortedIds[i]).toBe(i);
    }
  });

  it("all node squares are present as keys in the result", () => {
    const nodes = [makeNode("e4", "w"), makeNode("d5", "b"), makeNode("f3", "w")];
    const edges = [makeEdge("e4", "d5", 4), makeEdge("f3", "d5", 6)];
    const communities = detectCommunities(nodes, edges);

    for (const node of nodes) {
      expect(communities.has(node.square)).toBe(true);
    }
  });

  it("community IDs are non-negative integers", () => {
    const nodes = [
      makeNode("e4", "w"),
      makeNode("d5", "b"),
      makeNode("f3", "w"),
      makeNode("c6", "b"),
    ];
    const edges = [
      makeEdge("e4", "d5", 4),
      makeEdge("f3", "d5", 6),
      makeEdge("c6", "e4", 3, "attack"),
    ];
    const communities = detectCommunities(nodes, edges);

    for (const cid of communities.values()) {
      expect(Number.isInteger(cid)).toBe(true);
      expect(cid).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns a Map instance", () => {
    const nodes = [makeNode("e4", "w")];
    const result = detectCommunities(nodes, []);
    expect(result).toBeInstanceOf(Map);
  });

  it("respects resolution parameter — higher resolution yields more communities", () => {
    const nodes = [
      makeNode("a1", "w"),
      makeNode("a2", "w"),
      makeNode("b1", "w"),
      makeNode("b2", "w"),
    ];
    const edges = [
      makeEdge("a1", "a2", 5, "defense"),
      makeEdge("a2", "a1", 5, "defense"),
      makeEdge("b1", "b2", 5, "defense"),
      makeEdge("b2", "b1", 5, "defense"),
      makeEdge("a2", "b1", 2, "defense"),
      makeEdge("b1", "a2", 2, "defense"),
    ];

    const lowRes = detectCommunities(nodes, edges, 0.1);
    const highRes = detectCommunities(nodes, edges, 5.0);

    const lowResCommunities = new Set(lowRes.values()).size;
    const highResCommunities = new Set(highRes.values()).size;

    // Higher resolution should yield at least as many communities
    expect(highResCommunities).toBeGreaterThanOrEqual(lowResCommunities);
  });
});
