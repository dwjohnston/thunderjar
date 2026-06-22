# Thunderjar Terminology

## Task

A **task** is the combination of a starting commit and a prompt. It defines *what* the agent is asked to do and *from what state*.

Tasks also declare **measurements** — the assertions evaluated after the agent runs to determine pass/fail.

## Experiment

An **experiment** is a configured comparison: it names a task and a set of **variables**, then runs the task once for every permutation of those variables.

```ts
{
  experimentName: 'hello',
  taskId: 'normalise-compute-node',
  variables: {
    models: ['claude-sonnet-4-6'],
    harnesses: ['claude-code', 'cursor'],
    prompts: ['skills-v1', 'minimal'],
  }
}
```

The above produces 1 × 2 × 2 = 4 runs.

## Variables

The dimensions that differ across runs within an experiment:

| Variable | What it controls |
|---|---|
| `model` | The LLM used by the harness |
| `harness` | The agent tool (e.g. claude-code, cursor) |
| `prompt` | The prompt approach applied to the worktree |

## Prompt

A **prompt** is a named, reusable configuration that defines how to overlay prompt files into the worktree before a run. It is referenced by ID.

A prompt is not just a commit hash — it is a reproducible action, expressed as a shell command:

```ts
prompts: {
  'skills-v1': { apply: 'git checkout abc123 -- CLAUDE.md .claude/' },
  'minimal':   { apply: 'git checkout def456 -- CLAUDE.md' },
}
```

This keeps prompts general enough to work across repos and teams, not just git-based workflows.

## Run

A single execution of a task under one specific combination of variable values. A run produces a **result**.

## Measurements

Assertions evaluated at the end of a run. They are defined on the task, not the experiment, because the success criteria for a task does not change across variable permutations.

## Result

The outcome of a run: the set of measurement outcomes produced by that run. Each measurement resolves to `PASS`, `FAIL`, or `SKIPPED`. Results are stored with the full variable context so experiments can be compared across runs.
