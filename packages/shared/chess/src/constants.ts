/**
 * Chess domain constants used across graph analysis, edge weight calculations,
 * and visualization layers.
 */

/**
 * Standard material values for each piece type (lowercase symbols).
 * King uses 1000 as a sentinel for infinity in numeric calculations --
 * this ensures king attacks/defenses always dominate edge weight formulas.
 */
export const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 1000,
};

/**
 * Color palette for community visualization.
 * Each community detected by Leiden gets a color from this array (cycled).
 */
export const COMMUNITY_COLORS = [
  "rgba(239, 68, 68, 0.5)",
  "rgba(59, 130, 246, 0.5)",
  "rgba(16, 185, 129, 0.5)",
  "rgba(245, 158, 11, 0.5)",
  "rgba(139, 92, 246, 0.5)",
  "rgba(236, 72, 153, 0.5)",
  "rgba(14, 165, 233, 0.5)",
  "rgba(20, 184, 166, 0.5)",
] as const;

/**
 * All 64 squares in algebraic notation, a1 through h8.
 * Ordered file-first (a1, a2, ..., a8, b1, ..., h8).
 */
export const SQUARES: string[] = [];
for (let file = 0; file < 8; file++) {
  for (let rank = 0; rank < 8; rank++) {
    SQUARES.push(String.fromCharCode(97 + file) + (rank + 1));
  }
}

/** Piece types as lowercase single characters. */
export const PIECE_TYPES = ["p", "n", "b", "r", "q", "k"] as const;

/** Player colors. */
export const COLORS = ["w", "b"] as const;

/**
 * Movement direction vectors for sliding and stepping pieces.
 * Used by the attack map computation for ray-casting.
 */
export const PIECE_DIRECTIONS: Record<string, readonly (readonly [number, number])[]> = {
  r: [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ],
  b: [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  q: [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
  n: [
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
  ],
  k: [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ],
} as const;
