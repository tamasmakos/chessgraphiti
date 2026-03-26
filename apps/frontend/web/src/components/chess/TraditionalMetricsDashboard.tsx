import type React from "react";
import { useMemo } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";

interface TraditionalMetricsDashboardProps {
  fen: string;
  compact?: boolean;
}

const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
};

export function TraditionalMetricsDashboard({ fen, compact = false }: TraditionalMetricsDashboardProps) {
  const metrics = useMemo(() => {
    const game = new Chess(fen);
    const board = game.board();

    // Material
    let whiteMaterial = 0;
    let blackMaterial = 0;
    for (const row of board) {
      for (const piece of row) {
        if (piece) {
          const val = PIECE_VALUES[piece.type] || 0;
          if (piece.color === "w") whiteMaterial += val;
          else blackMaterial += val;
        }
      }
    }
    const materialDiff = whiteMaterial - blackMaterial;

    // Center pieces (extended center c3-f6)
    let whiteCenterPieces = 0;
    let blackCenterPieces = 0;
    for (let r = 2; r < 6; r++) {
      const row = board[r];
      if (!row) continue;
      for (let c = 2; c < 6; c++) {
        const p = row[c];
        if (p) {
          if (p.color === "w") whiteCenterPieces++;
          else blackCenterPieces++;
        }
      }
    }

    // Development (minor pieces moved from starting squares)
    const whiteStart: Record<string, Square[]> = { n: ["b1", "g1"], b: ["c1", "f1"] };
    const blackStart: Record<string, Square[]> = { n: ["b8", "g8"], b: ["c8", "f8"] };
    let whiteDev = 0;
    let blackDev = 0;
    ["n", "b"].forEach((type) => {
      (whiteStart[type] || []).forEach((sq) => {
        const p = game.get(sq);
        if (!p || p.type !== type || p.color !== "w") whiteDev++;
      });
      (blackStart[type] || []).forEach((sq) => {
        const p = game.get(sq);
        if (!p || p.type !== type || p.color !== "b") blackDev++;
      });
    });

    // King safety (pawn shield)
    const findKing = (color: "w" | "b"): Square | null => {
      for (let r = 0; r < 8; r++) {
        const row = board[r];
        if (!row) continue;
        for (let c = 0; c < 8; c++) {
          const p = row[c];
          if (p && p.type === "k" && p.color === color) {
            return (String.fromCharCode(97 + c) + (8 - r)) as Square;
          }
        }
      }
      return null;
    };

    const getKingSafety = (sq: Square | null, color: "w" | "b") => {
      if (!sq) return 0;
      const file = sq.charCodeAt(0) - 97;
      const rank = parseInt(sq[1] ?? "1") - 1;
      const dir = color === "w" ? 1 : -1;
      let shield = 0;
      for (let df = -1; df <= 1; df++) {
        const nf = file + df;
        const nr = rank + dir;
        if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
          const target = (String.fromCharCode(97 + nf) + (nr + 1)) as Square;
          const p = game.get(target);
          if (p && p.type === "p" && p.color === color) shield++;
        }
      }
      return shield;
    };

    const whiteSafety = getKingSafety(findKing("w") as Square | null, "w");
    const blackSafety = getKingSafety(findKing("b") as Square | null, "b");

    return {
      material: { white: whiteMaterial, black: blackMaterial, diff: materialDiff },
      center: { white: whiteCenterPieces, black: blackCenterPieces },
      development: { white: whiteDev, black: blackDev },
      safety: { white: whiteSafety, black: blackSafety },
    };
  }, [fen]);

  if (compact) {
    // Horizontal compact strip
    const items = [
      {
        label: "Material",
        white: metrics.material.white,
        black: metrics.material.black,
        diff: metrics.material.diff,
        max: 39,
      },
      {
        label: "Center",
        white: metrics.center.white,
        black: metrics.center.black,
        diff: undefined,
        max: 8,
      },
      {
        label: "Dev",
        white: metrics.development.white,
        black: metrics.development.black,
        diff: undefined,
        max: 4,
      },
      {
        label: "Shield",
        white: metrics.safety.white,
        black: metrics.safety.black,
        diff: undefined,
        max: 3,
      },
    ];

    return (
      <div className="flex items-stretch gap-px bg-slate-800/40 rounded-lg overflow-hidden border border-slate-700/30">
        {items.map((item) => {
          const total = item.white + item.black || 1;
          const whitePct = (item.white / total) * 100;
          return (
            <div
              key={item.label}
              className="flex-1 flex flex-col gap-1 px-2.5 py-2 bg-slate-900/40 hover:bg-slate-900/70 transition-colors"
            >
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest truncate">
                {item.label}
              </span>
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-mono text-slate-200">
                  {item.white}
                </span>
                {item.diff !== undefined && (
                  <span
                    className={`text-[9px] font-mono font-bold ${
                      item.diff > 0
                        ? "text-emerald-400"
                        : item.diff < 0
                          ? "text-rose-400"
                          : "text-slate-600"
                    }`}
                  >
                    {item.diff > 0 ? `+${item.diff}` : item.diff}
                  </span>
                )}
                <span className="text-[11px] font-mono text-slate-500">
                  {item.black}
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden flex gap-px">
                <div
                  className="bg-white/70 transition-all duration-500"
                  style={{ width: `${whitePct}%` }}
                />
                <div
                  className="bg-slate-600/70 transition-all duration-500"
                  style={{ width: `${100 - whitePct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Full version (kept for compatibility)
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: "Material", white: metrics.material.white, black: metrics.material.black, diff: metrics.material.diff },
        { label: "Center", white: metrics.center.white, black: metrics.center.black, diff: undefined },
        { label: "Development", white: metrics.development.white, black: metrics.development.black, diff: undefined },
        { label: "Pawn Shield", white: metrics.safety.white, black: metrics.safety.black, diff: undefined },
      ].map((item) => {
        const total = item.white + item.black || 1;
        const whitePct = (item.white / total) * 100;
        return (
          <div key={item.label} className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-slate-300">{item.label}</span>
              {item.diff !== undefined && (
                <span className={`text-[9px] font-mono font-bold ${item.diff > 0 ? "text-emerald-400" : item.diff < 0 ? "text-rose-400" : "text-slate-500"}`}>
                  {item.diff > 0 ? `+${item.diff}` : item.diff}
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-2 mb-1">
              <span className="text-xs font-mono text-white">{item.white}</span>
              <span className="text-xs font-mono text-slate-400">{item.black}</span>
            </div>
            <div className="flex h-1 gap-0.5 rounded-full overflow-hidden">
              <div className="bg-white/80 transition-all duration-500" style={{ width: `${whitePct}%` }} />
              <div className="bg-slate-600/80 transition-all duration-500" style={{ width: `${100 - whitePct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
