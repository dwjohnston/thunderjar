---
"thunderjar": minor
---

A harness declares the models it runs, in `models`, which is required, and a test case may only name those. A model's settings can have variants, such as an effort level, each an extra part of the pair's name, e.g. `codex-0.166.0/openai/gpt-6.1-sol/high`, which the harness's fragment reads as `ctx.model`. `generate` writes the declared names out as a literal union. `claudeCode()` takes `models` too.
