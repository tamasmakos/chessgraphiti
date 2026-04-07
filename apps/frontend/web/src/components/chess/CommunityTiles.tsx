import { COMMUNITY_COLORS } from "@yourcompany/chess/constants";
import type { GraphNode } from "@yourcompany/chess/types";
import React, { useMemo } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CommunityTilesProps {
  /** Pieces with their community assignments */
  nodes: GraphNode[];
  /** Board width in pixels (the board is always square) */
  boardWidth: number;
  /** Board orientation */
  orientation: "white" | "black";
  /** Controls how tile opacity is scaled */
  centralityMetric: "weighted" | "degree" | "betweenness" | "closeness" | "pagerank" | "none";
  /** Optional mapping local communityId -> stable color key */
  stableColorMap?: Record<number, number>;
  /** Optional changed squares for analysis deltas */
  changedSquares?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1]!, 16),
        g: parseInt(result[2]!, 16),
        b: parseInt(result[3]!, 16),
      }
    : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Subtle square tint layer drawn *under* the board pieces to visualize
 * Leiden community membership.
 *
 * Each square occupied by a piece receives a semi-transparent background
 * tint determined by its community assignment. The design is intentionally
 * minimal — full-square coverage with low opacity to avoid visual noise.
 *
 * The layer is `pointer-events: none` so all clicks pass through to the
 * interactive board beneath.
 */
export const CommunityTiles = React.memo(function CommunityTiles({
  nodes,
  boardWidth,
  orientation,
  centralityMetric,
  stableColorMap,
  changedSquares = [],
}: CommunityTilesProps) {
  const squareSize = boardWidth / 8;

  const getCentralityValue = (node: GraphNode): number => {
    switch (centralityMetric) {
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
  };

  const changedSet = useMemo(() => new Set(changedSquares), [changedSquares]);

  const tiles = useMemo(() => {
    const values = nodes.map((n) => getCentralityValue(n));
    const max = Math.max(...values, 0.0001);

    return nodes.map((node) => {
      const file = node.square.charCodeAt(0) - 97;
      const rank = Number.parseInt(node.square[1] ?? "1", 10) - 1;

      const left = orientation === "white" ? file * squareSize : (7 - file) * squareSize;
      const top = orientation === "white" ? (7 - rank) * squareSize : rank * squareSize;

      const value = getCentralityValue(node);
      const ratio = centralityMetric === "none" ? 0.5 : value / max;

      const stableKey = stableColorMap?.[node.communityId] ?? node.communityId;
      const colorHex = COMMUNITY_COLORS[stableKey % COMMUNITY_COLORS.length];
      const rgb = hexToRgb(colorHex ?? "#888888");

      const isChanged = changedSet.has(node.square);
      const opacity = centralityMetric === "none" ? 0.2 : 0.14 + ratio * 0.16;

      return {
        key: node.square,
        left,
        top,
        width: squareSize,
        height: squareSize,
        color: rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})` : colorHex,
        isChanged,
      };
    });
  }, [nodes, squareSize, orientation, centralityMetric, stableColorMap, changedSet]);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: boardWidth,
        height: boardWidth,
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {tiles.map((tile) => (
        <div
          key={tile.key}
          style={{
            position: "absolute",
            left: tile.left,
            top: tile.top,
            width: tile.width,
            height: tile.height,
            backgroundColor: tile.color,
            boxShadow: tile.isChanged ? "inset 0 0 0 2px rgba(167,139,250,0.6)" : undefined,
          }}
        />
      ))}
    </div>
  );
});
