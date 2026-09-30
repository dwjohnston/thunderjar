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

A container run's **Result** is the set of measures it produced. It is a keyed map, not
an array, because it is append-only: adding measurements later must not disturb the
measures already recorded, and position carries no meaning.

```ts
type Result = Record<MeasurementKey, RecordedMeasure>;

// instrument name + the content hash of the measurement (instrument + its config)
type MeasurementKey = `${string}-h${string}`;

type RecordedMeasure = {
  instrument: string;
  contentHash: string;
  measuredAt: string; // ISO timestamp — NOT the date the container run happened
  outcome: MeasurementResult<unknown>;
};
```

```ts
{
  "fileCreated-h7b21ac90": {
    instrument: "fileCreated",
    contentHash: "7b21ac90…",
    measuredAt: "2026-09-29T14:31:02Z",
    outcome: { outcome: "measured", data: true },
  },
  "grep-h0c4fe218": {
    instrument: "grep",
    contentHash: "0c4fe218…",
    measuredAt: "2026-09-29T14:31:02Z",
    outcome: { outcome: "measured", data: 0 },
  },
  // added three months later against the same postrun image
  "templateTest-hd91f6a07": {
    instrument: "templateTest",
    contentHash: "d91f6a07…",
    measuredAt: "2026-12-14T09:02:44Z",
    outcome: { outcome: "measured", data: { passed: 4, failed: 1 } },
  },
}
```

Two things the key has to carry. The **instrument name** alone isn't enough — a task can
declare two `grep` measurements with different configs, and they are different
measurements. The **content hash** is what separates them, and it is also what catches
someone editing a measurement's config in place: that isn't "adding a measurement", it's
silently redefining an existing one, and a changed hash makes it a new key rather than a
corrupted old one.

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

## Backfilling measurements

New measurements can be applied to runs that have already happened, without re-running
the agent. This is the payoff for preserving the postrun image.

Two rules make it safe:

- **Existing measurements never change.** Adding D, E and F leaves A, B and C untouched —
  their content hashes haven't changed, so their keys haven't either.
- **A changed hash is a new measurement, not an updated one.** Editing a measurement's
  config produces a new key alongside the old, so the history stays legible rather than
  being silently rewritten. A hash that no longer matches what was seen before is a
  warning, and the run is still recorded.

This also underwrites the authoring loop: writing an instrument is writing a test against
a known filesystem state. Restore the image once, then iterate on the instrument against
that fixed snapshot as often as needed — no tokens spent, no agent variance, just the
instrument's own logic under test.

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

- **Re-running an unchanged measurement.** If a measurement is applied again with the
  same content hash — a flaky instrument, a corrected environment — it lands on the same
  key. Overwrite, or keep both with their differing `measuredAt`? Overwriting loses
  evidence; keeping both means the key is no longer unique.
- **Comparing across a hash change.** The record stores full parameter hashes so a report
  can decide what's comparable, but the policy is a reporting concern and belongs in
  [110-cli-report-visualization.md](110-cli-report-visualization.md): when is it
  legitimate to plot runs whose parameters differ, and how is that shown?
- Whether the measurement context's shape is right — flagged in
  [021-human-zone-out.md](021-human-zone-out.md) as not yet properly reviewed.
