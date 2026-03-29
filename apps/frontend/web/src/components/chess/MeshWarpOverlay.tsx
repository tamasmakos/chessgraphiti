import type { GraphSnapshot } from "@yourcompany/chess/types";
import React, { useMemo } from "react";
import type { CentralityMetric } from "#stores/game-store";
import {
	computeElevationGrid,
	tileAvgElevation,
	tileFrontPoints,
	tileLeftPoints,
	tileRightPoints,
	tileTopPoints,
} from "#utils/mesh-warp";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MeshWarpOverlayProps {
	graphSnapshot: GraphSnapshot;
	centralityMetric: CentralityMetric;
	boardWidth: number;
	orientation: "white" | "black";
}

// ---------------------------------------------------------------------------
// Colour palette
// Two team colours for both fills (top face) and wall strokes.
// Walls are transparent — only their edges are tinted to show source.
// ---------------------------------------------------------------------------

type Rgb = { r: number; g: number; b: number };

const W_COLOR: Rgb = { r: 251, g: 191, b: 36  }; // amber-400  — white pieces
const B_COLOR: Rgb = { r: 129, g: 140, b: 248 }; // indigo-400 — black pieces

function lerp(a: Rgb, b: Rgb, t: number): Rgb {
	return {
		r: Math.round(a.r + (b.r - a.r) * t),
		g: Math.round(a.g + (b.g - a.g) * t),
		b: Math.round(a.b + (b.b - a.b) * t),
	};
}

function teamColor(wElev: number, bElev: number): Rgb {
	return lerp(B_COLOR, W_COLOR, wElev / (wElev + bElev + 1e-6));
}

/**
 * Fluid fill for wall faces — team-blended amber/indigo, subtly opaque.
 * Alpha scales only with elevation so low peaks stay near-invisible.
 */
function wallFill(wElev: number, bElev: number, totalElev: number, minElev = 0.015): string | null {
	if (totalElev < minElev) return null;
	const { r, g, b } = teamColor(wElev, bElev);
	const alpha = Math.min(0.06 + totalElev * 0.28, 0.36);
	return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

/** Crisp edge stroke for wall borders — same hue, higher opacity than fill. */
function wallEdge(wElev: number, bElev: number, totalElev: number, minElev = 0.015): string | null {
	if (totalElev < minElev) return null;
	const { r, g, b } = teamColor(wElev, bElev);
	const alpha = Math.min(0.55 + totalElev * 0.42, 0.97);
	return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Pseudo-3D isometric mountain overlay driven by piece centrality.
 *
 * Elevation lifts each tile corner on BOTH axes simultaneously:
 *   • Y-upward  (liftY = 85% of tileSize) — the mountain height
 *   • X-leftward (liftX = 45% of tileSize) — the oblique depth illusion
 *
 * Each tile is rendered as three SVG polygons in painter's order:
 *   EAST WALL  — right face, deepest shadow (faces away from light)
 *   SOUTH WALL — front face, medium shadow (faces camera at bottom)
 *   TOP FACE   — bright vivid team colour (white=amber, black=indigo)
 *
 * Tiles rendered back→front (row 0→7), left→right (col 0→7) within each row.
 * Amber tones = white-piece influence. Indigo = black-piece influence.
 */
export const MeshWarpOverlay = React.memo(function MeshWarpOverlay({
	graphSnapshot,
	centralityMetric,
	boardWidth,
	orientation,
}: MeshWarpOverlayProps) {
	const polygons = useMemo(() => {
		const tileSize = boardWidth / 8;
		const liftY = tileSize * 0.90; // tall mountains
		const liftX = tileSize * 0.60; // oblique depth, scaled per direction from centre

		const grid = computeElevationGrid(graphSnapshot, centralityMetric, orientation);

		const result: React.ReactNode[] = [];

		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				// Average elevations for the tile and its edges
				const totalAvg = tileAvgElevation(grid.total, col, row);
				const wAvg     = tileAvgElevation(grid.white, col, row);
				const bAvg     = tileAvgElevation(grid.black, col, row);

				// X-axis wall: west wall for left half (lean right), east for right half (lean left).
				// This mirrors the center-gravitating projX direction symmetrically.
				const isLeftHalf = col < 4;
				const xEdgeCol   = isLeftHalf ? col : col + 1;
				const xElev  = ((grid.total[row * 9 + xEdgeCol] ?? 0) + (grid.total[(row + 1) * 9 + xEdgeCol] ?? 0)) / 2;
				const xW     = ((grid.white[row * 9 + xEdgeCol] ?? 0) + (grid.white[(row + 1) * 9 + xEdgeCol] ?? 0)) / 2;
				const xB     = ((grid.black[row * 9 + xEdgeCol] ?? 0) + (grid.black[(row + 1) * 9 + xEdgeCol] ?? 0)) / 2;

				// Bottom-edge (south) elevation for the south wall face
				const bottomElev = ((grid.total[(row + 1) * 9 + col] ?? 0) + (grid.total[(row + 1) * 9 + col + 1] ?? 0)) / 2;
				const bottomW    = ((grid.white[(row + 1) * 9 + col] ?? 0) + (grid.white[(row + 1) * 9 + col + 1] ?? 0)) / 2;
				const bottomB    = ((grid.black[(row + 1) * 9 + col] ?? 0) + (grid.black[(row + 1) * 9 + col + 1] ?? 0)) / 2;

				const xFill    = wallFill(xW, xB, xElev);
				const xEdge    = wallEdge(xW, xB, xElev);
				const southFill = wallFill(bottomW, bottomB, bottomElev);
				const southEdge = wallEdge(bottomW, bottomB, bottomElev);
				const hasElevation = totalAvg > 0.015;

				// Painter order: x-wall → south → top face
				if (xFill) {
					result.push(
						<polygon
							key={`x-${col}-${row}`}
							points={isLeftHalf
								? tileLeftPoints(grid.total, col, row, tileSize, liftY, liftX)
								: tileRightPoints(grid.total, col, row, tileSize, liftY, liftX)}
							fill={xFill}
							stroke={xEdge ?? undefined}
							strokeWidth={1.6}
							strokeLinejoin="round"
						/>,
					);
				}
				if (southFill) {
					result.push(
						<polygon
							key={`s-${col}-${row}`}
							points={tileFrontPoints(grid.total, col, row, tileSize, liftY, liftX)}
							fill={southFill}
							stroke={southEdge ?? undefined}
							strokeWidth={1.6}
							strokeLinejoin="round"
						/>,
					);
				}
				if (hasElevation) {
					result.push(
						<polygon
							key={`t-${col}-${row}`}
							points={tileTopPoints(grid.total, col, row, tileSize, liftY, liftX)}
							fill="none"
						/>,
					);
				}
			}
		}

		return result;
	}, [graphSnapshot, centralityMetric, boardWidth, orientation]);

	return (
		<svg
			width={boardWidth}
			height={boardWidth}
			viewBox={`0 0 ${boardWidth} ${boardWidth}`}
			style={{ position: "absolute", top: 0, left: 0 }}
			aria-hidden="true"
		>
			{polygons}
		</svg>
	);
});


