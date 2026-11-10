# Harness

A named, version-pinned definition of an agent tool. The harness is the only parameter
involved in all three phases of a container run: it is installed into the image,
invoked to do the work, and read back afterwards for its reply and what the run cost.

With a model ID, it is one of the five experiment parameters, the
[harness model pair](004-addressing-harness-model-pair.md). Hashing and `applyParameter`
are common to all of them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

A harness is a folder, `parameters/harnessModels/<harness>/`, with one `index.ts`,
and optionally a `files/` folder for its fragment to copy in. The folder pins one version:
name it after the version, and copy it to try another. A test case names a pair as
`<harness>/<model ID>`, e.g. `claude-code-2.1.311/claude-haiku-5-5`.

For Claude Code, the library has the whole declaration:

```ts
// parameters/harnessModels/claude-code-2.1.311/index.ts
import { claudeCode } from "thunderjar";

export default claudeCode({ version: "2.1.311" });
```

`claudeCode({ version, command? })` returns a fragment that installs Claude Code as root,
writes the model ID and the run script, then switches to the image's non-root `node` user,
which it needs to skip its permission prompts. It reads the reply and token costs from
`--output-format json`, and needs `ANTHROPIC_API_KEY`. `command` replaces the command its run
script runs.

Any other agent is declared in full:

```ts
// parameters/harnessModels/opencode-1.19.5/index.ts
import { declareHarness, writeModel, writeRunScript } from "thunderjar";

export default declareHarness({
  version: "1.19.5",

  // build: install the tool, and write the model and the script that runs it
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g opencode-ai@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      writeModel(ctx.modelId),
      writeRunScript(`opencode run --model "$(cat /thunderjar/model.txt)" --format json "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`),
      "USER node",
    ].join("\n"),

  // interpret: the agent's reply, and normalised token costs, from that file
  collectReply: (raw) => { /* … */ },
  collectTokenCosts: (raw, ctx) => { /* … */ },

  // env vars the agent needs at run time; the user supplies the values
  requiredEnv: ["OPENCODE_API_KEY"],
});
```

| Field | Phase | What it is |
|---|---|---|
| `version` | — | The pinned version of the agent tool: `ctx.version`. |
| `config`, `resolve` | — | As every parameter has: see [060](060-experiment-parameters.md#floating-parameters-resolve). |
| `applyParameter` | Build | Returns the Dockerfile fragment that installs the tool, and writes the model ID and the run script. Required. |
| `requiredEnv` | Run | Names of the environment variables the agent needs, e.g. its API key. |
| `collectReply` | Interpret | Reads the agent's final reply from the result file. |
| `collectTokenCosts` | Interpret | Turns the result file into normalised token costs. Without it, `notReported`. |

## `applyParameter`: installing and running the agent

The fragment installs the agent tool into the prerun image, at `ctx.version`. It can
`RUN npm install`, or copy an installer from its `files/` folder, at `ctx.dir`:
`COPY ${ctx.dir}/install.sh /tmp/`.

It also writes the files that run the agent. Running an iteration is only
`sh /thunderjar/thunderjar-run.sh`, so the image holds how the agent is run:

| File | Written by | What it is |
|---|---|---|
| `/thunderjar/thunderjar-run.sh` | the harness, with `writeRunScript(command)` | Runs the agent, in the image's working directory. |
| `/thunderjar/model.txt` | the harness, with `writeModel(ctx.modelId)` | The pair's model ID, as the agent takes it. |
| `/thunderjar/prompt.txt` | the initial prompt, with `writePrompt(text)` | The [initial prompt](066-task.md#initial-prompts), ending with a newline. |
| `/thunderjar/result.json` | the run script, as it runs | The agent's result. |

| Context field | What it is |
|---|---|
| `ctx.version` | The harness's `version`. |
| `ctx.modelId` | The pair's model ID, as the agent takes it. |
| `ctx.dir` | Where its `files/` folder is in the build context. |
| `ctx.resolved` | What the harness's `resolve` returned, if it has one. |

The helpers are shorthand for `COPY <<'EOF' <path>` heredocs, so the Dockerfile shows exactly
what is written. A fragment may write the files any other way.

The run script carries a contract: **it must both run the agent and leave a file at
`/thunderjar/result.json`.** Thunderjar never parses the file itself. It hands the text to
that same harness's `collectReply` and `collectTokenCosts`. Read the prompt and model from
their files, as `"$(cat /thunderjar/prompt.txt)"`, so quotes and newlines reach the agent
intact. `plan` stops if no fragment writes the run script.

Thunderjar also times the script, recording start time, finish time and exit code. The
harness author does nothing for that — see
[080-docker-execution.md](080-docker-execution.md#the-run-script).

An agent gets a single prompt. Several turns, in one session, are not supported yet.

## `collectTokenCosts`: reading back the cost

Receives the raw contents of the result file, and `{ version, modelId }`, and returns
normalised token costs. See [087-collecting-token-costs.md](087-collecting-token-costs.md)
for the `TokenCosts` contract and what happens when the file is missing or malformed.

## `requiredEnv`: credentials

The harness declares the names of the environment variables its agent needs. The user
exports them in the shell (or CI secret store) that runs Thunderjar, and Thunderjar
passes exactly those names into that harness's containers, as `docker run -e NAME`.
Docker copies the value from the calling environment.

- **Names only.** Values never appear in the declaration, the image layers, the run data
  store or any hash. They exist only in the container's environment at run time.
- **Scoped to the harness.** A container sees only its own harness's variables, so a run
  of one harness never receives another's key.
- **Fails fast.** `plan` and `run` stop before building anything if a required variable
  is unset, naming the variable and the harness that asked for it.
- **Hashed by name.** `requiredEnv` is part of the harness's parameter hash: changing
  what a harness needs is a change to the harness.

A harness whose needed variables depend on the model's provider (Claude Code on Bedrock
needs AWS variables, not `ANTHROPIC_API_KEY`) is not handled in v1. Declare one harness
per provider for now.

A credential needed only to build, e.g. to install from a private registry, is a build
secret instead: see [060](060-experiment-parameters.md#build-secrets).

## Models

There is no list of the models a harness runs. A pair names any model ID, which the
harness's fragment is given as `ctx.modelId`, and whether the agent knows it is the agent's to say.
Different agents spell the same model differently, so a pair names it as its agent does:
`claude-code-2.1.311/claude-sonnet-5-5`, `opencode-1.19.5/anthropic/claude-sonnet-5-5`.

## Hashing

A harness's parameter hash is of what it outputs:

- its fragment, rendered, with its version, and a sample model ID
- its `requiredEnv`
- its `files/` folder

The model ID isn't in it. It joins the permutation hash, so their runs are told apart. The
fragment writes it into the prerun image, so each model has its own image, sharing every
layer below the model's.

| Change | Effect |
|---|---|
| Use a new model ID | Only the permutations naming it. Their images share every layer below the model's. |
| Change `version`, or the fragment, the run script included | Every permutation using this harness, and its images. |
| Change `requiredEnv` | Every permutation using this harness. No image is rebuilt. |
| Change `collectReply` or `collectTokenCosts`, or a comment | Nothing. |

`collectReply` and `collectTokenCosts` interpret a run after the fact, so they aren't
hashed: correcting a parser bug doesn't mark old runs as not comparable. Replies and token
costs stay re-derivable, since the raw result file is preserved in the postrun image.

## Comparing versions of a tool

Comparing two versions of the same tool (Claude Code 2.1.311 against 2.2.0) is comparing
two harness folders with different pinned versions, e.g. `claude-code-2.1.311/` and
`claude-code-2.2.0/`. It is not a special case. This is why harness stays separate from
base image rather than being folded into it.
