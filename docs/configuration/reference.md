<!-- Mockup: AI-generated draft of the configuration section. -->
# Declaration reference

Every file in `.thunderjar/` default-exports one of these functions. Each returns its argument unchanged, so its only job is to type-check the declaration.

```ts
import { declareTestCase } from "thunderjar";
```

## Shared parameter options

`declareBaseImage`, `declareCodeState`, `declarePromptSet`, `declareHarness` and `declareInitialPrompt` all accept these.

### config

**Type:** `C` (any value)<br>
**Default:** `undefined`

Values passed to `resolve` and `applyParameter`. Keeping them here, rather than inline, makes them easy to change.

### resolve

**Type:** `(config, ctx: { exec(command): Promise<string> }) => Resolved | Promise<Resolved>`

Looks up what a floating parameter currently means, such as a branch's latest commit. Runs on the host once per `plan`, `run` or `build`. Must only read. Its result is passed on as `ctx.resolved` and recorded with each run.

```ts
resolve: async (config, ctx) => ctx.exec(`git ls-remote ${config.repo} main | cut -f1`),
```

### applyParameter

**Type:** `(config, ctx: { dir: string; resolved: R }) => string`

Returns the Dockerfile fragment that applies this parameter to the prerun image. `ctx.dir` is where the folder's `files/` is in the build context.

```ts
applyParameter: (_config, ctx) => `COPY ${ctx.dir}/ /workspace/`,
```

## declareConfig

**File:** `thunderjar.config.ts`

```ts
export default declareConfig({
  imageStore: null,
  runDataStore: sqliteStore({ path: "./run-data.sqlite" }),
});
```

### imageStore

**Type:** `{ repository: string } | null`

The registry repository that images are pushed to, using your `docker login`. `null` keeps images in the local Docker daemon only.

### runDataStore

**Type:** `SqliteStore`

Where run data is kept. Create one with `sqliteStore({ path })`.

### build

**Type:** `{ secrets?: { id: string; env: string }[]; ssh?: boolean }`<br>
**Default:** none

Secrets and the SSH agent made available to prerun builds, for example to clone a private repository. They are never written to an image or to run data.

## declareTestCase

**File:** `test-cases/<name>.ts`

Every list is crossed with every other, and each combination runs `iterations` times.

| Option | Type | Description |
| --- | --- | --- |
| `baseImage` | `BaseImageName[]` | Folders under `parameters/baseImages/` |
| `codeState` | `CodeStateName[]` | Folders under `parameters/codeStates/` |
| `promptSet` | `PromptSetName[]` | Folders under `parameters/promptSets/` |
| `harnessModel` | `` `${harness}/${modelId}`[] `` | A harness folder and a model ID |
| `task` | `TaskName` | A folder under `parameters/tasks/` |
| `initialPrompt` | `InitialPromptName[]` | Files in that task's `initial-prompts/` |
| `iterations` | `number` | Runs per combination |

## declareBaseImage

**File:** `parameters/baseImages/<name>/index.ts`

```ts
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm
RUN npm install --global bun@1.3.14`,
});
```

### applyParameter

**Required.** Must start with `FROM`.

### runOptions

**Type:** `string[]`<br>
**Default:** `[]`

Extra `docker run` options for the agent's containers, such as `["--security-opt", "seccomp=unconfined"]`. Ask for as little as you need.

## declareCodeState

**File:** `parameters/codeStates/<name>/index.ts`

What's in `/workspace` when the agent starts. Accepts only the [shared options](#shared-parameter-options).

```ts
export default declareCodeState({
  config: { repo: "https://github.com/acme/app.git", commit: "a1b2c3d" },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
    && git -C /workspace checkout --quiet --detach ${config.commit}`,
});
```

## declarePromptSet

**File:** `parameters/promptSets/<name>/index.ts`

The `AGENTS.md`, skills and other prompt files the agent sees. Accepts only the [shared options](#shared-parameter-options).

```ts
export default declarePromptSet({
  applyParameter: (_config, ctx) => `COPY ${ctx.dir}/ /workspace/`,
});
```

## declareHarness

**File:** `parameters/harnessModels/<harness>/index.ts`

### version

**Type:** `string` — **required**

The agent version this harness installs. Name the folder after it, such as `claude-code-2.1.311/`.

### cli

**Type:** `(ctx) => string` — **required**

The command that runs the agent for one turn. `ctx` has `modelId`, `promptPath`, `resultPath`, `turn` and `sessionId`.

```ts
cli: (ctx) => `claude -p "$(cat ${ctx.promptPath})" --model ${ctx.modelId} > ${ctx.resultPath}`,
```

### requiredEnv

**Type:** `string[]`

Environment variables passed into this harness's containers, such as an API key. `plan` and `run` stop if one is unset.

### collectReply

**Type:** `(raw: string) => string`

Reads the agent's final reply from the result file, so instruments such as `replyMatches` can measure it.

### collectTokenCosts

**Type:** `(raw: string, ctx) => TokenCosts`

Reads token usage from each turn's result file.

## declareInitialPrompt

**File:** `parameters/tasks/<task>/initial-prompts/<name>.ts`

```ts
export default declareInitialPrompt({
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  timeoutSeconds: 600,
});
```

| Option | Type | Description |
| --- | --- | --- |
| `prompt` | `string` | A single prompt. Use either `prompt` or `turns` |
| `turns` | `string[]` | Several prompts, run in the same agent session |
| `timeoutSeconds` | `number` | **Required.** Covers every turn together |

## declareMeasurement

**File:** `parameters/tasks/<task>/measurements/<name>.ts`

```ts
export default declareMeasurement({
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
  aggregate: ["rate"],
});
```

### instrument

| Instrument | Config | Measures |
| --- | --- | --- |
| `fileCreated` | `{ glob }` | Whether a matching file exists |
| `grep` | `{ glob, pattern }` | Matching lines across files |
| `templateTest` | `{ subject, template }` | Tests passed and failed |
| `replyMatches` | `{ pattern, turn? }` | Whether the reply matches |
| `shell` | `{ command }` | Whether a command exits 0 |

### aggregate

How values combine across iterations. Booleans: `rate`, `count`. Numbers: `mean`, `median`, `min`, `max`, `sum`.
