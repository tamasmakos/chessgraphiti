import React, { useMemo, useRef, useState, useEffect } from "react";
import { COMMUNITY_COLORS } from "@yourcompany/chess/constants";
import type { CommunityLineageAnalysis } from "@yourcompany/chess/community-lineage";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

interface CommunityLineageGraphProps {
  analysis: CommunityLineageAnalysis;
  currentIndex: number;
  onIndexChange?: (index: number) => void;
  height?: number;
}

const PADDING = { top: 20, right: 30, bottom: 40, left: 30 };
const NODE_WIDTH = 12;
const MIN_NODE_HEIGHT = 4;
const FLOW_OPACITY = 0.25;
const HOVER_FLOW_OPACITY = 0.6;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Custom SVG Alluvial (Sankey-style) diagram to visualize community evolution.
 * 
 * Each column represents a game move (step). 
 * Rectangles represent communities, with height proportional to piece count.
 * Cubic bezier "flows" represent pieces migrating between communities.
 */
export function CommunityLineageGraph({
  analysis,
  currentIndex,
  onIndexChange,
  height = 200,
}: CommunityLineageGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  // Responsive width tracking
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { steps, nodes, links } = useMemo(() => {
    if (!analysis || !analysis.stableColorByStep) return { steps: [], nodes: [], links: [] };
    const numSteps = analysis.stableColorByStep.length;
    if (numSteps === 0) return { steps: [], nodes: [], links: [] };

    const chartWidth = width - PADDING.left - PADDING.right;
    const chartHeight = height - PADDING.top - PADDING.bottom;
    const stepGap = chartWidth / Math.max(1, numSteps - 1);

    const nodes: any[] = [];
    const links: any[] = [];

    // 1. Calculate Node Positions
    const nodeGeometry = new Array(numSteps).fill(0).map(() => new Map<number, any>());

    for (let i = 0; i < numSteps; i++) {
        const stepMap = analysis.stableColorByStep[i] ?? {};
        const communityIds = Object.keys(stepMap).map(Number);
        
        const counts = new Map<number, number>();
        if (i === 0) {
            const firstT = analysis.transitions[0];
            if (firstT) {
                for (const link of firstT.links) {
                    counts.set(link.fromCommunityId, (counts.get(link.fromCommunityId) || 0) + link.overlapWeight);
                }
            } else {
                communityIds.forEach(cid => counts.set(cid, 4));
            }
        } else {
            const t = analysis.transitions.find(trans => trans.stepIndex === i);
            if (t) {
                for (const link of t.links) {
                    counts.set(link.toCommunityId, (counts.get(link.toCommunityId) || 0) + link.overlapWeight);
                }
            } else {
                communityIds.forEach(cid => counts.set(cid, 4));
            }
        }

        const totalWeight = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;
        const scale = chartHeight / totalWeight;

        let currentY = 0;
        const sortedIds = [...communityIds].sort((a, b) => stepMap[a]! - stepMap[b]!);

        for (const cid of sortedIds) {
            const weight = counts.get(cid) || 1;
            const h = Math.max(MIN_NODE_HEIGHT, weight * scale);
            const colorIdx = stepMap[cid]!;
            const color = COMMUNITY_COLORS[colorIdx % COMMUNITY_COLORS.length];
            
            const node = {
                id: cid,
                step: i,
                x: PADDING.left + i * stepGap - NODE_WIDTH / 2,
                y: PADDING.top + currentY,
                h,
                w: NODE_WIDTH,
                color,
                colorIdx,
                weight
            };
            nodes.push(node);
            nodeGeometry[i]!.set(cid, node);
            currentY += h + 2; 
        }
    }

    // 2. Build Links (Flows)
    for (const transition of analysis.transitions) {
        const i = transition.stepIndex;
        if (i === 0) continue; 
        
        const prevIdx = i - 1;
        const currentIdx = i;

        const sourceOffset = new Map<number, number>();
        const targetOffset = new Map<number, number>();

        const sortedLinks = [...transition.links].sort((a, b) => {
            const aPos = (nodeGeometry[prevIdx]!.get(a.fromCommunityId)?.y || 0) + (nodeGeometry[currentIdx]!.get(a.toCommunityId)?.y || 0);
            const bPos = (nodeGeometry[prevIdx]!.get(b.fromCommunityId)?.y || 0) + (nodeGeometry[currentIdx]!.get(b.toCommunityId)?.y || 0);
            return aPos - bPos;
        });

        for (const link of sortedLinks) {
            const source = nodeGeometry[prevIdx]!.get(link.fromCommunityId);
            const target = nodeGeometry[currentIdx]!.get(link.toCommunityId);
            if (!source || !target) continue;

            const weight = link.overlapWeight;
            const sourceTotal = source.weight;
            const targetTotal = target.weight;

            const hSource = (weight / sourceTotal) * source.h;
            const hTarget = (weight / targetTotal) * target.h;

            const y0 = source.y + (sourceOffset.get(link.fromCommunityId) || 0) + hSource / 2;
            const y1 = target.y + (targetOffset.get(link.toCommunityId) || 0) + hTarget / 2;

            const x0 = source.x + NODE_WIDTH;
            const x1 = target.x;

            links.push({
                id: `link-${prevIdx}-${link.fromCommunityId}-${link.toCommunityId}`,
                x0, y0, x1, y1,
                width: Math.max(1, (hSource + hTarget) / 2),
                color: source.color,
                opacity: FLOW_OPACITY
            });

            sourceOffset.set(link.fromCommunityId, (sourceOffset.get(link.fromCommunityId) || 0) + hSource);
            targetOffset.set(link.toCommunityId, (targetOffset.get(link.toCommunityId) || 0) + hTarget);
        }
    }

    return { steps: new Array(numSteps).fill(0).map((_, i) => i), nodes, links };
  }, [analysis, width, height]);

  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  if (!analysis || !analysis.stableColorByStep || analysis.stableColorByStep.length === 0) {
     return (
        <div className="w-full h-[200px] bg-slate-900/40 border border-slate-700/50 rounded-xl flex items-center justify-center text-[10px] text-slate-600 uppercase tracking-widest font-black">
           Awaiting Initial Interaction
        </div>
     );
  }

  const chartWidth = width - PADDING.left - PADDING.right;
  const stepGap = chartWidth / Math.max(1, analysis.stableColorByStep.length - 1);

  return (
    <div className="w-full space-y-2" ref={containerRef}>
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-glow-indigo">Molecular Evolution</span>
        <span className="text-[10px] font-mono text-indigo-400">Step {currentIndex} of {analysis.stableColorByStep.length - 1}</span>
      </div>
      
      <div 
        className="bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden relative group backdrop-blur-sm"
        style={{ height }}
      >
        <svg width="100%" height="100%" className="overflow-visible">
          {/* Grid lines for steps */}
          {steps.map((s) => (
            <line
              key={`grid-${s}`}
              x1={PADDING.left + s * stepGap}
              y1={PADDING.top}
              x2={PADDING.left + s * stepGap}
              y2={height - PADDING.bottom}
              stroke={s === currentIndex ? "rgba(99, 102, 241, 0.5)" : "rgba(51, 65, 85, 0.3)"}
              strokeWidth={s === currentIndex ? 2 : 1}
              strokeDasharray={s === currentIndex ? "" : "4 4"}
            />
          ))}

          {/* Flows (Links) */}
          <g className="flows">
            {links.map((link) => (
              <path
                key={link.id}
                d={`M ${link.x0} ${link.y0} C ${(link.x0 + link.x1) / 2} ${link.y0}, ${(link.x0 + link.x1) / 2} ${link.y1}, ${link.x1} ${link.y1}`}
                fill="none"
                stroke={link.color}
                strokeWidth={link.width}
                strokeOpacity={hoveredLink === link.id ? HOVER_FLOW_OPACITY : link.opacity}
                className="transition-all duration-300"
                onMouseEnter={() => setHoveredLink(link.id)}
                onMouseLeave={() => setHoveredLink(null)}
              />
            ))}
          </g>

          {/* Communities (Nodes) */}
          <g className="nodes">
            {nodes.map((node) => (
              <g 
                key={`${node.step}-${node.id}`}
                className="cursor-pointer"
                onClick={() => onIndexChange?.(node.step)}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                  fill={node.color}
                  rx={2}
                  className={`transition-all duration-200 ${node.step === currentIndex ? 'stroke-white stroke-1 z-20' : 'opacity-80 hover:opacity-100'}`}
                  style={{
                    filter: node.step === currentIndex ? `drop-shadow(0 0 6px ${node.color})` : 'none'
                  }}
                />
              </g>
            ))}
          </g>

          {/* X-Axis labels */}
          {steps.filter(s => s % 5 === 0 || s === steps.length - 1).map(s => (
             <text
                key={`label-${s}`}
                x={PADDING.left + s * stepGap}
                y={height - PADDING.bottom + 15}
                textAnchor="middle"
                className="text-[9px] fill-slate-500 font-mono"
             >
                {s}
             </text>
          ))}
        </svg>
      </div>

      <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono italic px-1">
         <span>← OPENING</span>
         <span className="text-indigo-400 opacity-60">Hover flows to see migration • Click nodes to navigate</span>
         <span>LATE GAME →</span>
      </div>
    </div>
  );
}
