# Task

The goal an experiment is about: its initial prompts, and the measurements that judge them.

An experiment names one task. The experiment parameter is the **initial prompt** — the
first prompt given to the harness, what the agent is asked to do. A task can have several
wordings, so an experiment can compare them against the same measurements. Hashing and
`applyParameter` are common to all parameters — see
[060-experiment-parameters.md](060-experiment-parameters.md).

```
experiment-parameters/tasks/is-prime/
├── initial-prompts/
│   ├── plain.ts                   # one initial prompt. Hashed.
│   └── terse.ts
└── measurements/                  # NOT hashed
    ├── isPrimeTsExists.ts
    ├── isPrimeTestExists.ts
    ├── isPrimeTemplateTest.ts
    └── isPrime.test.template.ts
```

The folder name is the task. There is no `index.ts`.

## Initial prompts

Each file in `initial-prompts/` is one initial prompt, named by its file: `plain.ts` is
the initial prompt `plain`.

```ts
// experiment-parameters/tasks/is-prime/initial-prompts/plain.ts
export default declareInitialPrompt({
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  applyParameter: () => ``,
});
```

| Field | What it is |
|---|---|
| `prompt` | The initial prompt. Reaches the harness's `cli` as `ctx.initialPrompt`. |
| `applyParameter` | Returns an empty string. An initial prompt adds nothing to the image. |

An initial prompt is distinct from a [prompt set](063-prompt-set.md), which shapes the
environment the agent runs in. An initial prompt is what the agent is asked to do.

An experiment lists initial prompts of its one task:

```ts
task: "is-prime",
initialPrompt: ["plain", "terse"],
```

See [055-declaring-experiments.md](055-declaring-experiments.md#declaration).
_(Referenced by: [055-declaring-experiments.md](055-declaring-experiments.md), [064-harness.md](064-harness.md).)_

## When it applies

Run time only.

## Task measurements

Associated with each task are its **task measurements**, in a `measurements/` folder
beside `initial-prompts/`. They live with the task because they're only meaningful for it.
Every initial prompt of the task is judged by the same ones, so two wordings compare
measurement by measurement.

One file per measurement, named by its file: `isPrimeTsExists.ts` is the measurement
`isPrimeTsExists`. Supporting files, like a `templateTest` template, sit alongside.

```ts
// experiment-parameters/tasks/is-prime/measurements/isPrimeTemplateTest.ts
export default declareMeasurement({
  instrument: "templateTest",
  config: {
    subject: "**/isPrime.ts",
    template: "./isPrime.test.template.ts",
  },
});
```

Instruments and what a measurement produces are in
[060-experiment-parameters.md](060-experiment-parameters.md#measuring-instruments--measurements).

### Excluded from every parameter hash

`measurements/` is excluded from the hash of every initial prompt. Measurements judge the
outcome; they don't determine what runs, and they don't affect the prerun or postrun
image. Changing them must not change the permutation hash.

### Experiments name a task, not measurements

An experiment names one task. Measurements come with the task, so a second experiment
using `is-prime` gets the same measurements without copying them. Naming one task also
means every result in an experiment shares one measurement set, so they are all comparable.
