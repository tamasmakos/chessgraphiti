import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    conditions: ["typescript"],
    alias: [{ find: /^#(.*)$/, replacement: resolve(__dirname, "./src/$1") }],
  },
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
