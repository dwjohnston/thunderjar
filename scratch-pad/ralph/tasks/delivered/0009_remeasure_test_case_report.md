# 0009: Report all executions selected by a test case

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), the test-case target's execution selection and status report.

Depends on task 0008's execution report and unknown-target handling. Read the root, `src/AGENTS.md`, and `fixtureTests/AGENTS.md`. Relevant spec:

- [Remeasure targets](/workspace/thunderjar2/spec/100-cli-reference.md#remeasure)
- [Test-case output](/workspace/thunderjar2/spec/110-cli-report-visualization.md#a-test-case)
- [Backfilling measurements](/workspace/thunderjar2/spec/085-test-case-results.md#backfilling-measurements)

✅ Replace `Not implemented: remeasure by test case.` with the spec's test-case selection report. Continue trying the target as an execution ID first. Otherwise, use every execution from `listExecutions(target)`, in the store's newest-first order, rather than selecting only the latest as `show` does.

Print `<test case> has N executions (M container runs)` and one indented line per selected execution: its ID, run count and date (`YYYY-MM-DD`). Append `  (already current, nothing to do)` only when its `planRemeasure(...).runs` is empty. Load measurements for each execution's stored task; don't load or resolve today's test case declaration. Reuse task 0008's store and plan path.

End with a blank line and the same explicit placeholder used for execution reports:

```text
Not implemented: applying measurements and recomputing aggregation results.
```

❌ Don't measure, write the store, recompute aggregates, change the execution-ID report, or claim the command updated anything. Don't add new scenarios or change their files.

**Why:** selecting all historical executions is the key difference from `show`; it can be verified cheaply against the existing checked-in history before backfill changes records.

## Done when

Extend the colocated CLI tests, using scenario 8 unchanged:

1. `bun run fixture 8 remeasure fails` reports 3 executions and 12 runs, newest first: `01k4xc0000000000000000000a` (2026-09-30, already current), `01k4x9j2e8mqz3abcdefghjkmn` (2026-09-29, needs work), and `01k4tq3h8r0000000000000000` (2026-09-28, needs work). Each has 4 runs. Only the latest gets the already-current suffix.
2. `bun run fixture 8 remeasure times-out` reports its one execution with 2 runs as already current: that task has no measurements. Non-zero agent exits aren't a reason to omit historical runs.
3. Existing execution-ID, unknown-target and `--data-dir` assertions continue to pass. Assert full stdout, stderr and exit codes, and byte-for-byte preservation of the checked-in store. A recording fake Docker receives no commands.

Quick checks: `bun test src/commands/remeasure/remeasure.test.ts` and `bun run fixture 8 remeasure fails`.

Write and commit failing tests (🔴), then the fix (🟢), following repository conventions. Finish with passing typecheck, lint and the full test suite. Annotate the final commit with `remeasure-test-case-report-complete`, explaining the all-executions selection.

This completes only the next reporting stretch. Actual missing/stale backfill, aggregate recomputation even with no measurement work, timestamp preservation, and unavailable-run handling remain for the next assessment; do not broaden this task into those behaviors.
