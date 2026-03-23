/**
 * React hook for Stockfish engine integration.
 *
 * Manages the engine lifecycle (init, cleanup) and provides methods
 * to request engine moves and evaluations. Bridges the StockfishWeb
 * implementation with the game store.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { StockfishWeb } from "#lib/stockfish";
import type { ChessEngine } from "@yourcompany/chess/types";
import { useGameStore } from "#stores/game-store";

interface UseStockfishReturn {
  /** Whether the engine is loaded and ready */
  isReady: boolean;
  /** Initialization or runtime error, if engine is unavailable */
  error: string | null;
  /** Request the engine to make its move (for the current position) */
  requestEngineMove: () => void;
}

export function useStockfish(): UseStockfishReturn {
  const engineRef = useRef<ChessEngine | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fen = useGameStore((s) => s.fen);
  const playerColor = useGameStore((s) => s.playerColor);
  const gameStatus = useGameStore((s) => s.gameStatus);
  const isEngineThinking = useGameStore((s) => s.isEngineThinking);
  const engineStrength = useGameStore((s) => s.engineStrength);
  const makeMove = useGameStore((s) => s.makeMove);
  const setEngineThinking = useGameStore((s) => s.setEngineThinking);
  const setEvaluation = useGameStore((s) => s.setEvaluation);
  const setEngineLines = useGameStore((s) => s.setEngineLines);


  // Initialize engine on mount
  useEffect(() => {
    let cancelled = false;
    const engine = new StockfishWeb();
    engineRef.current = engine;

    engine
      .init()
      .then(() => {
        if (cancelled) return;
        setIsReady(true);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to initialize Stockfish:", err);
        setIsReady(false);
        setError("Engine unavailable");
      });

    return () => {
      cancelled = true;
      engine.quit().catch(() => {});
      engineRef.current = null;
      setIsReady(false);
      setError(null);
    };
  }, []);

  const requestEngineMove = useCallback(async () => {
    const engine = engineRef.current;
    const store = useGameStore.getState();

    if (!engine || !isReady) return;
    if (store.gameStatus !== "playing" && store.gameStatus !== "idle") return;
    if (store.isEngineThinking) return;

    // Determine whose turn it is from the FEN
    const fenParts = store.fen.split(" ");
    const turnColor = fenParts[1] ?? "w";

    // Only move if it's the engine's turn
    if (turnColor === store.playerColor) return;


    // Use Stockfish for free play
    setEngineThinking(true);
    try {
      await engine.setPosition(store.fen);

      // Get evaluation and best move together
      const skillLevel = Math.max(0, Math.min(20, Math.round(engineStrength)));
      // Depth mapping keeps search manageable while still showing strength differences.
      const depth = 6 + Math.round((skillLevel / 20) * 8); // 6..14

      const evalResult = await engine.getEvaluation({ depth, skillLevel });
      setEvaluation(evalResult.score, evalResult.mate);
      setEngineLines(evalResult.pv);

      // Parse the best move (it's in long algebraic notation: e2e4)
      const bestMove = evalResult.pv[0];
      if (bestMove && bestMove.length >= 4) {
        const from = bestMove.substring(0, 2);
        const to = bestMove.substring(2, 4);
        const promotion =
          bestMove.length > 4 ? bestMove.substring(4, 5) : undefined;
        makeMove(from, to, promotion);
      }
    } catch (err) {
      console.error("Engine move failed:", err);
      setError("Engine request failed");
    } finally {
      setEngineThinking(false);
    }
  }, [
    isReady,
    makeMove,
    setEngineThinking,
    setEvaluation,

    engineStrength,
  ]);

  // Auto-trigger engine move when it's the engine's turn
  useEffect(() => {
    if (!isReady || error) return;
    if (gameStatus !== "playing" && gameStatus !== "idle") return;
    if (isEngineThinking) return;

    const fenParts = fen.split(" ");
    const turnColor = fenParts[1] ?? "w";
    if (turnColor === playerColor) return;

    // Small delay before engine starts thinking
    const timer = setTimeout(() => {
      // Re-verify conditions inside the timer as well
      const currentStore = useGameStore.getState();
      if (currentStore.gameStatus === "playing" || currentStore.gameStatus === "idle") {
        requestEngineMove();
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [fen, isReady, error, gameStatus, isEngineThinking, playerColor, requestEngineMove]);

  return { isReady, error, requestEngineMove };
}
