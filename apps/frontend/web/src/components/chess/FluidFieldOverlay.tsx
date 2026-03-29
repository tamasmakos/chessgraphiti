import React, { useMemo } from "react";
import type { GraphSnapshot } from "@yourcompany/chess/types";
import type { InfluenceMap, SquareInfluence } from "@yourcompany/chess/influence";
import { computeInfluenceField } from "@yourcompany/chess/influence";
import { COMMUNITY_COLORS, SQUARES } from "@yourcompany/chess/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FluidFieldOverlayProps {
  snapshot: GraphSnapshot;
  playerColor: "white" | "black";
  boardWidth: number;
  orientation: "white" | "black";
  overlayOpacity?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WHITE_RGB = { r: 245, g: 158, b: 11 } as const;
const BLACK_RGB = { r: 99, g: 102, b: 241 } as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCommunityColor(colorStr: string): { r: number; g: number; b: number } {
  const match = /rgba\((\d+),\s*(\d+),\s*(\d+)/.exec(colorStr);
  if (!match?.[1] || !match[2] || !match[3]) return { r: 128, g: 128, b: 128 };
  return {
    r: Number.parseInt(match[1], 10),
    g: Number.parseInt(match[2], 10),
    b: Number.parseInt(match[3], 10),
  };
}

const PARSED_COMMUNITY_COLORS = COMMUNITY_COLORS.map(parseCommunityColor);

function squareToTopLeft(
  square: string,
  boardWidth: number,
  orientation: "white" | "black",
): { x: number; y: number } {
  const file = (square.codePointAt(0) ?? 97) - 97;
  const rank = Number.parseInt(square[1] ?? "1", 10) - 1;
  const squareSize = boardWidth / 8;
  return {
    x: orientation === "white" ? file * squareSize : (7 - file) * squareSize,
    y: orientation === "white" ? (7 - rank) * squareSize : rank * squareSize,
  };
}

function blendedFill(whiteW: number, blackW: number): string {
  const total = whiteW + blackW;
  if (total < 0.001) return "rgba(0,0,0,0)";
  const wF = whiteW / total;
  const bF = blackW / total;
  const r = Math.round(wF * WHITE_RGB.r + bF * BLACK_RGB.r);
  const g = Math.round(wF * WHITE_RGB.g + bF * BLACK_RGB.g);
  const b = Math.round(wF * WHITE_RGB.b + bF * BLACK_RGB.b);
  const alpha = Math.min(Math.max(whiteW, blackW), 0.7);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

function getCommColor(
  infl: SquareInfluence,
): { r: number; g: number; b: number } | undefined {
  const commId = infl.whiteWeight >= infl.blackWeight ? infl.whiteCommId : infl.blackCommId;
  if (commId < 0) return undefined;
  return PARSED_COMMUNITY_COLORS[commId % PARSED_COMMUNITY_COLORS.length];
}

function renderInfluenceMap(
  influenceMap: InfluenceMap,
  boardWidth: number,
  orientation: "white" | "black",
  pieceSquares: Set<string>,
): React.ReactNode[] {
  const squareSize = boardWidth / 8;
  const elements: React.ReactNode[] = [];

  for (const sq of SQUARES) {
    // Skip squares that have pieces — pieces must always sit on a clean background.
    if (pieceSquares.has(sq)) continue;
    const infl = influenceMap.get(sq);
    if (!infl || (infl.whiteWeight < 0.001 && infl.blackWeight < 0.001)) continue;

    const { x, y } = squareToTopLeft(sq, boardWidth, orientation);
    const fill = blendedFill(infl.whiteWeight, infl.blackWeight);
    const commColor = getCommColor(infl);

    elements.push(
      <g key={sq}>
        <rect
          x={x}
          y={y}
          width={squareSize}
          height={squareSize}
          fill={fill}
          style={{ transition: "fill 400ms ease-out" }}
        />
        {commColor && (
          <rect
            x={x}
            y={y}
            width={squareSize}
            height={squareSize}
            fill={`rgba(${commColor.r},${commColor.g},${commColor.b},0.22)`}
            style={{ transition: "fill 400ms ease-out" }}
          />
        )}

      </g>,
    );
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FluidFieldOverlay = React.memo(function FluidFieldOverlay({
  snapshot,
  playerColor: _playerColor,
  boardWidth,
  orientation,
  overlayOpacity = 0.4,
}: FluidFieldOverlayProps) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute only when board position changes
  const influenceMap = useMemo(() => {
    const result = computeInfluenceField(snapshot);
    return result.isOk() ? result.value : new Map<string, SquareInfluence>();
  }, [snapshot.metadata.fen]);

  const pieceSquares = useMemo(
    () => new Set(snapshot.nodes.map((n) => n.square)),
    [snapshot.nodes],
  );

  const cells = useMemo(
    () => renderInfluenceMap(influenceMap, boardWidth, orientation, pieceSquares),
    [influenceMap, boardWidth, orientation, pieceSquares],
  );

  return (
    <svg
      width={boardWidth}
      height={boardWidth}
      style={{ opacity: overlayOpacity, transition: "opacity 200ms ease-out" }}
      aria-hidden="true"
    >
      {cells}
    </svg>
  );
});
