# 0005: Mark a stale measure in the container run view

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), the container run stale marker. The pure status and planning functions are delivered; `show` currently prints stored values without checking their measurement versions.

Read the root, `src/AGENTS.md`, and `fixtureTests/AGENTS.md`. Relevant spec:

- [Name is identity, hash is version](/workspace/thunderjar2/spec/085-test-case-results.md#name-is-identity-hash-is-version)
- [Deleted and renamed measurements](/workspace/thunderjar2/spec/085-test-case-results.md#deleted-and-renamed-measurements)
- [A container run](/workspace/thunderjar2/spec/110-cli-report-visualization.md#a-container-run)

✅ In `src/commands/show/show.ts`, append ` (stale)` to a stored measure's displayed value when its full content hash differs from the current measurement of the same name. Load measurements for the record's stored task using `findThunderjarRoot` and `loadMeasurements` from `src/project/config.ts`; don't resolve today's test case matrix. Preserve the existing value and detail formatting.

An absent current measurement means the name was deleted, not that its stored value is stale. An aggregate-only edit does not make a measure stale. Use the existing measurement hashing path, including bundled template contents.

For a small, manually inspectable history variation, update scenario 8's checked-in store: in execution `01k4x9j2e8mqz3abcdefghjkmn`, give only `isPrimeTemplateTest` in the behaving agent's iteration 0 (`h8ffdda6e-i00`) the full hash of an older template version. Its iteration 1 remains current. Keep the stored outcomes, timestamps, aggregation results, IDs, and other hashes intact. Document this older template version in `fixtureTests/AGENTS.md`. Keep expectations in the CLI test, not in the scenario. This same history will support task 0006.

❌ Don't patch scenario files during a test, copy a scenario, recompute or write records from `show`, add execution-view markers, or implement `remeasure` in this task.

**Why:** a reader needs to see that a stored value came from an earlier measurement definition while still being able to inspect the original result.

## Done when

Add CLI assertions beside `show` in `src/commands/show/show.test.ts`, using `scenario()` and `thunderjar()`:

1. `bun run fixture 8 show postrun-e01k4x9j2e8mqz3abcdefghjkmn-h8ffdda6e-i00` succeeds and prints `isPrimeTemplateTest  {passed: 3, failed: 2} (stale)` with the normal column padding. Assert the complete output, stderr, and exit code.
2. The same command with `-i01` prints its template value without the marker. The current `isPrimeTsExists` and `tsIgnoreCount`, and deleted `readmeExists`, have no stale marker in either view. Existing skipped/error detail assertions still pass.
3. The commands leave the checked-in store byte-for-byte unchanged.

Write and commit the failing CLI test first (🔴), then commit the fix (🟢), following the repository's commit conventions. Finish with passing `bun test src/commands/show/show.test.ts`, `bun run typecheck`, `bun run lint`, and `bun test`; commit all task changes and annotate the final commit with `show-stale-container-measure-complete`, describing the delivered behavior and the checked-in history decision.
