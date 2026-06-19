# Thunderjar — Coding Agent Benchmarking Tool

A tool for measuring coding agent behaviour reproducibly. The behaviour of a coding agent is a non-deterministic function of four variables: codebase state (C), prompt configuration (P), model (M), and harness (H). Thunderjar holds some variables fixed and varies others, then applies objective measurements to compare results.

## Core Concept

1. Identify a task with a clear expected outcome (typically one already completed)
2. Note the commit hash at that point in time
3. Run an experiment: check out to that commit, apply the prompt approach, run the harness headlessly
4. Apply measurements to what the agent produced and emit a report

---

## Config File

Lives in the repo under test as `bench/bench.config.ts`.

```typescript
import { defineConfig } from 'coding-agent-bench';

export default defineConfig({
  commands: {
    beforeRun: 'bun scripts/generate-agent-files.ts {approachName}',
    testRunner: 'bun test',
  },

  tasks: {
    'add-normalise-node': {
      description: 'Add a normalise compute node',
      prompt: 'Add a normalise compute node that normalises a value within a min/max range to 0..1. Follow the existing compute node conventions.',
      measurements: [
        { type: 'command', run: 'bun typecheck', expectExitCode: 0 },
        { type: 'command', run: 'bun test', expectExitCode: 0 },
        { type: 'fileCreated', path: 'src/nodes/compute/normalise.ts' },
        { type: 'fileCreated', path: 'src/nodes/compute/normalise.test.ts' },
        { type: 'grep', glob: 'src/**/*.ts', pattern: 'as any', expect: 'absent' },
        { type: 'correctness-test', templatePath: 'bench/templates/normalise-correctness.test.ts' },
      ],
    },
  },

  experiments: {
    e1: {
      description: 'skills, sonnet',
      task: 'add-normalise-node',
      commitHash: 'a1b2c3d',
      approachName: 'skills',
      modelName: 'claude-sonnet-4-6',
      harnessName: 'claude-code',
    },
    e2: {
      description: 'skills, opus',
      task: 'add-normalise-node',
      commitHash: 'a1b2c3d',
      approachName: 'skills',
      modelName: 'claude-opus-4-8',
      harnessName: 'claude-code',
    },
  },
});
```

### Key design decisions

- `tasks` and `experiments` are objects keyed by id — uniqueness is guaranteed by the key.
- `commands.beforeRun` is top-level because it is a property of the repo, not the experiment. `{approachName}` is substituted at run time. If omitted, P comes from the commit as-is.
- `commands.testRunner` is used by `correctness-test` measurements to execute the template file.
- Experiments varying one variable at a time tell a clear story: e1 vs e2 isolates model, e1 vs e3 isolates approach, e1 vs e4 isolates harness.

---

## Measurement Types

Measurements are an **ordered list**. The runner short-circuits on first failure — the first failing measurement is always the meaningful signal.

```typescript
type Measurement =
  // Run a command in the worktree, assert exit code
  | { type: 'command'; run: string; expectExitCode: number }

  // Assert a file was newly created by the agent (appears in git diff as Added)
  | { type: 'fileCreated'; path: string }
  | { type: 'fileCreated'; glob: string }

  // Assert a file exists (regardless of diff)
  | { type: 'fileExists'; path: string }

  // Pattern check against files
  | { type: 'grep'; glob: string; pattern: string; expect: 'absent' | 'present'; scope?: 'worktree' | 'changed-files' | 'added-lines' }

  // Copy a template test file into the worktree and run it
  | { type: 'correctness-test'; templatePath: string }
```

### `grep` scope

Default scope is `added-lines` — only lines the agent introduced, not pre-existing content. This means `as any` detection fires only if the agent wrote it, not if it was already in the codebase.

### `correctness-test`

The most valuable measurement type. Separates **contract correctness** (does the exported function do the right thing?) from **process correctness** (did `bun test` pass?). An agent can write tests that all pass against a broken implementation; the correctness template is the independent oracle.

The template is a normal test file that imports from the path the agent is expected to have created:

```typescript
// bench/templates/normalise-correctness.test.ts
import { normalise } from '../src/nodes/compute/normalise';

test('maps mid-range to 0.5', () => {
  expect(normalise(0, -10, 10)).toBeCloseTo(0.5);
});
test('clamps to 0 at min', () => {
  expect(normalise(-10, -10, 10)).toBe(0);
});
test('clamps to 1 at max', () => {
  expect(normalise(10, -10, 10)).toBe(1);
});
```

If the agent did not create the file, the import fails — which is a distinct signal from "created the file but implemented it wrong". A `fileCreated` measurement before `correctness-test` cleanly separates these cases.

Templates live in `bench/templates/` inside the repo under test.

---

## Execution

Uses a **git worktree** for isolation — `git worktree add /tmp/exp-e1 <commitHash>`. The harness runs inside the worktree; the main working tree is untouched. Cleaned up after the run.

Supported harnesses (initial scope): `claude-code`, `opencode`.

---

## Report Formats

### Run output (terminal)

```
──────────────────────────────────────────
 e1 — skills, sonnet
──────────────────────────────────────────
 Task      add-normalise-node
 Commit    a1b2c3d
 Approach  skills
 Model     claude-sonnet-4-6
 Harness   claude-code
 Duration  4m 32s
──────────────────────────────────────────
 ✓  command: bun typecheck
 ✓  command: bun test
 ✓  fileCreated: src/nodes/compute/normalise.ts
 ✓  fileCreated: src/nodes/compute/normalise.test.ts
 ✗  grep absent 'as any' in src/**/*.ts
    → 2 occurrences: normalise.ts:14, normalise.ts:38
 —  correctness-test (not reached)
──────────────────────────────────────────
 FAILED — measurement 5 of 6
```

`—` means skipped due to short-circuit. Distinct from `✗` (ran and failed).

### Compare view

`thunderjar compare e1 e2 e3`

```
                         e1              e2              e3
                    skills/sonnet   skills/opus   subagents/sonnet
────────────────────────────────────────────────────────────────────
bun typecheck            ✓               ✓               ✗
bun test                 ✓               ✓               —
fileCreated normalise    ✓               ✓               —
fileCreated *.test.ts    ✓               ✓               —
grep: no 'as any'        ✗               ✓               —
correctness-test         —               ✓               —
────────────────────────────────────────────────────────────────────
Duration              4m 32s          6m 14s          2m 08s
Result                FAIL            PASS            FAIL
```

The compare view reads from stored results, so experiments from different sessions can be compared without re-running. `run` with multiple experiments automatically shows the compare view at the end.

### Stored result (JSON)

Saved to `bench/results/<experimentId>-<timestamp>.json`:

```json
{
  "experimentId": "e1",
  "runAt": "2026-06-19T10:23:00Z",
  "durationSeconds": 272,
  "task": "add-normalise-node",
  "variables": {
    "commitHash": "a1b2c3d",
    "approachName": "skills",
    "modelName": "claude-sonnet-4-6",
    "harnessName": "claude-code"
  },
  "result": "FAIL",
  "measurements": [
    { "type": "command", "run": "bun typecheck", "result": "PASS" },
    { "type": "command", "run": "bun test", "result": "PASS" },
    { "type": "fileCreated", "path": "src/nodes/compute/normalise.ts", "result": "PASS" },
    { "type": "fileCreated", "path": "src/nodes/compute/normalise.test.ts", "result": "PASS" },
    { "type": "grep", "glob": "src/**/*.ts", "pattern": "as any", "result": "FAIL",
      "detail": "2 occurrences: normalise.ts:14, normalise.ts:38" },
    { "type": "correctness-test", "result": "SKIPPED" }
  ]
}
```

---

## CLI

**`run`** — executes the harness, stores the result, then automatically renders the compare view if multiple experiments were run.
```
thunderjar run e1
thunderjar run e1 e2 e3                      # sequential; compare view shown at end
thunderjar run --task add-normalise-node     # all experiments for a task
```

**`compare`** — re-renders the compare view from stored results without re-executing.
```
thunderjar compare e1 e2 e3
thunderjar compare --task add-normalise-node
```

**`list`** — shows what is configured and what results are stored.
```
thunderjar list experiments
thunderjar list results
```

**`clean`** — removes stale worktrees left behind by crashed runs.

`run` with multiple experiments runs sequentially by default. Parallel execution is a later optimisation.

---

## Open Questions

- Token/duration capture from harness output (deferred)
- Raw harness stdout/stderr storage alongside result JSON (deferred)
- LLM judge as a measurement type (parked — introduces non-determinism into the measurement itself)
