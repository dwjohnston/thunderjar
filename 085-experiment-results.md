# Experiment Results

What gets recorded once a container run's postrun image is committed — picks up from
[080-docker-execution.md](080-docker-execution.md#process).

## Storage: three tiers, not two

Extends [070-data-architecture.md](070-data-architecture.md)'s design to three tiers:

1. **Run data store** — date, the permutation's experiment parameters and parameter
   hash, measurements, cost, tokens, duration. Small and queryable — this is what "did
   this get worse since last week" queries run against. Covered below.
2. **Trace store** — the OTel trace and session transcript. Not populated in v1 — see
   [Deferred: trace store](#deferred-trace-store) below.
3. **Image store** — the prerun/postrun images themselves. See
   [081-docker-tagging.md](081-docker-tagging.md).

## What gets written to the run data store

After a postrun image is committed, tagged, and pushed (the last steps in
[080-docker-execution.md](080-docker-execution.md#process)):

- Date/timestamp of the container run
- The permutation's experiment parameters and its parameter hash
- Measurements — the `Result` produced by applying the task's measuring instruments
  (see [060-experiment-parameters.md](060-experiment-parameters.md))
- Token costs

## Deferred: trace store

Extracting the OTel trace and session transcript out of the container into a separate
trace store is out of scope for v1 — see
[020-goals-non-goals.md](020-goals-non-goals.md). For now, if you want the trace or
transcript for a run, pull its postrun image and read them from its filesystem, same as
everything else preserved in the image.

This is expected to be the first fast-follow after v1, not a long-term non-goal: the
original intent is for the trace store to make "just show me the trace" cheap, without
needing a full image pull for the common case.

## Open questions

_TBD_
