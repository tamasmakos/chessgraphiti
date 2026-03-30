// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TutorRankingPanelProps {
  readonly ranking: Array<{ move: string; score: number }>;
  readonly winProb: number | undefined;
  readonly isAnalyzing: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TutorRankingPanel({
  ranking,
  winProb,
  isAnalyzing,
}: TutorRankingPanelProps) {
  const top10 = ranking.slice(0, 10);

  const scores = top10.map((r) => r.score);
  const maxScore = scores.length ? Math.max(...scores) : 100;
  const minScore = scores.length ? Math.min(...scores) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
            Tutor
          </span>
          {isAnalyzing && (
            <span className="text-[9px] text-slate-500 font-mono animate-pulse">
              analyzing…
            </span>
          )}
        </div>
        {winProb !== undefined && (
          <span className="text-[10px] font-mono text-emerald-400">
            {winProb.toFixed(1)}% W
          </span>
        )}
      </div>

      {/* Move rows */}
      {top10.length === 0 && !isAnalyzing && (
        <p className="text-[10px] text-slate-600 font-mono px-0.5">No data</p>
      )}

      <div className="flex flex-col gap-0.5">
        {top10.map((entry, i) => {
          const norm =
            maxScore === minScore
              ? 1
              : (entry.score - minScore) / (maxScore - minScore);
          const hue = Math.round(norm * 120);
          const isBest = i === 0;

          return (
            <div
              key={entry.move}
              className="flex items-center gap-2 group"
            >
              {/* Rank number */}
              <span className="text-[9px] font-mono text-slate-600 w-3 text-right flex-shrink-0">
                {i + 1}
              </span>

              {/* Move label */}
              <span
                className={`text-[10px] font-mono w-10 flex-shrink-0 ${
                  isBest ? "text-white font-black" : "text-slate-400"
                }`}
              >
                {entry.move}
              </span>

              {/* Progress bar */}
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${entry.score.toFixed(1)}%`,
                    backgroundColor: `hsl(${hue}, 80%, 50%)`,
                  }}
                />
              </div>

              {/* Score */}
              <span className="text-[9px] font-mono text-slate-500 w-8 text-right flex-shrink-0">
                {entry.score.toFixed(1)}%
              </span>

              {/* Best badge */}
              {isBest && (
                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-wider flex-shrink-0">
                  best
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
