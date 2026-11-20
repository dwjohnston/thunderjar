---
harness: claude-code
model: sonnet
effort: medium
ralph:
  session: "26d914a7-6306-401a-95c6-17c3e7b51471"
  capture: "thunderjar/capture/26d914a7-6306-401a-95c6-17c3e7b51471"
  branchedFrom: "ralph/4300_copilot-helper"
  date: "2026-11-20T05:56:19.491Z"
  costUsd: 0.3320742000000001
  durationMs: 5497
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

# 4400: `opencode()` helper

Move OpenCode's reply and token-cost parsing out of the project files and into `src/api`, matching `claudeCode`.

Roadmap item 5.

## Version bump type

minor

## Artifacts

- Adds `opencode()` to `src/api`, exported like `claudeCode`.
- `init`'s starter harnesses use it too.

## Migrate the evals

Convert every harness declaration for this harness in `.thunderjar/parameters/harnessModels/` to the helper, e.g. `opencode-1.19.5`.

- Replace its own JSONL parsing of the reply and token costs with the helper.
- Keep its version, install fragment and run command.
- Check: `bun run tj plan compare-harnesses` is unchanged.

"If appropriate" means: convert it only where the new helper gives the same result. Leave the rest as they are, and list each one in the PR description with the reason. Leave `fixtures/` alone: tests rely on its files as written.

## Example CLI Output

None: the results of `run` and `show` are unchanged.

## Tests

- Unit tests of the parsing, against a recorded result file, as `claudeCode.test.ts` does.

## Human interventions

None.
