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

# 4500: `commits` instrument

The commits the agent made since the start, oldest first.

Roadmap item 12. Needs 4000 (`thunderjar/start`).

## Version bump type

minor

## Artifacts

Adds the `commits` instrument, and the `FileChanges` type it shares with `filesChanged` (4600).

```ts
/** Paths are relative to the workspace, like `glob` elsewhere. */
export type FileChanges = {
  added: string[];
  modified: string[];
  deleted: string[];
};

// InstrumentTypes
commits: {
  config: {};
  value: Commit[];
};

export type Commit = {
  sha: string;
  /** The whole commit message. */
  message: string;
  /** What this commit changed, against its first parent. */
  files: FileChanges;
};
```

1. Only committed work. Uncommitted changes are `filesChanged`'s job.
2. The count is `v.length`.
3. The author is left out: in a run it's always the agent.

## Example CLI Output

A measurement that scores red/green TDD:

```ts
const touched = (c: Commit) => [...c.files.added, ...c.files.modified, ...c.files.deleted];
const onlyTests = (c: Commit) => touched(c).every((f) => f.endsWith(".test.ts"));
const noTests = (c: Commit) => touched(c).every((f) => !f.endsWith(".test.ts"));

export default declareMeasurement({
  instrument: "commits",
  config: {},
  metrics: {
    redGreen: {
      stat: "rate",
      better: "higher",
      score: (v) =>
        v.length === 2 &&
        v[0].message.includes("🔴") && onlyTests(v[0]) &&
        v[1].message.includes("🟢") && noTests(v[1]),
    },
    commits: { stat: "mean", score: (v) => v.length },
  },
});
```

## Tests

- Unit tests of parsing `git log` output into `Commit[]`.
- A `.docker.test.ts` measuring a workspace with two commits.

## Human interventions

None.
