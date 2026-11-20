# Experiment Results

What gets recorded once a container run's postrun image is committed — picks up from
[080-docker-execution.md](080-docker-execution.md#process). The token-cost half of the
same recording step is [087-collecting-token-costs.md](087-collecting-token-costs.md).

## Storage

Two stores, described in [070-data-architecture.md](070-data-architecture.md):

1. **Run data store** — date, the permutation's experiment parameters and parameter
   hash, measurements, cost, tokens, duration. Small and queryable — this is what "did
   this get worse since last week" queries run against. Covered below.
2. **Image store** — the prerun/postrun images themselves. See
   [081-docker-tagging.md](081-docker-tagging.md).

## Applying measurements

Measurements run **after** the postrun image is committed and pushed, in a short-lived
[measurement container](030-terminology.md#measurement-container) started from that
image, which is then discarded. The reasoning is in
[080-docker-execution.md](080-docker-execution.md#why-commit-happens-before-measurement).

Each of the task's measurements is an instrument plus a config. The instrument's logic
runs host-side; the work it commands — globbing, reading files, writing a rendered test,
running a test suite — happens inside the measurement container through the
[measurement context](060-experiment-parameters.md#measurement-context).

The single most useful consequence: **this is the same path as backfill.** Applying a
measurement to a run from a year ago is not a different operation from measuring a fresh
one. Both start a measurement container from a postrun image and evaluate an instrument
against it. There is no first-pass-only code path to keep in sync.

## The result record

A container run's **Result** is the set of measures it produced, keyed by measurement
name: the measurement file's name (see
[051-configuration-folder-structure.md](051-configuration-folder-structure.md)). It is a
map rather than an array, because position carries no meaning and adding measurements
later mustn't disturb the ones already there.

```ts
type Result = Record<MeasurementName, RecordedMeasure>;

type RecordedMeasure = {
  instrument: string;
  contentHash: string; // of the measurement that produced this measure
  measuredAt: string; // ISO timestamp — NOT the date the container run happened
  outcome: MeasurementResult<unknown>;
};
```

```ts
{
  isPrimeTsExists: {
    instrument: "fileCreated",
    contentHash: "7b21ac90…",
    measuredAt: "2026-09-29T14:31:02Z",
    outcome: { outcome: "measured", data: true },
  },
  tsIgnoreCount: {
    instrument: "grep",
    contentHash: "0c4fe218…",
    measuredAt: "2026-09-29T14:31:02Z",
    outcome: { outcome: "measured", data: 0 },
  },
  // added three months later against the same postrun image
  isPrimeTests: {
    instrument: "bunTestFile",
    contentHash: "d91f6a07…",
    measuredAt: "2026-12-14T09:02:44Z",
    outcome: { outcome: "measured", data: { passed: 4, total: 5 } },
  },
}
```

### Name is identity, hash is version

- **The name identifies the measurement.** Results are keyed by it, and it's what a
  report shows.
- **The content hash identifies the version.** It covers `instrument`, the version of
  that instrument's value shape, `config`, and any bundled files, such as a `bunTestFile`
  test. It does **not** cover `metrics`: adding, changing or removing a metric only means
  reading the stored measures again, never re-measuring.
- **An instrument's value shape is versioned.** Every instrument has a `version`, in the
  hash. When an instrument's value changes shape, as `shell`'s did from a boolean to
  `{ exitCode, stdout, stdoutTruncated }` (version 2), every measure stored before is
  stale, rather than read by a `score` written for the new shape.
- **A stale measure is a hash mismatch.** A stored measure whose `contentHash` differs
  from the measurement's current hash is stale. Backfilling re-measures it and replaces
  the old value. No history of earlier versions is kept.
- **Re-running an unchanged measurement overwrites it**, with a new `measuredAt`.
- **The measurement set hash is derived, not stored.** It is a hash over a task's sorted
  `name:contentHash` pairs. Two aggregation results with equal set hashes were judged by
  exactly the same measurements. Where the set hashes differ, the results are still
  comparable measurement by measurement, wherever name and hash both match.

```
measurement set hash = hash(
  "isPrimeTests:d91f6a07…\n" +
  "isPrimeTsExists:7b21ac90…\n" +
  "tsIgnoreCount:0c4fe218…"
)
```

### Deleted and renamed measurements

- **Deleted: kept but excluded.** A deleted measurement's measures stay in past
  iteration Results but are dropped from aggregation results. If the file is restored
  with the same content, its hash matches and nothing is re-measured.
- **Renamed: a delete followed by an add.** The old name is excluded as above. The new
  name has no stored measures, so it gets backfilled. Renames are rare enough that
  matching old and new names by hash isn't worth the logic.

`measuredAt` is deliberately distinct from the date of the container run. A backfilled
measure is dated when it was taken, not when the agent ran — otherwise the record claims
a measurement existed before it was written.

## What gets written to the run data store

After a postrun image is committed, tagged, and pushed, and its measurement container has
run:

```ts
type ContainerRunRecord = {
  executionId: string; // the ULID from the postrun tag
  permutationHash: string; // full, untruncated — the 8-char tag copy isn't authoritative
  iteration: number;
  postrunImage: string; // the tag, so the artifact is reachable from the record
  ranAt: string;

  task: string; // the experiment's task, by name

  // each parameter, by name and parameter hash, and what its `resolve` returned, if it has one
  parameters: Record<ParameterKind, { name: string; parameterHash: string; resolved?: Resolved }>;

  result: Result;
  tokenCosts: TokenCosts; // see 087
  execution: Execution; // see below
};
```

```ts
{
  executionId: "01k4x9j2e8mqz3",
  task: "add-prime",
  permutationHash: "4f9a21c8e0b7…",
  iteration: 0,
  postrunImage: "postrun-e01k4x9j2e8mqz3-h4f9a21c8-i00",
  ranAt: "2026-09-29T14:30:55Z",
  parameters: {
    baseImage:       { name: "node20",      parameterHash: "a01f…" },
    codeState:       { name: "follow-main", parameterHash: "b92c…", resolved: "24dc11c2…" },
    promptSet:       { name: "snerk",       parameterHash: "c7d4…" },
    harnessModel:    { name: "claude-code-2.1.311/claude-haiku-5-5", parameterHash: "d5e1…" },
    initialPrompt:   { name: "plain",       parameterHash: "f20b…" },
  },
  result: { /* as above */ },
  tokenCosts: { /* as above */ },
  execution: { startedAt: 1790692255104, finishedAt: 1790692297416, exitCode: 0 },
}
```

Parameters are stored **by name and by parameter hash**, not just by hash. The hash is what
proves comparability; the name is what makes a report readable. Keeping both means a
report can say "prompt set `snerk`" while still detecting that `snerk` means something
different than it did last month. A floating parameter also records what it resolved to,
e.g. the commit `main` was at, so a report can say which, not only that the hash changed.

## Execution

How long the agent ran, and how its process exited — read from `/thunderjar/run.json`,
which Thunderjar's [run script](080-docker-execution.md#the-run-script)
writes inside the container before commit.

```ts
type Execution = {
  startedAt: number; // epoch ms, harness start
  finishedAt: number; // epoch ms, harness exit
  exitCode: number; // the harness process's exit code
};
```

Duration is `finishedAt - startedAt`: the agent's execution only, not image pulls,
container setup, or measurement. Because the file is in the postrun image, this is
re-derivable from the image like everything else about the run.

How much of that time went to waiting on the model is separate, and comes from the
harness — see `apiDurationMs` in
[087-collecting-token-costs.md](087-collecting-token-costs.md#api-duration).

## Aggregation results

Container runs aren't what gets compared. The unit of comparison is the **aggregation
result**: the Results of every iteration of one permutation in one experiment execution,
combined. That holds even when there's only one iteration.

```
aggregation result = (execution ID, permutation hash) → the combined Results of its iterations
```

```
(01k4x9j2e8mqz3, 4f9a21c8e0b7…) → 5 iterations, i00–i04, combined
```

Wherever the things being compared come from — permutations in the same execution,
repeated executions of one experiment, or executions whose parameters [follow a moving target](060-experiment-parameters.md#parameters-that-follow-a-moving-target) —
comparing means comparing aggregation results. The only requirement is that they have
the same shape, and backfilling measurements is what makes that achievable. Which ones
to fetch and set side by side is the presentation layer's problem, not the store's.

**Computed when read.** Per-iteration Results are the source of truth. Aggregation results
are computed from them, by the task's measurements as declared today, whenever results
are read, so they're never stale relative to the measures they're built from, and a
changed metric shows at once.

Token costs and execution duration are aggregated alongside the measures, since they are
per-iteration values too.

### Measures and metrics

Decided: **an instrument returns data of any shape, and a measurement reads metrics from
it**.

- **The measure is what the instrument returned**, stored as it is: a boolean, a number,
  or a record such as `bunTestFile`'s `{ passed, total }` or `shell`'s
  `{ exitCode, stdout, stdoutTruncated }`. Measuring happens once per run.
- **A metric reads a score from the measure.** Its score for one run is a number or a
  boolean, or `undefined` when the metric doesn't apply to that run. Metrics are
  computed from the stored measures whenever results are read. They aren't stored or
  hashed.
- **A metric has one statistic**, its headline across a permutation's iterations, which
  is always a number, and optionally which way is better.

| Term | What it is | Identity |
| --- | --- | --- |
| Measure | one run's stored instrument value | measurement name + content hash |
| Metric | a score read from a measure, plus its statistic and direction | `<measurement>.<metric>` |

```ts
// tasks/is-prime/measurements/isPrimeTests.ts
export default declareMeasurement({
  instrument: "bunTestFile",
  config: { subject: "**/isPrime.ts", test: "./isPrime.test.ts" },
  metrics: {
    // bunTestFile's default score is the pass rate: passed / total, or undefined when total is 0.
    passRate: { stat: "mean", better: "higher" },
    // Anything else reads the stored { passed, total } with a score.
    passed: { score: (v) => v.passed, stat: "mean", better: "higher" },
  },
});
```

One run, several metrics: a `shell` command prints JSON once, and each metric reads the
same stored stdout.

```ts
const shape = (v: { exitCode: number; stdout: string }) =>
  v.exitCode === 0 ? (JSON.parse(v.stdout) as { lines: number; comments: number; exports: number }) : undefined;

export default declareMeasurement({
  instrument: "shell",
  config: { command: "node ./shape.js isPrime.ts" },
  metrics: {
    lines: { score: (v) => shape(v)?.lines, stat: "median", better: "lower" },
    comments: { score: (v) => shape(v)?.comments, stat: "mean" },
    singleExport: { score: (v) => (shape(v) ? shape(v)!.exports === 1 : undefined), stat: "rate", better: "higher" },
  },
});
```

#### Scores

- **`score?: (value) => number | boolean | undefined`** reads one run's value.
- **It's optional where the instrument has a default score.** An instrument whose value
  is a number or a boolean has the value as its score. `shell`'s default is whether it
  exited 0, and `bunTestFile`'s is the pass rate. An instrument with neither needs a
  `score` on every metric.
- **`undefined` means not applicable.** Never 0 or `false`: a run with no tests has no
  pass rate, rather than a pass rate of 0.

#### Statistics

A metric's `stat` is typed by its score: a stat that doesn't fit is a type error in the
measurement file, and an error at `plan` and `run` where the score type is known without
running anything.

| Score | Stats that fit |
| --- | --- |
| `boolean` | `rate`, `count` |
| `number` | `mean`, `median`, `min`, `max`, `sum` |

Booleans count as 1 and 0, so `rate` is a mean and `count` a sum.

`better?: "higher" | "lower"` is left out where neither is better. `show` displays it, and
`compare` will rank on it.

### What's left out, and why

Nothing is zero-filled, at any level. For each measurement in a permutation:

- **`measured`** counts the iterations with a `measured` outcome, by the measurement as it
  is today. Skipped, errored, never-measured and stale iterations are left out.
- For each metric:
  - **`applicable`**: measured iterations whose score is a number or a boolean.
  - **`notApplicable`**: measured iterations whose score is `undefined`.
  - **`failed`**: measured iterations whose score threw, or returned something other than
    a score of the kind its statistic combines, each with the iteration and why.
  - **`value`**: the statistic over the applicable scores, or `undefined` if there are
    none.

```ts
type AggregatedMetric = {
  kind: "boolean" | "number";
  stat: Stat;
  better?: "higher" | "lower";
  value: number | undefined;
  applicable: number;
  notApplicable: number;
  failed: { iteration: number; reason: string }[];
};
type AggregatedMeasurement = { measured: number; metrics: Record<string, AggregatedMetric> };
```

Every iteration left out is listed with why, so a statistic over fewer iterations than
ran is never mistaken for one over all of them.

#### Ruled out

- **Measurement-chosen combinations of the value itself (`aggregate`).** Each measurement
  picked methods from a menu typed by its instrument's value. Every value shape needed a
  menu, a record of numbers was combined key by key, and getting anything else out of a
  value meant a new instrument. Released in 0.2.0, and replaced by metrics.
- **Type-inferred: inferring it from the value type.** For example, booleans become a rate
  and numbers a standard summary.

## Backfilling measurements

New measurements can be applied to runs that have already happened, without re-running
the agent. This is the payoff for preserving the postrun image.

A backfill measures only what is **missing or stale**: a measurement with no stored
measure for a run, or one whose stored `contentHash` doesn't match its current hash (see
[Name is identity, hash is version](#name-is-identity-hash-is-version)). Everything else
is untouched. Adding D, E and F leaves A, B and C alone. Editing B re-measures only B,
and its new value replaces the old one.

This also underwrites the authoring loop: writing an instrument is writing a test against
a known filesystem state. Restore the image once, then iterate on the instrument against
that fixed snapshot as often as needed — no tokens spent, no agent variance, just the
instrument's own logic under test.

A backfilled measure also triggers recomputing its permutation's
[aggregation result](#aggregation-results).

Token costs are backfillable on the same terms, since the harness's result file is
preserved in the image too — see
[087-collecting-token-costs.md](087-collecting-token-costs.md#backfilling-token-costs).

## Traces and transcripts

A run's OTel trace and session transcript stay in its postrun image. To read them, pull
the image and read them from its filesystem, same as everything else the run left behind.

**Future:** a separate trace store, so viewing a trace doesn't need a full image pull —
expected to be the first fast-follow after v1. See
[020-goals-non-goals.md](020-goals-non-goals.md#non-goals-v1).

## Open questions

- **Comparing across a hash change.** The record stores full permutation hashes so a report
  can decide what's comparable, but the policy is a reporting concern and belongs in
  [110-cli-report-visualization.md](110-cli-report-visualization.md): when is it
  legitimate to plot runs whose parameters differ, and how is that shown?
- Whether the measurement context's shape is right — flagged in
  [021-human-zone-out.md](021-human-zone-out.md) as not yet properly reviewed.
