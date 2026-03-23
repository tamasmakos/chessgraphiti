import type React from "react";
import { useMemo } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { Shield, Target, Swords, Activity, Crown } from "lucide-react";

interface TraditionalMetricsDashboardProps {
	fen: string;
}

const PIECE_VALUES: Record<string, number> = {
	p: 1,
	n: 3,
	b: 3,
	r: 5,
	q: 9,
	k: 0,
};

export function TraditionalMetricsDashboard({ fen }: TraditionalMetricsDashboardProps) {
	const metrics = useMemo(() => {
		const game = new Chess(fen);
		const board = game.board();

		// 1. Material Balance
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

		const centerSquares: Square[] = ["d4", "e4", "d5", "e5"];
		
		// Let's use a simpler heuristic for center control: pieces in the extended center (c3-f6)
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

		// 3. Development
		// Number of minor pieces (N, B) that have moved from their starting squares.
		const whiteStart: Record<string, Square[]> = {
			n: ["b1", "g1"],
			b: ["c1", "f1"],
		};
		const blackStart: Record<string, Square[]> = {
			n: ["b8", "g8"],
			b: ["c8", "f8"],
		};

		let whiteDev = 0;
		let blackDev = 0;
		
		// Check white
		["n", "b"].forEach(type => {
			const wStarts = whiteStart[type] || [];
			wStarts.forEach(sq => {
				const p = game.get(sq);
				if (!p || p.type !== type || p.color !== "w") whiteDev++;
			});
			const bStarts = blackStart[type] || [];
			bStarts.forEach(sq => {
				const p = game.get(sq);
				if (!p || p.type !== type || p.color !== "b") blackDev++;
			});
		});

		// 4. King Safety (simplified: pawns in front of king)
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

		const whiteKingSq = findKing("w");
		const blackKingSq = findKing("b");
		
		const getKingSafety = (sq: Square | null | undefined, color: "w" | "b") => {
			if (!sq) return 0;
			const file = sq.charCodeAt(0) - 97;
			const rank = parseInt(sq[1]) - 1;
			const dir = color === "w" ? 1 : -1;
			
			let shield = 0;
			// Check 3 squares in front
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

		const whiteSafety = getKingSafety(whiteKingSq as Square | null, "w");
		const blackSafety = getKingSafety(blackKingSq as Square | null, "b");

		// 5. Mobility (total legal moves)
		const currentTurn = game.turn();
		const mobility = game.moves().length;

		return {
			material: { white: whiteMaterial, black: blackMaterial, diff: materialDiff },
			center: { white: whiteCenterPieces, black: blackCenterPieces },
			development: { white: whiteDev, black: blackDev },
			safety: { white: whiteSafety, black: blackSafety },
			mobility: mobility,
			turn: currentTurn
		};
	}, [fen]);

	return (
		<div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 backdrop-blur-md shadow-xl">
			<div className="flex items-center gap-2 mb-4">
				<Activity className="w-4 h-4 text-indigo-400" />
				<h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Traditional Analytics</h3>
			</div>

			<div className="grid grid-cols-2 gap-4">
				{/* Material */}
				<MetricCard 
					icon={<Swords className="w-4 h-4" />} 
					label="Material" 
					white={metrics.material.white} 
					black={metrics.material.black} 
					diff={metrics.material.diff}
				/>
				
				{/* Center Control */}
				<MetricCard 
					icon={<Target className="w-4 h-4" />} 
					label="Center Pieces" 
					white={metrics.center.white} 
					black={metrics.center.black} 
				/>

				{/* Development */}
				<MetricCard 
					icon={<Crown className="w-4 h-4" />} 
					label="Development" 
					white={metrics.development.white} 
					black={metrics.development.black} 
					max={4}
				/>

				{/* King Safety */}
				<MetricCard 
					icon={<Shield className="w-4 h-4" />} 
					label="Pawn Shield" 
					white={metrics.safety.white} 
					black={metrics.safety.black} 
					max={3}
				/>
			</div>

			<div className="mt-4 pt-3 border-t border-slate-700/50">
				<div className="flex justify-between items-center">
					<span className="text-[10px] text-slate-400 uppercase tracking-wider">Mobility (Total Moves)</span>
					<span className="text-xs font-mono text-indigo-300">{metrics.mobility}</span>
				</div>
				<div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
					<div 
						className="bg-indigo-500 h-full transition-all duration-500" 
						style={{ width: `${Math.min(100, (metrics.mobility / 50) * 100)}%` }}
					/>
				</div>
			</div>
		</div>
	);
}

function MetricCard({ 
	icon, 
	label, 
	white, 
	black, 
	diff, 
	max = 10 
}: { 
	icon: React.ReactNode; 
	label: string; 
	white: number; 
	black: number; 
	diff?: number;
	max?: number;
}) {
	const total = white + black || 1;
	const whitePct = (white / total) * 100;

	return (
		<div className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-2.5">
			<div className="flex items-center gap-2 mb-2">
				<div className="text-indigo-400">{icon}</div>
				<span className="text-[10px] font-medium text-slate-300">{label}</span>
			</div>
			
			<div className="flex items-end justify-between gap-2 mb-1">
				<span className="text-xs font-mono text-white">{white}</span>
				{diff !== undefined && (
					<span className={`text-[9px] font-mono ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
						{diff > 0 ? `+${diff}` : diff}
					</span>
				)}
				<span className="text-xs font-mono text-slate-400">{black}</span>
			</div>

			<div className="flex h-1 gap-0.5 rounded-full overflow-hidden">
				<div className="bg-white/80 transition-all duration-500" style={{ width: `${whitePct}%` }} />
				<div className="bg-slate-600/80 transition-all duration-500" style={{ width: `${100 - whitePct}%` }} />
			</div>
		</div>
	);
}
