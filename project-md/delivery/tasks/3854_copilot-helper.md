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

From the "Harness models handoff" planning session. Replaces 4300 and PR #239. Builds on 3852.

Humans: add your notes here
-->

# 3854: `copilot()` helper

A Copilot harness in one call, with the options 3852 gave `claudeCode`: `provider`, `models` and `command(ctx)`. Moves Copilot's reply and token-cost parsing out of the project files and into `src/api`.

## Version bump type

patch

## Artifacts

- Adds `copilot()` to `src/api`, exported like `claudeCode`.
- Default: GitHub Copilot, `COPILOT_GITHUB_TOKEN`, a default list of model IDs.
- `models` settings
  - `wireApi`, overriding the helper's choice for that model.
  - No effort setting is known for Copilot.
- `provider`
  - Passed as `COPILOT_PROVIDER_*` variables.
  - Wire API: `responses` for `openai/` models, else `chat`. On Chat Completions, OpenAI rejects Copilot's tool list (gauntlet run 6).
- Usage
  - The helper wraps any command: it clears the usage file, runs the command, and appends the usage line to the result.
  - An override passes `--usage-output-file ${paths.usage}`. Without it, the run still works and token costs are unavailable.
- No `copilotCommand` or other command builders.
- `init`'s starter harnesses use it.

```ts
import { copilot, OPENROUTER } from "thunderjar";

export default copilot({
  version: "1.0.105",
  provider: OPENROUTER,
  models: { "openai/gpt-5.5": [], "google/gemini-3-pro": [{ wireApi: "responses" }] },
});
```

## Migrate the evals

Convert every Copilot harness in `.thunderjar/parameters/harnessModels/` to the helper, e.g. `copilot-1.0.105`.

- Replace its own parsing of the reply and token costs with the helper.
- Check: `bun run tj build --dry-run` output is unchanged.
- Convert it only where the helper gives the same result. List the rest in the PR description, with the reason. Leave `fixtures/` alone.

## Example CLI Output

None: the results of `run` and `show` are unchanged.

## Tests

- Unit tests of the parsing, against a recorded result file, as `claudeCode.test.ts` does.
- Unit tests of the rendered fragment: no provider, `OPENROUTER` with each wire API, a custom provider, a `command` override with and without the usage flag.

## Human interventions

None.
