---
harness: claude-code
model: sonnet
effort: low
ralph:
  session: "790092f1-6455-4459-bd05-3718f03e6545"
  capture: "thunderjar/capture/790092f1-6455-4459-bd05-3718f03e6545"
  branchedFrom: "ralph/3900_capture-push-session"
  date: "2026-11-20T05:28:12.036Z"
  costUsd: 0.4438388000000001
  durationMs: 4114
  isError: false
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

`build --dry-run` prints the new step in each prerun Dockerfile, after the code state and prompt set fragments. The image's hash changes with it.

e.g. the first permutation of this repository's `humans-md` test case, whose prompt set adds nothing:

```diff
 $ thunderjar build humans-md --dry-run
-# thunderjar-prerun:f5e1f12c
+# thunderjar-prerun:<new hash>
 FROM node:20-bookworm
 RUN npm install --global bun@1.3.14
 RUN git config --system user.name "Thunderjar agent" \
   && git config --system user.email agent@thunderjar.invalid
 WORKDIR /workspace
 RUN git clone --quiet https://github.com/dwjohnston/thunderjar.git /workspace \
   && git -C /workspace fetch --quiet origin 3e614b510673f25596579be65c41cab611becd32 \
   && git -C /workspace checkout --quiet --detach 3e614b510673f25596579be65c41cab611becd32 \
   && git -C /workspace remote remove origin
 WORKDIR /workspace
+RUN if git -C /workspace rev-parse --git-dir >/dev/null 2>&1; then git -C /workspace update-ref refs/thunderjar/start HEAD; fi
 RUN npm install -g @anthropic-ai/claude-code@2.1.311
 RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
 …
```

Then, inside a measurement container:

```sh
$ git rev-parse thunderjar/start
3e614b510673f25596579be65c41cab611becd32
```

## Tests

- A `.docker.test.ts` that builds a prerun image from a git scenario and checks the ref is at the starting commit.

## Human interventions

None.
