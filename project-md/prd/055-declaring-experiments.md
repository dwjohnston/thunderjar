# Declaring Experiments

How an experiment is declared: which parameters it runs, and how its names are
type-checked. Where the file lives is in
[051-configuration-folder-structure.md](051-configuration-folder-structure.md); what each
parameter is, in [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `thunderjar/experiments/<name>.ts`.

```ts
// thunderjar/experiments/is-prime-baseline.ts
export default declareExperiment({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk", "glurk"],
  harness: ["claude-code-2-1-283"],
  model: ["haiku-4-5"],
  task: "is-prime",
  initialPrompt: ["plain", "terse"],
  iterations: 5,
});
```

| Field | What it is |
|---|---|
| `baseImage` | [Base images](061-base-image.md) to run. |
| `codeState` | [Code states](062-code-state.md) to run. |
| `promptSet` | [Prompt sets](063-prompt-set.md) to run. |
| `harness` | [Harnesses](064-harness.md) to run. |
| `model` | [Models](065-model.md) to run. |
| `task` | The [task](066-task.md) the experiment is about. One name, not an array. |
| `initialPrompt` | The task's [initial prompts](066-task.md#initial-prompts) to run. |
| `iterations` | How many times each permutation runs. |

Each parameter field is an array of names. Each name is a folder under
`experiment-parameters/<kind>/`, except `initialPrompt`, whose names are files under the
chosen task's `initial-prompts/` folder.

## An experiment is a matrix

The six arrays form a cross product, and each combination is one permutation. The
example above has four: `snerk` and `glurk`, each with `plain` and `terse`, with everything
else held fixed.

## One task, not measurements

The experiment names one task, not measurements. Measurements come with the task (see
[066-task.md](066-task.md#task-measurements)), so a second experiment using `is-prime`
gets the same measurements without copying them.

Naming one task means every permutation is judged by the same measurements, so every
result in the experiment can be compared with every other. Results for different tasks
can't be, so running a harness across several tasks is several experiments.

## Typed names

The strings in `declareExperiment` are not free text. A generation step reads the
folder names under `experiment-parameters/` and emits their union types into
`_generated/parameter-names.d.ts`, so a misspelled or deleted parameter is a type error
in the experiment file. The folder is git-ignored — see
[022-coding-conventions.md](022-coding-conventions.md#generated-files-go-in-_generated-and-are-git-ignored).

```ts
// _generated/parameter-names.d.ts — generated, not edited
type PromptSetName = "snerk" | "glurk";
type TaskName = "is-prime";
type InitialPromptNames = { "is-prime": "plain" | "terse" };
// …one union per parameter kind
```

`declareExperiment` is generic over the task name, and `initialPrompt` is restricted to
the prompts of the task named in `task`. A prompt that belongs to another task is a type
error.

## Harness and model must be compatible

The generation step also reads each harness's
[`models` map](064-harness.md#models-which-models-it-runs) and emits which models each
harness can run:

```ts
// _generated/parameter-names.d.ts
type HarnessModels = {
  "claude-code-2-1-283": "sonnet-5-5" | "haiku-4-5";
  "opencode-1-4-0": "sonnet-5-5" | "gpt-5";
};
```

`harness` and `model` form a cross product, so every listed model must be runnable by
every listed harness. Anything else is a type error on the `model` array:

```ts
export default declareExperiment({
  harness: ["claude-code-2-1-283", "opencode-1-4-0"],
  model: ["sonnet-5-5", "gpt-5"],
  //                    ~~~~~~~ Type '"gpt-5"' is not assignable to type '"sonnet-5-5"'.
  // …
});
```

An experiment that needs different models on different harnesses is declared as two
experiments.

## Open questions

- When the generation step runs — on demand, in a watch mode, or as part of every
  Thunderjar command.
