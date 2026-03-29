import type { GraphSnapshot } from "@yourcompany/chess/types";
import type { CentralityMetric } from "#stores/game-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A 9×9 elevation grid (81 elements, row-major).
 * `total`, `white`, and `black` are each normalised so the max value of
 * `total` across the board equals 1.0.
 */
export interface ElevationGrid {
	/** Combined elevation [0, 1]. Index: row * 9 + col. */
	total: number[];
	/** White-piece contribution in the same normalisation scale. */
	white: number[];
	/** Black-piece contribution in the same normalisation scale. */
	black: number[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getCentralityValue(
	node: {
		centralityWeighted: number;
		centralityDegree: number;
		centralityBetweenness: number;
		centralityCloseness: number;
		centralityPageRank: number;
	},
	metric: CentralityMetric,
): number {
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
		default:
			return 0;
	}
}

/**
 * Oblique projection: screen-X shifts toward the board centre with elevation.
 * Left half (col<4) leans right; right half (col>4) leans left.
 * Centre column has no horizontal displacement.
 */
function projX(col: number, elev: number, tileSize: number, liftX: number): number {
	const dir = (4 - col) / 4; // +1 at col=0, 0 at col=4, -1 at col=8
	return col * tileSize + dir * elev * liftX;
}

/**
 * Oblique projection: screen-Y shifts UP with elevation.
 */
function projY(row: number, elev: number, tileSize: number, liftY: number): number {
	return row * tileSize - elev * liftY;
}

/** Elevation at a specific grid corner (safe access). */
function cornerElev(elevations: number[], col: number, row: number): number {
	return elevations[row * 9 + col] ?? 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a 9×9 elevation grid from the graph snapshot.
 *
 * Each piece contributes a Gaussian hill centred on its square. Height scales
 * with normalised centrality. White and black contributions are tracked
 * separately so the overlay can colour mountains by team.
 *
 * @param snapshot     Current position graph
 * @param metric       Centrality metric driving elevation height
 * @param orientation  Board orientation
 * @param sigma        Gaussian hill spread in corner-grid units (default 1.1 ≈ 1 tile)
 */
export function computeElevationGrid(
	snapshot: GraphSnapshot,
	metric: CentralityMetric,
	orientation: "white" | "black",
	sigma = 1.1,
): ElevationGrid {
	const ZERO = new Array<number>(81).fill(0);
	if (snapshot.nodes.length === 0)
		return { total: ZERO, white: ZERO, black: ZERO };

	const rawValues = snapshot.nodes.map((n) => getCentralityValue(n, metric));
	const maxRaw = Math.max(...rawValues, Number.EPSILON);

	// Sigma (Gaussian spread) scales with piece mobility range so long-range
	// sliders cast broad territory hills while pawns stay tight and localised.
	// The `sigma` param acts as a global multiplier on top of per-piece spread.
	const pieceSigma: Record<string, number> = {
		q: 2.4, // queen  — widest board control
		r: 1.9, // rook   — open file / rank pressure
		b: 1.8, // bishop — diagonal sweep
		n: 1.3, // knight — short hop, contained footprint
		p: 0.9, // pawn   — very local
		k: 1.0, // king   — attenuated separately
	};

	const whiteAcc = new Float32Array(81);
	const blackAcc = new Float32Array(81);

	// Minimum presence floor: every piece registers a visible hill regardless of
	// its centrality score. Without this, pieces with low relative centrality
	// (e.g. rooks staring at each other on an open file) get normalised near
	// zero and fall below the render threshold — even though they clearly control
	// territory. The floor guarantees terrain presence; centrality only amplifies
	// above it. Only applied when a real metric is active (not "none").
	const pieceFloor = metric !== "none" ? 0.30 : 0;

	for (let i = 0; i < snapshot.nodes.length; i++) {
		const node = snapshot.nodes[i];
		if (!node) continue;
		const kingAttenuation = node.type === "k" ? 0.15 : 1;
		const normalised =
			Math.max((rawValues[i] ?? 0) / maxRaw, pieceFloor) * kingAttenuation;
		// Spread: per-type sigma so long-range pieces cast wider hills.
		const s = (pieceSigma[node.type] ?? 1.1) * sigma;
		const twoSigmaSqLocal = 2 * s * s;
		const file = node.square.charCodeAt(0) - 97;
		const rank = Number.parseInt(node.square[1] ?? "1", 10) - 1;
		// Piece centre in corner-grid units (0–8)
		const pcx = orientation === "white" ? file + 0.5 : 7 - file + 0.5;
		const pcy = orientation === "white" ? 7 - rank + 0.5 : rank + 0.5;
		const target = node.color === "w" ? whiteAcc : blackAcc;
		for (let row = 0; row <= 8; row++) {
			for (let col = 0; col <= 8; col++) {
				const dx = col - pcx;
				const dy = row - pcy;
				const idx = row * 9 + col;
				target[idx] =
					(target[idx] ?? 0) +
					normalised * Math.exp(-(dx * dx + dy * dy) / twoSigmaSqLocal);
			}
		}
	}

	// Normalise by the combined maximum so colours stay calibrated.
	let maxVal = Number.EPSILON;
	for (let i = 0; i < 81; i++) {
		const v = (whiteAcc[i] ?? 0) + (blackAcc[i] ?? 0);
		if (v > maxVal) maxVal = v;
	}

	return {
		total: Array.from(
			{ length: 81 },
			(_, i) => ((whiteAcc[i] ?? 0) + (blackAcc[i] ?? 0)) / maxVal,
		),
		white: Array.from({ length: 81 }, (_, i) => (whiteAcc[i] ?? 0) / maxVal),
		black: Array.from({ length: 81 }, (_, i) => (blackAcc[i] ?? 0) / maxVal),
	};
}

/** Average elevation at the centre of tile (col, row). */
export function tileAvgElevation(
	elevations: number[],
	col: number,
	row: number,
): number {
	return (
		((elevations[row * 9 + col] ?? 0) +
			(elevations[row * 9 + col + 1] ?? 0) +
			(elevations[(row + 1) * 9 + col] ?? 0) +
			(elevations[(row + 1) * 9 + col + 1] ?? 0)) /
		4
	);
}

// ---------------------------------------------------------------------------
// Polygon face helpers — oblique 2-axis projection
// liftY: how many px per unit elevation to shift upward (vertical component)
// liftX: how many px per unit elevation to shift leftward (horizontal component)
// Together these produce an ~30° oblique project giving three visible faces.
// ---------------------------------------------------------------------------

/**
 * SVG `points` for the TOP FACE of tile (col, row).
 * Each corner is projected with both X-leftward and Y-upward components.
 */
export function tileTopPoints(
	elevations: number[],
	col: number,
	row: number,
	tileSize: number,
	liftY: number,
	liftX: number,
): string {
	const tlE = cornerElev(elevations, col,     row);
	const trE = cornerElev(elevations, col + 1, row);
	const brE = cornerElev(elevations, col + 1, row + 1);
	const blE = cornerElev(elevations, col,     row + 1);
	const pts = [
		`${projX(col,     tlE, tileSize, liftX).toFixed(1)},${projY(row,     tlE, tileSize, liftY).toFixed(1)}`,
		`${projX(col + 1, trE, tileSize, liftX).toFixed(1)},${projY(row,     trE, tileSize, liftY).toFixed(1)}`,
		`${projX(col + 1, brE, tileSize, liftX).toFixed(1)},${projY(row + 1, brE, tileSize, liftY).toFixed(1)}`,
		`${projX(col,     blE, tileSize, liftX).toFixed(1)},${projY(row + 1, blE, tileSize, liftY).toFixed(1)}`,
	];
	return pts.join(" ");
}

/**
 * SVG `points` for the SOUTH (front) wall of tile (col, row).
 * Connects the lifted bottom edge back to the flat ground plane.
 * Medium shadow — faces the viewer at bottom.
 */
export function tileFrontPoints(
	elevations: number[],
	col: number,
	row: number,
	tileSize: number,
	liftY: number,
	liftX: number,
): string {
	const blE = cornerElev(elevations, col,     row + 1);
	const brE = cornerElev(elevations, col + 1, row + 1);
	const blLX = projX(col,     blE, tileSize, liftX);
	const blLY = projY(row + 1, blE, tileSize, liftY);
	const brLX = projX(col + 1, brE, tileSize, liftX);
	const brLY = projY(row + 1, brE, tileSize, liftY);
	const gY   = (row + 1) * tileSize;
	const gXL  = col       * tileSize;
	const gXR  = (col + 1) * tileSize;
	return `${blLX.toFixed(1)},${blLY.toFixed(1)} ${brLX.toFixed(1)},${brLY.toFixed(1)} ${gXR.toFixed(1)},${gY.toFixed(1)} ${gXL.toFixed(1)},${gY.toFixed(1)}`;
}

/**
 * SVG `points` for the WEST (left) wall of tile (col, row).
 * Visible for left-half tiles whose tops lean rightward toward centre.
 */
export function tileLeftPoints(
	elevations: number[],
	col: number,
	row: number,
	tileSize: number,
	liftY: number,
	liftX: number,
): string {
	const tlE = cornerElev(elevations, col, row);
	const blE = cornerElev(elevations, col, row + 1);
	const tlLX = projX(col, tlE, tileSize, liftX);
	const tlLY = projY(row,     tlE, tileSize, liftY);
	const blLX = projX(col, blE, tileSize, liftX);
	const blLY = projY(row + 1, blE, tileSize, liftY);
	const gX  = col * tileSize;
	const gYT = row * tileSize;
	const gYB = (row + 1) * tileSize;
	return `${tlLX.toFixed(1)},${tlLY.toFixed(1)} ${blLX.toFixed(1)},${blLY.toFixed(1)} ${gX.toFixed(1)},${gYB.toFixed(1)} ${gX.toFixed(1)},${gYT.toFixed(1)}`;
}

/**
 * SVG `points` for the EAST (right) wall of tile (col, row).
 * Connects the lifted right edge back to the flat ground plane.
 * Deeper shadow — faces away from the light source (upper-left).
 * This face is what turns a 2-axis projection into a true 3-face iso block.
 */
export function tileRightPoints(
	elevations: number[],
	col: number,
	row: number,
	tileSize: number,
	liftY: number,
	liftX: number,
): string {
	const trE = cornerElev(elevations, col + 1, row);
	const brE = cornerElev(elevations, col + 1, row + 1);
	const trLX = projX(col + 1, trE, tileSize, liftX);
	const trLY = projY(row,     trE, tileSize, liftY);
	const brLX = projX(col + 1, brE, tileSize, liftX);
	const brLY = projY(row + 1, brE, tileSize, liftY);
	const gX   = (col + 1) * tileSize;
	const gYT  = row       * tileSize;
	const gYB  = (row + 1) * tileSize;
	return `${trLX.toFixed(1)},${trLY.toFixed(1)} ${brLX.toFixed(1)},${brLY.toFixed(1)} ${gX.toFixed(1)},${gYB.toFixed(1)} ${gX.toFixed(1)},${gYT.toFixed(1)}`;
}
