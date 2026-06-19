---
name: thunderjar
description: Run and compare coding agent experiments. Use when asked to run an experiment, compare results, or add a new task or experiment to the bench config.
---

You are operating the thunderjar coding agent benchmarking tool.

Thunderjar runs a coding agent against a fixed codebase state, then applies objective measurements to what the agent produced.

## CLI

Run from the root of the repo under test (where `bench/bench.config.ts` lives):

```
bun /path/to/thunderjar/src/cli/index.ts <command>
```

| Command | Description |
|---|---|
| `run e1` | Run experiment `e1`, store result, print report |
| `run e1 e2 e3` | Run multiple experiments sequentially; compare view shown at end |
| `run --task <taskId>` | Run all experiments for a task |
| `compare e1 e2` | Re-render compare view from stored results without re-running |
| `compare --task <taskId>` | Compare all stored results for a task |
| `list experiments` | List tasks and experiments defined in config |
| `list results` | List stored result files |
| `clean` | Remove stale worktrees left by crashed runs |

## Config file

Lives at `bench/bench.config.ts` in the repo under test.

```typescript
import { defineConfig } from '../../../thunderjar/src/defineConfig.ts';

export default defineConfig({
  commands: {
    testRunner: 'bun test',
    promptFiles: ['CLAUDE.md', '.claude/'],   // overlaid from promptsCommit
    setup: 'bun install',                      // runs in worktree after checkout
    beforeRun: 'bun scripts/generate-agent-files.ts {approachName}',
    harnesses: {
      'claude-code': 'claude -p "$THUNDERJAR_PROMPT" --model {modelName} --append-system-prompt "..."',
      'opencode':    'opencode ...',
    },
  },

  tasks: {
    'my-task': {
      description: 'Short description',
      prompt: `Full task prompt sent to the agent.`,
      measurements: [
        { type: 'command', run: 'bun typecheck', expectExitCode: 0 },
        { type: 'command', run: 'bun test', expectExitCode: 0 },
        { type: 'fileCreated', path: 'src/path/to/expected-file.ts' },
        { type: 'grep', glob: 'src/**/*.ts', pattern: 'as any', expect: 'absent' },
        { type: 'correctness-test', templatePath: 'bench/templates/my-task-correctness.test.ts' },
      ],
    },
  },

  experiments: {
    e1: {
      description: 'skills, sonnet',
      task: 'my-task',
      commitHash: 'abc1234',      // C — codebase state
      promptsCommit: 'HEAD',      // P — branch name, commit hash, or 'HEAD'
      approachName: 'skills',     // used as {approachName} in beforeRun
      modelName: 'claude-sonnet-4-6',
      harnessName: 'claude-code',
    },
  },
});
```

## The four variables

| Variable | Config field | Notes |
|---|---|---|
| C — codebase | `commitHash` | The state of the repo the agent works against |
| P — prompts | `promptsCommit` | Overlaid from this ref after checkout; accepts branch, hash, or `HEAD` |
| M — model | `modelName` | Passed to the harness command as `{modelName}` |
| H — harness | `harnessName` | Selects which entry in `commands.harnesses` to use |

To isolate a variable, keep the other three identical across experiments.

## Measurements

Measurements run in order and **short-circuit on first failure** — the first failing measurement is always the meaningful signal.

| Type | What it checks |
|---|---|
| `command` | Runs a shell command in the worktree, asserts exit code |
| `fileCreated` | File appears in `git diff` as Added (accepts `path` or `glob`) |
| `fileExists` | File exists in worktree (regardless of diff) |
| `grep` | Pattern present or absent in files; `scope` defaults to `added-lines` |
| `correctness-test` | Copies a template test file into worktree root and runs it |

### `grep` scope

- `added-lines` (default) — only lines the agent introduced
- `changed-files` — all lines in files the agent touched
- `worktree` — all files matching the glob

### `correctness-test` templates

Live in `bench/templates/`. Written as normal test files importing from the path the agent is expected to create:

```typescript
import { myFunction } from './src/path/to/file';

test('does the right thing', () => {
  expect(myFunction(input)).toBe(expected);
});
```

Placed at `__thunderjar_correctness__.test.ts` in the worktree root at run time, then deleted.

## Results

Stored as JSON in `bench/results/<experimentId>-<timestamp>.json`. The `promptsCommit` field is always a resolved hash, never a branch name or `HEAD`.

`bench/results/` should be gitignored.

## Adding a new task

1. Add an entry to `tasks` in `bench/bench.config.ts`
2. Write a correctness test template at `bench/templates/<task-id>-correctness.test.ts`
3. Add one or more experiments to `experiments` referencing the task

## Adding a new experiment

Add an entry to `experiments` in `bench/bench.config.ts`. To compare variables, keep three fields identical and vary the fourth.
