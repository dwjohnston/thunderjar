# Experiment Parameters

Parameter hashing and identity, what every declaration has in common, and an
example of each parameter's declaration. Each parameter's detail is on its own page,
061 to 066. Also covers measuring instruments. Builds on the six
[experiment parameters](030-terminology.md#experiment-parameters) already named
in the glossary.

## Parameter hashing and identity

- Every experiment parameter folder (`experiment-parameters/<kind>/<name>/`)
  hashes its full content — `index.ts` plus any bundled scripts, templates, or
  fixtures — to a **content hash**. The same mechanism applies to measurements
  too, even though they aren't experiment parameters: hashing them catches
  silent drift when a named definition's content changes underneath it.
- A permutation's **parameter hash** combines the content hashes of its six
  resolved experiment parameters (base image, code state, prompt set, harness,
  model, task), plus the model ID the harness resolves the model to (see
  [064-harness.md](064-harness.md#hashing)). Two container runs are only directly comparable if
  their parameter hashes match.
- A harness's `models` map is excluded from its content hash. Adding a model
  to a harness doesn't change any existing parameter hash; changing one
  model's ID changes only that model's permutations, through the resolved
  model ID.
- Content hash is derived from content, not name — renaming a folder doesn't
  break comparability, but editing `index.ts` does. Any report comparing "the
  same" named parameter over time should treat a hash change as a break, not
  silently merge pre/post-edit runs together.

## Declarations and `applyParameter`

Each parameter is set by its [declaration](030-terminology.md#declaration) —
the `index.ts` in its folder, whose default export is wrapped in that kind's
`declareX()` function (`declareHarness`, `declareModel`, …) per
[022-coding-conventions.md](022-coding-conventions.md#declarex-functions-not-bare-exports).
Every declaration exposes the same function:

```ts
applyParameter: () => string; // a Dockerfile fragment
```

Building a permutation's prerun image is then a fold: concatenate each
parameter's fragment, in the order below, and build the result.

```dockerfile
FROM node:20-bookworm                                    # base image
RUN git checkout a1b2c3                                  # code state
RUN git checkout e4f5a6 -- prompts/snerk.md \
  && cp prompts/snerk.md CLAUDE.md                       # prompt set
COPY --from=thunderjar/harness-claude-code:2.1.283 \
  /opt/claude /opt/claude                                # harness
```

Fragments are Dockerfile source rather than bare shell commands, because the
prerun build *is* a Dockerfile — so layer caching stays explicit and the base
image needs no special case. It is simply the fragment carrying the `FROM`.
The order matches the build sequence in
[080-docker-execution.md](080-docker-execution.md#process).

### Build-time and run-time parameters

Only four of the six contribute to the image. The other two are consumed when
the harness is invoked, and their `applyParameter` returns an empty string:

| Parameter | Build time | Run time |
|---|---|---|
| Base image | seed of the build | — |
| Code state | checkout / fixture generation | — |
| Prompt set | overlays prompt files | — |
| Harness | installs the agent tool | invoked via `cli` |
| Model | — | `ctx.modelId` |
| Task | — | `ctx.taskPrompt` |

This split is the same one the flowchart in
[080-docker-execution.md](080-docker-execution.md#process) draws as its
per-permutation and per-iteration stages. All six keep the function even so:
the fold needs no special cases, and a kind that is a no-op today can gain
build-time setup later without changing the system's shape.

## Base image

The image a permutation's prerun image is built `FROM`. Detail:
[061-base-image.md](061-base-image.md).

```ts
// experiment-parameters/baseImages/node20/index.ts
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm`,
});
```

## Code state

The codebase applied on top of the base image, most commonly a pinned git commit.
Detail: [062-code-state.md](062-code-state.md).

```ts
// experiment-parameters/codeStates/baseline/index.ts
export default declareCodeState({
  applyParameter: () => `RUN git checkout a1b2c3`,
});
```

## Prompt set

A named, reusable action that overlays prompt files (`CLAUDE.md`, skills, rules) into
the worktree before the harness runs. Detail: [063-prompt-set.md](063-prompt-set.md).

```ts
// experiment-parameters/promptSets/snerk/index.ts
const commit = "e4f5a6";

export default declarePromptSet({
  applyParameter: () =>
    `RUN git checkout ${commit} -- prompts/snerk.md && cp prompts/snerk.md CLAUDE.md`,
});
```

## Harness

A named, version-pinned definition of an agent tool. It is installed into the image,
invoked to do the work, and read back afterwards for what the run cost. Detail:
[064-harness.md](064-harness.md).

```ts
// experiment-parameters/harnesses/claude-code-2-1-283/index.ts
const version = "2.1.283";

export default declareHarness({
  version,

  // build: layer the tool into the prerun image
  applyParameter: () =>
    `COPY --from=thunderjar/harness-claude-code:${version} /opt/claude /opt/claude`,

  // run: execute the agent, and write the result file
  cli: (ctx) =>
    `claude -p "${ctx.taskPrompt}" --model ${ctx.modelId} ` +
    `--allowedTools "Write,Edit,Read,Bash" --output-format json > ${ctx.resultPath}`,

  // interpret: turn that file's contents into normalised token costs
  collectTokenCosts: (raw) => { /* … */ },

  // which models this harness runs, and the ID it passes for each
  models: {
    "sonnet-5-5": "claude-sonnet-5-5",
    "haiku-4-5": "claude-haiku-4-5-20251001",
  },
});
```

## Model

The root LLM the harness is invoked with. The folder name is its identity; the ID
passed on the command line belongs to each harness. Detail:
[065-model.md](065-model.md).

```ts
// experiment-parameters/models/haiku-4-5/index.ts
export default declareModel({
  applyParameter: () => ``,
});
```

## Task

The initial prompt given to the harness — what the agent is asked to do. Its task
measurements live in a `measurements/` folder beside it, excluded from its content
hash. Detail: [066-task.md](066-task.md).

```ts
// experiment-parameters/tasks/is-prime/index.ts
export default declareTask({
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  applyParameter: () => ``,
});
```

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

### Measurement context

An instrument's logic runs on the host; the work it commands runs inside a
[measurement container](030-terminology.md#measurement-container). The context
is that seam:

```ts
interface MeasurementContext {
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  glob(pattern: string): Promise<string[]>;
  harnessResult: string; // raw contents of the file `cli` wrote
  workdir: string;
}

evaluate: (config, context) => Promise<MeasurementResult<T>>;
```

Keeping instrument logic host-side means it stays unit-testable against a fake
context — layer 1 of [120-test-boundaries.md](120-test-boundaries.md) — without
requiring Thunderjar's own runtime inside every base image.

### `templateTest`

The instrument that shows why `writeFile` is on the context. A test against
agent output can't be written in advance, because the thing it tests doesn't
exist yet and won't have a predictable name. So the file supplied is a
*template*, populated at measure time from whatever the agent actually
produced:

```ts
// declared on the task
{
  instrument: "templateTest",
  config: {
    subject: "output/**/*.ts",             // resolved in the measurement container
    template: "./prime.test.template.ts",  // host-side, part of the measurement's content hash
  },
}
```

```ts
// prime.test.template.ts — not runnable as-is
import { {{defaultExport}} } from "{{subjectPath}}";
test("17 is prime", () => expect({{defaultExport}}(17)).toBe(true));
```

Rendered into the measurement container and run there, so it gets the real
pinned runtime and installed dependencies. Its value type is a count rather
than a boolean — a measurement, not a verdict. The glob matching nothing gives
`skipped`; a template that can't bind gives `erroredWhileMeasuring`.

## Open questions

- Hash algorithm, and exactly what gets hashed (file contents only, or also
  file paths/structure?).
- Whether `applyParameter` should receive any context, or stay zero-argument as
  above.
- Nothing stops a declaration returning a fragment that isn't reproducible
  (`RUN apt-get install foo`). The prerun image being built once and reused
  bounds the damage within a permutation's lifetime, but the hash can't detect
  it.
- Whether "artifact" should become the umbrella term for every hashed,
  reusable definition (harness, prompt set, measuring instrument, code state)
  — flagged in `030-terminology.md`, unresolved.
