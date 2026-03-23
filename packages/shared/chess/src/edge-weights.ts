/**
 * Edge weight calculation for the chess graph.
 *
 * For attack edges:
 *   weight = max(0, attackerValue + targetValue - sum(defenderValues))
 *
 * For defense edges (same-color piece protecting another):
 *   weight = targetValue + (defenderValue * 0.2)
 *
 * The attack formula uses full defense cancellation (no 0.5 discount),
 * meaning a piece defended by equal material fully cancels the attack weight.
 * This corrects the MVP's `defenderSum * 0.5` which underweighted defense.
 */
import type { PieceInfo, GraphEdge, AttackMap, DefenseMap } from "#types";
import { PIECE_VALUES } from "#constants";

/**
 * Compute the weight of an attack edge.
 *
 * @param attacker - The attacking piece
 * @param target - The piece being attacked (must be opposite color)
 * @param defenderSquares - Squares of pieces defending the target
 * @param pieces - All pieces on the board (for looking up defender values)
 * @returns Non-negative weight representing the severity of the attack
 */
export function computeAttackWeight(
  attacker: PieceInfo,
  target: PieceInfo,
  defenderSquares: string[],
  pieces: PieceInfo[],
): number {
  if (defenderSquares.length === 0) {
    // Undefended target: attack threatens to win full material
    return target.value;
  }

  // Defended target: evaluate the trade
  const exchangeValue = target.value - attacker.value;

  if (exchangeValue >= 0) {
    // Favorable or even trade (e.g. Pawn attacks Rook, or Knight attacks Bishop)
    return target.value + exchangeValue;
  }

  // Losing trade (attacker > target). E.g., Rook attacks defended Pawn.
  // This attack is completely nullified by the defender and should not draw an edge.
  return 0;
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
 * Build all graph edges from attack/defense maps and piece positions.
 *
 * For each piece, iterates through its attack targets. If the target is an
 * enemy piece, creates an attack edge. If it's a friendly piece, creates
 * a defense edge.
 *
 * @param pieces - All pieces on the board
 * @param attackMap - Map of each piece's attacked squares
 * @param defenseMap - Map of each square to its defenders
 * @returns Array of weighted directed edges
 */
export function buildEdges(
  pieces: PieceInfo[],
  attackMap: AttackMap,
  defenseMap: DefenseMap,
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const pieceBySquare = new Map<string, PieceInfo>();
  for (const p of pieces) {
    pieceBySquare.set(p.square, p);
  }

  for (const actor of pieces) {
    const attackedSquares = attackMap.get(actor.square) ?? [];

    for (const targetSquare of attackedSquares) {
      const target = pieceBySquare.get(targetSquare);
      if (!target) continue;

      const isEnemy = target.color !== actor.color;

      if (isEnemy) {
        // Attack edge: actor attacks enemy target
        const defenders = defenseMap.get(targetSquare) ?? [];
        const weight = computeAttackWeight(actor, target, defenders, pieces);
        // Only add edges with positive weight (meaningful tension)
        if (weight > 0) {
          edges.push({
            from: actor.square,
            to: targetSquare,
            weight,
            type: "attack",
          });
        }
      } else {
        // Defense edge: actor defends friendly target
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
