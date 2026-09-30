# Configuration Folder Structure

What Thunderjar configuration looks like inside a user's project. The shape of each
declaration is in [060-experiment-parameters.md](060-experiment-parameters.md); this page
is about where things live.

## Example project

```
my-app/
├── src/                                   # the user's codebase — what code states check out
├── prompts/
│   ├── snerk.md                           # prompt files — what prompt sets check out
│   └── glurk.md
└── thunderjar/
    ├── thunderjar.config.ts               # global config: stores, registry, test runner
    ├── experiments/
    │   └── is-prime-baseline.ts           # declareExperiment(...)
    ├── experiment-parameters/
    │   ├── baseImages/
    │   │   └── node20/
    │   │       └── index.ts               # declareBaseImage(...)
    │   ├── codeStates/
    │   │   ├── baseline/
    │   │   │   └── index.ts               # declareCodeState(...)
    │   │   └── with-fixture/
    │   │       ├── index.ts
    │   │       └── seed-fixture-data.sh   # bundled — part of the content hash
    │   ├── promptSets/
    │   │   ├── snerk/
    │   │   │   └── index.ts               # declarePromptSet(...)
    │   │   └── glurk/
    │   │       └── index.ts
    │   ├── harnesses/
    │   │   └── claude-code-2-1-283/
    │   │       └── index.ts               # declareHarness(...)
    │   ├── models/
    │   │   └── haiku-4-5/
    │   │       └── index.ts               # declareModel(...)
    │   └── tasks/
    │       └── is-prime/
    │           ├── index.ts               # declareTask(...) — the task: the initial prompt. Hashed.
    │           └── measurements/          # NOT hashed
    │               ├── isPrimeTsExists.ts
    │               ├── isPrimeTestExists.ts
    │               ├── isPrimeTemplateTest.ts
    │               └── isPrime.test.template.ts
    └── _generated/
        └── parameter-names.d.ts           # generated from the folders above; git-ignored
```

## What lives where

- **The user's own files stay where they are.** Code and prompt files live in the normal
  project tree. Code state and prompt set declarations point at them by pinned commit
  rather than copying them into `thunderjar/`.
- **One folder per parameter**, under `experiment-parameters/<kind>/<name>/`. The folder
  name is the parameter's name; its content — `index.ts` plus anything bundled — is its
  content hash.
- **A task folder holds the task and its measurements.** `index.ts` is the task — the
  initial prompt, and the experiment parameter. `measurements/` holds the task
  measurements associated with it. They live together because measurements are
  meaningless apart from their task, but `measurements/` is **excluded from the task's
  content hash**: measurements don't affect
  the prerun or postrun image, so changing them must not change the parameter hash.
- **One file per measurement, named by its file.** `isPrimeTsExists.ts` is the
  measurement `isPrimeTsExists`. Supporting files, like a `templateTest` template, sit
  alongside.
- **Experiments live outside `experiment-parameters/`.** An experiment isn't a parameter;
  it's a matrix over them.

## Declaring

Every configuration file default-exports the result of a `declareX()` call rather than a
bare object. The function carries the type, so the file is checked without `satisfies`,
`as`, or a type annotation.

```ts
// thunderjar/experiments/is-prime-baseline.ts
export default declareExperiment({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk", "glurk"],
  harness: ["claude-code-2-1-283"],
  model: ["haiku-4-5"],
  task: ["is-prime"],
  iterations: 5,
});
```

```ts
// thunderjar/experiment-parameters/tasks/is-prime/index.ts
export default declareTask({
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  applyParameter: () => ``,
});
```

```ts
// thunderjar/experiment-parameters/tasks/is-prime/measurements/isPrimeTemplateTest.ts
export default declareMeasurement({
  instrument: "templateTest",
  config: {
    subject: "**/isPrime.ts",
    template: "./isPrime.test.template.ts",
  },
});
```

The experiment declares tasks, not measurements. Measurements come with the task, so a
second experiment using `is-prime` gets the same measurements without copying them.

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
// …one union per parameter kind
```

## Open questions

- When the generation step runs — on demand, in a watch mode, or as part of every
  Thunderjar command.
- Whether `thunderjar/` is a fixed location or configurable.
- What else `thunderjar.config.ts` holds beyond stores, registry and test runner.
