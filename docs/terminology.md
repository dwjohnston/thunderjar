# Thunderjar Terminology

## Task

A **task** is the combination of a starting commit and a task instruction. It defines *what* the agent is asked to do and *from what state*.

Tasks also declare **measurements** — the assertions evaluated after the agent runs to determine pass/fail.

## Task Instruction

A **task instruction** is the text sent to the agent defining what it should do. It lives on the task definition. Distinct from a prompt set, which configures the agent's environment rather than directing its work.

## Experiment

An **experiment** is a configured comparison: it names a task and a set of **variables**, then runs the task once for every permutation of those variables.

```ts
{
  experimentName: 'hello',
  taskId: 'normalise-compute-node',
  variables: {
    harnesses: {
      'claude-code': ['claude-haiku-4-5-20251001'],
      'cursor': ['composer-2.5'],
    },
    promptSets: ['skills-v1', 'minimal'],
  }
}
```

The above produces 2 × 2 = 4 runs.

## Variables

The dimensions that differ across runs within an experiment:

| Variable | What it controls |
|---|---|
| `model` | The LLM used by the harness |
| `harness` | The agent tool (e.g. claude-code, cursor) |
| `promptSet` | The prompt set applied to the worktree before a run |

## Prompt Set

A **prompt set** is a named, reusable configuration that defines how to overlay prompt files into the worktree before a run. It is referenced by ID. Distinct from a task instruction — a prompt set configures the agent's environment (e.g. installs a CLAUDE.md), while a task instruction tells the agent what to do.

A prompt set is a reproducible action, expressed as a shell command:

```ts
promptSets: {
  'skills-v1': { apply: 'git checkout abc123 -- CLAUDE.md .claude/' },
  'minimal':   { apply: 'git checkout def456 -- CLAUDE.md' },
}
```

This keeps prompt sets general enough to work across repos and teams, not just git-based workflows.

## Run

A single execution of a task under one specific combination of variable values. A run produces a **result**.

## Measurer

A **measurer** is a named, reusable definition of how to observe something about a run. It is registered once (built-in or user-defined) and referenced by name in task definitions. A measurer is parameterised by a config type and a value type:

```ts
registerMeasurer<{ glob: string }, boolean>({
    measurerName: "file-present",
    evaluate: (config, context) => Promise<MeasurementResult<boolean>>
})
```

Built-in measurers (e.g. `fileCreated`, `grep`) are pre-registered by the framework.

## Measurements

Observations evaluated at the end of a run. They are defined on the task, not the experiment, because what you want to measure about a task does not change across variable permutations.

A **measurement** is a task-level declaration that applies a measurer with specific config:

```ts
measurements: [
    { measurerName: "file-present", config: { glob: "output/add.ts" } }
]
```

A measurement returns a **`MeasurementResult<T>`** — not a verdict:

```ts
type MeasurementResult<T> =
  | { outcome: 'measured', data: T }
  | { outcome: 'skipped' }
  | { outcome: 'erroredWhileMeasuring', error: Error }
```

`data` can be any type — numeric (e.g. token count), boolean (e.g. file present/absent), or anything else. `'skipped'` means the measurement could not be evaluated (e.g. the run errored before relevant output existed). `'erroredWhileMeasuring'` means the measurement function itself threw during evaluation.

## Result

The outcome of a run: the set of measurement values produced by that run. Results are stored with the full variable context so experiments can be compared across runs.
