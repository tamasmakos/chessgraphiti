/**
 * Train Page — Dense board-centric 2-column layout.
 *
 * Board fills remaining height of left column.
 * Right panel uses a CSS grid to place all visualizations without wasted space.
 */
import { useCallback, useEffect, useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChessBoard,
  EvalBar,
  GraphOverlay,
  CommunityTiles,
  CentralityD3Dashboard,
  TraditionalMetricsDashboard,
  PositionDynamicsPanel,
  CommunityLineageGraph,
  DashboardHeader,
  FluidFieldOverlay,
  TutorArrowOverlay,
  TutorRankingPanel,
} from "#components/chess/index";
import { MeshWarpOverlay } from "#components/chess/MeshWarpOverlay";
import { useGameStore } from "#stores/game-store";
import { useStockfish } from "#hooks/use-stockfish";
import { useApi } from "#lib/api";
import { Button } from "@yourcompany/web/components/base/button";
import { toast } from "sonner";

export const Route = createFileRoute("/train")({
  component: TrainPage,
});

function TrainPage() {
  const { isReady: engineReady, error: engineError } = useStockfish();

  const [visionMode, setVisionMode] = useState<"graph" | "classic">("graph");
  const [leftWidthPct, setLeftWidthPct] = useState(50);
  const [highlightSquares, setHighlightSquares] = useState<Set<string>>(new Set());
  const [fluidFieldOpacity] = useState(0.75);

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
  const analysisGraphSnapshots = useGameStore((s) => s.analysisGraphSnapshots);
  const analysisLineage = useGameStore((s) => s.analysisLineage);
  const history = useGameStore((s) => s.history);
  const engineType = useGameStore((s) => s.engineType);
  const customModelPath = useGameStore((s) => s.customModelPath);
  const customBookPath = useGameStore((s) => s.customBookPath);
  const tutorMode = useGameStore((s) => s.tutorMode);
  const tutorRanking = useGameStore((s) => s.tutorRanking);
  const isTutorAnalyzing = useGameStore((s) => s.isTutorAnalyzing);
  const tutorWinProb = useGameStore((s) => s.tutorWinProb);

  const makeMove = useGameStore((s) => s.makeMove);
  const setPlayerColor = useGameStore((s) => s.setPlayerColor);
  const newGame = useGameStore((s) => s.newGame);
  const undo = useGameStore((s) => s.undo);
  const resign = useGameStore((s) => s.resign);
  const startAnalysis = useGameStore((s) => s.startAnalysis);
  const exitAnalysis = useGameStore((s) => s.exitAnalysis);
  const navigateAnalysis = useGameStore((s) => s.navigateAnalysis);
  const setEngineStrength = useGameStore((s) => s.setEngineStrength);
  const setCentralityMetric = useGameStore((s) => s.setCentralityMetric);
  const setEngineConfig = useGameStore((s) => s.setEngineConfig);
  const setTutorMode = useGameStore((s) => s.setTutorMode);
  const setTutorData = useGameStore((s) => s.setTutorData);
  const setTutorAnalyzing = useGameStore((s) => s.setTutorAnalyzing);

  const handleBoardSync = useCallback(
    (metric: Parameters<typeof setCentralityMetric>[0], squares: Set<string>) => {
      setCentralityMetric(metric);
      setHighlightSquares(squares);
    },
    [setCentralityMetric],
  );

  const orientation = playerColor === "w" ? "white" : "black";
  const isAnalysis = gameStatus === "analysis";
  const isGameOver = gameStatus === "gameover";
  const isPlaying = gameStatus === "playing";
  const canReview = history.length > 0;
  const isInteractive = !isAnalysis && !isGameOver && !isEngineThinking;

  const shouldRenderGraph =
    Boolean(graphSnapshot) && visionMode === "graph" && (liveGraphEnabled || isAnalysis);

  const currentTransition = isAnalysis
    ? analysisLineage?.transitions.find((t) => t.stepIndex === analysisIndex)
    : liveLineage?.transitions[liveLineage.transitions.length - 1];

  const stableColorMap = isAnalysis
    ? analysisLineage?.stableColorByStep[analysisIndex]
    : liveLineage?.stableColorByStep[liveLineage.stableColorByStep.length - 1];

  const activeSnapshots = isAnalysis ? analysisGraphSnapshots : liveGraphSnapshots;
  const activeLineage = isAnalysis ? analysisLineage : liveLineage;
  const activeIndex = isAnalysis ? analysisIndex : Math.max(0, liveGraphSnapshots.length - 1);



  const api = useApi();
  const exportReelMutation = useMutation(
    api.exports.enqueue.mutationOptions({
      onSuccess: (job) => toast.success(`Export queued (id: ${job.id})`),
      onError: (e) => toast.error(`Failed to enqueue export: ${(e as Error).message}`),
    }),
  );
  const enqueueExport = (fps: number) => exportReelMutation.mutate({ fps, pgn, moves: history });

  const engineFilesQuery = useQuery(api.engine.listFiles.queryOptions());
  const models = engineFilesQuery.data?.models ?? [];
  const books = engineFilesQuery.data?.books ?? [];

  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string | null): boolean => {
      if (!targetSquare) return false;
      return makeMove(sourceSquare, targetSquare).success;
    },
    [makeMove],
  );

  // Tutor: run GNN analysis on every FEN change when tutorMode is active
  useEffect(() => {
    if (!tutorMode) return;
    let cancelled = false;
    setTutorAnalyzing(true);
    api.engine.analyzePosition
      .call({ fen, modelPath: customModelPath, bookPath: customBookPath || undefined })
      .then((result) => {
        if (!cancelled) setTutorData(result.ranking ?? [], result.winProb);
      })
      .catch(() => {
        if (!cancelled) setTutorAnalyzing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, tutorMode, fen, customModelPath, customBookPath, setTutorData, setTutorAnalyzing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isAnalysis) return;
      switch (e.key) {
        case "ArrowLeft": e.preventDefault(); navigateAnalysis("prev"); break;
        case "ArrowRight": e.preventDefault(); navigateAnalysis("next"); break;
        case "Home": e.preventDefault(); navigateAnalysis("first"); break;
        case "End": e.preventDefault(); navigateAnalysis("last"); break;
      }
    };
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [isAnalysis, navigateAnalysis]);

  return (
    <div className="h-screen max-h-screen flex flex-col overflow-hidden bg-slate-950 selection:bg-indigo-500/30">

      {/* ── Header bar ── */}
      <DashboardHeader
        engineReady={engineReady}
        isThinking={isEngineThinking}
        engineError={engineError ?? null}
        visionMode={visionMode}
        onSetVisionMode={setVisionMode}
      />

      {/* ── Main 2-column layout ── */}
      <div 
        className="flex-1 min-h-0 flex flex-col lg:flex-row gap-0 overflow-hidden"
        style={{ "--left-width": `${leftWidthPct}%` } as React.CSSProperties}
      >

        {/* ═══ LEFT: Board + controls ══════════════ */}
        <div
          className="flex flex-col flex-shrink-0 p-3 lg:pr-1 gap-2 w-full lg:w-[var(--left-width)]"
        >
          {/* ── Board toolbar ── */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2.5 px-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Play as</span>
              {(["w", "b"] as const).map((c) => (
                <button key={c}
                  onClick={() => { setPlayerColor(c); newGame(); }}
                  className={`px-2.5 py-1 text-[10px] font-black rounded-lg border transition-all ${
                    playerColor === c
                      ? c === "w" ? "bg-white text-slate-900 border-white" : "bg-slate-800 text-white border-slate-500"
                      : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  {c === "w" ? "White" : "Black"}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Depth</span>
              <input type="range" min={0} max={20} step={1} value={engineStrength}
                onChange={(e) => setEngineStrength(Number(e.target.value))}
                className="w-20 accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer" />
              <span className="text-[10px] font-mono text-indigo-400 w-4 text-right">{engineStrength}</span>
            </div>
            <div className="h-4 w-px bg-slate-800" />
            <div className="flex items-center gap-1.5">
              {(isPlaying || isGameOver) && (
                <>
                  <button onClick={undo} className="px-2.5 py-1 text-[10px] font-black text-slate-400 rounded-lg border border-slate-700 hover:text-slate-200 transition-all">Undo</button>
                  <button onClick={resign} className="px-2.5 py-1 text-[10px] font-black text-rose-400 rounded-lg border border-rose-900/50 bg-rose-900/10 hover:bg-rose-900/20 transition-all">Resign</button>
                </>
              )}
              <button onClick={() => { setPlayerColor(playerColor); newGame(); }}
                className="px-2.5 py-1 text-[10px] font-black text-slate-200 rounded-lg border border-slate-700 bg-slate-800/40 hover:bg-slate-800 transition-all">
                New Game
              </button>
            </div>

            <div className="h-4 w-px bg-slate-800" />

            {/* Engine selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Engine</span>
              {(["stockfish", "custom"] as const).map((t) => {
                const activeClass =
                  t === "custom"
                    ? "bg-emerald-900 text-emerald-200 border-emerald-700"
                    : "bg-slate-700 text-white border-slate-500";
                return (
                  <button
                    key={t}
                    onClick={() => setEngineConfig(t, customModelPath, customBookPath)}
                    className={`px-2.5 py-1 text-[10px] font-black rounded-lg border transition-all ${
                      engineType === t
                        ? activeClass
                        : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                    }`}
                  >
                    {t === "stockfish" ? "Stockfish" : "GNN"}
                  </button>
                );
              })}
            </div>

            {engineType === "custom" && (
              <>
                <div className="h-4 w-px bg-slate-800" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Model</span>
                  <select
                    value={customModelPath}
                    onChange={(e) => setEngineConfig("custom", e.target.value, customBookPath)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-[10px] rounded-lg px-2 py-1 font-mono"
                  >
                    {(models.length ? models : [customModelPath]).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <select
                    value={customBookPath}
                    onChange={(e) => setEngineConfig("custom", customModelPath, e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-[10px] rounded-lg px-2 py-1 font-mono"
                  >
                    <option value="">No book</option>
                    {books.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="h-4 w-px bg-slate-800" />
            <button
              onClick={() => setTutorMode(!tutorMode)}
              className={`px-3 py-1.5 text-[11px] font-black rounded-lg border-2 transition-all ${
                tutorMode
                  ? "bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-500/40"
                  : "border-emerald-600 text-emerald-400 hover:bg-emerald-900/30"
              }`}
            >
              🎓 Tutor
            </button>

          </div>

          {/* Board — grows to fill remaining space */}
          <div className="relative flex-1 min-h-0 bg-slate-900/40 rounded-2xl border border-slate-800/60 shadow-2xl overflow-hidden flex items-center justify-center">
            <BoardSizer
              fen={fen}
              orientation={orientation}
              isInteractive={isInteractive}
              shouldRenderGraph={shouldRenderGraph}
              graphSnapshot={graphSnapshot}
              stableColorMap={stableColorMap}
              currentTransition={currentTransition}
              centralityMetric={centralityMetric}
              highlightSquares={highlightSquares}
              onPieceDrop={handlePieceDrop}
              showFluidField={false}
              fluidFieldOpacity={fluidFieldOpacity}
              tutorRanking={tutorRanking}
            />

            {isGameOver && (
              <GameOverModal
                reason={gameOverReason}
                playerColor={playerColor}
                onAnalyze={startAnalysis}
                onExport={enqueueExport}
                isExporting={exportReelMutation.isPending}
              />
            )}
          </div>

          {/* Eval bar */}
          <div className="flex-shrink-0">
            <EvalBar score={evaluation} mate={mateIn} />
          </div>

          {/* Controls */}
          {canReview && (
            <div className="flex-shrink-0">
              <AnalysisControls
                index={isAnalysis ? analysisIndex : history.length}
                total={history.length}
                onNavigate={navigateAnalysis}
                onExit={isAnalysis ? exitAnalysis : undefined}
              />
            </div>
          )}
        </div>

        {/* Drag Handle (Desktop Only) */}
        <div
          className="hidden lg:flex w-2 cursor-col-resize hover:bg-slate-700/50 active:bg-slate-600 transition-colors z-10 flex-shrink-0 items-center justify-center -mx-1"
          onPointerDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startPct = leftWidthPct;
            const handleMove = (moveEvent: PointerEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const deltaPct = (deltaX / window.innerWidth) * 100;
              setLeftWidthPct(Math.max(20, Math.min(80, startPct + deltaPct)));
            };
            const handleUp = () => {
              document.removeEventListener("pointermove", handleMove);
              document.removeEventListener("pointerup", handleUp);
            };
            document.addEventListener("pointermove", handleMove);
            document.addEventListener("pointerup", handleUp);
          }}
        >
          <div className="w-[2px] h-12 bg-slate-700/50 rounded-full" />
        </div>

        {/* ═══ RIGHT: Dense data panel ══════════════ */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-2 p-3 lg:pl-1 overflow-y-auto w-full">

          {/* Tutor ranking (GNN mode only) */}
          {tutorMode && (
            <div className="flex-shrink-0 bg-slate-900/40 rounded-xl border border-emerald-800/40 p-3">
              <TutorRankingPanel
                ranking={tutorRanking ?? []}
                winProb={tutorWinProb}
                isAnalyzing={isTutorAnalyzing}
              />
            </div>
          )}

          {/* Traditional metrics strip */}
          <div className="flex-shrink-0">
            <TraditionalMetricsDashboard fen={fen} compact={true} />
          </div>

          {/* Position dynamics (fragility + tension) */}
          <div className="flex-shrink-0">
            <PositionDynamicsPanel snapshot={graphSnapshot} />
          </div>

          {/* Topology (timeline + radar + force in internal grid) */}
          <div className="flex-shrink-0">
            <CentralityD3Dashboard
              analysisGraphSnapshots={activeSnapshots}
              analysisIndex={activeIndex}
              centralityMetric={centralityMetric}
              onIndexChange={isAnalysis ? (i) => navigateAnalysis(i) : undefined}
              onBoardSync={handleBoardSync}
            />
          </div>

          {/* Community Lineage — Sankey */}
          {activeLineage && (
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Community Lineage</span>
              </div>
              <CommunityLineageGraph
                analysis={activeLineage}
                currentIndex={activeIndex}
                onIndexChange={canReview ? (i) => navigateAnalysis(i) : undefined}
                height={190}
                analysisGraphSnapshots={activeSnapshots}
              />
            </div>
          )}

          {/* Move history */}
          {history.length > 0 && (
            <div className="flex-shrink-0">
              <MoveHistory history={history} analysisIndex={isAnalysis ? analysisIndex : undefined} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BoardSizer — measures available space and sets board width accordingly
// ---------------------------------------------------------------------------

function BoardSizer({
  fen, orientation, isInteractive, shouldRenderGraph, graphSnapshot,
  stableColorMap, currentTransition, centralityMetric, highlightSquares, onPieceDrop,
  showFluidField, fluidFieldOpacity, tutorRanking,
}: {
  fen: string; orientation: "white" | "black"; isInteractive: boolean;
  shouldRenderGraph: boolean; graphSnapshot: any; stableColorMap: any;
  currentTransition: any; centralityMetric: any; highlightSquares: Set<string>;
  onPieceDrop: (from: string, to: string | null) => boolean;
  showFluidField: boolean; fluidFieldOpacity: number;
  tutorRanking: Array<{ move: string; score: number }> | null | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(480);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const size = Math.min(entry.contentRect.width, entry.contentRect.height);
        if (size > 80) setBoardWidth(Math.floor(size));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      <ChessBoard
        fen={fen}
        orientation={orientation}
        onPieceDrop={onPieceDrop}
        interactive={isInteractive}
        boardWidth={boardWidth}
        graphNodes={graphSnapshot?.nodes ?? []}
        centralityMetric={centralityMetric}
        highlightSquares={highlightSquares}
      >
        {showFluidField && graphSnapshot && (
          <FluidFieldOverlay
            snapshot={graphSnapshot}
            playerColor={orientation === "white" ? "white" : "black"}
            boardWidth={boardWidth}
            orientation={orientation}
            overlayOpacity={fluidFieldOpacity}
          />
        )}
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
          <MeshWarpOverlay
            graphSnapshot={graphSnapshot}
            boardWidth={boardWidth}
            orientation={orientation}
          />
        )}
        {shouldRenderGraph && graphSnapshot && (
          <GraphOverlay
            edges={graphSnapshot.edges}
            boardWidth={boardWidth}
            orientation={orientation}
            fen={fen}
            hintMove={null}
            weightThreshold={0.1}
            showDominance={false}
          />
        )}
        {tutorRanking && tutorRanking.length > 0 && (
          <TutorArrowOverlay
            ranking={tutorRanking}
            boardWidth={boardWidth}
            orientation={orientation}
          />
        )}
      </ChessBoard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vision Controls
// ---------------------------------------------------------------------------
function VisionControls({ centralityMetric, onSetMetric, visionMode, onSetVisionMode }: {
  centralityMetric: string; onSetMetric: (m: any) => void;
  visionMode: "graph" | "classic"; onSetVisionMode: (m: "graph" | "classic") => void;
}) {
  const modes = [{ id: "graph", label: "Graphity" }, { id: "classic", label: "Classic" }] as const;
  const metrics = [
    { id: "weighted", label: "Impact" }, { id: "degree", label: "Activity" },
    { id: "betweenness", label: "Bridge" }, { id: "pagerank", label: "PageRank" },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="flex items-center bg-slate-900/70 p-0.5 rounded-lg border border-slate-800/60">
        {modes.map((m) => (
          <button key={m.id} onClick={() => onSetVisionMode(m.id)}
            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-tight rounded-md transition-all ${
              visionMode === m.id ? "bg-slate-700 text-white shadow" : "text-slate-500 hover:text-slate-300"
            }`}>
            {m.label}
          </button>
        ))}
      </div>
      {visionMode === "graph" && (
        <div className="flex items-center bg-slate-900/70 p-0.5 rounded-lg border border-slate-800/60">
          {metrics.map((m) => (
            <button key={m.id} onClick={() => onSetMetric(m.id)}
              className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-tight rounded-md transition-all ${
                centralityMetric === m.id
                  ? "bg-indigo-600 text-white shadow-[0_0_10px_rgba(99,102,241,0.35)]"
                  : "text-slate-500 hover:text-slate-300"
              }`}>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analysis Controls
// ---------------------------------------------------------------------------
function AnalysisControls({ index, total, onNavigate, onExit }: Readonly<{
  index: number;
  total: number;
  onNavigate: (dir: "first" | "prev" | "next" | "last") => void;
  onExit?: () => void;
}>) {
  const canGoPrev = index > 0;
  const canGoNext = index < total;

  return (
    <div className="flex items-center gap-2 bg-slate-900/60 rounded-xl border border-indigo-500/20 px-3 py-2">
      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex-shrink-0">Analysis</span>
      <div className="flex items-center gap-1">
        {canGoPrev && (
          <button onClick={() => onNavigate("prev")}
            className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-[11px] font-mono transition-colors">
            ⟨
          </button>
        )}
        <span className="text-[11px] font-mono font-bold text-white px-2 py-1 bg-slate-900 rounded-lg border border-slate-800 min-w-[50px] text-center">
          {index}/{total}
        </span>
        {canGoNext && (
          <button onClick={() => onNavigate("next")}
            className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-[11px] font-mono transition-colors">
            ⟩
          </button>
        )}
      </div>
      <div className="flex-1" />
      {onExit && (
        <button onClick={onExit} className="text-[10px] text-slate-500 hover:text-slate-200 transition-colors font-medium">Exit ×</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game Over Modal
// ---------------------------------------------------------------------------
function GameOverModal({ reason, playerColor, onAnalyze, onExport, isExporting }: {
  reason?: string; playerColor: "w" | "b";
  onAnalyze: () => void; onExport: (fps: number) => void; isExporting: boolean;
}) {
  const [fps, setFps] = useState(12);
  let title = "Game Over";
  if (reason === "checkmate") title = "Checkmate";
  else if (reason === "stalemate") title = "Draw — Stalemate";
  else if (reason === "draw") title = "Draw";
  else if (reason === "resignation") title = playerColor === "w" ? "Black Wins" : "White Wins";

  return (
    <div className="absolute inset-0 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center rounded-2xl z-50">
      <div className="bg-slate-900 p-8 rounded-2xl border border-slate-700/60 text-center shadow-2xl max-w-xs w-full mx-4">
        <h3 className="text-2xl font-black text-white mb-1">{title}</h3>
        <p className="text-slate-400 mb-6 font-medium capitalize text-sm">{reason}</p>
        <Button onClick={onAnalyze} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/25">
          Analyse Game
        </Button>
        <div className="mt-4 flex items-center gap-2">
          <input type="number" min={1} max={60} value={fps}
            onChange={(e) => setFps(Math.max(1, Math.min(60, Number(e.target.value) || 12)))}
            className="w-16 bg-slate-800 border border-slate-700 text-white text-xs rounded-lg p-2 text-center" />
          <Button onClick={() => onExport(fps)} disabled={isExporting}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold border border-slate-700">
            {isExporting ? "Exporting…" : "Export Reel"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Move History
// ---------------------------------------------------------------------------
function MoveHistory({ history, analysisIndex }: {
  history: { san: string }[]; analysisIndex?: number;
}) {
  return (
    <div className="bg-slate-900/40 rounded-xl border border-slate-800/50 p-3">
      <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2">Move History</div>
      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
        {history.map((m, i) => (
          <span key={i}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
              analysisIndex !== undefined && i + 1 === analysisIndex
                ? "bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500/40"
                : i % 2 === 0 ? "text-slate-200" : "text-slate-500"
            }`}>
            {i % 2 === 0 && <span className="text-slate-700">{Math.floor(i / 2) + 1}.</span>} {m.san}
          </span>
        ))}
      </div>
    </div>
  );
}
