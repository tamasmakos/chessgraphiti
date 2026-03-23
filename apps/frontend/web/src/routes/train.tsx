/**
 * Play vs Computer page -- the core Nexus Chess experience.
 *
 * Layout: 12-column grid with the chess board (8 cols) and control
 * sidebar (4 cols), matching the MVP aesthetic.
 */
import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Chess } from "chess.js";
import { useMutation } from "@tanstack/react-query";
import {
  ChessBoard,
  EvalBar,
  GraphOverlay,
  CommunityTiles,
  CentralityD3Dashboard,
  TraditionalMetricsDashboard,
  CommunityLineageTimeline,
  CommunityLineageGraph,
  MetricsCarousel,
  DashboardHeader,
  AnalysisSidebar,
  EvidenceDrawer,
} from "#components/chess/index";
import { useGameStore } from "#stores/game-store";
import { useStockfish } from "#hooks/use-stockfish";
import { useApi } from "#lib/api";
import { Button } from "@yourcompany/web/components/base/button";
import { Card, CardContent, CardHeader, CardTitle } from "@yourcompany/web/components/base/card";
import { toast } from "sonner";

export const Route = createFileRoute("/train")({
  component: TrainPage,
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function TrainPage() {
  const { isReady: engineReady, error: engineError } = useStockfish();

  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const fen = useGameStore((s) => s.fen);
  const pgn = useGameStore((s) => s.pgn);
  const playerColor = useGameStore((s) => s.playerColor);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const gameOverReason = useGameStore((s) => s.gameOverReason);
  const isEngineThinking = useGameStore((s) => s.isEngineThinking);
  const evaluation = useGameStore((s) => s.evaluation);
  const mateIn = useGameStore((s) => s.mateIn);
  const graphSnapshot = useGameStore((s) => s.graphSnapshot);
  const liveGraphEnabled = useGameStore((s) => s.liveGraphEnabled);
  const liveGraphSnapshots = useGameStore((s) => s.liveGraphSnapshots);
  const liveLineage = useGameStore((s) => s.liveLineage);
  const centralityMetric = useGameStore((s) => s.centralityMetric);
  const engineStrength = useGameStore((s) => s.engineStrength);
  const analysisIndex = useGameStore((s) => s.analysisIndex);
  const analysisFens = useGameStore((s) => s.analysisFens);
  const analysisGraphSnapshots = useGameStore((s) => s.analysisGraphSnapshots);
  const analysisLineage = useGameStore((s) => s.analysisLineage);
  const history = useGameStore((s) => s.history);

  const [filterPieces, setFilterPieces] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const makeMove = useGameStore((s) => s.makeMove);
  const setPlayerColor = useGameStore((s) => s.setPlayerColor);
  const newGame = useGameStore((s) => s.newGame);
  const undo = useGameStore((s) => s.undo);
  const resign = useGameStore((s) => s.resign);
  const startAnalysis = useGameStore((s) => s.startAnalysis);
  const exitAnalysis = useGameStore((s) => s.exitAnalysis);
  const navigateAnalysis = useGameStore((s) => s.navigateAnalysis);
  const setEngineStrength = useGameStore((s) => s.setEngineStrength);
  const toggleLiveGraph = useGameStore((s) => s.toggleLiveGraph);
  const setCentralityMetric = useGameStore((s) => s.setCentralityMetric);
  const edgeWeightThreshold = useGameStore((s) => s.edgeWeightThreshold);
  const setEdgeWeightThreshold = useGameStore((s) => s.setEdgeWeightThreshold);
  const showDominance = useGameStore((s) => s.showDominance);
  const toggleDominance = useGameStore((s) => s.toggleDominance);

  const orientation = playerColor === "w" ? "white" : "black";
  const boardWidth = 520; // Reduced from 560 to fit vertically
  const isAnalysis = gameStatus === "analysis";
  const isGameOver = gameStatus === "gameover";
  const isInteractive =
    !isAnalysis && !isGameOver && !isEngineThinking;
  const shouldRenderGraph = Boolean(graphSnapshot) && (liveGraphEnabled || isAnalysis);
  const previousAnalysisSnapshot =
    isAnalysis && analysisIndex > 0 ? analysisGraphSnapshots[analysisIndex - 1] : null;
  const currentTransition = isAnalysis 
    ? analysisLineage?.transitions.find((t) => t.stepIndex === analysisIndex)
    : liveLineage?.transitions[liveLineage.transitions.length - 1];

  const stableColorMap = isAnalysis
    ? analysisLineage?.stableColorByStep[analysisIndex]
    : liveLineage?.stableColorByStep[liveLineage.stableColorByStep.length - 1];


  const api = useApi();
  const exportReelMutation = useMutation(
    api.exports.enqueue.mutationOptions({
      onSuccess: (job) => {
        toast.success(`Export queued (id: ${job.id})`);
      },
      onError: (e) => {
        toast.error(`Failed to enqueue export: ${(e as Error).message}`);
      },
    }),
  );

  const enqueueExport = (fps: number) => {
    exportReelMutation.mutate({
      fps,
      pgn,
      moves: history,
    });
  };

  // Handle piece drops
  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string | null): boolean => {
      if (!targetSquare) return false;
      const result = makeMove(sourceSquare, targetSquare);
      return result.success;
    },
    [makeMove],
  );

  // Keyboard navigation for analysis mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isAnalysis) return;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          navigateAnalysis("prev");
          break;
        case "ArrowRight":
          e.preventDefault();
          navigateAnalysis("next");
          break;
        case "Home":
          e.preventDefault();
          navigateAnalysis("first");
          break;
        case "End":
          e.preventDefault();
          navigateAnalysis("last");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isAnalysis, navigateAnalysis]);

  return (
    <div
      className="h-screen max-h-screen flex flex-col items-center overflow-hidden bg-slate-950 font-sans selection:bg-indigo-500/30"
      style={{
        color: "var(--cg-page-fg)",
      }}
      data-theme={theme}
    >
      {/* Overview Layer - Fixed Header */}
      <div className="w-full flex-shrink-0">
        <DashboardHeader />
      </div>

      {/* Main Analysis Container - Triple Column, No Scroll */}
      <div className="flex-1 w-full max-w-[1920px] overflow-hidden px-4 pb-4">
        <div className="h-full grid grid-cols-12 gap-4 items-stretch">
          
          {/* 1. THE STRATEGIST (LEFT - Traditional & Controls) - 3 cols */}
          <div className="col-span-3 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
            <Card className="bg-slate-900/60 border-slate-700/40 backdrop-blur-xl shadow-2xl overflow-hidden flex-shrink-0">
               <div className="p-3 border-b border-slate-700/50 bg-slate-800/20">
                  <h3 className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                     Tactical Status
                  </h3>
               </div>
               <div className="p-3">
                  <TraditionalMetricsDashboard fen={fen} />
               </div>
            </Card>

            <Card className="bg-slate-900/60 border-slate-700/40 backdrop-blur-xl shadow-2xl overflow-hidden flex-1">
               <div className="p-3 border-b border-slate-700/50 bg-slate-800/20">
                  <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                     Parameters
                  </h3>
               </div>
               <div className="p-4 space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                       <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Engine Power</label>
                       <span className="text-[10px] font-mono text-indigo-400">{engineStrength}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={1}
                      value={engineStrength}
                      onChange={(e) => setEngineStrength(Number(e.target.value))}
                      className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                       <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Graph Density</label>
                       <span className="text-[10px] font-mono text-indigo-400">{(edgeWeightThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={edgeWeightThreshold}
                      onChange={(e) => setEdgeWeightThreshold(Number(e.target.value))}
                      className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Button onClick={() => { setPlayerColor("w"); newGame(); }} size="sm" className="bg-slate-200 text-slate-900 hover:bg-white font-black text-[9px] uppercase tracking-tighter w-[48%] h-8">White</Button>
                    <Button onClick={() => { setPlayerColor("b"); newGame(); }} size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 font-black text-[9px] uppercase tracking-tighter w-[48%] h-8">Black</Button>
                  </div>
               </div>
            </Card>
          </div>

          {/* 2. THE NEXUS (CENTER - Board & Primary Vision) - 6 cols */}
          <div className="col-span-6 flex flex-col gap-4">
            <div className="relative bg-slate-900/60 p-4 rounded-3xl border border-slate-700/40 shadow-[0_0_60px_-15px_rgba(0,0,0,0.6)] backdrop-blur-md flex flex-col items-center">
              <ChessBoard
                fen={fen}
                orientation={orientation}
                onPieceDrop={handlePieceDrop}
                interactive={isInteractive}
                boardWidth={boardWidth}
                graphNodes={graphSnapshot?.nodes ?? []}
                centralityMetric={centralityMetric}
              >
                {shouldRenderGraph && graphSnapshot && (
                  <CommunityTiles
                    nodes={graphSnapshot.nodes}
                    boardWidth={boardWidth}
                    orientation={orientation}
                    centralityMetric={centralityMetric}
                    stableColorMap={stableColorMap}
                    changedSquares={currentTransition?.changedSquares ?? []}
                  />
                )}
                {shouldRenderGraph && graphSnapshot && (
                  <GraphOverlay
                    edges={graphSnapshot.edges}
                    boardWidth={boardWidth}
                    orientation={orientation}
                    fen={fen}
                    hintMove={null}
                    weightThreshold={edgeWeightThreshold}
                    showDominance={showDominance}
                  />
                )}
              </ChessBoard>

              {/* Game Over Overlay */}
              {isGameOver && (
                <GameOverModal
                  reason={gameOverReason}
                  playerColor={playerColor}
                  onAnalyze={startAnalysis}
                  onExport={enqueueExport}
                  isExporting={exportReelMutation.isPending}
                />
              )}
              
              <div className="w-full mt-4 flex items-center justify-center">
                <EvalBar score={evaluation} mate={mateIn} />
              </div>

              {/* Engine Status - Minimal Floating Indicator */}
              <div className="absolute top-6 right-6">
                <EngineStatus isReady={engineReady} isThinking={isEngineThinking} error={engineError ?? null} />
              </div>
            </div>

            {/* Sub-board Control Bar - Compact & Functional */}
            <div className="flex flex-col gap-3">
              {isAnalysis ? (
                <AnalysisControls
                  index={analysisIndex}
                  total={analysisFens.length - 1}
                  onNavigate={navigateAnalysis}
                  onExit={exitAnalysis}
                />
              ) : (
                  <div className="flex flex-col items-center gap-4 py-1 px-2">
                     {/* Vision Mode Switcher - Prominent Button Group */}
                     <div className="flex items-center bg-slate-900/80 p-0.5 rounded-xl border border-slate-700/50 shadow-lg">
                        <span className="px-3 text-[9px] font-black text-slate-500 uppercase tracking-widest hidden lg:block">Vision</span>
                        {[
                          { id: "eval", label: "Evaluations" },
                          { id: "graph", label: "Graph" },
                          { id: "radar", label: "Radar" },
                          { id: "force", label: "Force" },
                          { id: "classic", label: "Classic" }
                        ].map((m) => {
                          const isActive = centralityMetric === m.id || (m.id === "eval" && !centralityMetric);
                          return (
                            <button
                              key={m.id}
                              onClick={() => setCentralityMetric(m.id as any)}
                              className={`px-4 py-2 text-[10px] font-black uppercase tracking-tighter rounded-lg transition-all ${
                                isActive 
                                  ? "bg-indigo-600 text-white shadow-[0_0_12px_rgba(79,70,229,0.4)]" 
                                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                              }`}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                     </div>
                  </div>
              )}
            </div>
          </div>

          {/* 3. THE HISTORIAN (RIGHT - Graph History & Moves) - 3 cols */}
          <div className="col-span-3 flex flex-col gap-4 overflow-y-auto pl-2 custom-scrollbar">
             <AnalysisSidebar />

             <div className="flex-1 flex flex-col gap-4 h-full">
                {/* D3 Centrality Dashboard - Minified for History */}
                {shouldRenderGraph && (
                    <CentralityD3Dashboard
                        analysisGraphSnapshots={isAnalysis ? analysisGraphSnapshots : liveGraphSnapshots}
                        analysisIndex={isAnalysis ? analysisIndex : Math.max(0, liveGraphSnapshots.length - 1)}
                        centralityMetric={centralityMetric}
                        onIndexChange={(index) => navigateAnalysis(index)}
                    />
                )}

                {/* Lineage Timeline - Always visible history */}
                {shouldRenderGraph && (
                    <CommunityLineageTimeline
                        analysis={isAnalysis ? analysisLineage! : liveLineage!}
                        analysisIndex={isAnalysis ? analysisIndex : Math.max(0, (isAnalysis ? analysisLineage : liveLineage)?.stableColorByStep.length ?? 0 - 1)}
                    />
                )}
             </div>
          </div>

        </div>

        {/* 3. EVIDENCE LAYER (Drill-down) */}
        <EvidenceDrawer />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EngineStatus({
  isReady,
  isThinking,
  error,
}: {
  isReady: boolean;
  isThinking: boolean;
  error: string | null;
}) {
  let dotColor = "bg-amber-500 animate-pulse";
  let text = "Initializing...";

  if (error) {
    dotColor = "bg-red-500";
    text = error;
  } else if (isReady && isThinking) {
    dotColor = "bg-amber-500 animate-pulse";
    text = "Thinking...";
  } else if (isReady) {
    dotColor = "bg-emerald-500";
    text = "Engine Ready";
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700 backdrop-blur-sm">
      <span className={`w-2.5 h-2.5 block rounded-full ${dotColor}`} />
      <span className="text-sm font-medium text-slate-300">{text}</span>
    </div>
  );
}

function GameOverModal({
  reason,
  playerColor,
  onAnalyze,
	onExport,
	isExporting,
}: {
  reason?: string;
  playerColor: "w" | "b";
  onAnalyze: () => void;
	onExport: (fps: number) => void;
	isExporting: boolean;
}) {
	const [fps, setFps] = useState(12);

  let title = "Game Over";
  const displayReason = reason ?? "Unknown";

  if (reason === "checkmate") {
    // In checkmate, the side to move lost
    title = "Checkmate";
  } else if (reason === "stalemate") {
    title = "Draw - Stalemate";
  } else if (reason === "draw") {
    title = "Draw";
  } else if (reason === "resignation") {
    title = playerColor === "w" ? "Black Wins" : "White Wins";
  }

  return (
    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center rounded-lg z-50">
      <div className="bg-slate-800 p-8 rounded-2xl border border-slate-600 text-center shadow-2xl max-w-sm w-full">
        <h3 className="text-3xl font-bold text-white mb-2">{title}</h3>
        <p className="text-slate-400 mb-6 font-medium capitalize">
          {displayReason}
        </p>
        <Button
          onClick={onAnalyze}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30"
        >
          Start Graph Analysis
        </Button>

        <div className="mt-4 space-y-2">
          <label className="block text-left text-xs text-slate-300 font-medium">
            Reels FPS
          </label>
          <input
            type="number"
            min={1}
            max={60}
            value={fps}
            onChange={(e) =>
              setFps(Math.max(1, Math.min(60, Number(e.target.value) || 12)))
            }
            className="w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-lg p-2.5"
          />
          <Button
            onClick={() => onExport(fps)}
            disabled={isExporting}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl font-bold shadow-lg"
          >
            {isExporting ? "Exporting..." : "Export Reel"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AnalysisControls({
  index,
  total,
  onNavigate,
  onExit,
}: {
  index: number;
  total: number;
  onNavigate: (dir: "first" | "prev" | "next" | "last") => void;
  onExit: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-5 bg-slate-800/80 rounded-xl border border-indigo-500/30 shadow-lg">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
          Post-Game Analysis
        </span>
        <button
          onClick={onExit}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          Exit Analysis
        </button>
      </div>
      <div className="flex items-center justify-center gap-2">
        <NavButton label="<<" onClick={() => onNavigate("first")} />
        <NavButton label="<" onClick={() => onNavigate("prev")} />
        <span className="w-24 text-center font-mono font-bold text-white bg-slate-900 py-3 rounded-lg border border-slate-700">
          {index} / {total}
        </span>
        <NavButton label=">" onClick={() => onNavigate("next")} />
        <NavButton label=">>" onClick={() => onNavigate("last")} />
      </div>
    </div>
  );
}

function NavButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors font-mono"
    >
      {label}
    </button>
  );
}

function ToggleButton({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center p-2 bg-slate-900/50 rounded-lg cursor-pointer border border-slate-700/50 hover:border-indigo-500/50 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-indigo-500 w-4 h-4 mr-2"
      />
      <span className="text-xs text-slate-300">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------


