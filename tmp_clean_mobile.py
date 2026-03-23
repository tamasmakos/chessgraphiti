import re
with open(r'c:\Users\User\Documents\dev\chessgraphiti\apps\frontend\mobile\src\app\(tabs)\train.tsx', 'r') as f:
    text = f.read()

text = re.sub(r'import type \{ OpeningNode, GraphSnapshot \} from "@yourcompany/chess/types";', 'import type { GraphSnapshot } from "@yourcompany/chess/types";', text)
text = re.sub(r'import \{ ALL_OPENINGS, buildOpeningTrie, validateTrainingMove \} from "@yourcompany/chess/openings";\n', '', text)
text = re.sub(r'type Mode = "play" \| "learn";\n', '', text)
text = re.sub(r'type OpeningKey = string;\n', '', text)
text = re.sub(r'const START_BOOK_DEPTH = 10;\n\n', '', text)

text = re.sub(r'function buildSingleOpeningTrie.*?return buildOpeningTrie.*?\n}\n\n', '', text, flags=re.DOTALL)

text = re.sub(r'\tconst \[mode, setMode\] = useState<Mode>\("learn"\);\n\tconst \[selectedOpening, setSelectedOpening\] = useState<OpeningKey>\("custom"\);\n\tconst \[bookDepth, setBookDepth\] = useState<number>\(START_BOOK_DEPTH\);\n', '', text)

text = re.sub(r'\tconst \[currentOpeningNode, setCurrentOpeningNode\] = useState<OpeningNode \| null>\(\n\t\t\(\) => buildSingleOpeningTrie\(selectedOpening\),\n\t\);\n', '', text)
text = re.sub(r'\tconst \[outOfBookHint, setOutOfBookHint\] = useState<string \| undefined>\(undefined\);\n', '', text)

text = re.sub(r'\tconst hintToSquare = useMemo.*?return null;\n\t\}, \[fen, mode, gameStatus, playerColor, currentOpeningNode\]\);\n\n', '\tconst hintToSquare = null;\n\n', text, flags=re.DOTALL)

text = re.sub(r'\t\tconst nextNode = buildSingleOpeningTrie\(selectedOpening\);\n\n\t\tsetFen\(game\.fen\(\)\);\n\t\tsetMoveHistory\(\[\]\);\n\t\tsetCurrentOpeningNode\(nextNode\);\n\t\tsetGameStatus\("playing"\);\n\t\tsetGameOverReason\(undefined\);\n\t\tsetOutOfBookHint\(undefined\);', '\t\tsetFen(game.fen());\n\t\tsetMoveHistory([]);\n\t\tsetGameStatus("playing");\n\t\tsetGameOverReason(undefined);', text)
text = re.sub(r'\[selectedOpening, liveGraphEnabled\]', '[liveGraphEnabled]', text)

# simplify attemptMove
text = re.sub(r'\t\t\t// Opening enforcement \(learn mode gives the user feedback\)\.\n.*?\t\t\t// Update opening pointer \+ move history with the player\'s move\.\n\t\t\tlet nextOpeningNode: OpeningNode \| null = currentOpeningNode;\n\t\t\tif \(nextOpeningNode\) \{\n\t\t\t\tconst child = nextOpeningNode\.children\.get\(move\.san\);\n\t\t\t\tnextOpeningNode = child \?\? \{ san: move\.san, children: new Map\(\) \};\n\t\t\t\}\n\n', '\t\t\t// Update history with the player\'s move.\n', text, flags=re.DOTALL)

text = re.sub(r'\t\t\t// One opponent move \(either book move or random legal\)\.\n\t\t\tif \(!game\.isGameOver\(\)\) \{\n\t\t\t\tlet opponentMove = null;\n\t\t\t\tconst stillInBook =.*?\n\t\t\t\t\t\t\t\}', '\t\t\t// One opponent move (random legal).\n\t\t\tif (!game.isGameOver()) {\n\t\t\t\tlet opponentMove = null;\n\t\t\t\tconst legal = game.moves();\n\t\t\t\tconst randomSan = pickRandom(legal);\n\t\t\t\tif (randomSan) opponentMove = game.move(randomSan);\n\n\t\t\t\tif (opponentMove) {\n\t\t\t\t\tnextHistory.push({\n\t\t\t\t\t\tsan: opponentMove.san,\n\t\t\t\t\t\tcolor: opponentMove.color as PlayerColor,\n\t\t\t\t\t});\n\t\t\t\t}', text, flags=re.DOTALL)


text = re.sub(r'\t\t\tsetCurrentOpeningNode\(nextOpeningNode\);\n\t\t\tsetMoveHistory\(nextHistory\);\n\t\t\tsetFen\(game\.fen\(\)\);\n\t\t\tsetOutOfBookHint\(undefined\);\n', '\t\t\tsetMoveHistory(nextHistory);\n\t\t\tsetFen(game.fen());\n', text)

text = re.sub(r'\t\t\tcurrentOpeningNode,\n\t\t\tmoveHistory,\n\t\t\tbookDepth,\n\t\t\tmode,\n', '\t\t\tmoveHistory,\n', text)

text = re.sub(r'\tconst openingsForColor = useMemo.*?\[\]\);\n\n', '', text, flags=re.DOTALL)

text = re.sub(r'Opening Trainer \(Mobile\)', 'Play (Mobile)', text)

text = re.sub(r'\t\t\t\t\{mode === "learn".*?</Text>\n\t\t\t\t\}\)\n\n', '', text, flags=re.DOTALL)
text = re.sub(r'setSelectedOpening\(.*?\);\n\t\t\t\t\t\t\t\t', '', text)

text = re.sub(r'\t\t\t\t\t<View style=\{\{ backgroundColor: "#111827", borderRadius: 12, padding: 12, gap: 8 \}\}>\n\t\t\t\t\t\t<Text style=\{\{ color: "#cbd5e1", fontSize: 12, fontWeight: "700" \}\}>\n\t\t\t\t\t\t\tMode\n\t\t\t\t\t\t</Text>.*?<Text style=\{\{ color: "#cbd5e1", fontSize: 12, fontWeight: "700" \}\}>Opening</Text>.*?</View>\n\n\t\t\t\t\t<View style=\{\{ backgroundColor: "#111827", borderRadius: 12, padding: 12, gap: 8 \}\}>\n\t\t\t\t\t\t<Text style=\{\{ color: "#cbd5e1", fontSize: 12, fontWeight: "700" \}\}>\n\t\t\t\t\t\t\tBook Depth.*?</Pressable>\n\t\t\t\t\t</View>\n\n', '', text, flags=re.DOTALL)

with open(r'c:\Users\User\Documents\dev\chessgraphiti\apps\frontend\mobile\src\app\(tabs)\train.tsx', 'w') as f:
    f.write(text)
