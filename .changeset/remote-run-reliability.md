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

Make executions on a remote runtime more reliable, faster, and easier to debug.

- `run` checks the run data store before it builds or starts anything, reports a store failure as an error rather than a stack trace, and retries a failed Postgres query twice.
- On a remote runtime, each postrun image is removed once it's pushed and measured, so the runtime's disk no longer grows by an image per container run. Set `runtime.keepPostrunImages: true` to keep them.
- `run` interrupted with Ctrl-C or SIGTERM removes its execution's containers and runs the runtime's `afterExecution`, instead of leaving agents and the runtime running.
- A container run's measurements are taken three at a time, and while its postrun image is pushed.
- `run` ends with the agents that didn't end cleanly, grouped by how and why. The hint of why, in `run` and `show`, is the error the harness reported in its result file, e.g. `402: This request would exceed your available credits`, ahead of the last line of its stderr.
- `run --timings` prints how long each phase took. The log has the same, each push and pull's duration, the runtime's disk usage before and after, and why token costs were unparseable.
- A failed build's error includes the end of the failed step's output, not only Docker's last line.
