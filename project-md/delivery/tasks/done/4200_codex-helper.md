---
harness: claude-code
model: sonnet
effort: medium
ralph:
  session: "19852bf5-2d7b-4f97-88c9-b3f292cc5fd9"
  capture: "thunderjar/capture/19852bf5-2d7b-4f97-88c9-b3f292cc5fd9"
  branchedFrom: "ralph/4100_code-state-git-checkout"
  date: "2026-11-20T05:47:30.351Z"
  costUsd: 0.29772980000000004
  durationMs: 298858
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

# 4200: `codex()` helper

Move Codex's reply and token-cost parsing out of the project files and into `src/api`, matching `claudeCode`.

Roadmap item 3.

## Version bump type

minor

## Artifacts

- Adds `codex()` to `src/api`, exported like `claudeCode`.
- `init`'s starter harnesses use it too.

## Migrate the evals

Convert every harness declaration for this harness in `.thunderjar/parameters/harnessModels/` to the helper, e.g. `codex-0.166.0`.

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
