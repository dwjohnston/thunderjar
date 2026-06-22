---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## What is Thunderjar

Thunderjar is a benchmarking framework for measuring how well AI coding agents perform on software engineering tasks. It runs an agent against a codebase, then evaluates the result against a set of defined measurements.

See `docs/terminology.md` for the full glossary. Key concepts:

- **Task** — a starting commit + a prompt. Defines what the agent is asked to do and from what state.
- **Prompt** — a named, reusable configuration that installs prompt files into the worktree via a shell command (e.g. `cp prompts/skills.md CLAUDE.md`). Referenced by ID.
- **Experiment** — a named comparison: one task × arrays of variable values (models, harnesses, prompts). Produces one run per permutation.
- **Run** — a single execution under one specific combination of variable values. Uses a git worktree so runs are isolated.
- **Measurements** — assertions evaluated after a run (file created, grep present/absent, command exit code, correctness test). Defined on the task; the result of a run is the set of measurement outcomes.

## Project structure

```
src/
  cli/           # CLI entry point and commands (run, compare, list, clean)
  runner/        # Worktree management, harness execution, measurement evaluators
  report/        # Terminal output and result storage
  types.ts       # All shared types
  defineConfig.ts  # Config helper (re-exported for consumer use)

evaluation-sandbox/  # Self-contained sandbox for testing the framework itself
  thunderjar.config.ts
  prompts/
  output/        # gitignored; agent output lands here during sandbox runs
```

## Running the CLI

From a directory containing a `thunderjar.config.ts`:

```sh
bun <path-to-thunderjar>/src/cli/index.ts run <experimentId>
bun <path-to-thunderjar>/src/cli/index.ts compare --experiment <experimentId>
bun <path-to-thunderjar>/src/cli/index.ts list
```

Results are stored in `bench/results/` as JSON, one file per run.
