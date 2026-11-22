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

From the "Harness models handoff" planning session. Replaces 4400 and PR #240, whose helper was "the best of the lot": follow its pattern. Builds on 3852.

Humans: add your notes here
-->

# 3855: `opencode()` helper

An OpenCode harness in one call, with the options 3852 gave `claudeCode`: `provider`, `models` and `command(ctx)`. Moves OpenCode's reply and token-cost parsing out of the project files and into `src/api`.

## Version bump type

patch

## Artifacts

- Adds `opencode()` to `src/api`, exported like `claudeCode`.
- Default: OpenCode Zen, `OPENCODE_API_KEY`, a default list of model IDs.
- Model IDs take OpenCode's own form, provider first, e.g. `openrouter/anthropic/claude-haiku-5.5`.
- `models` settings
  - OpenCode's own per-model config, `options` and `limit`, written into its config for that model.
  - e.g. `options.reasoningEffort` as a variant.
- `provider`
  - Set up as an OpenAI-compatible provider, with wire API `chat`.
  - Passed in `OPENCODE_CONFIG_CONTENT`, with the key as `{env:VAR}`.
  - `OPENCODE_CONFIG_CONTENT` isn't in OpenCode's docs. It was checked against 1.19.5: the binary reads it, and `opencode debug config` shows it merged.
- `init`'s starter harnesses use it.

```ts
import { opencode, OPENROUTER } from "thunderjar";

export default opencode({
  version: "1.19.5",
  provider: OPENROUTER,
  models: {
    "openrouter/openai/gpt-5.5": [{ options: { reasoningEffort: { values: ["low", "high"] } } }],
  },
});
```

## Migrate the evals

Convert every OpenCode harness in `.thunderjar/parameters/harnessModels/` to the helper, e.g. `opencode-1.19.5`.

- Replace its own JSONL parsing of the reply and token costs with the helper.
- Check: `bun run tj build --dry-run` output is unchanged.
- Convert it only where the helper gives the same result. List the rest in the PR description, with the reason. Leave `fixtures/` alone.

## Example CLI Output

None: the results of `run` and `show` are unchanged.

## Tests

- Unit tests of the parsing, against a recorded result file, as `claudeCode.test.ts` does.
- Unit tests of the rendered fragment: no provider, `OPENROUTER`, a custom provider, a `command` override.

## Human interventions

None.
