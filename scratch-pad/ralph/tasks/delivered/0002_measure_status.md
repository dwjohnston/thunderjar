# 0002: Classify a recorded measure

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), the `measureStatus` artifact.

Read the root and `src/AGENTS.md` conventions. Relevant spec:

- [Name is identity, hash is version](/workspace/thunderjar2/spec/085-test-case-results.md#name-is-identity-hash-is-version)
- [Backfilling measurements](/workspace/thunderjar2/spec/085-test-case-results.md#backfilling-measurements)
- [Pure units](/workspace/thunderjar2/spec/120-test-boundaries.md#1-pure-units)

The story explicitly treats `erroredWhileMeasuring` as missing, even with a matching hash. `skipped` remains a real outcome and is current when its hash matches.

✅ Add `measureStatus(recorded: RecordedMeasure | undefined, measurement: Measurement): "missing" | "stale" | "current"` in `src/measuring/remeasure.ts`, with colocated pure unit tests in `src/measuring/remeasure.test.ts`.

Use the existing `RecordedMeasure` from `src/store/run-data-store.ts`, `Measurement` from `src/project/config.ts`, and `hashMeasurement` from `src/matrix/hashing.ts`. Undefined or errored records return `missing`; other records return `stale` when their full content hash differs, otherwise `current`.

❌ Don't implement a CLI command, change the hashing algorithm, or edit fixture projects at test runtime. Reuse the existing hashing path because it already includes referenced template contents and excludes `aggregate` and the measurement name.

## Done when

`bun test src/measuring/remeasure.test.ts` verifies:

1. An absent record is missing.
2. A measured result with a matching full hash is current; a config change makes it stale. Hashes sharing their first eight characters but differing later still mismatch.
3. Changing only `aggregate` leaves it current.
4. A matching-hash error is missing and will be retried; a matching-hash skipped result is current. A skipped result with a different hash is stale.
5. Template-backed measurements use `hashMeasurement` too: a recorded hash for different bundled template contents is stale. Use static files for the two template versions; don't patch a scenario during a test.

Follow the repo's failing-test/fix commit sequence for new behaviour. Finish with passing `bun run typecheck`, `bun run lint`, and `bun test`, and commit all task changes.
