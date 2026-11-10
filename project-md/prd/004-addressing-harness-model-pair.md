# Addressing the Harness/Model Pair

**Status: applied.** The pair is one parameter, `<harness>/<model ID>`, and a harness folder
pins one version (task 3500). Its hashing is in [060](060-experiment-parameters.md#hashing).

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
**harness/model pair**, initial prompt. The matrix is still a cross product, but the pair is one
axis of it.

```ts
export default declareExperiment({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk", "glurk"],
  harnessModel: [
    "claude-code-2.1.311/claude-haiku-4-5-20251001",
    "claude-code-2.2.0/claude-haiku-4-5-20251001",
    "codex-0.166.0/gpt-luna",
  ],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 5,
});
```

## Why the pair is a parameter, not two parameters listed together

Keeping `harnesses/` and `models/` as folders while the declaration names a pair would
mean the declaration and the file system describe different parameters. The pair is what
an experiment varies, so it is the parameter.

## Structure: a harness folder pins one version

A harness is one folder with one `index.ts`, and the folder pins one version of the agent. A
pair is that folder, then the model ID the agent is given: `<harness>/<model ID>`.

```
parameters/harnessModels/
  claude-code-2.1.311/
    index.ts      # export default claudeCode({ version: "2.1.311" })
  opencode-1.19.5/
    index.ts      # declareHarness({ version: "1.19.5", applyParameter, cli, collectReply, … })
    files/        # optional: what its fragment copies in, at ctx.dir
```

- **To try another version, copy the folder.** The copy is a few lines, or one, with a
  helper like `claudeCode({ version })`. Name the folder after its version, so a pair reads as
  what it runs.
- **Any model ID.** A pair splits at its first `/`, and the rest is the model ID, as the
  agent takes it, `/`s and all: `opencode-1.19.5/opencode/claude-haiku-5-5`. There is no map
  from a model's name to its ID, so nothing to keep in step with the agent's own list.
- **No compatibility machinery.** `thunderjar generate` lists the harness folders, and the
  pair type is `` `${HarnessName}/${string}` ``: a harness that isn't declared is a type
  error. Whether the agent knows the model is the agent's to say.
- **`collectTokenCosts` sits beside `collectReply`** in the declaration. Both read the result
  file after the run, so neither is in the hash.

This replaces the earlier "harness family" design, with its `versions.ts` and `models.ts`,
and pairs written `family@version/model`. It took a hash rule per file to keep adding a
model or a version from changing any hash. Hashing what a parameter outputs (below) needs no
such rule, so the maps went.

## Hashing

A harness's parameter hash is of what it outputs, as every parameter's is (see
[060-experiment-parameters.md](060-experiment-parameters.md#hashing)):

1. Its rendered fragment, with its version in it.
2. Its `cli`, rendered with fixed sample values, for the first turn and a later one.
3. Its `requiredEnv`.
4. Its `files/` folder.

The model ID isn't in the harness's hash. It joins the permutation hash, beside the five
parameter hashes, so two models of one harness share a prerun image, and their runs are
told apart.

| Change | Effect on existing hashes |
|---|---|
| Add a harness folder, or use a new model ID | None. |
| Change a pair's model ID | Only the permutation hash of that pair's permutations. No image. |
| Change the version, or the install fragment | The harness's hash, and its images. |
| Change its `cli` or `requiredEnv` | The harness's hash. No image. |
| Change `collectReply` or `collectTokenCosts`, or a comment | None. |
| Rename a folder or a pair string | None. Hashes come from content, not names. |

A floating version, such as "Claude Code's latest", resolves with `resolve`, and the
version it resolved to is hashed through the fragment it ends up in. See
[060-experiment-parameters.md](060-experiment-parameters.md#floating-parameters-resolve).

Imports from outside the harness folder are no longer a reproducibility hole: what they
contribute is hashed through the text they help render.
