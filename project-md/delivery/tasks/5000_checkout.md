---
harness: claude-code
model: opus
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

# 5000: `checkout <run>`

Bring a container run's end state back, to inspect what happened. Replaces the planned `restore` command.

Roadmap item 27.

## Version bump type

minor

## Artifacts

Adds `checkout`.

1. Default: a local branch.
   - The agent's commits, plus a commit of anything it left uncommitted, so the branch is the whole end state.
2. `--shell`: `docker run -it` on the postrun image, in the workspace.
   - Through the configured runtime, so it works on a remote Docker host too.
3. A purged postrun image fails with that reason.
4. The branch is `thunderjar/run/<test case>/<execution>/<run>`.
   - `<run>` is the permutation hash and iteration, without the execution ID the container run ID repeats.
   - `run/` mirrors `thunderjar/capture/<session>`: the second segment is the kind of branch, so they never collide.

## Example CLI Output

```sh
$ thunderjar checkout 01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i00
Checked out thunderjar/run/compare-models/01K4X9J2E8MQZ3V7R5T0WABCDE/h4f9a21c8-i00
```

## Tests

- A read-from-docker-image test (`.docker.test.ts`) that checks out a run and compares the branch's tree with the postrun workspace.

## Human interventions

None.
