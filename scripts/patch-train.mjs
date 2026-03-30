import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = "C:/Users/User/Documents/dev/chessgraphiti";
const TARGET = resolve(ROOT, "apps/frontend/web/src/routes/train.tsx");

let src = execSync("git show HEAD:apps/frontend/web/src/routes/train.tsx", {
  encoding: "utf-8",
  cwd: ROOT,
});

// ── 1. Add useQuery to @tanstack/react-query import ──────────────────────────
src = src.replace(
  'import { useMutation } from "@tanstack/react-query";',
  'import { useMutation, useQuery } from "@tanstack/react-query";',
);

// ── 2. Add TutorArrowOverlay + TutorRankingPanel to chess index import ────────
src = src.replace(
  "  FluidFieldOverlay,\n} from \"#components/chess/index\";",
  "  FluidFieldOverlay,\n  TutorArrowOverlay,\n  TutorRankingPanel,\n} from \"#components/chess/index\";",
);

// ── 3. Add new store reads after history ─────────────────────────────────────
src = src.replace(
  "  const history = useGameStore((s) => s.history);",
  `  const history = useGameStore((s) => s.history);
  const engineType = useGameStore((s) => s.engineType);
  const customModelPath = useGameStore((s) => s.customModelPath);
  const customBookPath = useGameStore((s) => s.customBookPath);
  const tutorMode = useGameStore((s) => s.tutorMode);
  const tutorRanking = useGameStore((s) => s.tutorRanking);
  const isTutorAnalyzing = useGameStore((s) => s.isTutorAnalyzing);
  const tutorWinProb = useGameStore((s) => s.tutorWinProb);`,
);

// ── 4. Add new store actions after setCentralityMetric ───────────────────────
src = src.replace(
  "  const setCentralityMetric = useGameStore((s) => s.setCentralityMetric);",
  `  const setCentralityMetric = useGameStore((s) => s.setCentralityMetric);
  const setEngineConfig = useGameStore((s) => s.setEngineConfig);
  const setTutorMode = useGameStore((s) => s.setTutorMode);
  const setTutorData = useGameStore((s) => s.setTutorData);
  const setTutorAnalyzing = useGameStore((s) => s.setTutorAnalyzing);`,
);

// ── 5. Add engine files query + tutor effect after enqueueExport ─────────────
src = src.replace(
  "  const enqueueExport = (fps: number) => exportReelMutation.mutate({ fps, pgn, moves: history });",
  `  const enqueueExport = (fps: number) => exportReelMutation.mutate({ fps, pgn, moves: history });

  const engineFilesQuery = useQuery(api.engine.listFiles.queryOptions());
  const models = engineFilesQuery.data?.models ?? [];
  const books = engineFilesQuery.data?.books ?? [];`,
);

// ── 6. Add tutor analysis effect before keyboard effect ──────────────────────
src = src.replace(
  `  useEffect(() => {
    const handler = (e: KeyboardEvent) => {`,
  `  // Tutor: run GNN analysis on every FEN change when tutorMode is active
  useEffect(() => {
    if (!tutorMode || engineType !== "custom") return;
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
  }, [api, tutorMode, engineType, fen, customModelPath, customBookPath, setTutorData, setTutorAnalyzing]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {`,
);

// ── 7. Add engine selector + GNN controls after "New Game" button group ───────
//    The original ends the button group with:
//      </div>
//
//          </div>           <- closes the toolbar flex div
//
//          {/* Board ...
//
// We inject right before the closing </div> of the toolbar.
src = src.replace(
  `            </div>

          </div>

          {/* Board`,
  `            </div>

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
                    className={\`px-2.5 py-1 text-[10px] font-black rounded-lg border transition-all \${
                      engineType === t
                        ? activeClass
                        : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                    }\`}
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
                <div className="h-4 w-px bg-slate-800" />
                <button
                  onClick={() => setTutorMode(!tutorMode)}
                  className={\`px-2.5 py-1 text-[10px] font-black rounded-lg border transition-all \${
                    tutorMode
                      ? "bg-emerald-800 text-emerald-100 border-emerald-600"
                      : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }\`}
                >
                  Tutor
                </button>
              </>
            )}

          </div>

          {/* Board`,
);

// ── 8. Add TutorRankingPanel to the right panel before TraditionalMetrics ─────
src = src.replace(
  `          {/* Traditional metrics strip */}
          <div className="flex-shrink-0">
            <TraditionalMetricsDashboard fen={fen} compact={true} />
          </div>`,
  `          {/* Tutor ranking (GNN mode only) */}
          {tutorMode && engineType === "custom" && (
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
          </div>`,
);

// ── 9. Add tutorRanking prop to BoardSizer call ───────────────────────────────
src = src.replace(
  `              showFluidField={false}
              fluidFieldOpacity={fluidFieldOpacity}
            />`,
  `              showFluidField={false}
              fluidFieldOpacity={fluidFieldOpacity}
              tutorRanking={tutorRanking}
            />`,
);

// ── 10. Update BoardSizer signature to accept tutorRanking ────────────────────
src = src.replace(
  `function BoardSizer({
  fen, orientation, isInteractive, shouldRenderGraph, graphSnapshot,
  stableColorMap, currentTransition, centralityMetric, highlightSquares, onPieceDrop,
  showFluidField, fluidFieldOpacity,
}: {
  fen: string; orientation: "white" | "black"; isInteractive: boolean;
  shouldRenderGraph: boolean; graphSnapshot: any; stableColorMap: any;
  currentTransition: any; centralityMetric: any; highlightSquares: Set<string>;
  onPieceDrop: (from: string, to: string | null) => boolean;
  showFluidField: boolean; fluidFieldOpacity: number;
})`,
  `function BoardSizer({
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
})`,
);

// ── 11. Remove centralityMetric from MeshWarpOverlay ─────────────────────────
src = src.replace(
  `          <MeshWarpOverlay
            graphSnapshot={graphSnapshot}
            centralityMetric={centralityMetric}
            boardWidth={boardWidth}
            orientation={orientation}
          />`,
  `          <MeshWarpOverlay
            graphSnapshot={graphSnapshot}
            boardWidth={boardWidth}
            orientation={orientation}
          />`,
);

// ── 12. Add TutorArrowOverlay after GraphOverlay ─────────────────────────────
src = src.replace(
  `        {shouldRenderGraph && graphSnapshot && (
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
      </ChessBoard>`,
  `        {shouldRenderGraph && graphSnapshot && (
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
      </ChessBoard>`,
);

// ── Verify key strings are present ───────────────────────────────────────────
const checks = [
  "useQuery",
  "TutorArrowOverlay",
  "TutorRankingPanel",
  "engineType",
  "setEngineConfig",
  "tutorMode",
  "engineFilesQuery",
  "GNN",
  "Tutor",
  "tutorRanking",
];
for (const check of checks) {
  if (!src.includes(check)) {
    console.error(`MISSING: ${check}`);
    process.exit(1);
  }
}

writeFileSync(TARGET, src, "utf-8");
console.log(`Written ${src.split("\n").length} lines to ${TARGET}`);
