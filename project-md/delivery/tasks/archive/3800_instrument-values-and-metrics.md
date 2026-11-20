<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLjKsUA7GTkPhCpjAdE
Supervising engineer: Claude

Humans: add your notes here

-->

# 3800: Instrument values of any shape, read through metrics

An instrument returns data of any shape, stored as it is: the measure. A measurement reads one or more metrics from it, each a score per run, a number or a boolean, or `undefined` where it doesn't apply, with one statistic across a permutation's iterations. Metrics are computed when results are read, so adding or changing one needs no remeasuring. `aggregate` is removed.

## Version bump type

minor (breaking, while in 0.x)

## Artifacts

- `declareMeasurement`'s required `metrics`, each `{ score?, stat, better? }`. A `stat` that doesn't fit its score is a type error, and an error at `plan` and `run` where the score type is known.

```ts
export default declareMeasurement({
  instrument: "bunTestFile",
  config: { subject: "**/isPrime.ts", test: "./isPrime.test.ts" },
  metrics: {
    passRate: { stat: "mean", better: "higher" }, // the default score: passed / total
    passed: { score: (v) => v.passed, stat: "mean", better: "higher" },
  },
});
```

- Instrument values:
  - `shell`: `{ exitCode, stdout, stdoutTruncated }`, stdout capped at 64 KiB; default score, exit 0. Version 2.
  - `bunTestFile`: `{ passed, total }`; default score, the pass rate, not applicable to a run of no tests.
  - `fileCreated`, `grep`, `replyMatches`: unchanged; the value is the score.
- A `version` per instrument, in the measurement's content hash. A measure whose hash differs from its measurement's is stale, and left out.
- `src/execution/aggregate.ts` rewritten: per metric, `applicable`, `notApplicable`, `failed` with why, and `value`. Nothing zero-filled.
- `show`: a column per metric, `<measurement>.<metric>`, with `↑` or `↓`; why each iteration was left out; each metric's score in the single-run view. `view` reads the same shape.

## Example CLI Output

```
$ thunderjar show <ULID>
     harnessModel                                runs   isPrimeShape.lines ↓   isPrimeTests.passRate ↑   isPrimeTsExists.exists
 1   fake-harness-alpha@1.0.0/fake-model-small   1/1    3.0                    0.6                       1/1
 2   fake-harness-beta@1.0.0/fake-model-large    1/1    –*                     –*                        0/1

* Left out:
  2-1  isPrimeShape.lines  not applicable
  2-1  isPrimeTests        skipped  (no file matches **/isPrime.ts)
```

## Tests

- Type tests of `declareMeasurement`'s metrics, in `src/api/declarations.typecheck.test.ts`
- Unit tests of the instruments' values and default scores, the loader's checks, and `aggregate.ts`
- `show` against 0203's store: a starred cell, a not-applicable score, a failed score, a stale measure, and a metric added since the runs were measured
- `run` against 0202: `isPrimeShape`'s metrics tell the two fake agents apart

## Human interventions

None.
