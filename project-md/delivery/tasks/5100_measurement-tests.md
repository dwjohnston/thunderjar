---
harness: claude-code
model: sonnet
effort: medium
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: session_01LCLeLjJ93DfxJz1Jcn8net
Supervising engineer: David Johnston

Humans: add your notes here
-->

# 5100: Test a measurement against fixture files

Let a project write `bun test` tests for its own measurements: put fixture files where the agent would have written them, take the measurement, and assert on its metrics.

These tests check file content only, not git state such as commits or untracked files.

## Version bump type

patch

## Artifacts

### `measure()`, from a new `thunderjar/testing` export

```ts
// .thunderjar/parameters/tasks/tj-eval-blacksheepcode/measurements/tests/codeStateUsesTag.test.ts
import { expect, test } from "bun:test";
import { measure } from "thunderjar/testing";
import codeStateUsesTag from "../codeStateUsesTag.ts";

test("a code state that names the tag in resolve uses it", async () => {
  const result = await measure(codeStateUsesTag, {
    files: { ".thunderjar/parameters/codeStates/new/index.ts": `${import.meta.dir}/fixtures/index_good.ts` },
  });
  expect(result.metrics.usesTag).toBe(true);
});
```

```ts
function measure(
  measurement: MeasurementDeclaration,
  options: {
    /** Workspace path → fixture file to put there. */
    files?: Record<string, string>;
    /** The agent's reply, for instruments that read it, e.g. `replyMatches`. Default: "". */
    reply?: string;
  },
): Promise<{
  outcome: "measured" | "skipped" | "erroredWhileMeasuring";
  /** The instrument's value, when measured. */
  value?: unknown;
  /** Each metric's score, by name, as `show` and `compare` would read it. */
  metrics: Record<string, number | boolean | undefined>;
}>;
```

1. Makes an empty temp workspace, copies each fixture to its workspace path, and removes the workspace afterwards.
2. Takes the measurement on the host, with a `MeasurementContext` over the temp workspace: `exec` runs in it with Bun's `$`, and `readFile`, `writeFile` and `glob` work on its files. No Docker.
3. Scores each metric the way a real run does, its `score` or else the instrument's default score. Reuse the code in `src/execution/` rather than copying it.
4. An instrument with bundled files, e.g. `bunTestFile`, fails with a clear error saying it isn't supported yet. Its config paths are relative to the measurement's file, which `measure()` isn't given.
5. Type `metrics` by the declaration's metric names, if that's practical.

### Where it lives

- `src/testing/` is Thunderjar's own test harness, and it sits below `api` and `instruments` in `scripts/layers.ts`, so `measure()` can't go there.
- Add a new layer after `execution`, e.g. `src/measureTesting/`, following "Layers of `src/`" in `AGENTS.md`.
- Add the `./testing` export to `package.json`, and its folder to `files`.
- Extend `bun run test:package` (`scripts/`) so the installed package runs one `measure()` test. That's how a file left out of `files` gets caught.

### Measurement tests in this repo

The layout for a task's measurement tests:

```
.thunderjar/parameters/tasks/<task>/measurements/
  codeStateUsesTag.ts
  tests/
    fixtures/
      index_good.ts
      index_bad.ts
    codeStateUsesTag.test.ts
```

1. Check that the measurement loader ignores `measurements/tests/`. `tsFilesIn` in `src/config/folders.ts` should scan non-recursively. If it doesn't, make it skip `tests/`.
2. Check whether `bun test` finds tests under `.thunderjar/`, a hidden folder. If it doesn't, add a `test:measurements` script and run it in CI next to `bun test`.
3. Make sure the fixture files aren't type-checked or linted as Thunderjar code. They're stand-ins for an agent's output, and may be wrong on purpose.

## Migrate `codeStateUsesTag`

`.thunderjar/parameters/tasks/tj-eval-blacksheepcode/measurements/codeStateUsesTag.ts` finds the new code state with `git ls-files --others`, so it can't be tested from file content. It also has these bugs:

- It scores false if the agent committed the code state.
- With more than one matching file, `grep -q 'resolve' $f` passes if any one of them contains `resolve`.
- It only checks that `resolve` appears somewhere in the file, not that the tag is named inside `resolve`.

Rewrite it to find the files with a glob, `.thunderjar/parameters/codeStates/*/index.ts`, and to check their content. Keep the metric name `usesTag`.

- Check the starting code state of the `tj-eval-blacksheepcode` test case. If a code state it starts with already names `tj-codestate-1`, a glob would count it. Then exclude it by name, and say so in the PR description.
- Tests, one fixture each:
  - names the tag inside `resolve` → `true`
  - names the tag only in `applyParameter` → `false`
  - doesn't name the tag → `false`
  - no code state file at all → `false`

## Tests

- Unit tests of `measure()` in its layer, one per instrument that doesn't bundle files: `shell`, `grep`, `fileCreated`, `replyMatches`.
  - Use the instrument's default score in one test, and a metric's `score` in another.
  - `bunTestFile` gives the "not supported" error.
  - The temp workspace is gone afterwards, even when the measurement throws.
- The `codeStateUsesTag` tests above.
- `bun run test:package` runs a `measure()` test from the installed package.

## Human interventions

None.
