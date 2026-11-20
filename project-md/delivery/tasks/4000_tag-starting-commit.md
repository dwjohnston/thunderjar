---
harness: claude-code
model: sonnet
effort: low
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

# 4000: Tag the starting commit

Tag the workspace's starting commit in the prerun image, so measurements can compare against it. The measurement container has no ref for it today.

Roadmap item 11. The prerequisite for 4500 (`commits`) and 4600 (`filesChanged`).

## Version bump type

minor

## Artifacts

- A `thunderjar/start` ref in the workspace of the prerun image, at the commit the agent starts from.
  - Written after the code state and promptset are applied, so it's exactly what the agent sees.
  - Workspaces that aren't git repositories get no ref, and no error.
- The ref is still there in the postrun image, so measurement containers can use it.

## Example CLI Output

None: no command changes. Inside a measurement container:

```sh
$ git rev-parse thunderjar/start
530f477c1d2e…
```

## Tests

- A `.docker.test.ts` that builds a prerun image from a git scenario and checks the ref is at the starting commit.

## Human interventions

None.
