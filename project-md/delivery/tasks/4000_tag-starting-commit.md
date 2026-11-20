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

- A new step in the prerun Dockerfile that Thunderjar generates, in `src/execution/prerunDockerfile.ts`.
  - It runs right after the prompt set fragment, so it tags exactly what the agent starts from.
  - e.g.
    ```dockerfile
    RUN if git -C /workspace rev-parse --git-dir >/dev/null 2>&1; then git -C /workspace update-ref refs/thunderjar/start HEAD; fi
    ```
  - It does nothing in a workspace that isn't a git repository.
- Every prerun image's hash changes, so existing images are rebuilt once.

In each run, the ref is then in the prerun image, and still in the postrun image, where measurement containers can use it.

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
