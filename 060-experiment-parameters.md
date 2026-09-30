# Experiment Parameters

Parameter hashing and identity, plus the detailed configuration reference for
harnesses, prompt sets, tasks, and measuring instruments. Builds on the six
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
  model, task instruction). Two container runs are only directly comparable if
  their parameter hashes match.
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
| Model | — | `ctx.model` |
| Task instruction | — | `ctx.taskInstruction` |

This split is the same one the flowchart in
[080-docker-execution.md](080-docker-execution.md#process) draws as its
per-permutation and per-iteration stages. All six keep the function even so:
the fold needs no special cases, and a kind that is a no-op today can gain
build-time setup later without changing the system's shape.

## Base image

The image a permutation's prerun image is built `FROM`, before code state is
applied — base OS/runtime plus any extra services a task needs (a database, a
message broker) that code state, prompt set, or harness don't provision
themselves.

```ts
// experiment-parameters/baseImages/node20/index.ts
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm`,
});
```

Most experiments just use one plain, minimal base image like the one above;
this parameter only needs attention when a task genuinely depends on something
the codebase itself doesn't set up.

## Code state

The codebase applied on top of the base image. Most commonly a pinned git
commit, but `applyParameter` can return any fragment that produces the same
codebase every time — applying a patch, running a fixture generator, and so on
aren't special cases.

```ts
// experiment-parameters/codeStates/baseline/index.ts
export default declareCodeState({
  applyParameter: () => `RUN git checkout a1b2c3`,
});

// experiment-parameters/codeStates/with-fixture/index.ts
export default declareCodeState({
  applyParameter: () =>
    `RUN git checkout a1b2c3 && ./scripts/seed-fixture-data.sh`,
});
```

## Prompt set

A named, reusable action that overlays prompt files (`CLAUDE.md`, skills,
rules) into the worktree before the harness runs.

Prompt files are checked out from a pinned commit, not taken from whatever
happens to be in the worktree. Otherwise the declaration's content hash stays
the same while the file it applies changes underneath it — precisely the silent
drift the hash exists to catch.

```ts
// experiment-parameters/promptSets/snerk/index.ts
const commit = "e4f5a6";

export default declarePromptSet({
  applyParameter: () =>
    `RUN git checkout ${commit} -- prompts/snerk.md && cp prompts/snerk.md CLAUDE.md`,
});
```

The commit is the prompt set's own, independent of the code state's. That
keeps the two axes orthogonal: a matrix can vary prompt sets while holding
code state fixed, which is the single most common experiment shape.

## Harness

A named, version-pinned definition of an agent tool. The harness is the only
parameter involved in all three phases of a container run — it is installed
into the image, invoked to do the work, and read back afterwards for what the
run cost.

```ts
// experiment-parameters/harnesses/claude-code/index.ts
const version = "2.1.283";

export default declareHarness({
  version,

  // build: layer the tool into the prerun image
  applyParameter: () =>
    `COPY --from=thunderjar/harness-claude-code:${version} /opt/claude /opt/claude`,

  // run: execute the agent, and write the result file
  cli: (ctx) =>
    `claude -p "${ctx.taskInstruction}" --model ${ctx.model} ` +
    `--allowedTools "Write,Edit,Read,Bash" --output-format json > ${ctx.resultPath}`,

  // interpret: turn that file's contents into normalised token costs
  collectTokenCosts: (raw) => { /* … */ },
});
```

`cli` carries a contract worth stating plainly: **the command it returns must
both run the agent and leave a file at `ctx.resultPath`.** Thunderjar supplies
the path and never parses the file itself — it hands the bytes to that same
harness's `collectTokenCosts`. Thunderjar also wraps the command to record start time,
finish time and exit code — the harness author does nothing for that; see
[080-docker-execution.md](080-docker-execution.md#the-execution-wrapper). See
[087-collecting-token-costs.md](087-collecting-token-costs.md) for the
`TokenCosts` contract and what happens when the file is missing or malformed.

Comparing two versions of the same tool (e.g. Claude Code v1 vs v2) is just
comparing two harness declarations with different pinned versions — not a
special case. This is why harness stays separate from base image rather than
being folded into it. Where the pre-built harness images come from is
unresolved — see
[020-goals-non-goals.md](020-goals-non-goals.md#to-revisit). A declaration is
free to `RUN npm install` instead.

## Model

The root LLM the harness is invoked with. Nothing to add to the image.

```ts
// experiment-parameters/models/haiku/index.ts
export default declareModel({
  model: "claude-haiku-4-5-20251001",
  applyParameter: () => ``,
});
```

Sub-agent models aren't controlled here — they're recorded as outcomes, in the
per-model breakdown of
[087-collecting-token-costs.md](087-collecting-token-costs.md).

## Task

A task is a task instruction plus task measurements. The instruction lives
under `experiment-parameters/taskInstructions/<name>/` and is hashed like any
other experiment parameter. Measurements are declared alongside it but are
**not** part of the parameter hash — per [terminology](030-terminology.md#experiments),
they judge the outcome, they don't determine what runs.

```ts
// experiment-parameters/taskInstructions/add-prime/index.ts
export default declareTaskInstruction({
  instruction: "Write a TypeScript function that determines if a number is prime.",
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

## Accepted tradeoffs

- **`collectTokenCosts` is part of the harness's content hash, though it doesn't
  determine what runs.** Strictly it belongs with measurements — it interprets a
  run after the fact. Because the whole declaration folder is hashed, correcting
  a parser bug changes the harness's content hash, and so the parameter hash,
  marking old runs as not directly comparable even though nothing about what
  executed changed. Accepted for now: keeping the harness's three phases in one
  declaration is worth more than the hash precision, and a hash change is a
  warning rather than an error. Token costs stay re-derivable regardless, since
  the raw result file is preserved in the postrun image.

## Open questions

- Hash algorithm, and exactly what gets hashed (file contents only, or also
  file paths/structure?).
- Whether "task" is a first-class named folder (`tasks/<name>/`) bundling
  instruction + measurements, or whether the task instruction stands alone
  and measurements attach separately — `030-terminology.md`'s example layout
  only shows `taskInstructions/`, no `tasks/`.
- Whether `applyParameter` should receive any context, or stay zero-argument as
  above.
- Nothing stops a declaration returning a fragment that isn't reproducible
  (`RUN apt-get install foo`). The prerun image being built once and reused
  bounds the damage within a permutation's lifetime, but the hash can't detect
  it.
- Whether "artifact" should become the umbrella term for every hashed,
  reusable definition (harness, prompt set, measuring instrument, code state)
  — flagged in `030-terminology.md`, unresolved.
