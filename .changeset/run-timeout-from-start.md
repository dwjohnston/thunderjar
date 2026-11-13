---
"thunderjar": patch
---

`run`: an agent's timeout now counts from when its container has started, not from `docker run`, so a runtime that's slow to start a container no longer eats into it. A container that never starts, within 10 minutes (`THUNDERJAR_START_TIMEOUT_SECONDS`), or whose `docker run` fails before it does, is recorded as that run's outcome, `failed to start`, with why, and the execution goes on with its other runs instead of stopping.
