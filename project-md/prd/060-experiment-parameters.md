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
| Harness | Rendered fragment (with its version), `cli` rendered with fixed sample values for the first turn and a later one, `requiredEnv`, `files/` contents |
| Initial prompt | Rendered fragment, prompt text (or turns), `timeoutSeconds` |

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
| Image hash | The prerun Dockerfile, each folder parameter's `files/`, and what Thunderjar bakes in | The prerun image, which is tagged with it |

The image hash covers only what affects the image, so permutations that build the same
image share it. The model ID, the initial prompt and the run script are baked into the
image, so two models of one harness, or two initial prompts, each have their own image. They
still share every layer up to the model, so building the second is cheap.

| Change | Parameter hash | Permutation hash | Image |
|---|---|---|---|
| A comment, or a helper, without changing the rendered text | — | — | — |
| A code state's commit | code state | changed | rebuilt |
| A file in a parameter's `files/` | that parameter | changed | rebuilt |
| A harness's `cli` | harness | changed | rebuilt |
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
// test-case-parameters/codeStates/follow-main/index.ts
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
- **Where it goes.** Its result is `ctx.resolved` in `applyParameter`, and in a harness's
  `cli`. Its type is inferred from `resolve`'s return type, so declare `resolve` first.
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
harness's `ctx.version` is its own `version`.

Building a permutation's prerun image is then a fold: each parameter's fragment, in the
order below. Thunderjar adds `WORKDIR /workspace`, and bakes in the model ID, the prompts,
and `/thunderjar/thunderjar-run.sh`, the script that runs the agent. Its files are in the
build context under `thunderjar/`.

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
COPY thunderjar/model.txt /thunderjar/model.txt          # Thunderjar: the model ID
WORKDIR /workspace/packages/maths                        # initial prompt, optional
COPY thunderjar/prompt.txt /thunderjar/prompt.txt        # Thunderjar: the prompt
COPY --chmod=755 thunderjar/thunderjar-run.sh /thunderjar/thunderjar-run.sh
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

All five contribute to the image. The initial prompt's fragment is usually left out, or only
sets `WORKDIR`: Thunderjar bakes its prompt in, for the run script to pass to the harness:

| Parameter | Build time | Run time |
|---|---|---|
| Base image | seed of the build | `runOptions` |
| Code state | clones the codebase, then dependencies / fixture generation; may set `WORKDIR` | — |
| Prompt set | prompt files | — |
| Harness model pair | installs the agent tool; its `cli`, and the model ID, baked into the run script | `requiredEnv` |
| Initial prompt | its prompt or turns, baked in; may set `WORKDIR` | its `timeoutSeconds` |

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
// test-case-parameters/baseImages/node20/index.ts
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm`,
});
```

## Code state

The codebase applied on top of the base image: a repository cloned at a pinned commit, plus
any setup it needs. Detail: [062-code-state.md](062-code-state.md).

```ts
// test-case-parameters/codeStates/baseline/index.ts
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
// test-case-parameters/promptSets/house-style/index.ts — its files are in house-style/files/
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
// test-case-parameters/harnessModels/claude-code-2.1.311/index.ts
export default claudeCode({ version: "2.1.311" });
```

```ts
// test-case-parameters/harnessModels/opencode-1.19.5/index.ts
export default declareHarness({
  version: "1.19.5",

  // build: install the tool into the prerun image
  applyParameter: (_config, ctx) => `RUN npm install -g opencode-ai@${ctx.version}`,

  // run: execute the agent, and write the result file
  cli: (ctx) => `opencode run --model ${ctx.modelId} --format json "$(cat ${ctx.promptPath})" > ${ctx.resultPath}`,

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
// test-case-parameters/tasks/is-prime/initial-prompts/plain.ts
export default declareInitialPrompt({
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  timeoutSeconds: 600,
});
```

## Measuring instruments & measurements

- **Measuring instrument** — single-purpose, reusable evaluation logic (built-in
  or user-defined), parameterized by a config type and a value type. Examples:
  `grep`, `fileCreated`, `templateTest`, `shell`.
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

### `shell`

The escape hatch: runs any shell command in the measurement container, with
`sh -c` in `workdir`, and records whether it exited 0. Use it for whatever no
other instrument measures, with whatever the image has installed.

```ts
{
  instrument: "shell",
  config: { command: "bunx tsc --noEmit" },
  aggregate: ["rate"],
}
```

Its value is a boolean, so it aggregates as `rate` or `count`. A non-zero exit,
including a command that isn't found, is `false`, not `erroredWhileMeasuring`.

## Open questions

- Nothing stops a declaration returning a fragment that isn't reproducible
  (`RUN apt-get install foo`). The prerun image being built once and reused
  bounds the damage within a permutation's lifetime, but the hash can't detect
  it. A fingerprint of the built image could, later.
- Whether "artifact" should become the umbrella term for every hashed,
  reusable definition (harness, prompt set, measuring instrument, code state)
  — flagged in `030-terminology.md`, unresolved.
