import type { GraphEdge, GraphNode, GraphSnapshot } from "#types";

export type CommunityEventType = "persist" | "split" | "merge" | "emerge" | "dissolve";

export interface CommunityLink {
  fromCommunityId: number;
  toCommunityId: number;
  sharedSquares: string[];
  overlapWeight: number;
  jaccard: number;
}

export interface CommunityEvent {
  type: CommunityEventType;
  fromCommunityIds: number[];
  toCommunityIds: number[];
  strength: number;
}

export interface StepStoryMetrics {
  continuity: number;
  churn: number;
  modularityDelta: number;
}

export interface CommunityTransition {
  stepIndex: number;
  links: CommunityLink[];
  events: CommunityEvent[];
  changedSquares: string[];
  metrics: StepStoryMetrics;
  narrative: string;
}

export interface CommunityLineageAnalysis {
  stableColorByStep: Array<Record<number, number>>;
  transitions: CommunityTransition[];
}

interface CommunityGroup {
  id: number;
  members: Set<string>;
}

function computeModularity(nodes: GraphNode[], edges: GraphEdge[]): number {
  const ids = nodes.map((n) => n.square);
  if (ids.length === 0) return 0;

  const communityByNode = new Map<string, number>();
  for (const n of nodes) communityByNode.set(n.square, n.communityId);

  const directed = new Map<string, Map<string, number>>();
  for (const { from, to, weight } of edges) {
    let inner = directed.get(from);
    if (!inner) {
      inner = new Map();
      directed.set(from, inner);
    }
    inner.set(to, (inner.get(to) ?? 0) + weight);
  }

  const directedW = (u: string, v: string): number => directed.get(u)?.get(v) ?? 0;
  const A = (i: string, j: string): number => (i === j ? 0 : directedW(i, j) + directedW(j, i));

  const k = new Map<string, number>();
  let m2 = 0;
  for (const i of ids) {
    let sum = 0;
    for (const j of ids) sum += A(i, j);
    k.set(i, sum);
    m2 += sum;
  }
  if (m2 === 0) return 0;

  let q = 0;
  for (const i of ids) {
    for (const j of ids) {
      if (communityByNode.get(i) !== communityByNode.get(j)) continue;
      q += A(i, j) - ((k.get(i) ?? 0) * (k.get(j) ?? 0)) / m2;
    }
  }
  return q / m2;
}

export function groupByCommunity(nodes: GraphNode[]): CommunityGroup[] {
  const byId = new Map<number, Set<string>>();
  for (const node of nodes) {
    let set = byId.get(node.communityId);
    if (!set) {
      set = new Set<string>();
      byId.set(node.communityId, set);
    }
    set.add(node.square);
  }
  return [...byId.entries()]
    .map(([id, members]) => ({ id, members }))
    .sort((a, b) => a.id - b.id);
}

export function intersection(a: Set<string>, b: Set<string>): string[] {
  const shared: string[] = [];
  for (const v of a) {
    if (b.has(v)) shared.push(v);
  }
  return shared.sort();
}

export function buildLinks(prev: CommunityGroup[], next: CommunityGroup[]): CommunityLink[] {
  const links: CommunityLink[] = [];
  for (const p of prev) {
    for (const n of next) {
      const sharedSquares = intersection(p.members, n.members);
      if (sharedSquares.length === 0) continue;
      const unionSize = p.members.size + n.members.size - sharedSquares.length;
      const jaccard = unionSize > 0 ? sharedSquares.length / unionSize : 0;
      links.push({
        fromCommunityId: p.id,
        toCommunityId: n.id,
        sharedSquares,
        overlapWeight: sharedSquares.length,
        jaccard,
      });
    }
  }
  return links.sort((a, b) => b.overlapWeight - a.overlapWeight || b.jaccard - a.jaccard);
}

export function buildEvents(
  prev: CommunityGroup[],
  next: CommunityGroup[],
  links: CommunityLink[],
): CommunityEvent[] {
  const events: CommunityEvent[] = [];
  const byFrom = new Map<number, CommunityLink[]>();
  const byTo = new Map<number, CommunityLink[]>();

  for (const link of links) {
    let fromList = byFrom.get(link.fromCommunityId);
    if (!fromList) {
      fromList = [];
      byFrom.set(link.fromCommunityId, fromList);
    }
    fromList.push(link);

    let toList = byTo.get(link.toCommunityId);
    if (!toList) {
      toList = [];
      byTo.set(link.toCommunityId, toList);
    }
    toList.push(link);
  }

  for (const p of prev) {
    const outgoing = byFrom.get(p.id) ?? [];
    if (outgoing.length === 0) {
      events.push({
        type: "dissolve",
        fromCommunityIds: [p.id],
        toCommunityIds: [],
        strength: 0,
      });
    } else if (outgoing.length === 1) {
      const link = outgoing[0];
      if (link) {
        events.push({
          type: "persist",
          fromCommunityIds: [p.id],
          toCommunityIds: [link.toCommunityId],
          strength: link.jaccard,
        });
      }
    } else {
      const total = outgoing.reduce((sum, l) => sum + l.overlapWeight, 0);
      events.push({
        type: "split",
        fromCommunityIds: [p.id],
        toCommunityIds: outgoing.map((l) => l.toCommunityId),
        strength: p.members.size > 0 ? total / p.members.size : 0,
      });
    }
  }

  for (const n of next) {
    const incoming = byTo.get(n.id) ?? [];
    if (incoming.length === 0) {
      events.push({
        type: "emerge",
        fromCommunityIds: [],
        toCommunityIds: [n.id],
        strength: 1,
      });
    } else if (incoming.length > 1) {
      const total = incoming.reduce((sum, l) => sum + l.overlapWeight, 0);
      events.push({
        type: "merge",
        fromCommunityIds: incoming.map((l) => l.fromCommunityId),
        toCommunityIds: [n.id],
        strength: n.members.size > 0 ? total / n.members.size : 0,
      });
    }
  }

  return events;
}

export function assignStableColors(
  prevStable: Record<number, number>,
  links: CommunityLink[],
  nextGroups: CommunityGroup[],
  nextColorStart: number,
): { stable: Record<number, number>; nextColor: number } {
  const stable: Record<number, number> = {};
  const usedPrev = new Set<number>();
  const usedNext = new Set<number>();

  for (const link of links) {
    if (usedPrev.has(link.fromCommunityId) || usedNext.has(link.toCommunityId)) continue;
    const prevColor = prevStable[link.fromCommunityId];
    if (prevColor === undefined) continue;
    stable[link.toCommunityId] = prevColor;
    usedPrev.add(link.fromCommunityId);
    usedNext.add(link.toCommunityId);
  }

  let nextColor = nextColorStart;
  for (const group of nextGroups) {
    if (stable[group.id] !== undefined) continue;
    stable[group.id] = nextColor++;
  }

  return { stable, nextColor };
}

export function buildNarrative(stepIndex: number, events: CommunityEvent[], metrics: StepStoryMetrics): string {
  const splits = events.filter((e) => e.type === "split");
  const merges = events.filter((e) => e.type === "merge");
  const emerges = events.filter((e) => e.type === "emerge");
  const dissolves = events.filter((e) => e.type === "dissolve");

  let story = `Step ${stepIndex}: `;
  
  if (splits.length > 0 || merges.length > 0) {
    story += `${splits.length} splits, ${merges.length} merges. `;
  } else {
    story += `Stable structures. `;
  }

  if (emerges.length > 0) story += `${emerges.length} new clusters emerged. `;
  if (dissolves.length > 0) story += `${dissolves.length} clusters dissolved. `;

  story += `Churn: ${(metrics.churn * 100).toFixed(0)}%.`;
  
  return story;
}

export function analyzeCommunityLineage(
  snapshots: Array<GraphSnapshot | null>,
): CommunityLineageAnalysis {
  const validSnapshots = snapshots.map((s) => s ?? null);
  const stableColorByStep: Array<Record<number, number>> = [];
  const transitions: CommunityTransition[] = [];

  let nextColor = 0;

  for (let i = 0; i < validSnapshots.length; i++) {
    const current = validSnapshots[i];
    if (!current) {
      stableColorByStep.push({});
      continue;
    }
    const groups = groupByCommunity(current.nodes);
    if (i === 0) {
      const seed: Record<number, number> = {};
      for (const g of groups) {
        seed[g.id] = nextColor++;
      }
      stableColorByStep.push(seed);
      continue;
    }

    const previous = validSnapshots[i - 1];
    if (!previous) {
      const reset: Record<number, number> = {};
      for (const g of groups) {
        reset[g.id] = nextColor++;
      }
      stableColorByStep.push(reset);
      continue;
    }

    const prevGroups = groupByCommunity(previous.nodes);
    const links = buildLinks(prevGroups, groups);
    const events = buildEvents(prevGroups, groups, links);

    const prevStable = stableColorByStep[i - 1] ?? {};
    const assigned = assignStableColors(prevStable, links, groups, nextColor);
    nextColor = assigned.nextColor;
    stableColorByStep.push(assigned.stable);

    const previousBySquare = new Map(previous.nodes.map((n) => [n.square, n.communityId]));
    const changedSquares = current.nodes
      .filter((n) => previousBySquare.has(n.square) && previousBySquare.get(n.square) !== n.communityId)
      .map((n) => n.square)
      .sort();

    const continuityNumerator = links.reduce((sum, link) => sum + link.overlapWeight, 0);
    const continuityDenominator = Math.max(1, previous.nodes.length, current.nodes.length);
    const continuity = continuityNumerator / continuityDenominator;
    const churn = 1 - continuity;
    const modularityDelta = computeModularity(current.nodes, current.edges) -
      computeModularity(previous.nodes, previous.edges);

    const metrics: StepStoryMetrics = { continuity, churn, modularityDelta };
    transitions.push({
      stepIndex: i,
      links,
      events,
      changedSquares,
      metrics,
      narrative: buildNarrative(i, events, metrics),
    });
  }

  if (stableColorByStep.length === 0) {
    return { stableColorByStep: [], transitions: [] };
  }

  return { stableColorByStep, transitions };
}

/**
 * Compute the next step of lineage incrementally.
 * Useful for "live" mode consistency.
 */
export function computeNextStepLineage(
  currentSnapshot: GraphSnapshot,
  previousSnapshot: GraphSnapshot | null,
  previousAnalysis: CommunityLineageAnalysis | null,
): CommunityLineageAnalysis {
  const currentGroups = groupByCommunity(currentSnapshot.nodes);
  const stepIndex = previousAnalysis ? previousAnalysis.stableColorByStep.length : 0;
  
  if (!previousSnapshot || !previousAnalysis || stepIndex === 0) {
    // Treat as first step
    let nextColor = 0;
    const seed: Record<number, number> = {};
    for (const g of currentGroups) {
      seed[g.id] = nextColor++;
    }
    return {
      stableColorByStep: [seed],
      transitions: [],
    };
  }

  const prevGroups = groupByCommunity(previousSnapshot.nodes);
  const links = buildLinks(prevGroups, currentGroups);
  const events = buildEvents(prevGroups, currentGroups, links);

  const prevStable = previousAnalysis.stableColorByStep[stepIndex - 1] ?? {};
  
  // Find the highest color index used so far to continue the sequence
  let maxColor = -1;
  for (const stepMap of previousAnalysis.stableColorByStep) {
    for (const color of Object.values(stepMap)) {
      if (color > maxColor) maxColor = color;
    }
  }
  
  const assigned = assignStableColors(prevStable, links, currentGroups, maxColor + 1);
  
  const previousBySquare = new Map(previousSnapshot.nodes.map((n) => [n.square, n.communityId]));
  const changedSquares = currentSnapshot.nodes
    .filter((n) => previousBySquare.has(n.square) && previousBySquare.get(n.square) !== n.communityId)
    .map((n) => n.square)
    .sort();

  const continuityNumerator = links.reduce((sum, link) => sum + link.overlapWeight, 0);
  const continuityDenominator = Math.max(1, previousSnapshot.nodes.length, currentSnapshot.nodes.length);
  const continuity = continuityNumerator / continuityDenominator;
  const churn = 1 - continuity;
  const modularityDelta = computeModularity(currentSnapshot.nodes, currentSnapshot.edges) -
    computeModularity(previousSnapshot.nodes, previousSnapshot.edges);

  const metrics: StepStoryMetrics = { continuity, churn, modularityDelta };
  
  const nextTransition: CommunityTransition = {
    stepIndex,
    links,
    events,
    changedSquares,
    metrics,
    narrative: buildNarrative(stepIndex, events, metrics),
  };

  return {
    stableColorByStep: [...previousAnalysis.stableColorByStep, assigned.stable],
    transitions: [...previousAnalysis.transitions, nextTransition],
  };
}
