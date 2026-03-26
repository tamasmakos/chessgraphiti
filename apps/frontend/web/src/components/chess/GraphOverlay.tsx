import React, { useId, useMemo } from "react";
import { getAttackedSquares, parsePieces } from "@yourcompany/chess/graph";
import type { GraphEdge, GraphNode } from "@yourcompany/chess/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type EdgeFilter = "attack" | "defense" | "both";

interface GraphOverlayProps {
  /** Graph edges to render as arrows */
  edges: GraphEdge[];
  /** Board width in pixels (the board is always square) */
  boardWidth: number;
  /** Board orientation */
  orientation: "white" | "black";
  /** Current board position */
  fen: string;
  /** Optional hint arrow for opening training mode */
  hintMove?: { from: string; to: string } | null;
  /** Previous-step edges to render analysis deltas */
  previousEdges?: GraphEdge[];
  /** If true, render changed-edge deltas instead of full graph */
  deltaMode?: boolean;
  /** If true, render subtle square dominance heatmap */
  showDominance?: boolean;
  /** Minimum normalized weight (0-1) for edges to display */
  weightThreshold?: number;
  /** Which edge types to show; defaults to "both" */
  edgeFilter?: EdgeFilter;
  /** Graph nodes — when provided and edgeFilter=="both", edges are colored by source community */
  nodes?: GraphNode[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ATTACK_COLOR = "#e11d48";
const DEFENSE_COLOR = "#0ea5e9";
const HINT_COLOR = "#10b981";

/** Solid-hex parallels to COMMUNITY_COLORS — used for edge strokes in "both" mode */
const COMMUNITY_EDGE_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#0ea5e9",
  "#14b8a6",
] as const;

function getNormalizedWeight(absWeight: number, maxAbsWeight: number) {
  return Math.log1p(absWeight) / Math.log1p(maxAbsWeight);
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

export function squareToPixel(
  square: string,
  boardWidth: number,
  orientation: "white" | "black",
): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number.parseInt(square[1] ?? "1", 10) - 1;
  const squareSize = boardWidth / 8;

  const x =
    orientation === "white"
      ? file * squareSize + squareSize / 2
      : (7 - file) * squareSize + squareSize / 2;

  const y =
    orientation === "white"
      ? (7 - rank) * squareSize + squareSize / 2
      : rank * squareSize + squareSize / 2;

  return { x, y };
}

function squareToTopLeft(
  square: string,
  boardWidth: number,
  orientation: "white" | "black",
): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number.parseInt(square[1] ?? "1", 10) - 1;
  const squareSize = boardWidth / 8;

  const x =
    orientation === "white" ? file * squareSize : (7 - file) * squareSize;

  const y =
    orientation === "white" ? (7 - rank) * squareSize : rank * squareSize;

  return { x, y };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GraphOverlay = React.memo(function GraphOverlay({
  edges,
  boardWidth,
  orientation,
  fen,
  hintMove,
  showDominance = true,
  weightThreshold = 0.15,
  edgeFilter = "both",
  nodes,
}: GraphOverlayProps) {
  const overlayId = useId().replace(/[:]/g, "");

  const { visibleEdges, maxAbsWeight } = useMemo(() => {
    if (edges.length === 0) return { visibleEdges: [], maxAbsWeight: 1 };

    const absWeights = edges.map((e) => Math.abs(e.weight));
    const max = Math.max(...absWeights, 0.001);

    const filtered = edges.filter((e) => {
      const normalizedWeight = getNormalizedWeight(Math.abs(e.weight), max);
      return normalizedWeight >= weightThreshold;
    });

    return { visibleEdges: filtered, maxAbsWeight: max };
  }, [edges, weightThreshold]);

  const edgePaths = useMemo(() => {
    // Build a square → communityId lookup when nodes are provided
    const communityMap = new Map<string, number>();
    if (nodes) {
      for (const n of nodes) communityMap.set(n.square, n.communityId);
    }
    const useCommunityColors = edgeFilter === "both" && communityMap.size > 0;

    // Filter by type, then sort attacks before defenses
    const sorted = visibleEdges
      .filter((e) => edgeFilter === "both" || e.type === edgeFilter)
      .sort((a, b) => {
        if (a.type === "attack" && b.type === "defense") return -1;
        if (a.type === "defense" && b.type === "attack") return 1;
        return 0;
      });

    return sorted.map((edge) => {
      const src = squareToPixel(edge.from, boardWidth, orientation);
      const tgt = squareToPixel(edge.to, boardWidth, orientation);

      const isAttack = edge.type === "attack";
      const absWeight = Math.abs(edge.weight);
      const normalizedWeight = getNormalizedWeight(absWeight, maxAbsWeight);

      let color: string;
      let communityIdx: number | undefined;
      if (useCommunityColors) {
        const cid = communityMap.get(edge.from) ?? 0;
        communityIdx = cid % COMMUNITY_EDGE_COLORS.length;
        color = COMMUNITY_EDGE_COLORS[communityIdx] ?? ATTACK_COLOR;
      } else {
        color = isAttack ? ATTACK_COLOR : DEFENSE_COLOR;
      }

      const opacity = 0.65 + normalizedWeight * 0.35;
      const strokeWidth = 2.5 + normalizedWeight * 4.0;
      // In community mode: solid for attack, dashed for defense to preserve the distinction
      const dashArray = useCommunityColors && !isAttack ? "5 3" : "1000 1000";

      const d = `M ${src.x} ${src.y} L ${tgt.x} ${tgt.y}`;
      const key = `${fen}-${edge.from}-${edge.to}-${edge.type}`;
      const delay = isAttack ? 0 : 0.25;

      let markerEnd: string;
      if (useCommunityColors) {
        markerEnd = `url(#arrow-community-${communityIdx}-${overlayId})`;
      } else if (isAttack) {
        markerEnd = `url(#arrow-attack-${overlayId})`;
      } else {
        markerEnd = `url(#arrow-defense-${overlayId})`;
      }

      return {
        key,
        d,
        color,
        opacity,
        strokeWidth,
        isAttack,
        dashArray,
        className: isAttack ? "cg-edge-attack" : "cg-edge-defense",
        style: { animationDelay: `${delay.toFixed(3)}s` },
        markerEnd,
      };
    });
  }, [visibleEdges, boardWidth, orientation, maxAbsWeight, fen, nodes, edgeFilter, overlayId]);

  const hintLine = useMemo(() => {
    if (!hintMove) return null;
    const src = squareToPixel(hintMove.from, boardWidth, orientation);
    const tgt = squareToPixel(hintMove.to, boardWidth, orientation);
    return {
      src,
      tgt,
      d: `M ${src.x} ${src.y} L ${tgt.x} ${tgt.y}`,
    };
  }, [hintMove, boardWidth, orientation]);

  const dominanceCells = useMemo(() => {
    if (!showDominance) return [];

    const pieces = parsePieces(fen);
    const occupiedSquares = new Set(pieces.map((piece) => piece.square));
    const bySquare = new Map<
      string,
      { whiteControllers: Set<string>; blackControllers: Set<string> }
    >();

    for (const piece of pieces) {
      const attackedSquares = getAttackedSquares(piece.square, fen);
      for (const square of attackedSquares) {
        if (occupiedSquares.has(square)) continue;

        const current = bySquare.get(square) ?? {
          whiteControllers: new Set<string>(),
          blackControllers: new Set<string>(),
        };
        if (piece.color === "w") {
          current.whiteControllers.add(piece.square);
        } else {
          current.blackControllers.add(piece.square);
        }
        bySquare.set(square, current);
      }
    }

    const maxControllers = Math.max(
      ...[...bySquare.values()].map(
        (entry) =>
          entry.whiteControllers.size + entry.blackControllers.size,
      ),
      1,
    );
    const maxSideControllers = Math.max(
      ...[...bySquare.values()].flatMap(
        (entry) => [entry.whiteControllers.size, entry.blackControllers.size]
      ),
      1,
    );
    const squareSize = boardWidth / 8;

    return [...bySquare.entries()].map(([square, value]) => {
      const { x, y } = squareToTopLeft(square, boardWidth, orientation);
      const whiteCount = value.whiteControllers.size;
      const blackCount = value.blackControllers.size;
      const padding = squareSize * 0.05;
      const maxBarLength = squareSize - padding * 2;

      const whiteIntensity = whiteCount / maxSideControllers;
      const blackIntensity = blackCount / maxSideControllers;

      // Base opacities - more aggressive scaling
      const whiteOpacity = whiteCount > 0 ? Math.min(1, 0.3 + whiteIntensity * 0.7) : 0;
      const blackOpacity = blackCount > 0 ? Math.min(1, 0.3 + blackIntensity * 0.7) : 0;

      // Halos for strong dominance pieces
      const whiteHaloOpacity = whiteIntensity > 0.5 ? (whiteIntensity - 0.4) * 0.8 : 0;
      const blackHaloOpacity = blackIntensity > 0.5 ? (blackIntensity - 0.4) * 0.8 : 0;

      // Pulse animation for extreme pressure
      const whitePulse = whiteIntensity > 0.8;
      const blackPulse = blackIntensity > 0.8;

      const whiteThickness =
        whiteCount > 0
          ? Math.max(2, squareSize * 0.025 + Math.pow(whiteIntensity, 1.5) * squareSize * 0.05)
          : 0;
      const blackThickness =
        blackCount > 0
          ? Math.max(2, squareSize * 0.025 + Math.pow(blackIntensity, 1.5) * squareSize * 0.05)
          : 0;

      const whiteY =
        orientation === "white"
          ? y + squareSize - padding - whiteThickness
          : y + padding;

      const blackY =
        orientation === "white"
          ? y + padding
          : y + squareSize - padding - blackThickness;

      const whiteLength =
        whiteCount > 0
          ? Math.max(squareSize * 0.15, maxBarLength * Math.sqrt(whiteIntensity))
          : 0;
      const blackLength =
        blackCount > 0
          ? Math.max(squareSize * 0.15, maxBarLength * Math.sqrt(blackIntensity))
          : 0;

      const whiteX = x + (squareSize - whiteLength) / 2;
      const blackX = x + (squareSize - blackLength) / 2;

      // When pressure is very high, shift colors slightly hotter 
      // Rose-500 is rgba(244,63,94,1), if intense shift to Rose-400 or lighter
      const whiteColor = whiteIntensity > 0.8 ? "rgba(251,113,133,1)" : "rgba(244,63,94,1)";
      // Teal-500 is rgba(20,184,166,1), if intense shift to Teal-400
      const blackColor = blackIntensity > 0.8 ? "rgba(45,212,191,1)" : "rgba(20,184,166,1)";

      return {
        key: square,
        showWhite: whiteCount > 0,
        showBlack: blackCount > 0,
        white: {
          x: whiteX,
          y: whiteY,
          width: whiteLength,
          height: whiteThickness,
          opacity: whiteOpacity,
          haloOpacity: whiteHaloOpacity,
          color: whiteColor,
          pulse: whitePulse,
        },
        black: {
          x: blackX,
          y: blackY,
          width: blackLength,
          height: blackThickness,
          opacity: blackOpacity,
          haloOpacity: blackHaloOpacity,
          color: blackColor,
          pulse: blackPulse,
        },
      };
    });
  }, [showDominance, fen, boardWidth, orientation, overlayId]);

  return (
    <svg
      width={boardWidth}
      height={boardWidth}
      viewBox={`0 0 ${boardWidth} ${boardWidth}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <defs>
        <marker
          id={`arrow-attack-${overlayId}`}
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0 2, 8 5, 0 8" fill={ATTACK_COLOR} />
        </marker>

        <marker
          id={`arrow-defense-${overlayId}`}
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0 2, 8 5, 0 8" fill={DEFENSE_COLOR} />
        </marker>

        <marker
          id={`arrow-hint-${overlayId}`}
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0 2, 10 6, 0 10" fill={HINT_COLOR} />
        </marker>

        {/* Per-community markers for "both" edge-filter mode */}
        {COMMUNITY_EDGE_COLORS.map((color, idx) => (
          <marker
            key={color}
            id={`arrow-community-${idx}-${overlayId}`}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <polygon points="0 2, 8 5, 0 8" fill={color} />
          </marker>
        ))}
      </defs>

      {dominanceCells.map((cell) => (
        <g key={`dom-${cell.key}`}>
          {cell.showWhite && (
            <g className={cell.white.pulse ? "animate-pulse" : ""}>
              {cell.white.haloOpacity > 0 && (
                <rect
                  x={cell.white.x - 3}
                  y={cell.white.y - 3}
                  width={cell.white.width + 6}
                  height={cell.white.height + 6}
                  fill={cell.white.color}
                  opacity={cell.white.haloOpacity}
                  rx={(cell.white.height + 6) / 2}
                />
              )}
              <rect
                x={cell.white.x}
                y={cell.white.y}
                width={cell.white.width}
                height={cell.white.height}
                fill={cell.white.color}
                opacity={cell.white.opacity}
                rx={cell.white.height / 2}
              />
            </g>
          )}
          {cell.showBlack && (
            <g className={cell.black.pulse ? "animate-pulse" : ""}>
              {cell.black.haloOpacity > 0 && (
                <rect
                  x={cell.black.x - 3}
                  y={cell.black.y - 3}
                  width={cell.black.width + 6}
                  height={cell.black.height + 6}
                  fill={cell.black.color}
                  opacity={cell.black.haloOpacity}
                  rx={(cell.black.height + 6) / 2}
                />
              )}
              <rect
                x={cell.black.x}
                y={cell.black.y}
                width={cell.black.width}
                height={cell.black.height}
                fill={cell.black.color}
                opacity={cell.black.opacity}
                rx={cell.black.height / 2}
              />
            </g>
          )}
        </g>
      ))}

      {edgePaths.map((line) => (
        <path
          key={line.key}
          className={line.className}
          style={line.style}
          d={line.d}
          stroke={line.color}
          strokeOpacity={line.opacity}
          strokeWidth={line.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={line.dashArray}
          fill="none"
          markerEnd={line.markerEnd}
        />
      ))}

      {hintLine && (
        <path
          d={hintLine.d}
          stroke={HINT_COLOR}
          strokeOpacity={0.85}
          strokeWidth={5}
          strokeLinecap="round"
          fill="none"
          markerEnd={`url(#arrow-hint-${overlayId})`}
        />
      )}
    </svg>
  );
});
