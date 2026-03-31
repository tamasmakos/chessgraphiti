import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const trainPath = path.join(root, "apps/frontend/web/src/routes/train.tsx");
let code = readFileSync(trainPath, "utf8");

// Make the Tutor button impossible to miss
const before = `              onClick={() => setTutorMode(!tutorMode)}
              className={\`px-2.5 py-1 text-[10px] font-black rounded-lg border transition-all \${
                tutorMode
                  ? "bg-emerald-800 text-emerald-100 border-emerald-600"
                  : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }\`}
            >
              Tutor`;

const after = `              onClick={() => setTutorMode(!tutorMode)}
              className={\`px-3 py-1.5 text-[11px] font-black rounded-lg border-2 transition-all \${
                tutorMode
                  ? "bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-500/40"
                  : "border-emerald-600 text-emerald-400 hover:bg-emerald-900/30"
              }\`}
            >
              🎓 Tutor`;

const replaced = code.includes(before);
code = code.replace(before, after);

writeFileSync(trainPath, code, "utf8");
console.log("Tutor button made visible:", replaced);
