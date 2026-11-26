---
"thunderjar": patch
---

Add `copilot()`, a whole GitHub Copilot CLI harness in one call, with `provider`, `models`, `command(ctx)` and `requiredEnv`, and its readers, `copilotReply` and `copilotTokenCosts`. A `provider` is passed as `COPILOT_PROVIDER_*` variables, on the Responses API for `openai/` models and Chat Completions otherwise; a model's `wireApi` setting overrides that. Any command is wrapped so Copilot's usage file is appended to its result. `init`'s Copilot starter uses it.
