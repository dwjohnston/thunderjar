# Harness

A named, version-pinned definition of an agent tool. The harness is the only parameter
involved in all three phases of a container run: it is installed into the image,
invoked to do the work, and read back afterwards for what the run cost.

One of the six experiment parameters. Hashing and `applyParameter` are common to all of
them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `experiment-parameters/harnesses/<name>/index.ts`.

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

| Field | Phase | What it is |
|---|---|---|
| `version` | — | The pinned version of the agent tool. |
| `applyParameter` | Build | Returns the Dockerfile fragment that installs the tool. |
| `cli` | Run | Returns the command that runs the agent. |
| `collectTokenCosts` | Interpret | Turns the result file into normalised token costs. |
| `models` | Run | Which models this harness runs, and the ID it passes for each. |

## `applyParameter`: installing the tool

The fragment layers the agent tool into the prerun image. The example copies it from a
pre-built harness image. A declaration is free to `RUN npm install` instead.

Where the pre-built harness images come from is unresolved — see
[020-goals-non-goals.md](020-goals-non-goals.md#to-revisit).

## `cli`: running the agent

`cli` receives a context and returns the command to run:

| Context field | What it is |
|---|---|
| `ctx.taskPrompt` | The [task](066-task.md)'s prompt. |
| `ctx.modelId` | The ID this harness passes for the permutation's model — see [`models`](#models-which-models-it-runs). |
| `ctx.resultPath` | Where the command must write its result file. |

`cli` carries a contract: **the command it returns must both run the agent and leave a
file at `ctx.resultPath`.** Thunderjar supplies the path and never parses the file
itself. It hands the bytes to that same harness's `collectTokenCosts`.

Thunderjar also wraps the command to record start time, finish time and exit code. The
harness author does nothing for that — see
[080-docker-execution.md](080-docker-execution.md#the-execution-wrapper).

## `collectTokenCosts`: reading back the cost

Receives the raw contents of the result file and returns normalised token costs. See
[087-collecting-token-costs.md](087-collecting-token-costs.md) for the `TokenCosts`
contract and what happens when the file is missing or malformed.

## `models`: which models it runs

`models` is the only place that says which models a harness can run. Each key is a
[model](065-model.md) folder name under `experiment-parameters/models/`, and its value
is the ID this harness passes for that model, as `ctx.modelId`.

Different harnesses spell the same model differently:

```ts
// experiment-parameters/harnesses/opencode-1-4-0/index.ts
  models: {
    "sonnet-5-5": "anthropic/claude-sonnet-5-5",
    "gpt-5": "openai/gpt-5",
  },
```

An experiment listing a model that one of its harnesses can't run is a type error — see
[055-declaring-experiments.md](055-declaring-experiments.md#harness-and-model-must-be-compatible).

### Hashing

`models` is excluded from the harness's content hash. The resolved model ID goes into
the permutation's parameter hash instead.

For `claude-code-2-1-283` with `sonnet-5-5`, the parameter hash includes:

```
harness content hash     (everything in the folder except `models`)
model content hash       (sonnet-5-5)
resolved model ID        "claude-sonnet-5-5"
…the other four parameters' content hashes
```

| Change | Effect on existing parameter hashes |
|---|---|
| Add a model to `models` | None. |
| Change one model's ID | Only that model's permutations change. |
| Change `cli` or `version` | Every permutation using this harness changes. |

> **Future:** the mapping may move to a separate file in the harness folder, excluded
> from hashing by location rather than by field.

## Comparing versions of a tool

Comparing two versions of the same tool (Claude Code 2.1.283 against 2.2.0) is
comparing two harness declarations with different pinned versions. It is not a special
case. This is why harness stays separate from base image rather than being folded into
it.

## Accepted tradeoffs

- **`collectTokenCosts` is part of the harness's content hash, though it doesn't
  determine what runs.** Strictly it belongs with measurements — it interprets a run
  after the fact. Because the declaration folder is hashed, correcting a parser bug
  changes the harness's content hash, and so the parameter hash, marking old runs as not
  directly comparable even though nothing about what executed changed. Accepted for
  now: keeping the harness's three phases in one declaration is worth more than the
  hash precision, and a hash change is a warning rather than an error. Token costs stay
  re-derivable regardless, since the raw result file is preserved in the postrun image.
