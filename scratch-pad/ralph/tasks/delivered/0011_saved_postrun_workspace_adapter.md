# 0011: Read a saved postrun workspace through the recording Docker

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), a prerequisite for testing actual backfill through the CLI.

Read the root, `src/AGENTS.md`, and `fixtureTests/AGENTS.md`. Relevant spec:

- [Same measurement path for fresh runs and backfill](/workspace/thunderjar2/spec/085-test-case-results.md#applying-measurements)
- [CLI with recording adapters](/workspace/thunderjar2/spec/120-test-boundaries.md#2-cli-with-recording-adapters)
- [Backfill artifacts](/workspace/thunderjar2/delivery/2400_remeasure.md#artifacts)

Assessment: typecheck, lint and all 264 tests pass (16 Docker tests skipped). `remeasure` plans work and recomputes aggregates, but does not take measurements. Today's `run` already defaults to `createDockerMeasurementOpener`: it copies a postrun image's workspace to a temporary directory and evaluates instruments there. Reuse that path in the next task; don't revert `run` to the earlier host-only architecture or implement measurement execution inside Docker.

This task delivers just one adapter capability: the recording Docker can supply an existing workspace to the existing measurement opener, without a daemon or agent execution.

✅ Extend `src/testing/fake-docker.ts` and the `fakeDocker()` helper in `src/testing/cli.ts` with an optional map from full image references to checked-in snapshot directories. Keep this map in the fake's disposable state, supplied by the test, rather than in project declarations. Support the existing opener's exact protocol:

1. `docker create --name <name> --entrypoint sh <ref>` associates the container name with its configured snapshot. An unmapped image fails with a clear non-zero error.
2. `docker cp <name>:/workspace/. <destination>` copies the snapshot's workspace contents into the destination. Also support copying `/thunderjar/result.json` when present; an absent file fails, as the opener already tolerates.
3. `docker rm --force <name>` removes the fake container association.

Keep recording each command. Do not add support for executing containers, committing images, or generating agent output.

Add two static snapshots beside scenario 8's `fixtures/`, under `postrun-files/<execution ID>/<postrun tag>/workspace/isPrime.ts`, for these recorded runs:

- `postrun-e01k4x9j2e8mqz3abcdefghjkmn-h8ffdda6e-i00`
- `postrun-e01k4tq3h8r0000000000000000-h8ffdda6e-i01`

Each is the buggy `isPrime.ts` that the scenario's `fake-harness-alpha@1.0.0` CLI writes, including its `@ts-ignore`. These are preserved artifacts of existing recorded runs, not expected results. Document them in `fixtureTests/AGENTS.md`. Do not change scenario 8's declarations, checked-in store, IDs, hashes, outcomes or timestamps. No result file is needed for these instruments.

❌ Don't implement remeasurement, change production Docker or runner code, patch a scenario during a test, or copy a project. Tests may write the fake's own state and copy artifacts out into disposable destinations. Expectations stay in tests.

**Why:** backfill needs a fixed old filesystem state. A checked-in snapshot makes that state inspectable, while the recording executable keeps CLI tests on the same measurement path as users.

## Done when

Add a focused adapter test, colocated in `src/testing/`, that drives the fake executable in subprocesses with its own environment and temporary state. Against a checked-in snapshot, create a named container, copy its workspace, and verify byte-for-byte file contents. Verify absent `result.json` and an unmapped image fail; removal clears the association. Assert recorded commands and clean up temporary state and destinations. No scenario files change during a test.

Quick review: run that focused test and inspect the two saved files against the scenario's harness CLI. Existing CLI tests, including `remeasure`, retain their current behavior.

Write and commit failing tests first (🔴), then the adapter and static artifacts (🟢), using repository commit conventions. Finish with passing `bun run typecheck`, `bun run lint`, and `bun test`. Annotate the final commit with `saved-postrun-workspace-adapter-complete`, explaining that the fake only supplies saved files and never runs an agent. Measurement application and unavailable-artifact handling belong to the following tasks.
