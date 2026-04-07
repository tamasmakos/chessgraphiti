import type { GraphSnapshot } from "@yourcompany/chess/types";

interface PositionDynamicsPanelProps {
  snapshot: GraphSnapshot | null;
}

interface MetricItem {
  label: string;
  white: number;
  black: number;
  tooltip: string;
}

export function PositionDynamicsPanel({ snapshot }: PositionDynamicsPanelProps) {
  const fragility = snapshot?.metadata.positionFragility;
  const tension = snapshot?.metadata.strategicTension;

  const items: MetricItem[] = [
    {
      label: "Fragility",
      white: fragility?.white ?? 0,
      black: fragility?.black ?? 0,
      tooltip: "Undefended attack pressure on structurally important pieces",
    },
    {
      label: "Tension",
      white: tension?.white ?? 0,
      black: tension?.black ?? 0,
      tooltip: "Active threat network: reach, material at stake, mutual threats",
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
            title={item.tooltip}
            className="flex-1 flex flex-col gap-1 px-2.5 py-2 bg-slate-900/40 hover:bg-slate-900/70 transition-colors"
          >
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest truncate">
              {item.label}
            </span>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-mono text-slate-200">{item.white.toFixed(2)}</span>
              <span className="text-[11px] font-mono text-slate-500">{item.black.toFixed(2)}</span>
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
