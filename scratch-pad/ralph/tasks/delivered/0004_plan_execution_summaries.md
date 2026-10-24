# 0004: Summarize measurement status per execution

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md), the execution-summary portion of `planRemeasure`.

Depends on task 0003's pure `planRemeasure` and `RemeasurePlan` in `src/measuring/remeasure.ts`. Its `runs` array already identifies only missing/stale measurement work. Read the root and `src/AGENTS.md` conventions. Relevant spec:

- [Name is identity, hash is version](/workspace/thunderjar2/spec/085-test-case-results.md#name-is-identity-hash-is-version)
- [Deleted and renamed measurements](/workspace/thunderjar2/spec/085-test-case-results.md#deleted-and-renamed-measurements)
- [Remeasure output](/workspace/thunderjar2/spec/110-cli-report-visualization.md#remeasure)
- [Pure units](/workspace/thunderjar2/spec/120-test-boundaries.md#1-pure-units)

✅ Extend `RemeasurePlan` with `executions`, one summary per execution represented in the input records, in first-seen order. Each summary contains its execution ID and:

- Each current measurement's name, full current content hash, and status across that execution's runs. Use `missing` if any run is missing or errored, otherwise `stale` if any run is stale, otherwise `current`. Both missing and stale will eventually print as `new / changed`; this precedence keeps the summary deterministic when a name has both.
- Each deleted measurement name and the number of that execution's run Results containing it. Count stored entries regardless of measured, skipped, or errored outcome.

Sort measurement and deleted-name lists alphabetically. Include executions with zero run work: the command will later need them to recompute aggregates even when every measure is current. Keep the existing `runs` selection unchanged.

❌ Don't delete stored measures, compute aggregate values, produce CLI output, or mutate inputs. These summaries describe existing records so the command can report deleted measures accurately without discarding history.

## Done when

`bun test src/measuring/remeasure.test.ts` asserts exact execution summaries for:

1. Two executions where the same measurement is current in one and stale in the other, plus a new measurement missing from both.
2. A deleted name present in two runs of one execution and one run of the other: counts are 2 and 1, including skipped/errored stored entries.
3. A rename: the old name is deleted with its stored count, the new name is missing despite equal content hashes.
4. Mixed current/stale/missing runs use the stated status precedence, and errors count as missing.
5. A fully current execution, and an execution whose task currently declares no measurements, both remain in `executions` while their `runs` work can be empty. Empty input records give empty execution summaries.

Follow the repo's failing-test/fix commit sequence. Finish with passing `bun run typecheck`, `bun run lint`, and `bun test`, and commit all task changes. CLI wiring, actual backfill, and stale markers in `show` remain for the next assessment after these foundations are delivered.
