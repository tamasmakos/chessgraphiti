/**
 * Leiden community detection for chess piece graphs.
 *
 * Implements the Leiden algorithm (Traag, Waltman & van Eck, 2019), which
 * guarantees well-connected communities — an improvement over Louvain that
 * can produce arbitrarily badly-connected communities.
 *
 * Three phases per iteration:
 * 1. **Local moving** — greedily reassign nodes to the neighboring community
 *    that maximises modularity gain.
 * 2. **Refinement** — split any internally-disconnected community via BFS,
 *    then re-merge small fragments when doing so improves modularity.
 *    This is Leiden's key improvement: every community is guaranteed to be
 *    a connected subgraph.
 * 3. **Aggregation** — collapse each community into a single super-node,
 *    sum inter-community edge weights, and repeat on the reduced graph.
 *
 * Directed chess-graph edges are treated as undirected for modularity
 * computation by summing weights in both directions.
 *
 * @module
 */
import type { GraphEdge, GraphNode } from "#types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum outer iterations before forced convergence. */
const MAX_ITERATIONS = 10;

/** Default resolution parameter — higher values yield more, smaller communities. */
const DEFAULT_RESOLUTION = 1.0;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/**
 * Symmetric weighted adjacency list.
 * For every node id, stores a map of neighbour id → total undirected weight.
 */
type Adjacency = Map<string, Map<string, number>>;

/** Node identifier → community identifier. */
type Partition = Map<string, number>;

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

/**
 * Build a symmetric (undirected) weighted adjacency map from directed edges.
 *
 * Each directed edge `(u → v, w)` adds `w` to both `adj[u][v]` and
 * `adj[v][u]`, so the resulting structure is always symmetric.
 */
function buildAdjacency(nodeIds: readonly string[], edges: readonly GraphEdge[]): Adjacency {
  const adj: Adjacency = new Map();
  for (const id of nodeIds) {
    adj.set(id, new Map());
  }
  for (const { from, to, weight } of edges) {
    const fwd = adj.get(from);
    const rev = adj.get(to);
    if (fwd) fwd.set(to, (fwd.get(to) ?? 0) + weight);
    if (rev) rev.set(from, (rev.get(from) ?? 0) + weight);
  }
  return adj;
}

/** Weighted degree of a single node (sum of all incident edge weights). */
function weightedDegree(adj: Adjacency, node: string): number {
  const neighbors = adj.get(node);
  if (!neighbors) return 0;
  let sum = 0;
  for (const w of neighbors.values()) sum += w;
  return sum;
}

/**
 * Total edge weight of the graph.
 *
 * Because the adjacency stores each undirected edge in both directions,
 * the raw sum of every entry is exactly twice the true total weight.
 */
function computeTotalWeight(adj: Adjacency): number {
  let sum = 0;
  for (const neighbors of adj.values()) {
    for (const w of neighbors.values()) sum += w;
  }
  return sum / 2;
}

// ---------------------------------------------------------------------------
// Partition helpers
// ---------------------------------------------------------------------------

/** Collect every node id that belongs to a given community. */
function communityMembers(partition: Partition, communityId: number): Set<string> {
  const members = new Set<string>();
  for (const [node, cid] of partition) {
    if (cid === communityId) members.add(node);
  }
  return members;
}

/** Distinct community ids present in the partition. */
function uniqueCommunityIds(partition: Partition): Set<number> {
  return new Set(partition.values());
}

/** Sum of weighted degrees for all nodes in `members`. */
function communityDegreeSum(adj: Adjacency, members: Set<string>): number {
  let sum = 0;
  for (const node of members) sum += weightedDegree(adj, node);
  return sum;
}

/**
 * Sum of edge weights from `node` to the nodes in `community`.
 * Self-edges (node appearing in `community`) are excluded — they do not
 * contribute to the modularity-gain calculation when moving a node.
 */
function edgesToCommunity(adj: Adjacency, node: string, community: Set<string>): number {
  const neighbors = adj.get(node);
  if (!neighbors) return 0;
  let sum = 0;
  for (const member of community) {
    if (member === node) continue;
    sum += neighbors.get(member) ?? 0;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Modularity gain
// ---------------------------------------------------------------------------

/**
 * Change in modularity when moving `node` from `oldMembers` into
 * `newMembers`.
 *
 * Derived from the standard modularity function Q:
 *
 * ```
 *   ΔQ = [ k(i,new) − k(i,old\{i}) ] / m
 *        − γ · k_i · [ Σ_new − Σ_{old\{i}} ] / (2m²)
 * ```
 *
 * where:
 *  - k(i, C) = sum of edge weights from node i to nodes in community C
 *  - k_i     = weighted degree of node i
 *  - Σ_C     = sum of weighted degrees of all nodes in community C
 *  - m       = total edge weight of the graph
 *  - γ       = resolution parameter
 */
function modularityDelta(
  adj: Adjacency,
  node: string,
  oldMembers: Set<string>,
  newMembers: Set<string>,
  m: number,
  resolution: number,
): number {
  if (m === 0) return 0;

  const ki = weightedDegree(adj, node);
  const kiNew = edgesToCommunity(adj, node, newMembers);
  const kiOld = edgesToCommunity(adj, node, oldMembers);

  const sigmaNew = communityDegreeSum(adj, newMembers);
  const sigmaOld = communityDegreeSum(adj, oldMembers) - ki; // Σ_{old \ {i}}

  return (kiNew - kiOld) / m - (resolution * ki * (sigmaNew - sigmaOld)) / (2 * m * m);
}

// ---------------------------------------------------------------------------
// Phase 1 — Local moving
// ---------------------------------------------------------------------------

/**
 * Greedily move each node to the neighbouring community that yields the
 * greatest positive modularity gain.  Iterates until no node changes
 * (convergence within the phase).
 *
 * Updates are applied immediately (not batched), so each subsequent node
 * sees the latest partition — matching the original Leiden specification.
 *
 * @returns `true` if at least one node changed community.
 */
function localMoving(
  nodeIds: readonly string[],
  adj: Adjacency,
  partition: Partition,
  resolution: number,
): boolean {
  const m = computeTotalWeight(adj);
  if (m === 0) return false;

  let anyChange = false;
  let improved = true;

  while (improved) {
    improved = false;

    for (const node of nodeIds) {
      const currentCid = partition.get(node);
      if (currentCid === undefined) continue;

      const currentMembers = communityMembers(partition, currentCid);

      // Neighbouring community ids (excluding the node's current community)
      const neighbourCids = new Set<number>();
      const neighbors = adj.get(node);
      if (neighbors) {
        for (const nbr of neighbors.keys()) {
          const nc = partition.get(nbr);
          if (nc !== undefined && nc !== currentCid) neighbourCids.add(nc);
        }
      }

      let bestGain = 0;
      let bestCid = currentCid;

      for (const candidateCid of neighbourCids) {
        const candidateMembers = communityMembers(partition, candidateCid);
        const gain = modularityDelta(adj, node, currentMembers, candidateMembers, m, resolution);
        if (gain > bestGain) {
          bestGain = gain;
          bestCid = candidateCid;
        }
      }

      if (bestCid !== currentCid) {
        partition.set(node, bestCid);
        improved = true;
        anyChange = true;
      }
    }
  }

  return anyChange;
}

// ---------------------------------------------------------------------------
// Phase 2 — Refinement (Leiden-specific)
// ---------------------------------------------------------------------------

/**
 * Guarantee that every community in the partition is *internally connected*.
 *
 * **Step 1 — Split disconnected communities.**
 * For each community, run BFS to find connected components in the subgraph
 * induced by the community's members.  If more than one component exists,
 * assign fresh community ids to the extra components.
 *
 * **Step 2 — Re-merge small fragments.**
 * Communities of size ≤ 2 (typically created by the split) are candidates
 * for merging into a neighbouring community when doing so yields a positive
 * modularity gain.
 *
 * After refinement every community is a connected subgraph — this is the
 * key property that distinguishes Leiden from Louvain.
 */
function refinement(
  nodeIds: readonly string[],
  adj: Adjacency,
  partition: Partition,
  resolution: number,
): void {
  // --- Step 1: split disconnected communities ---------------------------------

  let nextId = 0;
  for (const cid of uniqueCommunityIds(partition)) {
    if (cid >= nextId) nextId = cid + 1;
  }

  for (const cid of [...uniqueCommunityIds(partition)]) {
    const members = communityMembers(partition, cid);
    if (members.size <= 1) continue;

    const components = connectedComponents(members, adj);
    if (components.length <= 1) continue;

    // First component keeps the original id; extras receive fresh ids.
    for (let i = 1; i < components.length; i++) {
      const comp = components[i];
      if (!comp) continue;
      for (const node of comp) {
        partition.set(node, nextId);
      }
      nextId++;
    }
  }

  // --- Step 2: re-merge tiny fragments ----------------------------------------

  const m = computeTotalWeight(adj);
  if (m === 0) return;

  for (const node of nodeIds) {
    const cid = partition.get(node);
    if (cid === undefined) continue;

    const members = communityMembers(partition, cid);
    if (members.size > 2) continue;

    const neighbors = adj.get(node);
    if (!neighbors) continue;

    const neighbourCids = new Set<number>();
    for (const nbr of neighbors.keys()) {
      const nc = partition.get(nbr);
      if (nc !== undefined && nc !== cid) neighbourCids.add(nc);
    }

    let bestGain = 0;
    let bestCid = cid;

    for (const candidateCid of neighbourCids) {
      const candidateMembers = communityMembers(partition, candidateCid);
      const gain = modularityDelta(adj, node, members, candidateMembers, m, resolution);
      if (gain > bestGain) {
        bestGain = gain;
        bestCid = candidateCid;
      }
    }

    if (bestCid !== cid) partition.set(node, bestCid);
  }
}

/**
 * Find connected components within a subset of nodes via BFS.
 * Only edges whose *both* endpoints belong to `members` are traversed.
 */
function connectedComponents(members: Set<string>, adj: Adjacency): Set<string>[] {
  const visited = new Set<string>();
  const components: Set<string>[] = [];

  for (const start of members) {
    if (visited.has(start)) continue;

    const component = new Set<string>();
    const queue: string[] = [start];
    visited.add(start);

    while (queue.length > 0) {
      // queue is non-empty so shift() always returns a string
      const current = queue.shift()!;
      component.add(current);

      const neighbors = adj.get(current);
      if (neighbors) {
        for (const nbr of neighbors.keys()) {
          if (members.has(nbr) && !visited.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        }
      }
    }

    components.push(component);
  }

  return components;
}

// ---------------------------------------------------------------------------
// Phase 3 — Aggregation
// ---------------------------------------------------------------------------

/** Result of collapsing a partition into a smaller super-node graph. */
interface AggregationResult {
  /** Adjacency map for the aggregated graph. */
  adj: Adjacency;
  /** Super-node identifiers. */
  nodeIds: string[];
  /** Mapping from each super-node id to the original node ids it contains. */
  superToOriginals: Map<string, string[]>;
}

/**
 * Collapse each community into a single super-node and sum
 * inter-community edge weights.
 *
 * Intra-community (internal) edges are collapsed into self-loops on the
 * super-node. Keeping this mass is critical for stable modularity optimization
 * across hierarchy levels.
 *
 * @returns The aggregated graph, or `null` if every node is already its
 *          own community (nothing to aggregate).
 */
function aggregate(adj: Adjacency, partition: Partition): AggregationResult | null {
  // Group nodes by community id
  const cidToMembers = new Map<number, string[]>();
  for (const [node, cid] of partition) {
    let list = cidToMembers.get(cid);
    if (!list) {
      list = [];
      cidToMembers.set(cid, list);
    }
    list.push(node);
  }

  // If every node is its own community there is nothing to aggregate.
  if (cidToMembers.size === partition.size) return null;

  // Assign deterministic string ids to super-nodes
  const superToOriginals = new Map<string, string[]>();
  const nodeToSuper = new Map<string, string>();
  const superNodeIds: string[] = [];

  let idx = 0;
  for (const [, members] of cidToMembers) {
    const superId = `s${idx}`;
    superNodeIds.push(superId);
    superToOriginals.set(superId, members);
    for (const m of members) nodeToSuper.set(m, superId);
    idx++;
  }

  // Build aggregated adjacency, preserving intra-community mass as self-loops.
  // `adj` is symmetric, so we only process each undirected edge once.
  const newAdj: Adjacency = new Map();
  for (const id of superNodeIds) newAdj.set(id, new Map());

  for (const [node, neighbors] of adj) {
    const fromSuper = nodeToSuper.get(node);
    if (!fromSuper) continue;

    for (const [nbr, w] of neighbors) {
      // Symmetric adjacency stores each undirected edge twice; keep one side.
      if (node > nbr) continue;

      const toSuper = nodeToSuper.get(nbr);
      if (!toSuper) continue;

      if (fromSuper === toSuper) {
        // `computeTotalWeight()` divides by 2. To preserve internal community
        // mass, self-loops must be stored with doubled weight.
        const selfNeighbors = newAdj.get(fromSuper);
        if (selfNeighbors) {
          selfNeighbors.set(fromSuper, (selfNeighbors.get(fromSuper) ?? 0) + 2 * w);
        }
        continue;
      }

      const fromNeighbors = newAdj.get(fromSuper);
      const toNeighbors = newAdj.get(toSuper);
      if (fromNeighbors) {
        fromNeighbors.set(toSuper, (fromNeighbors.get(toSuper) ?? 0) + w);
      }
      if (toNeighbors) {
        toNeighbors.set(fromSuper, (toNeighbors.get(fromSuper) ?? 0) + w);
      }
    }
  }

  return { adj: newAdj, nodeIds: superNodeIds, superToOriginals };
}

// ---------------------------------------------------------------------------
// ID normalisation
// ---------------------------------------------------------------------------

/**
 * Re-map community ids to sequential integers starting from 0.
 *
 * Communities are ordered by the lexicographically smallest member square
 * to ensure deterministic output regardless of internal numbering.
 */
function normalizeIds(partition: Partition): Map<string, number> {
  const groups = new Map<number, string[]>();
  for (const [node, cid] of partition) {
    let list = groups.get(cid);
    if (!list) {
      list = [];
      groups.set(cid, list);
    }
    list.push(node);
  }

  // Sort groups by their lexicographically smallest member square
  const sorted = [...groups.entries()].sort((a, b) => {
    const aMin = [...a[1]].sort()[0] ?? "";
    const bMin = [...b[1]].sort()[0] ?? "";
    return aMin.localeCompare(bMin);
  });

  const result = new Map<string, number>();
  let newId = 0;
  for (const [, members] of sorted) {
    for (const node of members) result.set(node, newId);
    newId++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect communities in a chess piece graph using the Leiden algorithm.
 *
 * The algorithm iterates through local moving, refinement, and aggregation
 * phases until the partition converges or {@link MAX_ITERATIONS} is reached.
 *
 * Directed edges are treated as undirected for the modularity computation
 * (weights are summed in both directions).
 *
 * @param nodes - Graph nodes (chess pieces with square positions).
 * @param edges - Weighted directed edges (attack / defence relationships).
 * @param resolution - Controls community granularity (default `1.0`).
 *   Higher values produce more, smaller communities; lower values produce
 *   fewer, larger communities.
 * @returns `Map<square, communityId>` where community ids are sequential
 *   integers starting from 0.
 *
 * @example
 * ```ts
 * const communities = detectCommunities(nodes, edges);
 * // Map { "e4" => 0, "d5" => 1, "f3" => 0, ... }
 * ```
 */
export function detectCommunities(
  nodes: GraphNode[],
  edges: GraphEdge[],
  resolution: number = DEFAULT_RESOLUTION,
): Map<string, number> {
  const nodeIds = nodes.map((n) => n.square);

  // --- Trivial cases ---

  if (nodeIds.length === 0) return new Map<string, number>();

  if (nodeIds.length === 1) {
    const single = nodeIds[0];
    if (single === undefined) return new Map<string, number>();
    return new Map<string, number>([[single, 0]]);
  }

  if (edges.length === 0) {
    // No edges → each node is its own community
    const result = new Map<string, number>();
    for (let i = 0; i < nodeIds.length; i++) {
      const id = nodeIds[i];
      if (id !== undefined) result.set(id, i);
    }
    return normalizeIds(result);
  }

  // --- Main algorithm ---

  let currentAdj = buildAdjacency(nodeIds, edges);
  let currentNodeIds: string[] = [...nodeIds];

  // Singleton initialisation: every node starts in its own community
  let partition: Partition = new Map();
  for (let i = 0; i < currentNodeIds.length; i++) {
    const id = currentNodeIds[i];
    if (id !== undefined) partition.set(id, i);
  }

  // Track the mapping from current-level nodes back to the original squares.
  // Initially each original node maps to itself.
  let nodeToOriginals = new Map<string, string[]>();
  for (const id of nodeIds) {
    nodeToOriginals.set(id, [id]);
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Phase 1 — local moving
    const moved = localMoving(currentNodeIds, currentAdj, partition, resolution);
    if (!moved) break;

    // Phase 2 — refinement (guarantee connected communities)
    refinement(currentNodeIds, currentAdj, partition, resolution);

    // Phase 3 — aggregation
    const agg = aggregate(currentAdj, partition);
    if (!agg) break; // every node is already its own community

    // Thread the original-node mapping through the aggregation layer
    const updatedMapping = new Map<string, string[]>();
    for (const [superId, memberIds] of agg.superToOriginals) {
      const originals: string[] = [];
      for (const mid of memberIds) {
        const prev = nodeToOriginals.get(mid);
        if (prev) originals.push(...prev);
        else originals.push(mid);
      }
      updatedMapping.set(superId, originals);
    }
    nodeToOriginals = updatedMapping;

    // Advance to the aggregated graph with a fresh singleton partition
    currentAdj = agg.adj;
    currentNodeIds = agg.nodeIds;
    partition = new Map();
    for (let i = 0; i < currentNodeIds.length; i++) {
      const id = currentNodeIds[i];
      if (id !== undefined) partition.set(id, i);
    }
  }

  // --- Flatten back to original node ids ---

  const flat: Partition = new Map();
  for (const [superNode, cid] of partition) {
    const originals = nodeToOriginals.get(superNode) ?? [superNode];
    for (const orig of originals) flat.set(orig, cid);
  }

  return normalizeIds(flat);
}
