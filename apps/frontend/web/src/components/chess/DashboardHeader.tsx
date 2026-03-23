import React, { useEffect, useState } from "react";
import { useGameStore } from "#stores/game-store";
import { Settings, ChevronDown, ChevronUp } from "lucide-react";

interface DashboardHeaderProps {
  settingsOpen: boolean;
  onToggleSettings: () => void;
  engineReady: boolean;
  isThinking: boolean;
  engineError: string | null;
}

export function DashboardHeader({
  settingsOpen,
  onToggleSettings,
  engineReady,
  isThinking,
  engineError,
}: DashboardHeaderProps) {
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

  const evalText =
    mateIn !== undefined ? `M${mateIn}` : (evaluation / 100).toFixed(1);
  const evalPositive = mateIn !== undefined ? mateIn > 0 : evaluation >= 0;
  const moveNum = Math.floor(history.length / 2) + 1;
  const turn = history.length % 2 === 0 ? "White" : "Black";
  const phase =
    history.length < 20
      ? "Opening"
      : history.length < 60
        ? "Middlegame"
        : "Endgame";

  // Engine status
  let engineDot = "bg-amber-500 animate-pulse";
  let engineLabel = "Initializing";
  if (engineError) {
    engineDot = "bg-red-500";
    engineLabel = "Error";
  } else if (engineReady && isThinking) {
    engineDot = "bg-amber-400 animate-pulse";
    engineLabel = "Thinking";
  } else if (engineReady) {
    engineDot = "bg-emerald-500";
    engineLabel = "Ready";
  }

  return (
    <div className="w-full flex items-center gap-4 px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md flex-shrink-0">
      {/* Eval */}
      <div className="flex items-baseline gap-1.5 min-w-[56px]">
        <span
          className={`text-xl font-mono font-black tracking-tighter leading-none ${evalPositive ? "text-emerald-400" : "text-rose-400"}`}
        >
          {evalText}
        </span>
        {swing !== 0 && (
          <span
            className={`text-[10px] font-mono ${swing > 0 ? "text-emerald-500" : "text-rose-500"}`}
          >
            {swing > 0 ? "↑" : "↓"}
            {Math.abs(swing / 100).toFixed(1)}
          </span>
        )}
      </div>

      <div className="h-5 w-px bg-slate-800" />

      {/* Move / Turn */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-slate-200">Move {moveNum}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono border border-slate-700/60">
          {turn}
        </span>
      </div>

      <div className="h-5 w-px bg-slate-800" />

      {/* Phase */}
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden sm:block">
        {phase}
      </span>

      <div className="h-5 w-px bg-slate-800 hidden sm:block" />

      {/* Session Status */}
      <div className="flex items-center gap-1.5 hidden sm:flex">
        <div
          className={`w-1.5 h-1.5 rounded-full ${gameStatus === "playing" ? "bg-emerald-500 animate-pulse" : gameStatus === "analysis" ? "bg-indigo-500" : "bg-slate-600"}`}
        />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
          {gameStatus}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Engine indicator */}
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${engineDot}`} />
        <span className="text-[10px] font-medium text-slate-400 hidden md:block">
          {engineLabel}
        </span>
      </div>

      <div className="h-5 w-px bg-slate-800" />

      {/* Settings toggle */}
      <button
        onClick={onToggleSettings}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
          settingsOpen
            ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
            : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 border border-transparent"
        }`}
      >
        <Settings size={12} />
        <span className="hidden sm:block">Settings</span>
        {settingsOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
    </div>
  );
}
