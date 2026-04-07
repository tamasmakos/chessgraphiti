/**
 * Centrality metrics for chess piece graphs.
 *
 * Computes four centrality measures over a directed graph of chess pieces:
 * - Betweenness centrality (Brandes' algorithm, O(VE))
 * - Degree centrality (in + out degree, normalized)
 * - Weighted degree centrality (sum of incident edge weights, normalized)
 * - Closeness centrality (inverse sum of shortest path distances, normalized)
 *
 * All functions return `Map<string, number>` keyed by square (e.g., "e4")
 * with values normalized to the 0-1 range.
 */
import type { GraphEdge, GraphNode } from "#types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build an adjacency list (from → [{ to, weight }]) from directed edges. */
function buildAdjacencyList(
  edges: readonly GraphEdge[],
): Map<string, { to: string; weight: number }[]> {
  const adj = new Map<string, { to: string; weight: number }[]>();
  for (const edge of edges) {
    let neighbors = adj.get(edge.from);
    if (!neighbors) {
      neighbors = [];
      adj.set(edge.from, neighbors);
    }
    neighbors.push({ to: edge.to, weight: edge.weight });
  }
  return adj;
}

/**
 * Normalize a map of raw scores to the 0-1 range by dividing by the max value.
 * If max is 0 (or there are no entries), all values remain 0.
 */
function normalizeByMax(scores: Map<string, number>): void {
  let max = 0;
  for (const v of scores.values()) {
    if (v > max) max = v;
  }
  if (max > 0) {
    for (const [key, v] of scores) {
      scores.set(key, v / max);
    }
  }
}

// ---------------------------------------------------------------------------
// Betweenness centrality — Brandes' algorithm
// ---------------------------------------------------------------------------

/**
 * Compute betweenness centrality for every node using Brandes' algorithm.
 *
 * Betweenness centrality measures how often a piece lies on the shortest
 * directed path between two other pieces. A high betweenness score indicates
 * a positionally critical piece that bridges regions of the board.
 *
 * Edges are treated as **directed** (from → to). Shortest paths are computed
 * via BFS (unweighted hop count). The final scores are normalized to 0-1 by
 * dividing by the maximum observed value.
 *
 * Complexity: O(V × E) — much faster than Floyd–Warshall O(V³) for the
 * sparse graphs typical of chess positions (≤ 32 nodes, ≤ ~100 edges).
 *
 * @param nodes - Graph nodes (pieces on the board)
 * @param edges - Directed graph edges (attack/defense relationships)
 * @returns Map from square to betweenness centrality in [0, 1]
 */
export function computeBetweennessCentrality(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): Map<string, number> {
  const scores = new Map<string, number>();

  // Initialize all nodes to 0
  for (const node of nodes) {
    scores.set(node.square, 0);
  }

  // Early exit: nothing to compute for 0-2 nodes
  if (nodes.length <= 2) return scores;

  const adj = buildAdjacencyList(edges);
  const squares = nodes.map((n) => n.square);

  // Run BFS from every source node (Brandes' algorithm)
  for (const source of squares) {
    // Stack of nodes in order of non-increasing distance from source
    const stack: string[] = [];

    // Predecessors on shortest paths
    const predecessors = new Map<string, string[]>();
    for (const sq of squares) {
      predecessors.set(sq, []);
    }

    // Number of shortest paths from source to each node
    const sigma = new Map<string, number>();
    for (const sq of squares) {
      sigma.set(sq, 0);
    }
    sigma.set(source, 1);

    // Distance from source (-1 = unvisited)
    const dist = new Map<string, number>();
    for (const sq of squares) {
      dist.set(sq, -1);
    }
    dist.set(source, 0);

    // BFS queue
    const queue: string[] = [source];
    let queueHead = 0;

    while (queueHead < queue.length) {
      const v = queue[queueHead++];
      if (v === undefined) break;
      stack.push(v);

      const vDist = dist.get(v) ?? -1;
      const vSigma = sigma.get(v) ?? 0;
      const neighbors = adj.get(v) ?? [];

      for (const { to: w } of neighbors) {
        // w discovered for the first time?
        const wDist = dist.get(w);
        if (wDist === undefined) continue; // w not in our node set
        if (wDist === -1) {
          dist.set(w, vDist + 1);
          queue.push(w);
        }

        // Shortest path to w via v?
        const currentWDist = dist.get(w) ?? -1;
        if (currentWDist === vDist + 1) {
          const wSigma = sigma.get(w) ?? 0;
          sigma.set(w, wSigma + vSigma);
          const preds = predecessors.get(w);
          if (preds) {
            preds.push(v);
          }
        }
      }
    }

    // Back-propagation of dependencies
    const delta = new Map<string, number>();
    for (const sq of squares) {
      delta.set(sq, 0);
    }

    while (stack.length > 0) {
      const w = stack.pop();
      if (w === undefined) break;

      const preds = predecessors.get(w) ?? [];
      const wSigma = sigma.get(w) ?? 1;
      const wDelta = delta.get(w) ?? 0;

      for (const v of preds) {
        const vSigma = sigma.get(v) ?? 1;
        const vDelta = delta.get(v) ?? 0;
        const contribution = (vSigma / wSigma) * (1 + wDelta);
        delta.set(v, vDelta + contribution);
      }

      if (w !== source) {
        const current = scores.get(w) ?? 0;
        scores.set(w, current + wDelta);
      }
    }
  }

  // Normalize to 0-1
  normalizeByMax(scores);
  return scores;
}

// ---------------------------------------------------------------------------
// Degree centrality
// ---------------------------------------------------------------------------

/**
 * Compute degree centrality for every node.
 *
 * Degree centrality counts the total number of edges incident to a piece
 * (both incoming and outgoing, since edges are directed). It is normalized
 * by (n - 1) where n is the number of nodes, then clamped to [0, 1].
 *
 * A high degree centrality indicates a very active piece with many
 * attack/defense relationships.
 *
 * @param nodes - Graph nodes (pieces on the board)
 * @param edges - Directed graph edges
 * @returns Map from square to degree centrality in [0, 1]
 */
export function computeDegreeCentrality(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): Map<string, number> {
  const scores = new Map<string, number>();
  const n = nodes.length;

  // Initialize all nodes to 0
  for (const node of nodes) {
    scores.set(node.square, 0);
  }

  // Early exit: single node or empty graph
  if (n <= 1) return scores;

  // Count in-degree + out-degree
  for (const edge of edges) {
    // Out-degree for the source
    const fromScore = scores.get(edge.from);
    if (fromScore !== undefined) {
      scores.set(edge.from, fromScore + 1);
    }

    // In-degree for the target
    const toScore = scores.get(edge.to);
    if (toScore !== undefined) {
      scores.set(edge.to, toScore + 1);
    }
  }

  // Normalize by (n - 1) and clamp to [0, 1]
  const divisor = n - 1;
  for (const [key, value] of scores) {
    scores.set(key, Math.min(1, value / divisor));
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Weighted degree centrality
// ---------------------------------------------------------------------------

/**
 * Compute weighted degree centrality for every node.
 *
 * Weighted degree centrality sums the weights of all incident edges
 * (both incoming and outgoing) for each node. This captures not just
 * how many relationships a piece has, but how significant those
 * relationships are (e.g., attacking an undefended queen vs. a defended pawn).
 *
 * Normalized to 0-1 by dividing by the maximum observed value.
 *
 * @param nodes - Graph nodes (pieces on the board)
 * @param edges - Directed graph edges with weights
 * @returns Map from square to weighted degree centrality in [0, 1]
 */
export function computeWeightedDegreeCentrality(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): Map<string, number> {
  const scores = new Map<string, number>();

  // Initialize all nodes to 0
  for (const node of nodes) {
    scores.set(node.square, 0);
  }

  // Sum incident edge weights
  for (const edge of edges) {
    // Outgoing edge weight for the source
    const fromScore = scores.get(edge.from);
    if (fromScore !== undefined) {
      scores.set(edge.from, fromScore + edge.weight);
    }

    // Incoming edge weight for the target
    const toScore = scores.get(edge.to);
    if (toScore !== undefined) {
      scores.set(edge.to, toScore + edge.weight);
    }
  }

  // Normalize to 0-1
  normalizeByMax(scores);
  return scores;
}

// ---------------------------------------------------------------------------
// PageRank centrality
// ---------------------------------------------------------------------------

/**
 * Compute PageRank centrality for every node.
 *
 * Uses weighted directed edges as transition probabilities with damping.
 * Scores are normalized to 0-1 by dividing by the maximum value.
 */
export function computePageRankCentrality(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  damping = 0.85,
  maxIterations = 50,
  tolerance = 1e-6,
): Map<string, number> {
  const scores = new Map<string, number>();
  const n = nodes.length;
  if (n === 0) return scores;

  const nodeSet = new Set(nodes.map((node) => node.square));
  const outgoingWeight = new Map<string, number>();
  const incoming = new Map<string, Array<{ from: string; weight: number }>>();

  for (const node of nodes) {
    scores.set(node.square, 1 / n);
    outgoingWeight.set(node.square, 0);
    incoming.set(node.square, []);
  }

  for (const edge of edges) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) continue;
    outgoingWeight.set(edge.from, (outgoingWeight.get(edge.from) ?? 0) + edge.weight);
    const entries = incoming.get(edge.to);
    if (entries) entries.push({ from: edge.from, weight: edge.weight });
  }

  const base = (1 - damping) / n;
  for (let iter = 0; iter < maxIterations; iter++) {
    const next = new Map<string, number>();
    let danglingMass = 0;

    for (const node of nodes) {
      const out = outgoingWeight.get(node.square) ?? 0;
      if (out <= 0) {
        danglingMass += scores.get(node.square) ?? 0;
      }
    }

    let totalDelta = 0;
    for (const node of nodes) {
      let rank = base + damping * (danglingMass / n);
      const inc = incoming.get(node.square) ?? [];
      for (const { from, weight } of inc) {
        const out = outgoingWeight.get(from) ?? 0;
        if (out > 0) {
          rank += (damping * ((scores.get(from) ?? 0) * weight)) / out;
        }
      }
      next.set(node.square, rank);
      totalDelta += Math.abs(rank - (scores.get(node.square) ?? 0));
    }

    for (const node of nodes) {
      scores.set(node.square, next.get(node.square) ?? 0);
    }

    if (totalDelta < tolerance) break;
  }

  normalizeByMax(scores);
  return scores;
}

// ---------------------------------------------------------------------------
// Closeness centrality
// ---------------------------------------------------------------------------

/**
 * Compute closeness centrality for every node.
 *
 * Closeness centrality measures how close a piece is to all other reachable
 * pieces in the directed graph. For each node, it is computed as:
 *
 *   closeness(v) = (number of reachable nodes from v) / (sum of shortest distances to reachable nodes)
 *
 * This variant (sometimes called "harmonic-adjacent" or "Wasserman-Faust")
 * handles disconnected components gracefully: if no nodes are reachable,
 * closeness is 0 rather than undefined.
 *
 * Shortest paths are measured by BFS (unweighted hop count). The final
 * scores are normalized to 0-1 by dividing by the maximum observed value.
 *
 * @param nodes - Graph nodes (pieces on the board)
 * @param edges - Directed graph edges
 * @returns Map from square to closeness centrality in [0, 1]
 */
export function computeClosenessCentrality(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): Map<string, number> {
  const scores = new Map<string, number>();

  // Initialize all nodes to 0
  for (const node of nodes) {
    scores.set(node.square, 0);
  }

  // Early exit: 0-1 nodes have closeness 0 (no paths exist)
  if (nodes.length <= 1) return scores;

  const adj = buildAdjacencyList(edges);
  const nodeSet = new Set(nodes.map((n) => n.square));

  for (const node of nodes) {
    const source = node.square;

    // BFS from source
    const dist = new Map<string, number>();
    dist.set(source, 0);
    const queue: string[] = [source];
    let queueHead = 0;

    while (queueHead < queue.length) {
      const v = queue[queueHead++];
      if (v === undefined) break;

      const vDist = dist.get(v) ?? 0;
      const neighbors = adj.get(v) ?? [];

      for (const { to: w } of neighbors) {
        // Only consider nodes in our graph and unvisited
        if (!nodeSet.has(w)) continue;
        if (dist.has(w)) continue;

        dist.set(w, vDist + 1);
        queue.push(w);
      }
    }

    // Compute closeness: reachable / totalDist
    let reachable = 0;
    let totalDist = 0;
    for (const [sq, d] of dist) {
      if (sq !== source && d > 0) {
        reachable++;
        totalDist += d;
      }
    }

    if (reachable > 0 && totalDist > 0) {
      scores.set(source, reachable / totalDist);
    }
  }

  // Normalize to 0-1
  normalizeByMax(scores);
  return scores;
}
