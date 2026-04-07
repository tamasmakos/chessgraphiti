/**
 * Edge weight calculation for the chess graph.
 *
 * Attack edges use Static Exchange Evaluation (SEE) to determine whether a
 * capture chain is materially profitable for the initiating piece. An attack
 * edge is only emitted when SEE > 0 — i.e. the capturing piece can net
 * material through the optimal exchange sequence.
 *
 * Defense edges (same-color piece protecting another) use a value-weighted
 * formula:
 *   weight = targetValue + (defenderValue * 0.2)
 *
 * Kings are excluded from SEE exchange sequences because their participation
 * depends on in-check legality that pseudo-legal attack maps do not model.
 * Kings are also never the target of defense edges (Piece→King arrows carry
 * no useful tactical meaning and their disproportionate value would dominate
 * the visualisation).
 */
import type { AttackMap, GraphEdge, PieceInfo } from "#types";

/**
 * Static Exchange Evaluation (SEE).
 *
 * Simulates the full optimal capture sequence on a square, cheapest pieces
 * first. Each side can stop capturing at any point if continuing would lose
 * material. Returns the net material gain for the first-moving side.
 *
 * NOTE: No X-ray detection is performed. When a piece moves off a square to
 * capture, any piece behind it on the same ray is not automatically added to
 * the attacker pool. The attack map is static and pre-computed.
 *
 * @param firstCapture - Material value of the piece being captured first
 * @param myAttackers - Values of pieces on the first-moving side that attack
 *   the square, sorted cheapest-first. The first element executes the initial
 *   capture.
 * @param theirAttackers - Values of pieces on the defending side that attack
 *   the square, sorted cheapest-first.
 * @returns Net material gain ≥ 0 for the first-moving side
 */
export function computeSEE(
  firstCapture: number,
  myAttackers: readonly number[],
  theirAttackers: readonly number[],
): number {
  if (myAttackers.length === 0) return 0;

  // We capture the piece worth firstCapture using myAttackers[0].
  // Opponent responds optimally from theirAttackers.
  const [first, ...rest] = myAttackers;
  const gain = firstCapture - computeSEE(first!, theirAttackers, rest);

  // Either side can choose not to capture if the continuation loses material.
  return Math.max(0, gain);
}

/**
 * Compute the weight of a defense edge.
 *
 * @param defender - The piece providing defense
 * @param target - The piece being defended (same color as defender)
 * @returns Positive weight representing the defensive relationship strength
 */
export function computeDefenseWeight(defender: PieceInfo, target: PieceInfo): number {
  return target.value + defender.value * 0.2;
}

/**
 * Build all graph edges from the attack map and piece positions.
 *
 * Attack edges: uses SEE with the actor as first capturer. Only edges where
 * SEE > 0 are emitted — the initiating piece nets material from the optimal
 * exchange. Kings are excluded from exchange sequences.
 *
 * Defense edges: a same-color piece defending a non-King target emits an
 * edge with weight = targetValue + defenderValue * 0.2. Piece→King defense
 * edges are suppressed — their disproportionate weight would dominate the
 * visualisation and the relationship has no tactical equivalent.
 *
 * @param pieces - All pieces on the board
 * @param attackMap - Map of each piece's attacked squares (pseudo-legal)
 * @returns Array of weighted directed edges
 */
export function buildEdges(pieces: PieceInfo[], attackMap: AttackMap): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const pieceBySquare = new Map<string, PieceInfo>();
  for (const p of pieces) {
    pieceBySquare.set(p.square, p);
  }

  // Reverse attack map: target square → all pieces that attack it.
  // Used to gather both sides' attacker pools for SEE.
  const attackersBySquare = new Map<string, PieceInfo[]>();
  for (const actor of pieces) {
    for (const sq of attackMap.get(actor.square) ?? []) {
      const list = attackersBySquare.get(sq) ?? [];
      list.push(actor);
      attackersBySquare.set(sq, list);
    }
  }

  for (const actor of pieces) {
    for (const targetSquare of attackMap.get(actor.square) ?? []) {
      const target = pieceBySquare.get(targetSquare);
      if (!target) continue;

      const isEnemy = target.color !== actor.color;

      if (isEnemy) {
        const allAttackers = attackersBySquare.get(targetSquare) ?? [];

        // Actor initiates the capture; remaining same-color non-King pieces
        // fill the follow-up slots, sorted cheapest-first.
        const otherMine = allAttackers
          .filter((p) => p.color === actor.color && p.square !== actor.square && p.type !== "k")
          .map((p) => p.value)
          .sort((a, b) => a - b);
        const seeMyAttackers = [actor.value, ...otherMine];

        // Defending side's non-King pieces that attack the square.
        const seeTheirAttackers = allAttackers
          .filter((p) => p.color === target.color && p.type !== "k")
          .map((p) => p.value)
          .sort((a, b) => a - b);

        const weight = computeSEE(target.value, seeMyAttackers, seeTheirAttackers);

        if (weight > 0) {
          edges.push({
            from: actor.square,
            to: targetSquare,
            weight,
            type: "attack",
          });
        }
      } else {
        // Defense edge: actor defends friendly target.
        // Skip Piece→King defense edges: a piece cannot meaningfully "defend"
        // the king in the same way it defends other pieces, and the king's
        // disproportionate value (1000) would dominate the visualisation.
        if (target.type === "k") continue;
        const weight = computeDefenseWeight(actor, target);
        edges.push({
          from: actor.square,
          to: targetSquare,
          weight,
          type: "defense",
        });
      }
    }
  }

  return edges;
}
