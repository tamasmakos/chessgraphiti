import { useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { GraphNode } from "@yourcompany/chess/types";
import { useGameStore } from "#stores/game-store";

type CentralityMetric =
  | "weighted"
  | "degree"
  | "betweenness"
  | "closeness"
  | "pagerank"
  | "none";

interface ChessBoardProps {
  /** Current board position in FEN notation */
  fen: string;
  /** Board orientation */
  orientation: "white" | "black";
  /**
   * Handler for piece drops. Return true to accept the move, false to reject.
   * sourceSquare is always a string; targetSquare may be null if dropped off board.
   */
  onPieceDrop?: (sourceSquare: string, targetSquare: string | null) => boolean;
  /** Whether the board accepts user interaction (default: true) */
  interactive?: boolean;
  /** Board width in pixels (default: 560) */
  boardWidth?: number;
  /** Optional children rendered as an absolute overlay (e.g. GraphOverlay, CommunityTiles) */
  children?: React.ReactNode;
  /** Optional graph nodes for centrality-based piece scaling */
  graphNodes?: GraphNode[];
  /** Metric used for piece scaling */
  centralityMetric?: CentralityMetric;
}

function getCentralityValue(node: GraphNode, metric: CentralityMetric): number {
  switch (metric) {
    case "weighted":
      return node.centralityWeighted;
    case "degree":
      return node.centralityDegree;
    case "betweenness":
      return node.centralityBetweenness;
    case "closeness":
      return node.centralityCloseness;
    case "pagerank":
      return node.centralityPageRank;
    case "none":
    default:
      return 0;
  }
}

/**
 * Controlled chessboard component wrapping react-chessboard v5.
 *
 * Renders inside a relative container so graph overlays and community tiles
 * can be absolutely positioned on top of / beneath the board.
 *
 * Piece scaling: `squareRenderer` wraps square contents in a flex box and
 * applies `transform: scale(...)` in React. Avoid imperative DOM under the
 * board — reparenting piece nodes breaks reconciliation (removeChild errors).
 */
export function ChessBoard({
  fen,
  orientation,
  onPieceDrop,
  interactive = true,
  boardWidth = 560,
  children,
  graphNodes = [],
  centralityMetric = "none",
}: ChessBoardProps) {
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const setHoveredSquare = useGameStore((s) => s.setHoveredSquare);

  const scaledSquareRenderer = useMemo(() => {
    const bySquare = new Map<string, number>();
    for (const n of graphNodes) {
      bySquare.set(n.square, getCentralityValue(n, centralityMetric));
    }
    const max = Math.max(...bySquare.values(), 0.0001);

    return ({
      piece,
      square,
      children,
    }: {
      piece: { pieceType: string } | null;
      square: string;
      children?: React.ReactNode;
    }) => {
      const base: React.CSSProperties = {
        width: "100%",
        height: "100%",
      };

      const canScale =
        centralityMetric !== "none" &&
        graphNodes.length > 0 &&
        piece !== null &&
        bySquare.has(square);

      let scale = 1;
      if (canScale) {
        const raw = bySquare.get(square);
        if (raw !== undefined) {
          const ratio = raw / max;
          // Min/max scale span ~40% (was ~14%) so high-centrality pieces read clearly.
          scale = 0.72 + ratio * 0.40;
        }
      }

      return (
        <div 
          style={base}
          onMouseEnter={() => setHoveredSquare(square)}
          onMouseLeave={() => setHoveredSquare(null)}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...(canScale
                ? {
                    transform: `scale(${scale.toFixed(3)})`,
                    transformOrigin: "center center",
                    transition: "transform 180ms ease-out",
                  }
                : {}),
            }}
          >
            {children}
          </div>
        </div>
      );
    };
  }, [graphNodes, centralityMetric]);

  const options = useMemo(
    () => ({
      /** Must match use in Piece.tsx: `${id}-piece-${pieceType}-${square}` */
      id: "cg-chessboard",
      position: fen,
      boardOrientation: orientation as "white" | "black",
      allowDragging: interactive,
      darkSquareStyle: { backgroundColor: "var(--cg-board-dark, #64748b)" } as React.CSSProperties,
      lightSquareStyle: { backgroundColor: "var(--cg-board-light, #e2e8f0)" } as React.CSSProperties,
      animationDurationInMs: 200,
      boardStyle: { borderRadius: "0.5rem" } as React.CSSProperties,
      squareRenderer: scaledSquareRenderer,
      customSquareStyles: moveFrom
        ? { [moveFrom]: { backgroundColor: "rgba(255, 255, 0, 0.4)" } }
        : {},
      ...(interactive && onPieceDrop
        ? {
            onSquareClick: ({ square }: { square: string, piece?: unknown }) => {
              if (!moveFrom) {
                setMoveFrom(square);
                return;
              }
              const success = onPieceDrop(moveFrom, square);
              if (!success) {
                setMoveFrom(square);
              } else {
                setMoveFrom(null);
              }
            },
            onPieceDrop: ({
              sourceSquare,
              targetSquare,
            }: {
              piece: unknown;
              sourceSquare: string;
              targetSquare: string | null;
            }) => {
              setMoveFrom(null);
              return onPieceDrop(sourceSquare, targetSquare);
            },
          }
        : {}),
      ...(!interactive ? { canDragPiece: () => false } : {}),
    }),
    [fen, orientation, interactive, onPieceDrop, scaledSquareRenderer, moveFrom],
  );

  return (
    <div
      className="relative rounded-lg shadow-lg shadow-black/30 overflow-hidden"
      style={{
        width: boardWidth,
        height: boardWidth,
        backgroundColor: "var(--cg-board-bg, #111827)",
      }}
    >
      <Chessboard options={options} />

      {children && (
        <div className="absolute inset-0 pointer-events-none">{children}</div>
      )}
    </div>
  );
}
