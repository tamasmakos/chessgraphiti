import type { Color, GraphSnapshot, PieceType } from "@yourcompany/chess/types";
import { useEffect, useMemo, useRef, useState } from "react";

export interface PieceSelection {
  type: PieceType;
  color: Color;
}

const TYPE_NAMES: Record<PieceType, string> = {
  k: "King",
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
  p: "Pawn",
};

export function pieceFullLabel(color: Color, type: PieceType): string {
  return `${color === "w" ? "White" : "Black"} ${TYPE_NAMES[type]}`;
}

interface PieceTypeSelectorProps {
  selected: PieceSelection[];
  onChange: (selected: PieceSelection[]) => void;
  snapshot: GraphSnapshot | null;
}

const PIECE_SYMBOL: Record<string, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};

const TYPE_ORDER: PieceType[] = ["k", "q", "r", "b", "n", "p"];

function selKey(s: PieceSelection): string {
  return `${s.color}-${s.type}`;
}

interface PieceGroup {
  type: PieceType;
  color: Color;
  count: number;
}

export function PieceTypeSelector({
  selected,
  onChange,
  snapshot,
}: Readonly<PieceTypeSelectorProps>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const groups = useMemo((): PieceGroup[] => {
    if (!snapshot || snapshot.nodes.length === 0) return [];
    const counts = new Map<string, PieceGroup>();
    for (const node of snapshot.nodes) {
      const key = `${node.color}-${node.type}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { type: node.type, color: node.color, count: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => {
      if (a.color !== b.color) return a.color === "w" ? -1 : 1;
      return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    });
  }, [snapshot]);

  const isAll = selected.length === 0;
  const selectedKeys = new Set(selected.map(selKey));

  const toggleAll = () => onChange([]);

  const toggleGroup = (group: PieceGroup) => {
    const key = selKey(group);
    if (selectedKeys.has(key)) {
      onChange(selected.filter((s) => selKey(s) !== key));
    } else {
      onChange([...selected, { type: group.type, color: group.color }]);
    }
  };

  const chipSymbols = selected.slice(0, 5).map((s) => PIECE_SYMBOL[`${s.color}${s.type}`] ?? "?");

  let buttonLabel: string;
  if (isAll) {
    buttonLabel = "All Pieces";
  } else if (selected.length === 1) {
    buttonLabel = pieceFullLabel(selected[0]!.color, selected[0]!.type);
  } else {
    buttonLabel = `${selected.length} types`;
  }

  if (groups.length === 0) {
    return (
      <div className="px-2 py-0.5 rounded-md border border-slate-700 text-[9px] font-black uppercase tracking-wider text-slate-600">
        No position
      </div>
    );
  }

  const whiteGroups = groups.filter((g) => g.color === "w");
  const blackGroups = groups.filter((g) => g.color === "b");

  const renderRow = (group: PieceGroup) => {
    const key = selKey(group);
    const active = selectedKeys.has(key);
    const isWhite = group.color === "w";
    const symbol = PIECE_SYMBOL[`${group.color}${group.type}`] ?? "?";
    let rowClass: string;
    if (active) {
      rowClass = isWhite ? "text-amber-300" : "text-sky-300";
    } else {
      rowClass = "text-slate-400 hover:text-slate-200";
    }
    let checkboxBorder: string;
    if (!active) {
      checkboxBorder = "border-slate-700";
    } else if (isWhite) {
      checkboxBorder = "border-amber-600";
    } else {
      checkboxBorder = "border-sky-600";
    }
    const checkClass = isWhite ? "text-amber-400" : "text-sky-400";
    const countLabel = group.count > 1 ? ` ×${group.count}` : "";
    return (
      <button
        type="button"
        key={key}
        onClick={() => toggleGroup(group)}
        className={`w-full flex items-center gap-2 py-1 text-[9px] font-bold transition-colors rounded ${rowClass}`}
      >
        <span
          className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 ${checkboxBorder}`}
        >
          {active && (
            <svg
              aria-hidden="true"
              viewBox="0 0 8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className={`w-2 h-2 ${checkClass}`}
            >
              <polyline points="1,4 3,6 7,2" />
            </svg>
          )}
        </span>
        <span className="text-[14px] leading-none">{symbol}</span>
        <span>
          {pieceFullLabel(group.color, group.type)}
          {countLabel && <span className="opacity-50 font-mono">{countLabel}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider transition-all max-w-[200px] ${
          open
            ? "bg-slate-700 border-slate-600 text-white"
            : "bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
        }`}
      >
        <span className="text-[11px] leading-none flex-shrink-0">
          {isAll ? "⬡" : chipSymbols.join("")}
          {selected.length > 5 ? `+${selected.length - 5}` : ""}
        </span>
        <span className="truncate">{buttonLabel}</span>
        <svg
          aria-hidden="true"
          className={`w-2.5 h-2.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <polyline points="2,3 5,7 8,3" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl min-w-[220px] max-h-[320px] overflow-y-auto">
          <button
            type="button"
            onClick={toggleAll}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-colors ${
              isAll
                ? "bg-indigo-600/30 text-indigo-300"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-sm border border-slate-600 flex items-center justify-center flex-shrink-0">
              {isAll && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="w-2 h-2 text-indigo-400"
                >
                  <polyline points="1,4 3,6 7,2" />
                </svg>
              )}
            </span>
            <span className="text-[11px]">⬡</span> All Pieces
          </button>

          <div className="h-px bg-slate-800 mx-2" />

          <div className="px-3 py-1">
            <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-0.5">
              White
            </div>
            {whiteGroups.map(renderRow)}
          </div>

          {blackGroups.length > 0 && (
            <>
              <div className="h-px bg-slate-800 mx-2" />
              <div className="px-3 py-1">
                <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-0.5">
                  Black
                </div>
                {blackGroups.map(renderRow)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
