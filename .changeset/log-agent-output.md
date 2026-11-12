---
"thunderjar": patch
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: c07c882c-639c-493c-8957-caa40aa841ac
Supervising engineer: blacksheep-bot
-->

Say in the run log why an agent failed. Each turn's standard error now goes to a `stderr.log` beside its result file, which is also kept in the postrun image. When an agent exits non-zero or times out, the log gets a `WARN` with the end of each turn's standard error and result file.
