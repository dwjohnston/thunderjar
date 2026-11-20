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
Session Id: session_01LCLeLjFb1Gy2NHaFDTB6tk
Supervising engineer: David Johnston

Split from PR #218's roadmap plan.

Humans: add your notes here
-->

# 4600: `filesChanged` instrument

Everything changed since the start, committed or not, as one `FileChanges`.

Roadmap item 14. Needs 4000 (`thunderjar/start`) and 4500 (`FileChanges`).

## Version bump type

minor

## Artifacts

Adds the `filesChanged` instrument.

```ts
// InstrumentTypes
filesChanged: {
  config: {
    /** Only report paths matching this. Default: every path. */
    glob?: string;
  };
  value: FileChanges;
};
```

1. Untracked files count as added; git-ignored files, e.g. `node_modules`, are left out.
2. A rename is a deletion plus an addition, so `deleted.includes(...)` works as expected.
3. In a workspace that isn't a git repository, the measurement fails with that reason.

## Migrate the evals

Convert the measurements in `.thunderjar/parameters/tasks/*/measurements/` that check what changed against a hard-coded commit or hash to `filesChanged`.

- `gauntlet-wrong-failing-test/testFileUnchanged.ts`
  - Today: a SHA-256 of `test/retail/money.test.js`.
  - Becomes: `filesChanged` with that glob, scored as not in `modified` or `deleted`.
- `add-claude-code-harness-0201/parameterNamesTestUpdated.ts`
  - Today: `git diff` against commit `88f0e6f…`.
  - Becomes: `filesChanged`, scored as the test file being in `modified`.
- Leave the `fileCreated` measurements as they are, e.g. `harnessFileCreated.ts`. They check that a file exists, which `fileCreated` already does.

"If appropriate" means: convert it only where the new helper gives the same result. Leave the rest as they are, and list each one in the PR description with the reason. Leave `fixtures/` alone: tests rely on its files as written.

## Example CLI Output

```ts
export default declareMeasurement({
  instrument: "filesChanged",
  config: { glob: "src/**" },
  metrics: {
    didDeleteFoo: { stat: "rate", better: "higher", score: (v) => v.deleted.includes("src/foo/bar.js") },
    testUnchanged: { stat: "rate", better: "higher", score: (v) => !v.modified.includes("src/foo/bar.test.js") },
  },
});
```

## Tests

- Unit tests of parsing `git diff --name-status` and `git status` output.
- A `.docker.test.ts` with committed, uncommitted, untracked, ignored and renamed files.

## Human interventions

None.
