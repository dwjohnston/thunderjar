---
"thunderjar": patch
---

Every parameter's `declareX()` (`declareBaseImage`, `declareCodeState`, `declarePromptSet`, `declareHarness`, `declareInitialPrompt`) takes an optional `config` and an `applyParameter(config, ctx)` that returns the Dockerfile fragment applying it. `config` is typed from the declaration's own `config`; `ctx.dir` is the parameter's folder in the build context, and a harness also gets `ctx.version`. A base image's `applyParameter` is required and must start with `FROM`.
