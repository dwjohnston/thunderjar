---
"thunderjar": patch
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLhpmETxGQ7SW8synkm
Supervising engineer: David Johnston
-->

Add a diagnostic log. Pass `--log-level <level>`, or set `THUNDERJAR_LOG_LEVEL`, and Thunderjar writes what it's doing to stderr as JSON lines: each Docker command, image build, container run and measurement, with Docker's whole error output when it fails. It's silent by default, and a command's output is unchanged.
