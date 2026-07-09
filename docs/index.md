# Thunderjar — Coding Agent Benchmarking Tool

A tool for measuring coding agent behaviour reproducibly. The behaviour of a coding agent is a non-deterministic function of four variables: codebase state (C), prompt configuration (P), model (M), and harness (H). Thunderjar holds some variables fixed and varies others, then applies objective measurements to compare results.

## Core Concept

1. Identify a task with a clear expected outcome (typically one already completed)
2. Note the commit hash at that point in time
3. Run an experiment: check out to that commit, apply the prompt approach, run the harness headlessly
4. Apply measurements to what the agent produced and emit a report

---

## Config File

Lives in the repo under test as `thunderjar.config.ts`.

```typescript
import { defineConfig } from '../thunderjar/src/defineConfig.ts';

export default defineConfig({
  commands: {
    testRunner: 'bun test',
    setup: 'bun install',   // runs in worktree after checkout; optional
    harnesses: {
      'claude-code': 'claude -p "$THUNDERJAR_PROMPT" --model {model} --append-system-prompt "..."',
      'opencode':    'opencode ...',
    },
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

  prompts: {
    skills: { apply: 'cp prompts/skills.md CLAUDE.md' },
    minimal: { apply: 'cp prompts/minimal.md CLAUDE.md' },
  },

  experiments: {
    'model-comparison': {
      description: 'Compare sonnet vs opus on the normalise task with skills prompt',
      taskId: 'add-normalise-node',
      commitHash: 'a1b2c3d',
      variables: {
        models: ['claude-sonnet-4-6', 'claude-opus-4-8'],
        harnesses: ['claude-code'],
        prompts: ['skills'],
      },
    },
  },
});
```

An experiment with `models: [A, B]`, `harnesses: [X]`, `prompts: [P, Q]` produces 2 × 1 × 2 = 4 runs.

### Key design decisions

- `tasks` and `experiments` are objects keyed by id — uniqueness is guaranteed by the key.
- `prompts` is a top-level section of named, reusable configurations. Each prompt's `apply` command installs prompt files into the worktree before a run.
- `commands.harnesses` is a map from harness name to the shell command used to invoke it. `{model}` is substituted at run time.
- `commands.testRunner` is used by `correctness-test` measurements to execute the template file.
- Experiments vary one or more variables at a time via arrays; each permutation becomes a run. To isolate a single variable, keep the other arrays to one element.

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
 model-comparison — skills/sonnet
──────────────────────────────────────────
 Task      add-normalise-node
 Commit    a1b2c3d
 Prompt    skills
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

`thunderjar compare --experiment model-comparison`

```
                         run 1               run 2
                    skills/sonnet       skills/opus
────────────────────────────────────────────────────────────────────
bun typecheck            ✓               ✓
bun test                 ✓               ✓
fileCreated normalise    ✓               ✓
fileCreated *.test.ts    ✓               ✓
grep: no 'as any'        ✗               ✓
correctness-test         —               ✓
────────────────────────────────────────────────────────────────────
Duration              4m 32s          6m 14s
Result                FAIL            PASS
```

The compare view reads from stored results, so experiments from different sessions can be compared without re-running. `run` automatically shows the compare view at the end.

### Stored result (JSON)

Saved to `bench/results/<experimentId>--<prompt>--<model>--<harness>-<timestamp>.json`:

```json
{
  "experimentId": "model-comparison",
  "runId": "model-comparison--skills--claude-sonnet-4-6--claude-code",
  "runAt": "2026-06-19T10:23:00Z",
  "durationSeconds": 272,
  "taskId": "add-normalise-node",
  "variables": {
    "commitHash": "a1b2c3d",
    "model": "claude-sonnet-4-6",
    "harness": "claude-code",
    "prompt": "skills"
  },
  "measurements": [
    { "measurement": { "type": "command", "run": "bun typecheck" }, "result": "PASS" },
    { "measurement": { "type": "command", "run": "bun test" }, "result": "PASS" },
    { "measurement": { "type": "fileCreated", "path": "src/nodes/compute/normalise.ts" }, "result": "PASS" },
    { "measurement": { "type": "fileCreated", "path": "src/nodes/compute/normalise.test.ts" }, "result": "PASS" },
    { "measurement": { "type": "grep", "glob": "src/**/*.ts", "pattern": "as any" }, "result": "FAIL",
      "detail": "2 occurrences: normalise.ts:14, normalise.ts:38" },
    { "measurement": { "type": "correctness-test" }, "result": "SKIPPED" }
  ]
}
```

`bench/results/` should be gitignored.

---

## CLI

**`run`** — executes the harness for all variable permutations in an experiment, stores results, then renders the compare view.
```
thunderjar run <experimentId>
thunderjar run --task <taskId>     # all experiments for a task
```

**`compare`** — re-renders the compare view from stored results without re-executing.
```
thunderjar compare --experiment <experimentId>
thunderjar compare --task <taskId>
```

**`list`** — shows what is configured and what results are stored.
```
thunderjar list experiments
thunderjar list results
```

**`clean`** — removes stale worktrees left behind by crashed runs.

---

## Open Questions

- Token/duration capture from harness output (deferred)
- Raw harness stdout/stderr storage alongside result JSON (deferred)
- LLM judge as a measurement type (parked — introduces non-determinism into the measurement itself)

---

## Further Reading

- [Terminology](terminology.html) — glossary of task, prompt, experiment, run, measurement, etc.
- [CLI Workflow](cli-workflow.html) — the interactive CLI's menu structure
- [Skill](skill.html) — the Claude Code skill definition for operating Thunderjar
- [Operating Principles](operating_principles.html) — callbacks-over-static-values design rule
- [Harness vs Models](harness-vs-models.html) — design decision on the `variables` shape
- [Test Measure Proposal](test_measure_proposal.html) — proposal for a template-driven correctness measurer
- [Paned Runner Display](paned-runner-display.html) — design for a full-screen TUI progress view
