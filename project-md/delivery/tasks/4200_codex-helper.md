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

# 4200: `codex()` helper

Move Codex's reply and token-cost parsing out of the project files and into `src/api`, matching `claudeCode`.

Roadmap item 3.

## Version bump type

minor

## Artifacts

- Adds `codex()` to `src/api`, exported like `claudeCode`.
- The harness declarations in `.thunderjar/parameters/harnessModels/` use it instead of their own parsing.
- `init`'s starter harnesses use it too.

## Example CLI Output

None: the results of `run` and `show` are unchanged.

## Tests

- Unit tests of the parsing, against a recorded result file, as `claudeCode.test.ts` does.

## Human interventions

None.
