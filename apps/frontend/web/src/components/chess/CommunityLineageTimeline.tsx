import React, { useMemo } from "react";
import { COMMUNITY_COLORS } from "@yourcompany/chess/constants";
import type { CommunityLineageAnalysis } from "@yourcompany/chess/community-lineage";

interface CommunityLineageTimelineProps {
  analysis: CommunityLineageAnalysis;
  analysisIndex: number;
}

export function CommunityLineageTimeline({
  analysis,
  analysisIndex,
}: CommunityLineageTimelineProps) {
  const rows = useMemo(() => {
    console.log("CommunityLineageTimeline analysis:", analysis);
    if (!analysis || !analysis.transitions || !Array.isArray(analysis.transitions)) return [];
    
    return analysis.transitions.filter(Boolean).map((transition) => {
      const splitCount = transition.events?.filter((e) => e?.type === "split").length ?? 0;
      const mergeCount = transition.events?.filter((e) => e?.type === "merge").length ?? 0;
      const dissolveCount = transition.events?.filter((e) => e?.type === "dissolve").length ?? 0;
      const churnPct = Math.round((transition.metrics?.churn ?? 0) * 100);
      return {
        stepIndex: transition.stepIndex ?? 0,
        splitCount,
        mergeCount,
        dissolveCount,
        churnPct,
        modularityDelta: transition.metrics?.modularityDelta ?? 0,
        narrative: transition.narrative ?? "",
      };
    });
  }, [analysis]);

  if (!analysis || !analysis.transitions) {
    return (
      <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-6 flex flex-col items-center justify-center text-center">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Structural Genesis</div>
        <p className="text-[10px] text-slate-500 max-w-[140px]">Molecular history begins after the first move.</p>
      </div>
    );
  }

  const currentStable = analysis.stableColorByStep?.[analysisIndex] ?? {};
  const chips = Object.entries(currentStable).map(([communityId, colorKey]) => ({
    communityId,
    color: COMMUNITY_COLORS[(colorKey as number) % COMMUNITY_COLORS.length],
  }));

  return (
    <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-3">
      <div className="text-xs font-bold text-slate-200 uppercase tracking-widest mb-2">
        Community Lineage
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="text-[11px] text-slate-300 font-mono">
          {analysisIndex === 0 ? "Initial State" : `Step ${analysisIndex}`}
        </div>
        <div className="text-[11px] text-indigo-400 font-mono text-right">
          {chips.length} active modules
        </div>
      </div>

      {analysisIndex > 0 && analysis.transitions[analysisIndex - 1] && (
        <div className="mb-3 px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
          <p className="text-[11px] text-slate-200 leading-relaxed italic">
            "{analysis.transitions[analysisIndex - 1]?.narrative}"
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {chips.map((chip) => (
          <span
            key={chip.communityId}
            className="px-2 py-1 text-[10px] rounded border border-slate-600 text-slate-100 font-mono"
            style={{ backgroundColor: chip.color }}
          >
            C{chip.communityId}
          </span>
        ))}
      </div>

      <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
        {rows.map((row) => (
          <div
            key={row.stepIndex}
            className={`rounded px-2 py-1.5 text-[10px] font-mono border transition-all ${
              row.stepIndex === analysisIndex
                ? "bg-indigo-600/30 border-indigo-400/60 text-indigo-50"
                : "bg-slate-900/40 border-slate-700/60 text-slate-400 opacity-60 hover:opacity-100"
            }`}
          >
            <div className="flex justify-between items-center mb-0.5">
              <span>Step {row.stepIndex}</span>
              <span className={row.churnPct > 50 ? "text-amber-400" : "text-slate-500"}>
                churn {row.churnPct}%
              </span>
            </div>
            <div className="flex gap-2 text-[9px] uppercase tracking-taper">
              {row.splitCount > 0 && <span className="text-blue-400">Splits: {row.splitCount}</span>}
              {row.mergeCount > 0 && <span className="text-emerald-400">Merges: {row.mergeCount}</span>}
              {row.dissolveCount > 0 && <span className="text-rose-400 font-bold">Extinctions!</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
