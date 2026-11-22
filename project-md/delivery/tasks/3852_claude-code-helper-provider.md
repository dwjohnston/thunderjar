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
Session Id: session_01LCLeLhdZHdqX3iGhMMBNN6
Supervising engineer: David Johnston

From the "Harness models handoff" planning session. Builds on 3851.

Humans: add your notes here
-->

# 3852: `claudeCode()` takes a provider, models and `command(ctx)`

Gives `claudeCode` the options all four harness helpers share: `provider`, `models` and a `command` function. The pattern that 3853–3855 follow.

## Version bump type

minor

Breaking: `command` no longer takes a string.

## Artifacts

- Shared, exported from `thunderjar`, for all four helpers:
  - `Provider`: `{ baseUrl, apiKeyEnv }`.
  - `OPENROUTER`: `{ baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" }`.
  - `CommandContext<S>`: `{ modelId, model, version, paths: { prompt, model, result, usage }, provider }`. `provider` holds `baseUrl`, `apiKeyEnv` and `wireApi`, or is undefined for the harness's own provider.
- Options of `claudeCode`
  - `version`
  - `models`: optional, overriding a default list of Anthropic model IDs. Required when `provider` is given, since the defaults are Anthropic's IDs.
  - `provider`: must speak Anthropic's Messages API. Passed as `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`. For `OPENROUTER`, use OpenRouter's Anthropic-compatible address, not `/api/v1`: confirm which.
  - `command`: a function of `CommandContext`, never a string.
  - `requiredEnv`: defaults to `[provider.apiKeyEnv]`, or Claude Code's own keys.
- Effort
  - The default models declare `effort` as a variant, passed as `--effort`.
  - Claude Code 2.1.311 takes low, medium, high, xhigh and max.
- Thinking tokens
  - No default sets `MAX_THINKING_TOKENS`.
  - Documented as bespoke customisation, through `command`.
- Environment variables are built as objects, never hand-joined strings.

```ts
import { claudeCode, OPENROUTER } from "thunderjar";

export default claudeCode({
  version: "2.1.311",
  provider: OPENROUTER,
  models: {
    "anthropic/claude-opus-5.5": [
      { effort: { values: ["low", "high"] } },
      { thinkingTokens: { values: [8000, 32000] } },
      { maxTurns: 60 },
    ],
  },
  command: ({ model, paths, provider }) =>
    `ANTHROPIC_BASE_URL="${provider!.baseUrl}" ANTHROPIC_AUTH_TOKEN="$${provider!.apiKeyEnv}"` +
    ` MAX_THINKING_TOKENS=${model.thinkingTokens}` +
    ` claude -p "$(cat ${paths.prompt})" --model "$(cat ${paths.model})" --effort ${model.effort} --max-turns ${model.maxTurns}` +
    ` --output-format json --dangerously-skip-permissions > ${paths.result}`,
});
```

## Migrate the evals

Convert the Claude Code harnesses in `.thunderjar/parameters/harnessModels/` to the new options, e.g. `claude-code-2.1.311`.

- Check: `bun run tj build --dry-run` output is unchanged, apart from the effort flag.
- Leave `fixtures/` alone: tests rely on its files as written.

## Example CLI Output

None: the results of `run` and `show` are unchanged.

## Tests

- Unit tests of the rendered fragment: no provider, `OPENROUTER`, a custom provider, a `command` override.
- Type tests: `models` required with `provider`; `command` rejects a string.

## Human interventions

None.
