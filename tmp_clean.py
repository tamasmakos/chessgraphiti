import re
with open(r'c:\Users\User\Documents\dev\chessgraphiti\apps\frontend\web\src\routes\train.tsx', 'r') as f:
    text = f.read()

# Remove imports
text = re.sub(r'import \{ OpeningTreeExplorer \} from "#components/openings/OpeningTreeExplorer";\n', '', text)
text = re.sub(r'import \{ OPENINGS_WHITE, OPENINGS_BLACK \} from "@yourcompany/chess/openings";\n', '', text)

# Remove gameStore selectors for openings
selectors = [
    r'  const showHints = useGameStore.*?\n',
    r'  const selectedOpening = useGameStore.*?\n',
    r'  const bookDepth = useGameStore.*?\n',
    r'  const mode = useGameStore.*?\n',
    r'  const trainingDeviationHint = useGameStore.*?\n',
    r'  const setOpening = useGameStore.*?\n',
    r'  const setBookDepth = useGameStore.*?\n',
    r'  const setMode = useGameStore.*?\n',
    r'  const toggleHints = useGameStore.*?\n',
]
for sel in selectors:
    text = re.sub(sel, '', text)

# Remove useHintMove call
text = re.sub(r'  // Compute hint move for the opening trainer\n  const hintMove = useHintMove\(\);\n', '', text)

# Remove relevantOpenings
text = re.sub(r'  // Get relevant openings for current player color\n  const relevantOpenings =\n    playerColor === "w" \? OPENINGS_WHITE : OPENINGS_BLACK;\n\n', '', text)

# Update Header text
text = re.sub(r'Opening Trainer', 'Play vs Computer', text, count=1)
text = re.sub(r'Graph-Based Analysis Engine', 'Powered by Stockfish & Graphity Vision', text, count=1)

# Remove showHints from hintMove
text = re.sub(r'hintMove=\{showHints \? hintMove : null\}', 'hintMove={null}', text)

# Remove hintMove block
text = re.sub(r'              \{\!liveGraphEnabled && showHints && hintMove && \((.*?)\)\}\n', '', text, flags=re.DOTALL)

# Replace Training Settings Card with Engine Settings Card
engine_card = '''          {/* Engine Settings */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-indigo-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Engine Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  <span className="flex justify-between">
                    <span>Engine Strength (Skill Level)</span>
                    <span className="text-indigo-400 font-mono">
                      {engineStrength}
                    </span>
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={engineStrength}
                  onChange={(e) => setEngineStrength(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </CardContent>
          </Card>'''

text = re.sub(r'          \{\/\* Training Settings \*\/\}\n          <Card className="bg-slate-800 border-slate-700">(.*?)          \{\/\* Visualization Settings \*\/\}', engine_card + '\n\n          {/* Visualization Settings */}', text, flags=re.DOTALL)

# Delete useHintMove
text = re.sub(r'/\*\*\n \* Compute the hint move \(green arrow\) for the current opening position\.\n(.*?)\n}', '', text, flags=re.DOTALL)


with open(r'c:\Users\User\Documents\dev\chessgraphiti\apps\frontend\web\src\routes\train.tsx', 'w') as f:
    f.write(text)
