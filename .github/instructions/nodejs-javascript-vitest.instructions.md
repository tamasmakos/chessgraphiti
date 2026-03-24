---
description: "Guidelines for writing TypeScript/JavaScript code with Vitest testing in this monorepo"
applyTo: '**/*.ts, **/*.tsx, **/*.js, **/*.mjs, **/*.cjs'
---

# Code Generation Guidelines

## General
- This is a **pnpm + Turborepo monorepo** written entirely in TypeScript. Prefer TypeScript (`.ts`/`.tsx`) for all new files
- Target **ES2022**, **Node.js 24** (engine requirement: `>24.0.0`)
- Always use `async`/`await` for asynchronous code
- Never use `null` — always use `undefined` for optional values
- Do not add comments unless the logic is genuinely non-obvious; the code should be self-explanatory
- Keep the code simple and focused — no over-engineering, no speculative abstractions

## TypeScript

### Compiler flags (always on)
- `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `isolatedModules`, `verbatimModuleSyntax`
- **`noUncheckedIndexedAccess`**: `arr[0]` is `T | undefined` — always null-check array and Map access
- **`verbatimModuleSyntax`**: type-only imports **must** use `import type`:
  ```ts
  import type { GraphNode } from "#types";
  import { buildEdges } from "#edge-weights";
  ```

### Module resolution
- `moduleResolution: NodeNext` for Node.js packages; `bundler` for React apps
- **Intra-package imports** use the `#` subpath alias (`#*` → `./src/*.ts`), declared in each package's `package.json` `"imports"` field and mirrored in `tsconfig.json` `paths`
- **Cross-package imports** use workspace package names: `import { connectDB } from "@chessgraphiti/core/db"`
- `allowJs: false` — no JavaScript in TypeScript packages

### TypeScript `moduleResolution` per package
| Package type | Config |
|---|---|
| Node.js (backend, shared) | `tsconfig.node.json` → `NodeNext` + `rewriteRelativeImportExtensions` |
| React apps (web, landing) | `tsconfig.react.app.json` → `bundler` + `jsx: react-jsx` |

## Error Handling

**Never throw from service methods.** All services return `Result<T, Error>` from **neverthrow**:
```ts
// ✅ correct
return ok(value);
return err(new NotFoundError("game not found"));

// ❌ wrong
throw new Error("...");
```

Use `fromAsyncThrowable` / `fromThrowable` to wrap third-party code that throws (e.g. Kysely, Chess.js):
```ts
return fromAsyncThrowable(
  async () => db.selectFrom("games").where(...).executeTakeFirstOrThrow(),
  (e) => typedError(e),
)();
```

**Custom error classes** — extend `Error`, set `this.name` explicitly:
```ts
export class NotFoundError extends Error {
  constructor(message: string) { super(message); this.name = "NotFoundError"; }
}
```

## Data Validation

Co-locate Zod schemas with their inferred types — always export both together:
```ts
export const GameSchema = z.object({ id: z.string().uuid(), ... });
export type Game = z.infer<typeof GameSchema>;
```

Use `validateInput(schema, input)` (from `@chessgraphiti/core`) at ORPC handler boundaries — it returns `Result<T, Error>`.

## JavaScript / Tooling Config Files

The only `.js`/`.mjs`/`.cjs` files in this repo are tooling configs:
- `metro.config.js`, `eslint.config.js`, `scripts/reset-project.js` — must use **CommonJS** (`require`/`module.exports`); Metro and ESLint require CJS
- `astro.config.mjs` — ESM, keep as-is
- Do **not** convert CJS tooling configs to ESM

## Linting & Formatting

- **Biome** handles all linting and formatting for TypeScript packages — do **not** use ESLint or Prettier for TS files
- Config is embedded in the **root `package.json`** (no `biome.json`)
- `pnpm lint` — lint with auto-fix; `pnpm lint:check` — read-only (used in CI)
- Exception: `apps/frontend/mobile` uses **ESLint** (`eslint-config-expo` flat config) — do not add Biome there
- Commits follow **Conventional Commits** (`commitlint` + Husky)

## Testing

- All tests are written in TypeScript (`.test.ts`) — never add `.test.js` files
- Use **Vitest** (v4.x, pinned via pnpm catalog)
- Write tests for all new features and bug fixes; cover edge cases and error handling
- **Never change production code to make it easier to test** — write tests that cover the code as-is
- Assert neverthrow results safely:
  ```ts
  expect(result.isOk()).toBe(true);
  if (result.isOk()) { expect(result.value).toEqual(...); }
  ```

### Backend / Integration tests
- Use `createTestPostgresContainer()` from `@chessgraphiti/core/test-helpers` — one container per test **suite** (not per file)
- Initialize the shared helper in `beforeAll(() => getSharedDatabaseHelper(), 60_000)`
- Call `resetSharedDatabase()` in `beforeEach` for isolation (TRUNCATE, not container teardown)
- Do **not** mock the database in integration tests — use the real container
- `pool: "threads"` is required (not `"forks"`) for the shared mutex to work
- Timeouts: `hookTimeout: 120_000`, `testTimeout: 30_000`, `maxConcurrency: 4`

## User Interactions
- Ask questions if implementation details or design choices are unclear
- Always answer in the same language as the question; use English for generated code, comments, and docs
