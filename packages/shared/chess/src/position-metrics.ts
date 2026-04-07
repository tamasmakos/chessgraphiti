/**
 * Position-level graph metrics: Fragility and Strategic Tension.
 *
 * Both are derived purely from the nodes and edges of a single GraphSnapshot
 * and return a `{ white, black }` pair normalized to [0, 1].
 *
 * ## Position Fragility
 * Measures how much structural collapse pressure a player is imposing on the
 * opponent. For each enemy piece, net undefended attack weight is scaled by
 * its betweenness centrality — pinning down a bridging queen is worth far
 * more than threatening a defended pawn. Higher score = you are pressing.
 *
 * ## Strategic Tension
 * Measures the total threat-network pressure a player maintains.
 * Combines SEE-weighted attack reach and mutual-threat loop bonuses
 * (pieces threatening each other simultaneously). The SEE weight already
 * encodes material value, so no separate material term is needed.
 *
 * @module
 */
import type { GraphEdge, GraphNode } from "#types";

export interface PositionScore {
  white: number;
  black: number;
}

function normalizePair(white: number, black: number): PositionScore {
  const max = Math.max(white, black);
  if (max <= 0) return { white: 0, black: 0 };
  return { white: white / max, black: black / max };
}

/**
 * Compute position fragility for each side.
 *
 * For every piece P owned by color C:
 *   netPressure(P) = totalAttackWeightIn(P) − totalDefenseWeightIn(P)
 *   fragility(P)   = max(0, netPressure) × (1 + betweennessCentrality(P))
 *
 * Fragility of an OPPONENT's piece is credited to the ATTACKING side, so
 * `positionFragility.white` = the fragility pressure white is imposing on
 * black's pieces (higher = white is pressing harder). This keeps the same
 * display convention as all other metrics: bigger bar = stronger position.
 */
export function computePositionFragility(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): PositionScore {
  const attackIn = new Map<string, number>();
  const defenseIn = new Map<string, number>();

  for (const node of nodes) {
    attackIn.set(node.square, 0);
    defenseIn.set(node.square, 0);
  }

  for (const edge of edges) {
    if (edge.type === "attack") {
      attackIn.set(edge.to, (attackIn.get(edge.to) ?? 0) + edge.weight);
    } else {
      defenseIn.set(edge.to, (defenseIn.get(edge.to) ?? 0) + edge.weight);
    }
  }

  let whiteRaw = 0;
  let blackRaw = 0;

  for (const node of nodes) {
    const netPressure = (attackIn.get(node.square) ?? 0) - (defenseIn.get(node.square) ?? 0);
    if (netPressure <= 0) continue;
    const fragility = netPressure * (1 + node.centralityBetweenness);
    // Credit the OPPONENT of the fragile piece: their pressure caused this.
    if (node.color === "b") {
      whiteRaw += fragility;
    } else {
      blackRaw += fragility;
    }
  }

  return normalizePair(whiteRaw, blackRaw);
}

/**
 * Compute strategic tension for each side.
 *
 * For every attack edge sourced by color C:
 *   - attackReach:   sum of SEE edge weights (already encodes attacker + target
 *                    value minus defender cost — no separate materialAtStake
 *                    term to avoid double-counting the target piece value)
 *   - mutualLoops:   count of reciprocal threat pairs (A→B and B→A both exist)
 *
 * rawTension(C) = attackReach + 2 × mutualLoops
 *
 * Normalized so the higher-tension side is 1.0.
 */
export function computeStrategicTension(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): PositionScore {
  const nodeBySquare = new Map<string, GraphNode>();
  for (const node of nodes) {
    nodeBySquare.set(node.square, node);
  }

  const attackSet = new Set<string>();
  const attackEdges: GraphEdge[] = [];
  for (const edge of edges) {
    if (edge.type === "attack") {
      attackEdges.push(edge);
      attackSet.add(`${edge.from}\u2192${edge.to}`);
    }
  }

  let whiteReach = 0;
  let blackReach = 0;
  let whiteLoops = 0;
  let blackLoops = 0;

  for (const edge of attackEdges) {
    const attacker = nodeBySquare.get(edge.from);
    if (!attacker) continue;

    const isMutual = attackSet.has(`${edge.to}\u2192${edge.from}`);

    if (attacker.color === "w") {
      whiteReach += edge.weight;
      if (isMutual) whiteLoops += 1;
    } else {
      blackReach += edge.weight;
      if (isMutual) blackLoops += 1;
    }
  }

  const rawWhite = whiteReach + 2 * whiteLoops;
  const rawBlack = blackReach + 2 * blackLoops;

  return normalizePair(rawWhite, rawBlack);
}
