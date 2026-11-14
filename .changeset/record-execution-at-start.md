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

`run` records an execution as it starts, before the runtime's `beforeExecution` and any build, so one that fails before its first container run is no longer lost. If it stops on an error, or is interrupted, it's recorded as `failed`, with what it was doing (`beforeExecution`, `build`, `push`, `pull`, `run`, `measure`, `store`, `docker` or `interrupted`) and the error `run` printed.

- `executions` shows what it was doing after its status, e.g. `failed (build)`.
- `show <execution>` shows `Failed at` and the error, above the container runs, of which there may be none. A running execution shows the phase it got to.
- Records gain two optional fields, `phase` and `failure`, in `--json` output too. Executions recorded before keep reading as they did.
- Interrupted while its prerun images are being built, `run` now starts no container once the build finishes, and the execution is always recorded as failed, even if its container runs don't settle in time.
