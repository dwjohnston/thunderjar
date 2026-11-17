# Experiment Parameters

Parameter hashing and identity, what every declaration has in common, and an
example of each parameter's declaration. Each parameter's detail is on its own page,
061 to 066. Also covers measuring instruments. Builds on the five
[experiment parameters](030-terminology.md#experiment-parameters) already named
in the glossary: the harness and the model are one parameter, the
[pair](004-addressing-harness-model-pair.md).

## Hashing

A parameter's hash identifies what it produces, not its source. Its purpose is comparing runs:
"for this task, these parameters stayed the same, this one changed, and the effect was…".

### Parameter hash = output text + `files/`

Each parameter hash is of the text the parameter outputs once `resolve` and `applyParameter`
have run, and of its `files/` folder:

| Parameter | Hashed |
|---|---|
| Base image | Rendered fragment, `files/` contents, `runOptions` |
| Code state, prompt set | Rendered fragment, `files/` contents |
| Harness | Rendered fragment (with its version, and a sample model ID), `requiredEnv`, `files/` contents |
| Initial prompt | Rendered fragment, which writes the prompt, `timeoutSeconds` |

- **Nothing else of the declaration is hashed.** Comments, formatting, helper code and
  imports from anywhere change no hash, unless they change the text it renders. A harness's
  `collectReply` and `collectTokenCosts` read the result file after the run, so they aren't
  hashed either.
- **The name isn't hashed.** Renaming a folder or file keeps its hash.
- **`files/` is hashed by content**, following symlinks, so editing a file a link points at
  changes the hash. Only `files/` reaches the build: see
  [051](051-configuration-folder-structure.md#a-parameters-files-folder).
- **The text must always build the same thing.** That's the user's side of it: pin versions,
  image digests and commits in the text, and let anything float only through `resolve`. A
  fragment like `RUN npm install -g foo` has the same hash whatever `foo`'s latest is, and
  Thunderjar can't tell.
- A task's measurements aren't experiment parameters, and are in no parameter hash. Each has
  its own content hash, which marks a measure taken by an older version of it as stale.

### Permutation hash and image hash

| Hash | Of | Identifies |
|---|---|---|
| Permutation hash | The five parameter hashes, and the pair's model ID | A permutation's runs: two container runs are directly comparable only if theirs match |
| Image hash | The prerun Dockerfile, and each folder parameter's `files/` | The prerun image, which is tagged with it |

The image hash covers only what affects the image, so permutations that build the same
image share it. The harness's fragment writes the model ID into the image, and the initial
prompt's writes the prompt, so two models of one harness, or two initial prompts, each have
their own image. They still share every layer below the one they differ in, so building the
second is cheap.

| Change | Parameter hash | Permutation hash | Image |
|---|---|---|---|
| A comment, or a helper, without changing the rendered text | — | — | — |
| A code state's commit | code state | changed | rebuilt |
| A file in a parameter's `files/` | that parameter | changed | rebuilt |
| A harness's run script | harness | changed | rebuilt |
| A harness's `requiredEnv` | harness | changed | shared |
| A pair's model ID | — | changed | rebuilt |
| An initial prompt's text | initial prompt | changed | rebuilt |
| An initial prompt's timeout | initial prompt | changed | shared |
| A base image's `runOptions` | base image | changed | shared |

### Floating parameters: `resolve`

A parameter can follow a moving target, e.g. "the latest commit of `main`", with an optional
`resolve` on its declaration. It replaces `determineHash` and `additionalHash`, which were
never built.

```ts
type ResolveCtx = {
  /** Runs `command` with `sh -c` on the host, in the repository's root. Returns stdout, trimmed. Throws on a non-zero exit. */
  exec(command: string): Promise<string>;
};
type Resolved = string | number | boolean | null | Resolved[] | { [key: string]: Resolved };

resolve?(config: C, ctx: ResolveCtx): R | Promise<R>;          // R extends Resolved, inferred
applyParameter?(config: C, ctx: Ctx & { resolved: R }): string;
```

```ts
// parameters/codeStates/follow-main/index.ts
export default declareCodeState({
  config: { repo: "https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git", branch: "main" },
  resolve: async (config, ctx) =>
    (await ctx.exec(`git ls-remote --exit-code ${config.repo} refs/heads/${config.branch}`)).split("\t")[0] as string,
  applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${ctx.resolved} \\
  && git -C /workspace remote remove origin`,
});
```

- **When.** On the host, once per execution (`plan`, `run`, `build`), before anything is
  hashed. A parameter used by several permutations is resolved once.
- **Read only.** It may fetch, but it must not build or write anything.
- **Where it goes.** Its result is `ctx.resolved` in `applyParameter`. Its type is inferred from `resolve`'s return type, so declare `resolve` first.
- **Not hashed itself.** Only the text it ends up in is, so a resolved value that's never
  used changes nothing. When `main` moves, the commit in the code state's `RUN` changes, so
  its hash, the permutation hash and the image do, and the execution is recorded as a
  different permutation of the same named parameters.
- **Recorded.** Each container run records `{ name, parameterHash, resolved }` per parameter.
  `plan` lists what each parameter resolved to, and `show <execution> <container run>` shows
  it beside the parameter.
- **Errors.** If it throws, a command fails, or it returns what JSON can't hold, nothing is
  built, and the error names the parameter: `code state "follow-main": resolve threw: …`.
- **Pipelines.** `ctx.exec` reports a pipeline's last command's exit status, as `sh` does, so
  `git ls-remote … | cut -f1` succeeds with nothing when the branch is missing. Prefer a
  single command that fails, like `git ls-remote --exit-code`, and split its output in
  TypeScript.
- Tests fake `ctx.exec` by passing their own to `hashPermutations`, or, through the CLI, by
  putting a fake command first on the `PATH` (`src/testing/fakeCommand.ts`), as
  `src/testing/fakeDocker.ts` fakes Docker.

## Declarations and `applyParameter`

Each parameter is set by its [declaration](030-terminology.md#declaration) —
the `index.ts` in its folder, whose default export is wrapped in that kind's
`declareX()` function (`declareCodeState`, `declareHarness`, …) per
[022-coding-conventions.md](022-coding-conventions.md#declarex-functions-not-bare-exports).
Every declaration can have the same three:

```ts
config?: C;                                                     // its settings
resolve?(config: C, ctx: ResolveCtx): R | Promise<R>;           // see above
applyParameter?(config: C, ctx: Ctx & { resolved: R }): string; // a Dockerfile fragment
```

A folder parameter's `ctx.dir` is where its `files/` folder is in the build context. A
harness's `ctx.version` is its own `version`, and its `ctx.modelId` the pair's model ID.

Building a permutation's prerun image is then a fold: each parameter's fragment, in the
order below. Thunderjar adds only `WORKDIR /workspace`. The harness's fragment writes the
model ID and `/thunderjar/thunderjar-run.sh`, the script that runs the agent, and the initial
prompt's writes the prompt, with the `writeModel`, `writeRunScript` and `writePrompt`
helpers: see [064-harness.md](064-harness.md#applyparameter-installing-and-running-the-agent).

```dockerfile
FROM node:20-bookworm                                    # base image
RUN git config --system user.name "Thunderjar agent" \
  && git config --system user.email agent@thunderjar.invalid
WORKDIR /workspace                                       # Thunderjar
RUN git clone --quiet https://github.com/acme/widgets.git /workspace \
  && git -C /workspace checkout --quiet --detach a1b2c3 \
  && git -C /workspace remote remove origin             # code state
COPY parameters/promptSet/ /workspace/                   # prompt set, from its files/
RUN npm install -g @anthropic-ai/claude-code@2.1.311     # harness
COPY <<'THUNDERJAR_EOF' /thunderjar/model.txt
claude-haiku-5-5
THUNDERJAR_EOF
COPY --chmod=755 <<'THUNDERJAR_EOF' /thunderjar/thunderjar-run.sh
#!/bin/sh
claude -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --output-format json > /thunderjar/result.json
THUNDERJAR_EOF
COPY <<'THUNDERJAR_EOF' /thunderjar/prompt.txt          # initial prompt
Create a file isPrime.ts exporting a function that tests for primality.
THUNDERJAR_EOF
WORKDIR /workspace/packages/maths                        # initial prompt, optional
```

Running an iteration is then only `sh /thunderjar/thunderjar-run.sh`, in the image's
working directory: the last `WORKDIR` a fragment set, or `/workspace`. A code state or an
initial prompt sets one to run the agent in a subfolder, e.g. a package of a monorepo, and
measurements run there too. A prerun image holds everything a run needs, so it can be run,
or read, without the project's config.

Fragments are Dockerfile source rather than bare shell commands, because the
prerun build *is* a Dockerfile — so layer caching stays explicit and the base
image needs no special case. It is simply the fragment carrying the `FROM`.
The order matches the build sequence in
[080-docker-execution.md](080-docker-execution.md#process).

### Build-time and run-time parameters

All five contribute to the image. The initial prompt's fragment writes its prompt, and may
set `WORKDIR`:

| Parameter | Build time | Run time |
|---|---|---|
| Base image | seed of the build | `runOptions` |
| Code state | clones the codebase, then dependencies / fixture generation; may set `WORKDIR` | — |
| Prompt set | prompt files | — |
| Harness model pair | installs the agent tool; writes the model ID and the run script | `requiredEnv` |
| Initial prompt | writes the prompt; may set `WORKDIR` | its `timeoutSeconds` |

This split is the same one the flowchart in
[080-docker-execution.md](080-docker-execution.md#process) draws as its
per-permutation and per-iteration stages. All five keep the function even so:
the fold needs no special cases, and a kind that is a no-op today can gain
build-time setup later without changing the system's shape.

### Build secrets

A fragment that needs a credential at build time only, e.g. to clone a private repository,
mounts a secret the config names:

```ts
// thunderjar.config.ts
build: { secrets: [{ id: "github", env: "GITHUB_TOKEN" }], ssh: true },
```

```dockerfile
RUN --mount=type=secret,id=github \
  git clone "https://x-access-token:$(cat /run/secrets/github)@github.com/acme/private.git" /workspace
```

Each build gets `docker build --secret id=github,env=GITHUB_TOKEN`, and `--ssh default`
with `ssh: true`. A secret is never in an image layer, the run data or any hash. `plan`,
`build` and `run` stop if its variable is unset.

## Base image

The image a permutation's prerun image is built `FROM`. Detail:
[061-base-image.md](061-base-image.md).

```ts
// parameters/baseImages/node20/index.ts
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm`,
});
```

## Code state

The codebase applied on top of the base image: a repository cloned at a pinned commit, plus
any setup it needs. Detail: [062-code-state.md](062-code-state.md).

```ts
// parameters/codeStates/baseline/index.ts
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git",
    commit: "24dc11c26e2716a12cf33b82fec895a7f02b3e8a",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin
RUN npm ci`,
});
```

## Prompt set

A named, reusable action that overlays prompt files (`CLAUDE.md`, skills, rules) into
the worktree before the harness runs. Detail: [063-prompt-set.md](063-prompt-set.md).

```ts
// parameters/promptSets/house-style/index.ts — its files are in house-style/files/
export default declarePromptSet({
  applyParameter: (_config, ctx) => `COPY ${ctx.dir}/ /workspace/`,
});
```

## Harness model pair

A harness folder pins one version of an agent tool. It is installed into the image,
invoked to do the work, and read back afterwards for its reply and what the run cost. A
test case names it with a model ID, `<harness>/<model ID>`. Detail:
[064-harness.md](064-harness.md) and [004](004-addressing-harness-model-pair.md).

```ts
// parameters/harnessModels/claude-code-2.1.311/index.ts
export default claudeCode({ version: "2.1.311" });
```

```ts
// parameters/harnessModels/opencode-1.19.5/index.ts
export default declareHarness({
  version: "1.19.5",

  // build: install the tool, and write the model and the script that runs it, which writes the result file
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g opencode-ai@${ctx.version}`,
      writeModel(ctx.modelId),
      writeRunScript(`opencode run --model "$(cat /thunderjar/model.txt)" --format json "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`),
    ].join("\n"),

  // interpret: the reply, and normalised token costs, from that file
  collectReply: (raw) => { /* … */ },
  collectTokenCosts: (raw, ctx) => { /* … */ },

  requiredEnv: ["OPENCODE_API_KEY"],
});
```

## Initial prompt

The first prompt given to the harness — what the agent is asked to do. It is one wording
of a task, and the task's measurements live in a `measurements/` folder beside its
initial prompts, in no parameter hash. Detail: [066-task.md](066-task.md).

```ts
// parameters/tasks/is-prime/initial-prompts/plain.ts
export default declareInitialPrompt({
  applyParameter: () => writePrompt("Create a file isPrime.ts exporting a function that tests for primality."),
  timeoutSeconds: 600,
});
```

## Measuring instruments & measurements

- **Measuring instrument** — single-purpose, reusable evaluation logic (built-in
  or user-defined), parameterized by a config type and a value type, whose
  value can be of any shape. It has a `version` for that shape, and may have a
  default score. Examples: `grep`, `fileCreated`, `bunTestFile`, `shell`.
- **Measurement** — an instrument plus a specific config, declared on a task.
  Copied per task, never shared by reference, so changing one task's
  measurement config can't silently change another task's meaning or history.
- **Measure** — the value one measurement produces for one iteration, stored as
  the instrument returned it.
- **Metric** — a score read from a measure, a number or a boolean, or
  `undefined` where it doesn't apply, with one statistic across iterations and
  optionally which way is better. A measurement declares one or more in
  `metrics`. Metrics are computed when results are read, so they can change
  without re-measuring. See
  [085-experiment-results.md](085-experiment-results.md#measures-and-metrics).
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
  harnessResult: string; // raw contents of the file the run script wrote
  workdir: string;
}

evaluate: (config, context) => Promise<MeasurementResult<T>>;
```

Keeping instrument logic host-side means it stays unit-testable against a fake
context — layer 1 of [120-test-boundaries.md](120-test-boundaries.md) — without
requiring Thunderjar's own runtime inside every base image.

### `declareMeasurement`

A measurement names its instrument, the instrument's config, and its metrics.

```ts
export default declareMeasurement({
  instrument: "bunTestFile",
  config: { subject: "**/isPrime.ts", test: "./isPrime.test.ts" },
  metrics: {
    passRate: { stat: "mean", better: "higher" }, // the default score: passed / total
    passed: { score: (v) => v.passed, stat: "mean", better: "higher" },
  },
});
```

`metrics` is required, with at least one entry, each named by an identifier. A metric's
`score` reads the instrument's value, and is optional where the instrument has a default
score. Its `stat` must fit what the score returns: `rate` or `count` for booleans, `mean`,
`median`, `min`, `max` or `sum` for numbers. A misfit is a type error, and, where the score
type is known without running anything, an error at `plan` and `run`.

| Instrument | Value | Default score |
| --- | --- | --- |
| `fileCreated` | `boolean` | the value |
| `grep` | `number` | the value |
| `replyMatches` | `boolean` | the value |
| `bunTestFile` | `{ passed: number; total: number }` | the pass rate, `passed / total`, or not applicable with no tests |
| `shell` | `{ exitCode: number; stdout: string; stdoutTruncated: boolean }` | whether it exited 0 |

### `bunTestFile`

The instrument that shows why `writeFile` is on the context. It runs an ordinary
Bun test file against each file matching `subject`. The test can't import the
agent's file by name, because it doesn't exist yet and won't have a
predictable name, so it reads its absolute path from
`Bun.env.THUNDERJAR_SUBJECT`, falling back to a reference implementation
beside it when run on the host.

```ts
// declared on the task
{
  instrument: "bunTestFile",
  config: {
    subject: "**/isPrime.ts",    // resolved in the measurement container
    test: "./isPrime.test.ts",  // host-side, part of the measurement's content hash
  },
  metrics: { passRate: { stat: "mean" } },
}
```

```ts
// isPrime.test.ts — runs on the host as it is
import { expect, test } from "bun:test";
const { isPrime }: typeof import("./isPrime.reference.ts") = await import(Bun.env.THUNDERJAR_SUBJECT ?? "./isPrime.reference.ts");
test("17 is prime", () => expect(isPrime(17)).toBe(true));
```

Written into the measurement container and run there, so it gets the real
pinned runtime and installed dependencies. Its value is `{ passed, total }`,
read from Bun's JUnit report, summed over every subject the glob matches;
`total` includes skipped and failed tests. The glob matching nothing gives
`skipped`; a test that doesn't run against the subject gives
`erroredWhileMeasuring`.

### `shell`

The escape hatch: runs any shell command in the measurement container, with
`sh -c` in `workdir`, and stores what happened, unparsed:
`{ exitCode, stdout, stdoutTruncated }`. Use it for whatever no other
instrument measures, with whatever the image has installed.

```ts
{
  instrument: "shell",
  config: { command: "bunx tsc --noEmit" },
  metrics: { typeChecks: { stat: "rate" } }, // the default score: exit 0
}
```

- A non-zero exit, including a command that isn't found, is still `measured`,
  never `erroredWhileMeasuring`.
- `stdout` is capped at 64 KiB, with `stdoutTruncated` set when it was cut.
- To get any other value from a command, write a `score` that parses `stdout`,
  e.g. a command that prints JSON, read by several metrics.
- Version 2: version 1 stored whether it exited 0.

> **Warning:** stdout is stored in the run data store as it is. A command that
> prints secrets or other sensitive data will persist them. There is
> deliberately no transform step before storing.

## Open questions

- Nothing stops a declaration returning a fragment that isn't reproducible
  (`RUN apt-get install foo`). The prerun image being built once and reused
  bounds the damage within a permutation's lifetime, but the hash can't detect
  it. A fingerprint of the built image could, later.
- Whether "artifact" should become the umbrella term for every hashed,
  reusable definition (harness, prompt set, measuring instrument, code state)
  — flagged in `030-terminology.md`, unresolved.
