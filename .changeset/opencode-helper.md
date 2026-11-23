---
"thunderjar": patch
---

Add `opencode()`, a whole OpenCode harness in one call, with `provider`, `models`, `command(ctx)` and `requiredEnv`, and its readers, `opencodeReply` and `opencodeTokenCosts`. A model's settings are OpenCode's own per-model config, `options` and `limit`, e.g. `{ options: { reasoningEffort: { values: ["low", "high"] } } }`, written into `OPENCODE_CONFIG_CONTENT`. A `provider` is set up there as an OpenAI-compatible one, its key as `{env:…}`. `init`'s OpenCode starter uses it.
