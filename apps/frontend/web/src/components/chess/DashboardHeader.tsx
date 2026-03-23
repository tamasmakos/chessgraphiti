import React, { useEffect, useState } from "react";
import { useGameStore } from "#stores/game-store";

export function DashboardHeader() {
  const evaluation = useGameStore((s) => s.evaluation);
  const mateIn = useGameStore((s) => s.mateIn);
  const history = useGameStore((s) => s.history);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const [prevEval, setPrevEval] = useState(evaluation);
  const [swing, setSwing] = useState(0);

  useEffect(() => {
    if (evaluation !== prevEval) {
      setSwing(evaluation - prevEval);
      setPrevEval(evaluation);
    }
  }, [evaluation, prevEval]);

  const evalText = mateIn !== undefined 
    ? `M${mateIn}` 
    : (evaluation / 100).toFixed(1);

  const swingText = (swing / 100).toFixed(1);
  const moveNum = Math.floor(history.length / 2) + 1;
  const turn = history.length % 2 === 0 ? "White" : "Black";

  return (
    <div className="w-full bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 flex items-center justify-between gap-6 backdrop-blur-xl shadow-2xl mb-8 relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-50" />
      
      {/* Eval Widget */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Evaluation</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-mono font-black tracking-tighter ${evaluation >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {evalText}
            </span>
            {swing !== 0 && (
              <span className={`text-xs font-mono font-bold ${swing > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {swing > 0 ? '↑' : '↓'}{Math.abs(Number(swingText))}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="h-10 w-px bg-slate-800" />

      {/* Opening / Move Widget */}
      <div className="flex flex-col flex-1">
        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Position Narrative</span>
        <div className="flex items-center gap-3">
           <span className="text-sm font-bold text-slate-200">
             Move {moveNum}
           </span>
           <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono border border-slate-700">
             {turn} to move
           </span>
        </div>
      </div>

      <div className="h-10 w-px bg-slate-800" />

      {/* Clock Widget (Visual Placeholder) */}
      <div className="flex flex-col">
        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Phase</span>
        <span className="text-sm font-bold text-slate-300 uppercase tracking-wide">
          {history.length < 20 ? 'Opening' : history.length < 60 ? 'Middlegame' : 'Endgame'}
        </span>
      </div>

      <div className="h-10 w-px bg-slate-800" />

      {/* Mode Status */}
      <div className="flex flex-col items-end">
        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Session</span>
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${gameStatus === 'playing' ? 'bg-emerald-500 animate-pulse' : 'bg-indigo-500'}`} />
            <span className="text-xs font-black text-slate-200 uppercase tracking-wider">
              {gameStatus}
            </span>
        </div>
      </div>
    </div>
  );
}
