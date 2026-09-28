# Experiment Parameters

Parameter hashing and identity, plus the detailed configuration reference for
harnesses, prompt sets, tasks, and measuring instruments. Builds on the five
[experiment parameters](03-terminology.md#experiment-parameters) already named
in the glossary.

## Parameter hashing and identity

- Every experiment parameter folder (`experiment-parameters/<kind>/<name>/`)
  hashes its full content — `index.ts` plus any bundled scripts, templates, or
  fixtures — to a **content hash**. The same mechanism applies to measurements
  too, even though they aren't experiment parameters: hashing them catches
  silent drift when a named definition's content changes underneath it.
- A permutation's **parameter hash** combines the content hashes of its five
  resolved experiment parameters (code state, prompt set, harness, model, task
  instruction). Two container runs are only directly comparable if their
  parameter hashes match.
- Content hash is derived from content, not name — renaming a folder doesn't
  break comparability, but editing `index.ts` does. Any report comparing "the
  same" named parameter over time should treat a hash change as a break, not
  silently merge pre/post-edit runs together.

## Harness

A named, version-pinned definition of an agent tool and how to invoke it
headlessly.

```ts
// experiment-parameters/harnesses/claude-code/index.ts
export default {
  version: "1.2.3", // pinned exact version of the underlying tool
  cli: (ctx) => `claude -p "${ctx.taskInstruction}" --model ${ctx.model}`,
};
```

Comparing two versions of the same tool (e.g. Claude Code v1 vs v2) is just
comparing two harness definitions with different pinned versions — not a
special case.

## Prompt set

A named, reusable action that overlays prompt files (`CLAUDE.md`, skills,
rules) into the worktree before the harness runs, expressed as a shell command
or script.

```ts
// experiment-parameters/promptSets/snerk/index.ts
export default () => `cp prompts/snerk.md CLAUDE.md`;
```

## Task

A task is a task instruction plus task measurements. The instruction lives
under `experiment-parameters/taskInstructions/<name>/` and is hashed like any
other experiment parameter. Measurements are declared alongside it but are
**not** part of the parameter hash — per [terminology](03-terminology.md#experiments),
they judge the outcome, they don't determine what runs.

## Measuring instruments & measurements

- **Measuring instrument** — single-purpose, reusable evaluation logic (built-in
  or user-defined), parameterized by a config type and a value type. Examples:
  `grep`, `fileCreated`, `templateTest`.
- **Measurement** — an instrument plus a specific config, declared on a task.
  Copied per task, never shared by reference, so changing one task's
  measurement config can't silently change another task's meaning or history.
- **Measure** — the value one measurement produces for one iteration.
- **Result** — the set of measures for an iteration. Can grow after the fact:
  new measurements can be backfilled against a preserved artifact (the
  committed container image) without re-running the agent.

```ts
type MeasurementResult<T> =
  | { outcome: "measured"; data: T }
  | { outcome: "skipped" } // e.g. no output existed to check
  | { outcome: "erroredWhileMeasuring"; error: Error }; // the instrument itself threw
```

## Open questions

- Hash algorithm, and exactly what gets hashed (file contents only, or also
  file paths/structure?).
- Whether "task" is a first-class named folder (`tasks/<name>/`) bundling
  instruction + measurements, or whether the task instruction stands alone
  and measurements attach separately — `03-terminology.md`'s example layout
  only shows `taskInstructions/`, no `tasks/`.
- Exact shape of the harness's headless-invocation callback (`ctx` fields,
  return value) — sketched above, not settled.
- Whether "artifact" should become the umbrella term for every hashed,
  reusable definition (harness, prompt set, measuring instrument, code state)
  — flagged in `03-terminology.md`, unresolved.
