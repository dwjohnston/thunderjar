# Phase 2: Config Builder

## What we're building

Replacing `defineConfig()` (a thin pass-through in `src/defineConfig.ts`) with a `ThunderJarConfig` builder class that uses TypeScript's type-state pattern to carry registered names through the chain, giving autocomplete and compile-time errors when referencing unknown harnesses, prompt sets, or measurers.

The builder lives in `src/ThunderJarConfig.ts`. The test file is `src/ThunderJarConfig.test.ts`.

## Builder API

```ts
new ThunderJarConfig()
    .configure({
        testRunner: 'bun test',
        onWorktreeCreate: ({ worktreePath }) => `git -C ${worktreePath} config commit.gpgsign false`,
        harnessWorkingDirectory: 'evaluation-sandbox',
    })
    .registerMeasurer<{ glob: string }, boolean>({
        measurerName: 'file-present',
        evaluate: async (config, context) => ({ outcome: 'measured', data: true }),
    })
    .registerHarness({
        harnessName: 'claude-code',
        models: ['claude-haiku-4-5-20251001'],
        cli: (ctx) => `claude -p "${ctx.promptText}" --model ${ctx.model}`,
    })
    .registerPromptSet({
        promptSetName: 'snerk',
        cli: (_ctx) => 'cp prompts/snerk.md CLAUDE.md',
    })
    .registerTask({
        taskName: 'add-function',
        instruction: 'Write a TypeScript add function',
        measurements: [
            { measurerName: 'file-present', config: { glob: 'output/add.ts' } },
        ],
    })
    .registerExperiment({
        experimentName: 'snerk-experiment',
        taskName: 'add-function',
        commitHash: 'HEAD',
        variables: {
            harnesses: { 'claude-code': ['claude-haiku-4-5-20251001'] },
            promptSets: ['snerk'],
        },
    })
    .construct()  // returns ThunderjarConfig (the existing type the CLI consumes)
```

## Type carry-over (the key mechanic)

No call ordering is enforced. Instead, each `register*` call accumulates the registered name into the builder's type parameters. By the time `registerTask` and `registerExperiment` are called, the type system knows which measurer names, harness names, model names, and prompt set names are valid — and rejects anything else at compile time.

Example errors the type system should catch:
- `registerTask` measurement referencing `'nonexistent-measurer'` — not registered
- `registerExperiment` harness key `'cursor'` — not registered via `registerHarness`
- `registerExperiment` promptSet `'zzzz'` — not registered via `registerPromptSet`

Built-in measurers (e.g. `fileCreated`, `grep`) are pre-registered by the framework so they are always valid in `registerTask` without an explicit `registerMeasurer` call.

## Callbacks everywhere

All CLI/command fields are callbacks returning strings, not plain strings. This follows the operating principle in `docs/operating_principles.md`: callbacks receive a context object that can be extended over time without breaking existing configs.

Callback context shapes (start small, grow as needed):
- `registerHarness.cli`: `{ model: string, promptText: string, worktreePath: string }`
- `registerPromptSet.cli`: `{ worktreePath: string }` (currently unused, forward compat)
- `.configure.onWorktreeCreate`: `{ worktreePath: string }`
- `registerMeasurer.evaluate`: `(config: TConfig, context: { worktreePath: string, exitCode: number, stdout: string, stderr: string }) => Promise<MeasurementResult<TValue>>`

## MeasurementResult type

```ts
type MeasurementResult<T> =
  | { outcome: 'measured', data: T }
  | { outcome: 'skipped' }
  | { outcome: 'erroredWhileMeasuring', error: Error }
```

- `'measured'` — evaluation ran, here is the data (any type: boolean, number, string, etc.)
- `'skipped'` — could not evaluate (e.g. run errored before relevant output existed)
- `'erroredWhileMeasuring'` — the measurer's `evaluate` function threw

## Experiment variables shape (Option B)

Models are nested under their harness, not a flat cross-product:

```ts
variables: {
    harnesses: {
        'claude-code': ['claude-haiku-4-5-20251001'],
        'opencode': ['opencode/deepseek-v4-flash-free', 'opencode/north-mini'],
    },
    promptSets: ['snerk', 'glurk'],
}
```

Permutations: `(harness × its models) × promptSets`.

## Terminology changes from phase 1

| Old | New |
|---|---|
| `prompt` (overlay) | `promptSet` |
| `task.prompt` (agent text) | `task.instruction` / **task instruction** |
| `variables.prompts` | `variables.promptSets` |
| Measurement returns `PASS/FAIL/SKIPPED` | Measurement returns `MeasurementResult<T>` |
| The thing registered = measurement | The thing registered = **measurer** |
| The task-level declaration = (same) | The task-level declaration = **measurement** |

Full glossary: `docs/terminology.md`

## TDD state

`src/ThunderJarConfig.ts` — empty class, ready to implement.
`src/ThunderJarConfig.test.ts` — two tests:
1. Happy path: full valid chain, `expect(config).toBeDefined()`
2. Error cases: three `@ts-expect-error` annotations covering unregistered measurer, harness, and prompt set names

Run tests: `bun test src/ThunderJarConfig.test.ts`

Both tests currently fail at runtime (class is empty). Goal is to make test 1 pass and test 2 pass (meaning the `@ts-expect-error` annotations are correctly triggering type errors).
