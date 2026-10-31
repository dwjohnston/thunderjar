# Model

The root LLM the harness is invoked with.

One of the six experiment parameters. Hashing and `applyParameter` are common to all of
them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `experiment-parameters/models/<name>/index.ts`.

```ts
// experiment-parameters/models/haiku-4-5/index.ts
export default declareModel({
  applyParameter: () => ``,
});
```

| Field | What it is |
|---|---|
| `applyParameter` | Returns an empty string. A model adds nothing to the image. |

## Identity

The folder name is the model's identity: `haiku-4-5` above. It is the name an
experiment lists, and the key harnesses use in their `models` map.

## The model ID belongs to the harness

The ID passed on the command line is not declared here. Harnesses spell the same model
differently, so each harness declares its own ID for each model it runs, in its
[`models` map](064-harness.md#models-which-models-it-runs):

```ts
// experiment-parameters/harnesses/claude-code-2-1-283/index.ts
  models: { "haiku-4-5": "claude-haiku-4-5-20251001" },
```

A model can be used with a harness only if that harness lists it. An experiment that
pairs a model with a harness that doesn't list it is a type error — see
[055-declaring-experiments.md](055-declaring-experiments.md#harness-and-model-must-be-compatible).

## When it applies

Run time only. The harness's `cli` receives the resolved ID as `ctx.modelId`.

## Sub-agent models

Sub-agent models aren't controlled here. They're recorded as outcomes, in the per-model
breakdown of [087-collecting-token-costs.md](087-collecting-token-costs.md).
