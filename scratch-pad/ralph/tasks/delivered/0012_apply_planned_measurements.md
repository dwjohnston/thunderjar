# 0012: Take and store only the planned measurements

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), actual missing/stale backfill on the successful path.

Depends on task 0011's recording adapter and scenario 8's two saved workspaces. Read the root, `src/AGENTS.md`, and `fixtureTests/AGENTS.md`. Relevant spec and delivered decision:

- [Backfilling measurements](/workspace/thunderjar2/spec/085-test-case-results.md#backfilling-measurements)
- [Name is identity, hash is version](/workspace/thunderjar2/spec/085-test-case-results.md#name-is-identity-hash-is-version)
- [Deleted measurements stay in per-run Results](/workspace/thunderjar2/spec/085-test-case-results.md#deleted-and-renamed-measurements)
- [Remeasure targets](/workspace/thunderjar2/spec/100-cli-reference.md#remeasure)
- [Remeasure output](/workspace/thunderjar2/spec/110-cli-report-visualization.md#remeasure)
- [Existing aggregate recomputation path](/workspace/thunderjar2/delivery/delivered/2300_aggregation.md#artifacts)

Current behavior: `src/commands/remeasure/remeasure.ts` resolves an execution ID first, otherwise all of a test case's executions, loads each stored task's current measurements, calls `planRemeasure`, and recomputes every selected permutation's aggregate. It ends with `Not implemented: applying measurements.` This task replaces that placeholder with successful measurement application, using the shared per-execution path for both target forms.

✅ For each run in the existing plan, select exactly its `measurementNames` from that task's loaded definitions. Call the existing `measureContainerRun` with those definitions and a callback to `openMeasurementContext(record.postrunImage)`, then merge its returned Result through `store.recordMeasures`. Runs absent from the work plan open no context and write no measures. Leave unconditional aggregate recomputation in place, after the backfilled Results have been stored, using `recomputeAggregationResult` against the store so it reads the new values.

Use the same default measurement opener as today's `run`: `createDockerMeasurementOpener(dockerCli(), LOCAL_REPOSITORY)`. This copies saved files and evaluates on the host. Reuse its existing context lifecycle; don't implement measurement execution inside a Docker container. Keep argument validation, execution selection, task loading, deleted-name reporting and `--data-dir` behavior.

For an execution target, retain its pre-backfill status report and add a blank line followed by `Measuring from each postrun image:` when work exists. Print one result line per planned measurement in run order, with abbreviated permutation hash, zero-padded iteration, measurement name and the outcome value, for example:

```text
  8ffdda6e i00  isPrimeTemplateTest  {passed: 3, failed: 2}
```

Reuse the existing outcome/value formatting conventions; move shared formatting to `src/commands/format.ts` if necessary rather than importing another command. For a test-case target, retain the pre-backfill execution list and print `Measuring N container runs...  done`, counting planned runs, not measurements. With no work, print `Already current, nothing to do.` instead of a measuring section. End either target form with:

```text
Updated N container runs. Recomputed M aggregation results.
The agent was not rerun.
```

Substitute actual counts and use the existing singular/plural convention. Remove the application placeholder. This increment may propagate a context-opening error; reporting and continuing after unavailable artifacts is task 0013.

❌ Don't rerun agents, touch prerun images, add flags, remeasure current or deleted names, replace whole container-run records, or duplicate instruments/aggregation logic. Backfilled measures receive the current measurement hash and time from `measureContainerRun`; every untouched measure, including deleted entries, keeps its complete original value and `measuredAt`.

**Why:** the delivered plan already selects work correctly. Applying it through the existing measuring and store seams fills history without disturbing other observations.

## Done when

Extend `src/commands/remeasure/remeasure.test.ts`. Run scenario 8's project unchanged through `scenario()` and `thunderjar()`, with an external `--data-dir` seeded from an exact copy of its checked-in `runs.json`. Configure task 0011's fake image map with both saved workspaces. Never edit declarations, synthesize records, run an agent, or copy the project. Clean up disposable data. Assert complete stdout, stderr and exit codes, and these store effects:

1. Execution `01k4x9j2e8mqz3abcdefghjkmn` updates exactly one run and recomputes two aggregates. Only its `h8ffdda6e-i00` template measure is retaken: current full hash, `{passed: 3, failed: 2}`, and a valid fresh ISO `measuredAt` within the invocation's time interval. Every other measure and all run metadata stay deeply equal, including deleted `readmeExists`. `show` against this store no longer marks that value or aggregate stale and excludes `readmeExists` from its aggregate rows.
2. Target `fails` updates exactly two runs across all three executions and recomputes six aggregates. Besides the stale template above, the oldest execution's `h8ffdda6e-i01` gains its three missing measures: template `{passed: 3, failed: 2}`, existence `true`, and ignore count `1`. It exited 3 and is still measured under story 2400. Its previously incomplete aggregate now includes both iterations. The latest execution's records remain unchanged.
3. Repeating either invocation against its updated store reports nothing to do, updates zero runs, still recomputes all selected aggregates, issues no additional Docker commands, and leaves store bytes unchanged. Fully current and no-measurement targets also open no contexts.

Assert the fake receives only the opener's create/copy/remove protocol, once per selected measurement; it receives no `run`, `commit` or `build`. The checked-in store and saved workspaces remain unchanged. Normalize only unpredictable values; keep hashes, outcomes and stable output explicit in tests. Existing successful report tests must continue passing with the new complete behavior.

Quick review: `bun test src/commands/remeasure/remeasure.test.ts` and `bun test src/commands/show/show.test.ts`.

Write and commit failing CLI tests first (🔴), then the fix (🟢), using repository commit conventions. Finish with passing typecheck, lint and the full suite. Annotate the final commit with `apply-planned-measurements-complete`, describing selective writes, timestamp preservation and reuse of today's measurement opener. Unavailable artifacts and extra declaration-history variations remain outside this task.
