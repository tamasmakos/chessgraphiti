import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const trainPath = path.join(root, "apps/frontend/web/src/routes/train.tsx");
let code = readFileSync(trainPath, "utf8");

// Find the Tutor button by its unique content
const startMarker = "onClick={() => setTutorMode(!tutorMode)}";
const endMarker = "Tutor\n";

const startIdx = code.indexOf(startMarker);
if (startIdx === -1) {
  console.log("ERROR: cannot find tutor button");
  process.exit(1);
}

// Find the end of the Tutor text node
const endIdx = code.indexOf(endMarker, startIdx) + endMarker.length;

const oldSection = code.substring(startIdx, endIdx);
console.log("Found section:", JSON.stringify(oldSection));

// Detect indentation
const lineStart = code.lastIndexOf("\n", startIdx) + 1;
const indent = code.substring(lineStart, startIdx).replace(/[^\s].*/, "");
console.log("Indent chars:", indent.length);

const newSection = `onClick={() => setTutorMode(!tutorMode)}
${indent}className={\`px-3 py-1.5 text-[11px] font-black rounded-lg border-2 transition-all \${
${indent}  tutorMode
${indent}    ? "bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-500/40"
${indent}    : "border-emerald-600 text-emerald-400 hover:bg-emerald-900/30"
${indent}}\`}
${indent.slice(2)}>
${indent}🎓 Tutor
`;

code = code.substring(0, startIdx) + newSection + code.substring(endIdx);
writeFileSync(trainPath, code, "utf8");
console.log("Done — Tutor button updated on disk");
