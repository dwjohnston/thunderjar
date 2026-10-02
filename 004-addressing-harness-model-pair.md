# Addressing the Harness/Model Pair

**Status: parked.** The design below is agreed in outline. It changes the spec's central
shape, so it is recorded here and linked from
[003-critical-issues.md](003-critical-issues.md) until it is applied to the pages it
affects. Nothing else in the spec has been edited yet.

## The problem

Today `harness` and `model` are two independent arrays in `declareExperiment`, and they
form a cross product. Every listed model must run on every listed harness, which is why
[055-declaring-experiments.md](055-declaring-experiments.md#harness-and-model-must-be-compatible)
carries a type guard.

The cross product can't express the comparison Thunderjar exists to make:
`claude-code` with `haiku` against `codex` with `gpt-luna`. Those two pairs share no
harness and no model. Today the workaround is to declare two experiments, which defeats
comparing them in one.

The compatibility check was meant to stop invalid combinations. It also stops valid mixed
ones.

## The decision

Harness and model stop being two parameters. An experiment has one axis, a **harness/model
pair**, and lists the pairs it wants. Each pair is valid or not on its own, so any mix of
valid pairs is allowed.

The experiment parameters go from six to five: base image, code state, prompt set,
**harness/model pair**, task. The matrix is still a cross product, but the pair is one
axis of it.

```ts
export default declareExperiment({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk", "glurk"],
  harnessModel: [
    "claude-code@2.1.283/haiku-4-5",
    "claude-code@2.2.0/haiku-4-5",
    "codex@0.9.0/gpt-luna",
  ],
  task: ["is-prime"],
  iterations: 5,
});
```

## Why the pair is a parameter, not two parameters listed together

Keeping `harnesses/` and `models/` as folders while the declaration names a pair would
mean the declaration and the file system describe different parameters. The pair is what
an experiment varies, so it is the parameter.

## Structure: a harness is a family

Writing one folder per pair means copying the same `cli`, `collectTokenCosts` and install
fragment across every model and every version. Writing `models/` inside each harness
version folder only moves the copying. The repetition has two sources:

- The model-to-ID map differs per harness family (`claude-haiku-4-5-20251001` for Claude
  Code, `anthropic/claude-haiku-4-5-20251001` for OpenCode). That is information, not
  duplication.
- It repeats only across *versions* of one family, because version and model are
  independent axes.

So a harness is declared once as a **family**. Version and model are values on it.

```
experiment-parameters/harnessModels/
  claude-code/
    index.ts      # install, cli, collectTokenCosts — written once, parameterised by version
    models.ts     # model name → model ID, written once
    versions.ts   # the versions, plus any per-version override
  opencode/
    ...
```

A pair is addressed as `family@version/model`.

Consequences:

- **A folder is no longer one parameter.** One family folder yields many parameter values.
  The unit of identity is the pair string. The folder-structure and terminology pages must
  say so explicitly.
- **No compatibility machinery.** A pair exists or it doesn't. The generation step emits
  the valid pair strings as template-literal types from each family's `versions.ts` and
  `models.ts`. `claude-code@…/gpt-5` isn't in the union, so it is a type error. The
  `HarnessModels` map and the cross-product types (`HarnessesFor`, `ModelsForAll`) go away.
- **`ctx.modelId` is no longer handed to the harness.** `cli` is given the resolved
  version and model ID for the pair.
- **Adding things is cheap.** A model is one line in one `models.ts`. A version is one entry
  in `versions.ts`, with its own override only if a flag changed. A family is a new folder.

### Not decided

Models could be declared once centrally, with each family only saying how to spell the ID
(for example `anthropic/${id}` for OpenCode). That removes most of the per-family maps, but
fails for harnesses whose IDs don't follow a rule. Default is explicit maps, with this as an
optional shortcut. To settle when the design is applied.

## Hashing and invalidation

A pair's parameter hash is made of:

1. The family's shared code: `index.ts` and anything bundled with it.
2. The resolved version, plus any override for that version.
3. The resolved model ID.

`models.ts` and `versions.ts` are excluded from the family's content hash **by location**.
This replaces the "`models` is excluded by field" rule in
[064-harness.md](064-harness.md#hashing), and is the "Future" note on that page made the
design.

| Change | Effect on existing hashes |
|---|---|
| Add a model or a version | None. |
| Change one model's ID | Only that model's pairs. |
| Edit one version's override | Only that version's pairs. |
| Edit the family's `cli` or install fragment | Every pair in the family. |
| Rename a folder or a pair string | None. Hashes come from content, not names. |

A floating version such as `claude-code@latest` uses the existing `determineHash`
mechanism. The pair hash uses the resolved version. No new machinery.

### `collectTokenCosts` and the hash

`collectTokenCosts` is currently in the harness's hash as an accepted tradeoff. In the old
structure a parser fix invalidated one harness version's permutations. In the family
structure it would invalidate every version and model of the family, though nothing that ran
differed.

**Leaning:** move it into its own file and exclude it by location, like `models.ts`. Token
costs stay re-derivable from the result file preserved in the postrun image, so the hash
would then cover only what affects execution. The alternative is to keep it in the hash and
accept the larger blast radius. **Undecided.**

Imports from outside the family folder are still not hashed. That is the existing
non-reproducibility question in
[060-experiment-parameters.md](060-experiment-parameters.md#open-questions), unchanged here.

## What has to change when this is applied

Concepts, not a file list:

- Every statement that there are six experiment parameters, and the six-array cross
  product, becomes five, with the pair as one axis.
- Harness and model stop being separate parameter kinds. Both pages are rewritten around
  the family, version and model values.
- Typed names: replace the `HarnessModels` compatibility section with the generated
  pair-string union.
- The hashing and permutation-hash descriptions drop the "resolved model ID" special case.
  It is now just part of the pair hash.
- The folder-structure and terminology pages state that a harness/model folder is a family,
  and that the parameter is the pair.
- Anywhere the path notation reads `<harnesses>/<models>`, it becomes the pair.
- The `scratchpad/harness-model-types` demo still shows the superseded cross-product
  option as chosen.
