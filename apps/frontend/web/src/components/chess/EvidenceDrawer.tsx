import React from "react";
import { useGameStore } from "#stores/game-store";
import { useShallow } from "zustand/react/shallow";

export function EvidenceDrawer() {
  const { history, isAnalysis, graphSnapshot, hoveredSquare } = useGameStore(
    useShallow((s) => ({
      history: s.history,
      isAnalysis: s.gameStatus === "analysis",
      graphSnapshot: s.graphSnapshot,
      hoveredSquare: s.hoveredSquare,
    }))
  );

  // Derive most active pieces from centrality
  const activePieces = React.useMemo(() => {
    if (!graphSnapshot) return [];
    return [...graphSnapshot.nodes]
      .sort((a, b) => b.centralityWeighted - a.centralityWeighted)
      .slice(0, 5);
  }, [graphSnapshot]);

  // Derive most controlled squares (highest degree / attack density)
  const hotSquares = React.useMemo(() => {
    if (!graphSnapshot) return [];
    const counts: Record<string, number> = {};
    graphSnapshot.edges.forEach(e => {
        counts[e.to] = (counts[e.to] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [graphSnapshot]);

  if (!isAnalysis && history.length === 0) return null;

  return (
    <div className="w-full mt-8 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-xl shadow-2xl transition-all duration-500 hover:border-slate-600/50">
      <div className="flex items-center justify-between mb-6 border-b border-slate-700/50 pb-4">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                <span className="text-indigo-400">📊</span>
            </div>
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-[0.2em]">Evidence Layer</h3>
        </div>
        <div className="flex items-center gap-4">
            {hoveredSquare && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 animate-in fade-in zoom-in duration-300">
                    <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Inspecting</span>
                    <span className="text-xs font-mono font-bold text-white uppercase">{hoveredSquare}</span>
                </div>
            )}
            <span className="text-[9px] text-slate-500 uppercase font-mono tracking-widest bg-slate-800/50 px-2 py-0.5 rounded border border-slate-700/50">Forensic Drill-down</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Chronicler Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Chronicle</span>
            <span className="text-[9px] text-slate-600 font-mono">{history.length} Plies</span>
          </div>
          <div className="max-h-52 overflow-y-auto pr-2 custom-scrollbar">
            <div className="grid grid-cols-2 gap-2">
                {history.map((m, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${i % 2 === 0 ? 'bg-slate-800/40 border-slate-700/30' : 'bg-slate-800/20 border-slate-700/20'}`}>
                    <span className="text-[10px] font-mono text-slate-600 w-4">{i % 2 === 0 ? Math.floor(i/2) + 1 : ""}</span>
                    <span className={`text-[11px] font-bold ${i % 2 === 0 ? 'text-slate-200' : 'text-slate-400'}`}>{m.san}</span>
                </div>
                ))}
            </div>
          </div>
        </div>
        {/* Piece Relations Section */}
        <div className="space-y-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Structural Anchors</span>
          <div className="space-y-2">
            {activePieces.length > 0 ? activePieces.map((p, i) => (
              <div 
                key={i} 
                className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-300 group ${
                  hoveredSquare === p.square 
                    ? 'bg-indigo-500/20 border-indigo-500/50 scale-[1.02] shadow-lg shadow-indigo-500/10' 
                    : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${p.color === 'w' ? 'bg-white text-slate-900' : 'bg-slate-700 text-slate-300'} font-black shadow-lg`}>
                    {p.type.toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-200 uppercase">{p.square}</span>
                    <span className="text-[9px] text-slate-500 uppercase font-mono">Impact Factor</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-mono font-black ${hoveredSquare === p.square ? 'text-white' : 'text-indigo-400'}`}>
                    {(p.centralityWeighted * 10).toFixed(1)}
                  </span>
                </div>
              </div>
            )) : (
              <div className="h-40 flex items-center justify-center text-[10px] text-slate-600 italic border border-dashed border-slate-800 rounded-2xl">
                Pending graphity data...
              </div>
            )}
          </div>
        </div>

        {/* Square Control Section */}
        <div className="space-y-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Controlled Nodes</span>
          <div className="space-y-2">
            {hotSquares.length > 0 ? hotSquares.map(([sq, count], i) => (
              <div 
                key={i} 
                className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-300 ${
                  hoveredSquare === sq 
                    ? 'bg-indigo-500/20 border-indigo-500/50 scale-[1.02] shadow-lg shadow-indigo-500/10' 
                    : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[11px] font-bold font-mono transition-colors ${
                    hoveredSquare === sq ? 'bg-white text-indigo-600 border-white' : 'bg-slate-950 text-slate-400 border-slate-700'
                  }`}>
                    {sq}
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase font-black">Pressure Level</span>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className={`w-1 h-3 rounded-full transition-colors ${
                      j < (count as number) 
                        ? (hoveredSquare === sq ? 'bg-white' : 'bg-indigo-500') 
                        : 'bg-slate-800'
                    }`} />
                  ))}
                </div>
              </div>
            )) : (
              <div className="h-40 flex items-center justify-center text-[10px] text-slate-600 italic border border-dashed border-slate-800 rounded-2xl">
                Analyzing board density...
              </div>
            )}
          </div>
        </div>

        {/* Tactical Lessons (Blunder analysis) Section */}
        <div className="space-y-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Forensic Markings</span>
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-4xl">⚠️</span>
                </div>
                <div className="flex flex-col gap-1 relative z-10">
                    <span className="text-[10px] font-black text-rose-400 uppercase tracking-tighter">Critical Blunder</span>
                    <span className="text-xs text-slate-300 font-medium leading-relaxed">
                        The move <span className="text-white font-bold">Nf3</span> weakened the kingside community structure by <span className="text-rose-400 font-bold">14%</span>.
                    </span>
                    <button type="button" className="mt-3 text-[9px] font-black text-white uppercase tracking-widest bg-rose-500/20 hover:bg-rose-500/40 py-1 px-3 rounded-full border border-rose-500/30 transition-all w-fit">
                        Explore Variance
                    </button>
                </div>
            </div>
            
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-4xl">💎</span>
                </div>
                <div className="flex flex-col gap-1 relative z-10">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter">Structural Brilliance</span>
                    <span className="text-xs text-slate-300 font-medium leading-relaxed">
                        Community <span className="text-white font-bold">#4</span> successfully modularized the center, isolating the enemy queen.
                    </span>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
