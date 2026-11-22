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
Session Id: session_01LCLeLhdZHdqX3iGhMMBNN6
Supervising engineer: David Johnston

From the "Harness models handoff" planning session. Replaces 4200 and PR #238. Builds on 3852.

Humans: add your notes here
-->

# 3853: `codex()` helper

A Codex harness in one call, with the options 3852 gave `claudeCode`: `provider`, `models` and `command(ctx)`. Moves Codex's reply and token-cost parsing out of the project files and into `src/api`.

## Version bump type

patch

## Artifacts

- Adds `codex()` to `src/api`, exported like `claudeCode`.
- Default: OpenAI, `OPENAI_API_KEY`, a default list of OpenAI model IDs.
- `models` settings
  - `reasoningEffort`, passed as `-c model_reasoning_effort=…`.
  - The default models declare it as a variant.
- `provider`
  - Must support the Responses API: Codex has no Chat Completions mode.
  - Wire API always `responses`.
  - Set up as a `model_providers` entry.
- No `openRouter: true` switch: commit 4c3874c on PR #238 had one.
- `init`'s starter harnesses use it.

```ts
import { codex, OPENROUTER } from "thunderjar";

export default codex({
  version: "0.166.0",
  provider: OPENROUTER,
  models: { "openai/gpt-6.1-sol": [{ reasoningEffort: { values: ["low", "high"] } }] },
});
```

## Migrate the evals

Convert every Codex harness in `.thunderjar/parameters/harnessModels/` to the helper, e.g. `codex-0.166.0`.

- Replace its own JSONL parsing of the reply and token costs with the helper.
- Check: `bun run tj build --dry-run` output is unchanged, apart from the effort flag.
- Convert it only where the helper gives the same result. List the rest in the PR description, with the reason. Leave `fixtures/` alone.

## Example CLI Output

None: the results of `run` and `show` are unchanged.

## Tests

- Unit tests of the parsing, against a recorded result file, as `claudeCode.test.ts` does.
- Unit tests of the rendered fragment: no provider, `OPENROUTER`, a custom provider, a `command` override.

## Human interventions

None.
