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

Add a diagnostic log. Each command writes what it's doing to a new file in `.thunderjar/logs/`: each image build, container run and measurement, and with `-v`, each Docker command, with Docker's whole error output when it fails. Set where with `--log-file` or `THUNDERJAR_LOG_FILE`, and how much with `-v`, `--log-level` or `THUNDERJAR_LOG_LEVEL`. Nothing of it is written to the terminal. `init` now git-ignores `logs/`: add `logs/` to `.thunderjar/.gitignore` in a project initialised before.
