# Configuration Folder Structure

Where Thunderjar configuration lives inside a user's project. What goes in each file is
elsewhere: experiments in [055-declaring-experiments.md](055-declaring-experiments.md),
parameters in [060-experiment-parameters.md](060-experiment-parameters.md).

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
    │   │       └── seed-fixture-data.sh   # bundled — part of the parameter hash
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
  parameter hash.
- **A task folder holds the task and its measurements.** `index.ts` is the task — the
  initial prompt, and the experiment parameter. `measurements/` holds the task
  measurements associated with it. They live together because measurements are
  meaningless apart from their task, but `measurements/` is **excluded from the task's
  parameter hash**: measurements don't affect
  the prerun or postrun image, so changing them must not change the permutation hash.
- **One file per measurement, named by its file.** `isPrimeTsExists.ts` is the
  measurement `isPrimeTsExists`. Supporting files, like a `templateTest` template, sit
  alongside.
- **Experiments live outside `experiment-parameters/`.** An experiment isn't a parameter;
  it's a matrix over them.
- **Generated types live in `_generated/`.** They are built from the folder names above
  and git-ignored — see
  [055-declaring-experiments.md](055-declaring-experiments.md#typed-names).

## Open questions

- Whether `thunderjar/` is a fixed location or configurable.
- What else `thunderjar.config.ts` holds beyond stores, registry and test runner.
