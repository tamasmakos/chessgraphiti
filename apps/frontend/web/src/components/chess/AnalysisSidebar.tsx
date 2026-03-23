import React from "react";
import { useGameStore } from "#stores/game-store";
import { Card, CardContent, CardHeader, CardTitle } from "@yourcompany/web/components/base/card";
import { TraditionalMetricsDashboard } from "./TraditionalMetricsDashboard";
import { ChevronRight, AlertTriangle, ShieldCheck } from "lucide-react";

export function AnalysisSidebar() {
  const fen = useGameStore((s) => s.fen);
  const engineLines = useGameStore((s) => s.engineLines);
  const isThinking = useGameStore((s) => s.isEngineThinking);
  const graphSnapshot = useGameStore((s) => s.graphSnapshot);

  // Simple threat detection: attack edges targeting higher or equal value, or undefended
  const threats = React.useMemo(() => {
    if (!graphSnapshot) return [];
    
    const attackEdges = graphSnapshot.edges.filter(e => e.type === "attack");
    const defenseEdges = graphSnapshot.edges.filter(e => e.type === "defense");

    return attackEdges
      .filter(edge => {
        const targetNode = graphSnapshot.nodes.find(n => n.square === edge.to);
        const attackerNode = graphSnapshot.nodes.find(n => n.square === edge.from);
        if (!targetNode || !attackerNode) return false;
        
        // Only show threats to the current player's pieces
        const turn = fen.split(" ")[1];
        if (targetNode.color !== turn) return false;

        const isDefended = defenseEdges.some(d => d.to === edge.to);
        const isHighValue = targetNode.value >= attackerNode.value;
        
        return !isDefended || isHighValue;
      })
      .map(edge => {
        const targetNode = graphSnapshot.nodes.find(n => n.square === edge.to)!;
        return {
          square: edge.to,
          piece: targetNode.type,
          attacker: edge.from
        };
      })
      .slice(0, 3);
  }, [graphSnapshot, fen]);

  return (
    <div className="flex flex-col gap-6">
      {/* Candidate Moves Widget */}
      <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-md shadow-xl overflow-hidden">
        <CardHeader className="pb-2 border-b border-slate-700/30 bg-slate-800/40">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Candidate Moves</CardTitle>
            {isThinking && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />}
          </div>
        </CardHeader>
        <CardContent className="pt-3 px-0">
          <div className="space-y-1">
            {engineLines.length > 0 ? (
              engineLines.slice(0, 3).map((line, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2 hover:bg-white/5 cursor-pointer group transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-slate-600 w-4">{i + 1}.</span>
                    <span className="text-sm font-bold text-slate-200 group-hover:text-indigo-400 transition-colors uppercase tracking-tight">
                      {line.substring(0, 2)} → {line.substring(2, 4)}
                    </span>
                  </div>
                  <ChevronRight size={12} className="text-slate-700 group-hover:text-indigo-500 transition-transform group-hover:translate-x-0.5" />
                </div>
              ))
            ) : (
              <div className="px-4 py-4 text-[11px] text-slate-500 italic text-center">
                Waiting for engine depth...
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tactical Threats Widget */}
      <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-md shadow-xl overflow-hidden">
        <CardHeader className="pb-2 border-b border-slate-700/30 bg-slate-800/40">
          <CardTitle className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tactical Alert</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="space-y-3">
            {threats.length > 0 ? (
              threats.map((t, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-rose-500/5 border border-rose-500/10">
                  <div className="bg-rose-500/20 p-1.5 rounded-md">
                    <AlertTriangle size={14} className="text-rose-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-200 uppercase tracking-tight">
                      {t.piece} on {t.square}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      Attacked from {t.attacker}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <div className="bg-emerald-500/20 p-1.5 rounded-md">
                  <ShieldCheck size={14} className="text-emerald-400" />
                </div>
                <span className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-widest">Structure Stable</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
