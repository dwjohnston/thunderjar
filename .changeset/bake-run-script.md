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

Bake everything a run needs into the prerun image. Each image now holds the model ID at `/thunderjar/model.txt`, the initial prompt, and `/thunderjar/thunderjar-run.sh`, the script that runs the harness's `cli` for each turn. Running an iteration is just `sh /thunderjar/thunderjar-run.sh`, so a prerun image can be run, or read, without the project's config.

- The script runs in the image's working directory. A code state or initial prompt fragment can set `WORKDIR`, e.g. to run the agent in one package of a monorepo, and measurements run there too.
- Breaking: each model and initial prompt now has its own prerun image, so every image hash changes. They share every layer below the model.
- Breaking: the prompts of a multi-turn initial prompt are at `/thunderjar/prompts/<n>.txt`, not `/thunderjar/turns/<n>/prompt.txt`. Results are still at `/thunderjar/turns/<n>/result.json`.
- Breaking: a harness's `ctx.sessionId` is now `$THUNDERJAR_SESSION_ID`, read as the command runs, rather than the UUID itself.
