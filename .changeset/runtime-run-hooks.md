---
"thunderjar": patch
---

Add `beforeRun` and `afterRun` to a runtime in `thunderjar.config.ts`: commands `run` runs once before the run and once after it, e.g. to start a remote runtime and size it for the run, then stop it. Each is given `THUNDERJAR_CONCURRENCY`, `THUNDERJAR_CONTAINERS` and `THUNDERJAR_EXECUTION_ID`.
