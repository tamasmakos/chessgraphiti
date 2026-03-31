import { readFileSync, writeFileSync } from "node:fs";

const p = "apps/frontend/web/src/routes/train.tsx";
let s = readFileSync(p, "utf8");

// 1. Remove engineType guard from tutor effect condition
s = s.replace(
  "if (!tutorMode || engineType !== \"custom\") return;",
  "if (!tutorMode) return;",
);

// 2. Remove engineType from dep array
s = s.replace(
  "}, [api, tutorMode, engineType, fen, customModelPath, customBookPath, setTutorData, setTutorAnalyzing]);",
  "}, [api, tutorMode, fen, customModelPath, customBookPath, setTutorData, setTutorAnalyzing]);",
);

// 3. Remove engineType guard from TutorRankingPanel visibility
s = s.replace(
  "{tutorMode && engineType === \"custom\" && (",
  "{tutorMode && (",
);

const noOldGuard = !s.includes("engineType !== \"custom\"");
const noOldPanel = !s.includes("tutorMode && engineType === \"custom\"");
const hasFix = s.includes("if (!tutorMode) return;");
console.log("guard removed:", noOldGuard, "panel fixed:", noOldPanel, "effect fixed:", hasFix);

if (noOldGuard && noOldPanel && hasFix) {
  writeFileSync(p, s, "utf8");
  console.log("Written to disk.");
} else {
  console.error("Verification failed — file not written.");
  process.exit(1);
}
