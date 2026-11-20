---
harness: claude-code
model: opus
effort: high
ralph:
  session: "604f26c5-4a61-4431-828e-36a193861e71"
  capture: "thunderjar/capture/604f26c5-4a61-4431-828e-36a193861e71"
  branchedFrom: "ralph/4800_purge-capture"
  date: "2026-11-20T06:38:41.928Z"
  costUsd: 3.3880144000000003
  durationMs: 579585
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

# 4900: `remeasure <test case | execution>`

Apply the measurements on disk now to past container runs, without rerunning the agent.

Roadmap item 26. Spec: `project-md/prd/100-cli-reference.md#remeasure`.

## Version bump type

minor

## Artifacts

Adds `remeasure`.

- An execution remeasures its container runs; a test case, every past execution of it.
- Each run is measured in a new measurement container from its postrun image, the same path as the original measurement.

1. New measures are a new version, beside the old ones, not a replacement.
   - `show` uses the latest version.
2. Runs whose postrun image was purged are skipped, and listed as skipped.
3. Always runs every measurement. No selecting a subset.

## Example CLI Output

```sh
$ thunderjar remeasure 01K4X9J2E8MQZ3V7R5T0WABCDE
remeasured 6 runs, skipped 1 (postrun image purged)
```

## Tests

- A read-from-docker-image test (`.docker.test.ts`): run, change a measurement, remeasure, and `show` the new values.

## Human interventions

None.
