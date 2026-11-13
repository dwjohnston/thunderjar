---
"thunderjar": patch
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLkjATuQXxaawiKKoPy
Supervising engineer: David Johnston
-->

Run a whole execution on the runtime machine, not command by command from the host. Opt in with `runtime.runner` in `thunderjar.config.ts`.

- `run` builds a runner image, holding Thunderjar and the project's `.thunderjar/` folder, pushes it to the image store, and starts it on the runtime as a container with the runtime's Docker socket.
- The runner runs each container, collects and measures it, pushes its postrun image and writes every record to the run data store. The host only follows its progress, with the same output and `--json` as before.
- The variables the execution needs, e.g. model API keys and the run data store's URL, are sent to the runner as it starts, and kept in memory only.
- Ctrl-C detaches from the execution instead of stopping it. `thunderjar attach <execution ID>` follows it again, and `attach --stop` stops it.
- Without `runtime.runner`, and with `run --local`, nothing changes.
