import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const trainPath = path.join(root, "apps/frontend/web/src/routes/train.tsx");
const code = readFileSync(trainPath, "utf8");
const lines = code.split("\n");

console.log("Total lines:", lines.length);

// Check for common JSX issues
let braceDepth = 0;
let parenDepth = 0;
let issues = [];

// Check basic bracket balance
let open = (code.match(/{/g) || []).length;
let close = (code.match(/}/g) || []).length;
console.log("{ count:", open, "} count:", close, "balance:", open - close);

let openParen = (code.match(/\(/g) || []).length;
let closeParen = (code.match(/\)/g) || []).length;
console.log("( count:", openParen, ") count:", closeParen, "balance:", openParen - closeParen);

// Print lines around 535
console.log("\n--- Lines 530-540 ---");
for (let i = 529; i <= 539 && i < lines.length; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}

// Find any duplicate export statements
const exportMatches = lines.filter((l) => l.trim().startsWith("export const Route"));
console.log("\nExport Route declarations:", exportMatches.length);

// Check for duplicate function declarations
const funcMatches = lines.filter(
  (l) =>
    l.trim().startsWith("function TrainPage") || l.trim().startsWith("export function TrainPage"),
);
console.log("TrainPage declarations:", funcMatches.length, funcMatches);

// Find the return statement in TrainPage
let inTrainPage = false;
let returnCount = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().startsWith("function TrainPage")) inTrainPage = true;
  if (inTrainPage && lines[i].trim() === "}") {
    inTrainPage = false;
    break;
  }
}
