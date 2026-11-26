---
"thunderjar": minor
---

`claudeCode()` takes a `provider`, e.g. `OPENROUTER`, with `models` by the provider's IDs, and `requiredEnv`. A model's `effort` setting is passed as `--effort`, e.g. `{ effort: { values: CLAUDE_CODE_EFFORTS } }`. Breaking: `command` is now a function of a `CommandContext`, `{ modelId, model, version, paths, provider }`, not a string, and `CLAUDE_CODE_COMMAND` is that function.
