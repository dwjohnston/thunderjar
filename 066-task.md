# Task

The initial prompt given to the harness — what the agent is asked to do.

One of the six experiment parameters. Hashing and `applyParameter` are common to all of
them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `experiment-parameters/tasks/<name>/index.ts`.

```ts
// experiment-parameters/tasks/is-prime/index.ts
export default declareTask({
  prompt: "Create a file isPrime.ts exporting a function that tests for primality.",
  applyParameter: () => ``,
});
```

| Field | What it is |
|---|---|
| `prompt` | The initial prompt. Reaches the harness's `cli` as `ctx.taskPrompt`. |
| `applyParameter` | Returns an empty string. A task adds nothing to the image. |

## When it applies

Run time only.

## Task measurements

Associated with each task are its **task measurements**, in a `measurements/` folder
beside `index.ts`. They live with the task because they're only meaningful for it.

```
experiment-parameters/tasks/is-prime/
├── index.ts                       # the task. Hashed.
└── measurements/                  # NOT hashed
    ├── isPrimeTsExists.ts
    ├── isPrimeTestExists.ts
    ├── isPrimeTemplateTest.ts
    └── isPrime.test.template.ts
```

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

### Excluded from the task's content hash

`measurements/` is excluded from the task's content hash. Measurements judge the
outcome; they don't determine what runs, and they don't affect the prerun or postrun
image. Changing them must not change the parameter hash.

### Experiments list tasks, not measurements

An experiment declares tasks. Measurements come with the task, so a second experiment
using `is-prime` gets the same measurements without copying them.
