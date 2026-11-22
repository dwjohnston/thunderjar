---
harness: claude-code
model: opus
effort: medium
ralph:
  session: "878b577e-ad2d-4b67-aa98-33c6adede43f"
  capture: "thunderjar/capture/878b577e-ad2d-4b67-aa98-33c6adede43f"
  branchedFrom: "ralph/4600_files-changed-instrument"
  date: "2026-11-20T06:15:29.365Z"
  costUsd: 3.2315334000000018
  durationMs: 878021
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

# 4700: Parameter overrides on `run`

Replace any of a test case's parameter lists for one execution, without editing the file.

Roadmap item 19.

## Version bump type

minor

## Artifacts

One flag per field of the test case, on `run`, `plan` and `build`:

- `--base-image`
- `--code-state`
- `--prompt-set`
- `--harness-model`
- `--initial-prompt`
- `--iterations`

1. A flag replaces that list; it doesn't add to it. Values are comma-separated.
2. Names are checked as the test case's are, e.g. an unknown code state fails before anything builds.
3. `plan` and `build` take the same flags, so an override can be previewed.
4. The execution records the overrides, so `show` and `executions` say it wasn't the test case as written.

Out of scope: `--task`.

## Example CLI Output

```sh
$ thunderjar run compare-models --harness-model claude-code-2.1.326/haiku,opencode-1.19.5/haiku
$ thunderjar run compare-models --code-state thunderjar-main --prompt-set none --iterations 3

$ thunderjar plan compare-models --code-state nope
Unknown code state "nope". Known: thunderjar-main, thunderjar-start, …
```

## Tests

- Fixture + stdout tests of `plan` with each flag, and with an unknown name.
- `run --dry-run` tests that the overrides are recorded.

## Human interventions

None.
