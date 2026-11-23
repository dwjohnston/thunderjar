---
"thunderjar": patch
---

Add `codex()`, a whole Codex harness in one call, with `provider`, `models`, `command(ctx)` and `requiredEnv`, and its readers, `codexReply` and `codexTokenCosts`. A `provider` is set up as a `model_providers` entry on the Responses API. Its default models declare `reasoningEffort` as a variant. `init`'s Codex starter uses it. A `Provider` may have a display `name`; `OPENROUTER`'s is `OpenRouter`.
