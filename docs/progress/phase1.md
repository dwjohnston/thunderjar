# Phase 1 — Interactive CLI (complete as of 36fc934)

## What's built

### Config layer
- `src/types.ts` — full TypeScript types for `ThunderjarConfig` (tasks, experiments, prompts, measurements, commands)
- `src/defineConfig.ts` — thin passthrough helper for config files to import

### CLI (`src/cli/index.ts`)
Interactive menu driven by `@inquirer/prompts`:

**Run experiment → Fake / Real**
- Fake: creates a git worktree per permutation on a named branch (`thunderjar/<runId>--<timestamp>`), makes an empty commit in it, writes measurement results to `bench/results/<experimentId>--<timestamp>/<permutation>.json`, then removes the worktree
- Real: creates worktrees only — harness execution not yet wired up

**List experiment results → experiment → run (by datetime) → permutation → Checkout / Cancel**
- Reads `bench/results/` for stored runs
- Lists runs newest-first, datetime formatted to the minute
- Lists permutations by `prompt--model--harness`
- On checkout: reads `branch` from the result JSON, guards against dirty working tree, runs `git checkout`

### Runner (`src/runner.ts`)
- Generates all permutations of `models × harnesses × prompts`
- Worktrees created on named branches; removed after each permutation completes
- Result JSON includes `branch`, `runId`, `runAt`, `durationSeconds`, `taskId`, `variables`, and the full `measurements` array

## What's not yet built
- Real harness execution (running the agent)
- Measurement evaluation (command, fileCreated, grep, correctness-test)
- Compare view
- `thunderjar clean` command for orphaned worktrees
- Tests (see `docs/todos.md`)
