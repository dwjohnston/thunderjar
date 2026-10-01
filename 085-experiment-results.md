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
  isPrimeTemplateTest: {
    instrument: "templateTest",
    contentHash: "d91f6a07…",
    measuredAt: "2026-12-14T09:02:44Z",
    outcome: { outcome: "measured", data: { passed: 4, failed: 1 } },
  },
}
```

### Name is identity, hash is version

- **The name identifies the measurement.** Results are keyed by it, and it's what a
  report shows.
- **The content hash identifies the version.** It covers `instrument`, `config`, and any
  bundled files, such as a `templateTest` template. It does **not** cover `aggregate`:
  changing how values combine only means recomputing aggregation results, never
  re-measuring.
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
  "isPrimeTemplateTest:d91f6a07…\n" +
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
  parameterHash: string; // full, untruncated — the 8-char tag copy isn't authoritative
  iteration: number;
  postrunImage: string; // the tag, so the artifact is reachable from the record
  ranAt: string;

  // each resolved parameter, by name and content hash
  parameters: Record<ParameterKind, { name: string; contentHash: string }>;

  result: Result;
  tokenCosts: TokenCosts; // see 087
  execution: Execution; // see below
};
```

```ts
{
  executionId: "01k4x9j2e8mqz3",
  parameterHash: "4f9a21c8e0b7…",
  iteration: 0,
  postrunImage: "postrun-e01k4x9j2e8mqz3-h4f9a21c8-i00",
  ranAt: "2026-09-29T14:30:55Z",
  parameters: {
    baseImage:       { name: "node20",      contentHash: "a01f…" },
    codeState:       { name: "baseline",    contentHash: "b92c…" },
    promptSet:       { name: "snerk",       contentHash: "c7d4…" },
    harness:         { name: "claude-code", contentHash: "d5e1…" },
    model:           { name: "haiku",       contentHash: "e3a8…" },
    task:            { name: "add-prime",   contentHash: "f20b…" },
  },
  result: { /* as above */ },
  tokenCosts: { /* as above */ },
  execution: { startedAt: 1790692255104, finishedAt: 1790692297416, exitCode: 0 },
}
```

Parameters are stored **by name and by content hash**, not just by hash. The hash is what
proves comparability; the name is what makes a report readable. Keeping both means a
report can say "prompt set `snerk`" while still detecting that `snerk` means something
different than it did last month.

## Execution

How long the agent ran, and how its process exited — read from `/thunderjar/run.json`,
which Thunderjar's [execution wrapper](080-docker-execution.md#the-execution-wrapper)
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
aggregation result = (execution ID, parameter hash) → the combined Results of its iterations
```

```
(01k4x9j2e8mqz3, 4f9a21c8e0b7…) → 5 iterations, i00–i04, combined
```

Wherever the things being compared come from — permutations in the same execution,
repeated executions of one experiment, or executions whose parameters [follow a moving target](060-experiment-parameters.md#parameters-that-follow-a-moving-target) —
comparing means comparing aggregation results. The only requirement is that they have
the same shape, and backfilling measurements is what makes that achievable. Which ones
to fetch and set side by side is the presentation layer's problem, not the store's.

**Stored, and recomputed on change.** Per-iteration Results remain the source of truth.
Aggregation results are stored alongside them, so the presentation layer only ever
fetches aggregation results. Whenever a measure is added or backfilled against any
iteration, its permutation's aggregation result is recomputed, so a stored aggregate is
never stale relative to the Results it was built from.

Token costs and execution duration are aggregated alongside the measures, since they are
per-iteration values too.

### How a measure's values combine

Decided: **measurement-chosen**. Each measurement states how its values combine across
iterations. The example below uses task `is-prime` with three measurements, run for five
iterations.

```ts
// per-iteration measures, i00–i04
isPrimeTsExists:     true,  true,  true,  false,   true
tsIgnoreCount:       0,     2,     0,     0,       1
isPrimeTemplateTest: {4,1}, {5,0}, {5,0}, skipped, {3,2}  // i03: no isPrime.ts to test
```

Each measurement picks one or more combinations from a fixed menu, as an array. The
menu is typed by the instrument's value type, so an incompatible choice is a type error
in the measurement file. It is always an array, even for one choice, so there is one way
to write it.

```ts
// the menu, keyed by value type
type AggregateFor<T> =
  T extends boolean ? "rate" | "count"
  : T extends number ? "mean" | "median" | "min" | "max" | "sum"
  : T extends Record<string, number> ? "sum" | "mean"
  : never;
```

```ts
// tasks/is-prime/measurements/isPrimeTsExists.ts
export default declareMeasurement({
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
  aggregate: ["rate"],
});

// tasks/is-prime/measurements/tsIgnoreCount.ts
export default declareMeasurement({
  instrument: "grep",
  config: { glob: "**/*.ts", pattern: "@ts-ignore" },
  aggregate: ["mean", "max"], // typical and worst iteration
});

// tasks/is-prime/measurements/isPrimeTemplateTest.ts
export default declareMeasurement({
  instrument: "templateTest",
  config: { subject: "**/isPrime.ts", template: "./isPrime.test.template.ts" },
  aggregate: ["sum"],
});
```

How it shows up in the aggregation result. Each chosen method becomes a key, so the
record says which methods were used without a separate field. `measured` is the number
of iterations whose value was combined:

```ts
measures: {
  isPrimeTsExists:     { measured: 5, rate: 0.8 },
  tsIgnoreCount:       { measured: 5, mean: 0.6, max: 2 },
  isPrimeTemplateTest: { measured: 4, sum: { passed: 17, failed: 3 } },   // i03 skipped
}
```

The measurement author chooses what matters for this task. For `@ts-ignore`, the worst
iteration matters as much as the average, and the array means neither has to be given
up. The cost: every measurement file has to state it, and the menu has to anticipate
every value shape. A new instrument with an unusual value type gets `never` until the
menu grows.

#### Future: instrument-owned

Each measuring instrument could declare a default `aggregate` next to its value type, so
a measurement file only states one when it wants something different. Not in v1 — see
[020-goals-non-goals.md](020-goals-non-goals.md#non-goals-v1).

#### Ruled out

- **Type-inferred: inferring it from the value type.** For example, booleans become a rate and numbers
  a standard summary.
- **Inferred-with-override: inferred by default, overridable by the instrument.** This depends on the inference
  above for its defaults, so it goes with it.

Changing a measurement's `aggregate` only recomputes its aggregation results. Because
`aggregate` is left out of the measurement's content hash, editing it never triggers a
re-measure.

Still undecided:

- **Iterations that didn't produce a value.** A `skipped` or `erroredWhileMeasuring`
  iteration has no value to combine. Excluding it silently makes the aggregate look
  better than it is, and counting it as a zero is wrong for the same reason as with
  token costs — see
  [087-collecting-token-costs.md](087-collecting-token-costs.md). The likely answer is to
  exclude them and report how many were excluded, but that isn't settled either.

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

- **Comparing across a hash change.** The record stores full parameter hashes so a report
  can decide what's comparable, but the policy is a reporting concern and belongs in
  [110-cli-report-visualization.md](110-cli-report-visualization.md): when is it
  legitimate to plot runs whose parameters differ, and how is that shown?
- Whether the measurement context's shape is right — flagged in
  [021-human-zone-out.md](021-human-zone-out.md) as not yet properly reviewed.
