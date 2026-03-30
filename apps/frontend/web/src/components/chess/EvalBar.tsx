interface EvalBarProps {
  /** Centipawn score. Positive = white advantage, negative = black advantage. */
  readonly score: number;
  /** Mate in N moves. Positive = white mates, negative = black mates. */
  readonly mate?: number;
  /** White win probability (0-100) from the GNN model. When present, takes priority over the CP formula. */
  readonly winProb?: number;
}

/**
 * Horizontal evaluation bar.
 *
 * White portion grows from the left; black portion fills the remainder.
 * A thin center marker at 50% shows the equal-position baseline.
 */
export function EvalBar({ score, mate, winProb }: EvalBarProps) {
  const whitePct = winProb ?? computeWhitePercent(score, mate);

  return (
    <div className="relative h-2 w-full rounded-full bg-slate-700 overflow-hidden">
      {/* White portion */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-300"
        style={{ width: `${whitePct}%` }}
      />

      {/* Center marker (50%) */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
    </div>
  );
}

/** Convert an engine score / mate-in-N to a 0-100 percentage for the white bar. */
function computeWhitePercent(score: number, mate: number | undefined): number {
  if (mate !== undefined) {
    // Mate for white → almost full; mate for black → almost empty
    return mate > 0 ? 95 : 5;
  }

  // Clamp centipawns to [-500, 500] and map to [0, 100]
  const clamped = Math.max(-500, Math.min(500, score));
  return 50 + clamped / 10;
}
