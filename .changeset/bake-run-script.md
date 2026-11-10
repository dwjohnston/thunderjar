---
"thunderjar": minor
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: Claude
Session Id: session_01LCLeLkGEjKg1CyLY5YY6bJ
Supervising engineer: Claude

Humans: add your notes here
-->

Write everything a run needs into the prerun image, with each parameter's `applyParameter`. Running an iteration is then just `sh /thunderjar/thunderjar-run.sh`, so a prerun image can be run, or read, without the project's config.

- A harness's fragment installs the agent and writes `/thunderjar/thunderjar-run.sh` and `/thunderjar/model.txt`, with the new `writeRunScript(command)` and `writeModel(ctx.modelId)`. It gets the pair's model ID as `ctx.modelId`. `claudeCode()` and the `init` starters do this for you.
- An initial prompt's fragment writes `/thunderjar/prompt.txt`, with the new `writePrompt(text)`.
- The helpers are `COPY <<'EOF' <path>` heredocs, so the Dockerfile shows what's written. `writeFile(path, contents)` writes any other file.
- The script runs in the image's working directory. A code state or initial prompt fragment can set `WORKDIR`, e.g. to run the agent in one package of a monorepo, and measurements run there too.
- Breaking: a harness's `cli` is gone, and so is `claudeCode`'s `cli` option, now `command`. Write the run script in `applyParameter`.
- Breaking: an initial prompt's `prompt` field is gone. Write it with `applyParameter: () => writePrompt("…")`.
- Breaking: multi-turn initial prompts (`turns`) and per-run session IDs are removed, for now.
- Breaking: each model and initial prompt has its own prerun image, so every image and permutation hash changes. They share every layer below the one they differ in.
