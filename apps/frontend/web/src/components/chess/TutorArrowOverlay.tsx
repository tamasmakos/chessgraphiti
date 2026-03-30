import { useId, useMemo } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TutorArrowOverlayProps {
  readonly ranking: Array<{ move: string; score: number }>;
  readonly boardWidth: number;
  readonly orientation: "white" | "black";
}

// ---------------------------------------------------------------------------
// Coordinate helper (mirrors GraphOverlay.squareToPixel)
// ---------------------------------------------------------------------------

function squareCenter(
  square: string,
  boardWidth: number,
  orientation: "white" | "black",
): { x: number; y: number } {
  const file = (square.codePointAt(0) ?? 97) - 97;
  const rank = Number.parseInt(square[1] ?? "1", 10) - 1;
  const sq = boardWidth / 8;
  const x =
    orientation === "white"
      ? file * sq + sq / 2
      : (7 - file) * sq + sq / 2;
  const y =
    orientation === "white"
      ? (7 - rank) * sq + sq / 2
      : rank * sq + sq / 2;
  return { x, y };
}

// ---------------------------------------------------------------------------
// Arrow shape helpers
// ---------------------------------------------------------------------------

function arrowPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  shaftWidth: number,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return "";
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const headLen = shaftWidth * 2.8;
  const headWidth = shaftWidth * 2.2;
  const shaftEnd = len - headLen;

  // Shaft points
  const s = shaftWidth / 2;
  const ax = x1 + nx * s;
  const ay = y1 + ny * s;
  const bx = x1 - nx * s;
  const by = y1 - ny * s;
  const cx = bx + ux * shaftEnd;
  const cy = by + uy * shaftEnd;
  const dx2 = ax + ux * shaftEnd;
  const dy2 = ay + uy * shaftEnd;

  // Arrowhead
  const tipX = x1 + ux * len;
  const tipY = y1 + uy * len;
  const hx1 = tipX - ux * headLen + nx * headWidth;
  const hy1 = tipY - uy * headLen + ny * headWidth;
  const hx2 = tipX - ux * headLen - nx * headWidth;
  const hy2 = tipY - uy * headLen - ny * headWidth;

  return [
    `M ${ax} ${ay}`,
    `L ${ax + ux * shaftEnd} ${ay + uy * shaftEnd}`,
    `L ${dx2} ${dy2}`,
    `L ${hx1} ${hy1}`,
    `L ${tipX} ${tipY}`,
    `L ${hx2} ${hy2}`,
    `L ${cx} ${cy}`,
    `L ${bx} ${by}`,
    "Z",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TutorArrowOverlay({
  ranking,
  boardWidth,
  orientation,
}: TutorArrowOverlayProps) {
  const id = useId();

  const arrows = useMemo(() => {
    if (!ranking.length) return [];

    const scores = ranking.map((r) => r.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore || 1;
    const squareSize = boardWidth / 8;

    return ranking.map((entry, i) => {
      const uci = entry.move;
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);

      if (from.length < 2 || to.length < 2) return null;

      const p1 = squareCenter(from, boardWidth, orientation);
      const p2 = squareCenter(to, boardWidth, orientation);

      // Normalise 0 (worst) → 1 (best)
      const norm = (entry.score - minScore) / range;

      // Opacity: best move near opaque; rest fade proportionally
      const opacity = 0.25 + norm * 0.65;

      // Hue: 120 (green) → 0 (red) based on rank
      const hue = Math.round(norm * 120);
      const color = `hsl(${hue}, 85%, 55%)`;

      // Shaft width proportional to score, capped
      const shaftWidth = squareSize * (0.06 + norm * 0.06);

      const path = arrowPath(p1.x, p1.y, p2.x, p2.y, shaftWidth);
      if (!path) return null;

      return { key: `${id}-${i}-${uci}`, path, color, opacity };
    });
  }, [ranking, boardWidth, orientation, id]);

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={boardWidth}
      height={boardWidth}
    >
      {arrows.map((a) =>
        a ? (
          <path
            key={a.key}
            d={a.path}
            fill={a.color}
            opacity={a.opacity}
          />
        ) : null,
      )}
    </svg>
  );
}
