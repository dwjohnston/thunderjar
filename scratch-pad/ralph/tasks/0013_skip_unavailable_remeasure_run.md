# 0013: Skip an unavailable run and finish the remaining backfill

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), the reported, skipped run and non-zero exit when its saved artifact is gone.

Depends on task 0012's successful planned backfill and task 0011's recording Docker snapshots. Read the root, `src/AGENTS.md`, and `fixtureTests/AGENTS.md`. Relevant spec and story decision:

- [Story artifacts: unavailable kept directories](/workspace/thunderjar2/delivery/2400_remeasure.md#artifacts)
- [Story spec gaps: report, skip and exit non-zero](/workspace/thunderjar2/delivery/2400_remeasure.md#spec-gaps)
- [Backfilling measurements](/workspace/thunderjar2/spec/085-test-case-results.md#backfilling-measurements)
- [Remeasure reports](/workspace/thunderjar2/spec/110-cli-report-visualization.md#remeasure)
- [CLI with recording adapters](/workspace/thunderjar2/spec/120-test-boundaries.md#2-cli-with-recording-adapters)

The story describes the earlier host runner's kept directory. Today's production measurement opener copies a postrun image's workspace to the host. Treat failure to open that workspace as the corresponding unavailable saved artifact, through the existing opener seam. Do not introduce a second CLI measurement path or a host-mode flag.

✅ When opening a context for a planned run fails, report that run's full postrun tag and the error, skip its measurement update, and continue subsequent planned runs and selected executions. Retain and print the normal report and final updated/recomputed counts. Return exit code 1 if any run could not be opened; successful invocations stay at 0. Make the status observable from the CLI without losing the partial-success output to a final exception.

Count only successfully updated runs. Recompute every selected permutation's aggregation result even when one run was skipped, from the Results actually stored. An unavailable run's stored Result, including its old timestamps and stale values, stays intact. Preserve cleanup of temporary measurement workspaces and fake container associations through the existing opener.

❌ Don't manufacture a skipped or errored measure for an artifact-opening failure, silently succeed, stop at the first unavailable run, or retry agents. Instrument outcomes are different: `measureContainerRun` already records `skipped` and `erroredWhileMeasuring`, and those must remain ordinary recorded outcomes. Don't swallow store or aggregate write failures as unavailable artifacts. No new flags, scenarios, or patched records are needed.

**Why:** a missing artifact must be visible, but it must not prevent independent historical runs from being measured or their aggregates refreshed.

## Done when

Extend `src/commands/remeasure/remeasure.test.ts`, invoking the CLI against unchanged scenario 8 and an external `--data-dir` seeded with an exact, unmodified copy of its checked-in store. Configure the fake Docker image map with only the oldest execution's saved workspace, omitting the snapshot mapping for `postrun-e01k4x9j2e8mqz3abcdefghjkmn-h8ffdda6e-i00`. This configures adapter availability; it does not change or delete scenario files.

1. `remeasure fails --data-dir <dir>` exits 1. Assert complete stdout and stderr: the unavailable run is identified by its full tag with a clear skipped/error message; the report still lists all executions; the summary says one updated run and six recomputed aggregation results. The oldest execution follows the unavailable one in selection order and still gains its three missing measures.
2. The unavailable run's complete record remains unchanged, including its stale template and timestamp. The available run is measured normally and receives fresh timestamps. Deleted entries and unrelated records remain intact. All six selected aggregates are stored, including those derived from the unchanged stale value. `show` still marks the unavailable run's stale contribution.
3. Against a fresh copy of the store, target the unavailable execution directly. It exits 1, updates zero runs and recomputes two aggregates, retaining its original per-run Results. Existing successful/no-work invocations still exit 0.

Assert no fake Docker `run`, `commit` or `build` commands, and no leftover fake container association. Preserve the checked-in store and snapshots byte-for-byte and clean up external writable stores. Normalize only temporary paths and random container names in reported errors.

Quick review: `bun test src/commands/remeasure/remeasure.test.ts`.

Write and commit failing CLI tests first (🔴), then the fix (🟢), using repository commit conventions. Finish with passing `bun run typecheck`, `bun run lint`, and `bun test`. Annotate the final commit with `skip-unavailable-remeasure-run-complete`, describing partial success, unconditional aggregate refresh and the distinction between context-opening failures and instrument outcomes. The next assessment should check the remaining story coverage, particularly aggregate-only declaration history and retrying an errored current-hash measurement through the CLI.
