# 0007: Expose the remeasure command

Goal: [2400: Remeasure](/workspace/thunderjar2/delivery/2400_remeasure.md).

Read the root and `src/AGENTS.md` conventions. Relevant spec:

- [Remeasure usage](/workspace/thunderjar2/spec/100-cli-reference.md#remeasure)
- [CLI tests](/workspace/thunderjar2/spec/120-test-boundaries.md#2-cli-with-recording-adapters)

Assessment: `measureStatus`, `planRemeasure`, and both stale markers in `show` are delivered. `bun run fixture 8 remeasure 01k4x9j2e8mqz3abcdefghjkmn` still prints `unknown command: remeasure`. Baseline checks pass: 257 tests passed, 16 Docker tests skipped, typecheck and lint passed.

✅ Register `remeasure <test case | execution> [--data-dir <dir>]` in `src/cli/index.ts`, the top-level usage, and the source layout's command list. Add its command module and colocated CLI tests under `src/commands/remeasure/`.

For this entry-point-only increment, a syntactically valid invocation prints exactly:

```text
Not implemented: remeasure.
```

Exit successfully for this explicit placeholder, as the repository permits. Accept the existing store override convention, `--data-dir`, in either position around the target. Reject a missing target, extra positional arguments, unknown flags, a missing option value, or a repeated option with exit 1 and exactly this stderr line:

```text
usage: thunderjar remeasure <test case | execution> [--data-dir <dir>]
```

❌ Don't resolve targets, load measurements, access Docker, or modify the store yet. The next task replaces the placeholder for execution IDs. Don't introduce `--force`, `--json`, or a dry-run flag.

**Why:** establishing the command and its argument contract is a small independently verifiable change before the execution-reporting implementation.

## Done when

CLI tests use `scenario("scenario_8_recorded_executions")` in place through `thunderjar()` from `src/testing/cli.ts`. Assert exact stdout, stderr and exit code for a valid target (with and without `--data-dir`) and the invalid argument forms above. Confirm the checked-in store is byte-for-byte unchanged and a recording fake Docker receives no commands.

Quick checks: `bun test src/commands/remeasure/remeasure.test.ts` and `bun run fixture 8 remeasure 01k4x9j2e8mqz3abcdefghjkmn`.

Write and commit the failing CLI tests first (🔴), then the implementation (🟢), following the repository's commit conventions. Finish with passing `bun run typecheck`, `bun run lint`, and `bun test`. Annotate the final commit with `remeasure-cli-entry-complete`, explaining that target handling and backfill remain explicitly unimplemented.
