# 0010: Recompute every selected aggregation result

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), the requirement to recompute every selected execution's aggregation results even when no measurements need taking.

Depends on delivered tasks 0008 and 0009: `remeasure` already resolves an execution ID first, otherwise every execution of a test case, and reports their plans. Assessment passed typecheck, lint and the full suite (264 passed, 16 Docker tests skipped). Actual measurement application remains a placeholder.

Read the root, `src/AGENTS.md`, and `fixtureTests/AGENTS.md`. Relevant spec and earlier decision:

- [Aggregation results](/workspace/thunderjar2/spec/085-test-case-results.md#aggregation-results)
- [Deleted and renamed measurements](/workspace/thunderjar2/spec/085-test-case-results.md#deleted-and-renamed-measurements)
- [Aggregate-only changes](/workspace/thunderjar2/spec/085-test-case-results.md#how-a-measures-values-combine)
- [Remeasure output](/workspace/thunderjar2/spec/110-cli-report-visualization.md#remeasure)
- [Story 2400 artifacts and spec gaps](/workspace/thunderjar2/delivery/2400_remeasure.md#artifacts)
- [Delivered aggregation path](/workspace/thunderjar2/delivery/delivered/2300_aggregation.md#artifacts)

✅ After resolving and planning the target, recompute and store one aggregation result for every distinct full permutation hash of every selected execution. Call the existing `recomputeAggregationResult` from `src/measuring/aggregate.ts`, with that execution's stored task's current measurements and the same store selected by `--data-dir`. Include executions with no planned measurement work, tasks declaring no measurements, permutations with missing or stale measures, and executions with no previously stored aggregates. Keep the existing execution selection and report ordering.

End either report with a blank line followed by these two lines, substituting the actual number of aggregation results written and using singular for one:

```text
Recomputed 2 aggregation results.
Not implemented: applying measurements.
```

This replaces the old combined placeholder. Count permutations, not executions or container runs. Do not claim any container run was updated.

❌ Don't take measurements, open contexts, rerun agents, change container-run records or their timestamps, change stale markers, add flags, or implement unavailable-run handling. Don't duplicate aggregation logic or import another command. Work selection can still describe pending backfill; this increment only refreshes aggregates from the Results already stored.

**Why:** changes to aggregate methods and deleted measurement names need a refresh even when all recorded measures are current. This is a small independent use of the already delivered aggregation path before backfill starts changing Results.

## Fixture and test boundary

Use scenario 8's project unchanged, in place, through `scenario()` and `thunderjar()` from `src/testing/cli.ts`. The command now writes its run data store: seed a disposable `--data-dir` with an exact, unmodified copy of only scenario 8's checked-in `runs.json`. This is an external writable store, not a copied project. Do not copy the scenario, edit declarations, synthesize records, or call `run` against its recorded history. Remove disposable data after the test.

Update existing successful remeasure report tests to use this external store so the checked-in store stays untouched. Invalid-argument and unknown-target checks must still make no writes. Keep expected output and stored values in the tests. A recording fake Docker receives no commands.

## Done when

Colocated CLI tests in `src/commands/remeasure/remeasure.test.ts` assert complete stdout, stderr and exit code, plus these observable store effects:

1. Target `01k4xc0000000000000000000a`, the fully current execution, reports `Recomputed 2 aggregation results.` despite having no planned measurement work. All container-run records remain deeply equal to their starting state.
2. Target `01k4x9j2e8mqz3abcdefghjkmn` reports 2 recomputations. Its two stored aggregation results no longer contain deleted `readmeExists`, while every per-run `readmeExists` entry remains intact, including errored entries. The behaving permutation still combines its existing template values to mean `{passed: 3, failed: 2}` and sum `{passed: 6, failed: 4}`; its stale contributing measure remains stale because no backfill occurred.
3. Target `fails` reports 6 recomputations, covering all three executions and both permutations in each. The oldest execution, `01k4tq3h8r0000000000000000`, starts without stored aggregates and gains both. No other execution's aggregation results change.
4. Target `times-out` reports `Recomputed 1 aggregation result.` Its measurement map stays empty, and duration is still aggregated. A second identical invocation against the same disposable store leaves its bytes unchanged.
5. All commands preserve the checked-in store byte-for-byte and all container-run records in the disposable store, including every `measuredAt`. Existing argument validation and unknown-target behavior still pass.

Quick review: `bun test src/commands/remeasure/remeasure.test.ts`. For a manual check, seed an external data directory with the checked-in store, then run `bun run fixture 8 remeasure fails --data-dir <absolute data directory>` and `bun run fixture 8 show 01k4tq3h8r0000000000000000 --data-dir <same directory>`; the latter now shows the newly stored aggregate table.

Write and commit failing CLI tests first (🔴), then the implementation (🟢), following repository commit conventions. Finish with passing `bun run typecheck`, `bun run lint`, and `bun test`, and commit all task changes. Annotate the final commit with `remeasure-recompute-selected-aggregates-complete`, describing unconditional recomputation and the unchanged per-run Results.

Actual missing/stale backfill, fresh measurement timestamps, aggregate-only declaration variations, and unavailable-run reporting remain for a later assessment. This task delivers only aggregation refresh from existing records.
