# 0008: Report an execution's remeasurement plan

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), the execution header and measurement-status report.

Depends on task 0007's CLI entry point. Read the root, `src/AGENTS.md`, and `fixtureTests/AGENTS.md`. Relevant spec:

- [Name is identity, hash is version](/workspace/thunderjar2/spec/085-test-case-results.md#name-is-identity-hash-is-version)
- [Deleted and renamed measurements](/workspace/thunderjar2/spec/085-test-case-results.md#deleted-and-renamed-measurements)
- [Execution output](/workspace/thunderjar2/spec/110-cli-report-visualization.md#an-execution-1)
- [Remeasure output, including deleted names](/workspace/thunderjar2/spec/110-cli-report-visualization.md#remeasure)

✅ Replace the placeholder for a recorded execution ID with its plan report. Open `jsonFileStore(runDataStorePath(cwd, dataDir))`, try `getExecution(target)` first, load current measurements for the records' stored task with `findThunderjarRoot` and `loadMeasurements`, and use the delivered `planRemeasure` from `src/measuring/remeasure.ts`.

Print an execution header with its container-run count, then `Current measurements for task <task>:`. Sort current names alphabetically. Print `up to date` for current summaries and `new / changed (<first eight hash characters>)` for missing or stale ones. Print each deleted name with its stored count and the spec's `deleted from task; N stored measures kept, excluded from aggregates` wording. Pad names into aligned columns, as in the story.

End with a blank line and exactly:

```text
Not implemented: applying measurements and recomputing aggregation results.
```

This is deliberately a report-only increment: don't claim any run or aggregate was updated. If no execution matches, consult `listExecutions(target)`: a recorded test case prints `Not implemented: remeasure by test case.` until task 0009; an unknown target throws `<target> is not a recorded execution or test case` and exits 1. Postrun tags aren't accepted targets. Preserve task 0007's argument validation.

❌ Don't resolve today's test case matrix, open measurement contexts, rerun an agent, change stored measures, recompute aggregates, or add new fixture data. Use the records and definitions already in scenario 8.

**Why:** the existing pure plan already describes current, changed and deleted measurements; exposing it verifies command-to-store-to-project wiring before writes are introduced.

## Done when

Extend colocated CLI tests against scenario 8 unchanged. Assert complete stdout, stderr and exit code for:

1. `bun run fixture 8 remeasure 01k4x9j2e8mqz3abcdefghjkmn`: 4 runs; `isPrimeTemplateTest` is new / changed with its current hash abbreviation; `isPrimeTsExists` and `tsIgnoreCount` are up to date; deleted `readmeExists` has 4 stored measures, including its errored entries. The final line explicitly says application and recomputation are unimplemented.
2. `bun run fixture 8 remeasure 01k4xc0000000000000000000a`: all three current measurements are up to date, with no deleted names.
3. An unknown argument fails with the stated error; a recorded test case still receives its explicit placeholder. A fresh empty `--data-dir` makes even a known scenario execution unknown, proving that the option is honored.

Keep expected hashes and output in the tests, not in scenario files. Showing these reports leaves the checked-in store byte-for-byte unchanged and gives the recording fake Docker no commands. Don't patch or copy a scenario.

Quick checks: `bun test src/commands/remeasure/remeasure.test.ts` and the first fixture command above.

Write and commit failing tests (🔴), then the fix (🟢), following repository conventions. Finish with passing typecheck, lint and the full test suite. Annotate the final commit with `remeasure-execution-report-complete`, describing the read-only report and the remaining backfill work.
