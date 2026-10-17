# 0006: Mark a stale contributing value in the execution view

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), the execution view stale marker. Depends on delivered task 0005's container marker and its scenario 8 history variation.

Read the root, `src/AGENTS.md`, and `fixtureTests/AGENTS.md`. Relevant spec:

- [Name is identity, hash is version](/workspace/thunderjar2/spec/085-test-case-results.md#name-is-identity-hash-is-version)
- [Aggregation results](/workspace/thunderjar2/spec/085-test-case-results.md#aggregation-results)
- [An execution](/workspace/thunderjar2/spec/110-cli-report-visualization.md#an-execution)

✅ Extend the execution view in `src/commands/show/show.ts`: append exactly ``  stale, run `remeasure` `` to an aggregate row when any measured value contributing to that permutation's row has a full content hash different from the current measurement of the same name. One stale iteration is enough, even when the other iteration is current. Reuse the task measurement loading and hashing from task 0005.

Determine staleness from that permutation's run records, not from another permutation or execution, and not just from the execution summary in `planRemeasure`: its missing-first status precedence can hide a stale contributing value. Missing, skipped and errored outcomes contribute no value. A name no longer declared has no current definition to compare against. Changing only aggregate methods leaves a measure current.

❌ Don't recompute aggregates during `show`, hide stored rows, change stored values, add fields to the store, or implement `remeasure`. Keep the existing message for executions recorded before aggregation results were stored.

**Why:** stored aggregates may still contain earlier measurement versions; the marker lets the reader see that without changing historical results while reporting them.

## Done when

Extend the CLI assertions in `src/commands/show/show.test.ts`, running scenario 8 unchanged:

1. `bun run fixture 8 show 01k4x9j2e8mqz3abcdefghjkmn` succeeds. Assert the complete stdout, stderr, and exit code: only the behaving agent's `isPrimeTemplateTest` row ends with ``stale, run `remeasure` ``. Its stored aggregate is still `mean {passed: 3.0, failed: 2.0}, sum {passed: 6, failed: 4}`. Its iteration 0 was recorded with an older template hash in task 0005, and iteration 1 is current.
2. The other permutation and other measurement rows have no stale marker. Deleted `readmeExists` retains its existing stored display. `bun run fixture 8 show fails`, which selects the latest execution, has no stale markers.
3. Showing the earlier execution and the latest execution leaves the checked-in store byte-for-byte unchanged. Container markers from task 0005 still pass.

Write and commit the failing CLI test first (🔴), then commit the fix (🟢), following the repository's commit conventions. Finish with passing `bun test src/commands/show/show.test.ts`, `bun run typecheck`, `bun run lint`, and `bun test`; commit all task changes and annotate the final commit with `show-stale-execution-measure-complete`, describing the contributing-value check. The next assessment will plan the command and actual backfill; these two tasks cover only stale reporting.
