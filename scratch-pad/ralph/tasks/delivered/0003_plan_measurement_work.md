# 0003: Plan which measurements each run needs

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), the per-container-run portion of `planRemeasure`.

Depends on task 0002's `measureStatus` in `src/measuring/remeasure.ts`. Read the root and `src/AGENTS.md` conventions. Relevant spec:

- [Backfilling measurements](/workspace/thunderjar2/spec/085-test-case-results.md#backfilling-measurements)
- [Deleted and renamed measurements](/workspace/thunderjar2/spec/085-test-case-results.md#deleted-and-renamed-measurements)
- [Pure units](/workspace/thunderjar2/spec/120-test-boundaries.md#1-pure-units)

✅ Add the pure function `planRemeasure(records, measurements): RemeasurePlan` to the same module, accepting stored container-run records and the task's current measurements. For this increment, its plan contains `runs`, an array of `{ executionId, postrunImage, measurementNames }`. Include only runs with work and only measurement names whose `measureStatus` is missing or stale. Keep input run order and sort each run's names alphabetically for stable display.

The next task adds execution summaries to this plan. This task implements only work selection.

❌ Don't open measurement contexts, call instruments, write to a store, or wire the CLI. Don't filter on agent exit code: story 2400 still measures failed and timed-out runs. Don't mutate the records, outcomes, timestamps, or measurements; this plan only describes work.

## Done when

`bun test src/measuring/remeasure.test.ts` checks exact plans from small in-memory records:

1. A run with current A, missing B, and stale C schedules exactly B and C; an entirely current run is absent from `runs`.
2. A current skipped result is omitted; an errored result is scheduled even with a matching hash.
3. A removed measurement is never scheduled. Renaming A to B schedules B and leaves stored A intact, even when both definitions hash identically.
4. An aggregate-only edit schedules nothing. Empty records or no current measurements give no run work.
5. Two executions retain their run identities and order; non-zero-exit runs follow the same selection rules. The input records and their `measuredAt` values are unchanged after planning.

These are the pure-unit tests explicitly requested by the story; no generated project or mutable scenario is needed. Follow the repo's failing-test/fix commit sequence. Finish with passing `bun run typecheck`, `bun run lint`, and `bun test`, and commit all task changes.
