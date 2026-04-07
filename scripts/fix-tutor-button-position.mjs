import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const trainPath = path.join(root, "apps/frontend/web/src/routes/train.tsx");
const code = readFileSync(trainPath, "utf8");
const lines = code.split("\n");

// Identify the closing of the engineType conditional and the Tutor button inside it
// We need to move lines 281-291 (1-indexed) outside (after line 293)
// Find by content markers

const customBlockStart = lines.findIndex((l) => l.includes('engineType === "custom" && ('));
if (customBlockStart === -1) throw new Error("Cannot find engineType=custom block");
console.log("Custom block starts at line", customBlockStart + 1);

// Find the closing )} for the custom block (at same indent level = 12 spaces)
let closeIdx = -1;
for (let i = customBlockStart + 1; i < lines.length; i++) {
  if (lines[i].match(/^            \)\}/) || lines[i].match(/^            \)$/)) {
    closeIdx = i;
    break;
  }
}
if (closeIdx === -1) throw new Error("Cannot find closing )} for custom block");
console.log("Custom block closes at line", closeIdx + 1, ":", lines[closeIdx]);

// Find the Tutor divider + button inside the fragment (looking for 2nd divider)
// The 2nd divider is "                <div className="h-4 w-px bg-slate-800" />"
// which is at 16 spaces, inside the custom block, after the selects div
let tutorDividerIdx = -1;
for (let i = customBlockStart + 1; i < closeIdx; i++) {
  // Look for a divider that's AFTER the </div> closing the selects
  if (
    lines[i].trim() === '<div className="h-4 w-px bg-slate-800" />' &&
    i > customBlockStart + 5 &&
    lines[i].startsWith("                ") &&
    !lines[i].startsWith("                 ")
  ) {
    // This is 16 spaces - inside the fragment
    tutorDividerIdx = i;
    break;
  }
}
if (tutorDividerIdx === -1) throw new Error("Cannot find Tutor divider inside custom block");
console.log("Tutor divider starts at line", tutorDividerIdx + 1);

// Find where the button ends
let buttonEndIdx = -1;
for (let i = tutorDividerIdx; i < closeIdx; i++) {
  if (lines[i].trim() === "</button>") {
    buttonEndIdx = i;
    break;
  }
}
if (buttonEndIdx === -1) throw new Error("Cannot find </button> inside custom block");
console.log("Button ends at line", buttonEndIdx + 1);

// Extract the Tutor divider + button lines
const innerLines = lines.slice(tutorDividerIdx, buttonEndIdx + 1);
console.log("Lines to move:", innerLines.length);

// Dedent by 4 spaces (from 16-space indent to 12-space indent)
const outdentedLines = innerLines.map((l) => {
  if (l.startsWith("    ")) return l.substring(4);
  return l;
});

// Build new file: everything before tutor divider + closing of fragment/custom, then the tutor section
const newLines = [
  ...lines.slice(0, tutorDividerIdx),
  lines[tutorDividerIdx - 0].replace(/.*/, ""), // The line where divider was is now gone; actually keep blank if needed
  ...lines.slice(tutorDividerIdx + innerLines.length, closeIdx + 1), // close fragment + close custom block
  "",
  ...outdentedLines, // the divider + button now outside at proper indent
  ...lines.slice(closeIdx + 1),
];

// Actually rebuild more carefully
const beforeTutor = lines.slice(0, tutorDividerIdx);
const afterTutorToClose = lines.slice(tutorDividerIdx + innerLines.length, closeIdx + 1);
const afterClose = lines.slice(closeIdx + 1);

const result = [...beforeTutor, ...afterTutorToClose, "", ...outdentedLines, ...afterClose].join(
  "\n",
);

writeFileSync(trainPath, result, "utf8");
console.log("Done! Tutor button moved outside engineType conditional.");
console.log("New total lines:", result.split("\n").length);

// Verify
const verify = readFileSync(trainPath, "utf8");
const verifyLines = verify.split("\n");
const tutorLine = verifyLines.findIndex((l) => l.includes("setTutorMode(!tutorMode)"));
if (tutorLine !== -1) {
  const ctx = verifyLines.slice(tutorLine - 5, tutorLine + 2);
  console.log("\nContext around Tutor button:");
  ctx.forEach((l, i) => {
    const sp = l.match(/^( *)/)[1].length;
    console.log("  L" + (tutorLine - 4 + i + 1) + " (" + sp + "sp):", l.trimEnd().substring(0, 70));
  });
}
