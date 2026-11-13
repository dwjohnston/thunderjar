---
"thunderjar": patch
---

Add `beforeExecution` and `afterExecution` to a runtime in `thunderjar.config.ts`: commands `run` runs once before the execution and once after it, e.g. to start a remote runtime and size it for the execution, then release it. Each is given `THUNDERJAR_CONCURRENCY`, `THUNDERJAR_CONTAINERS` and `THUNDERJAR_EXECUTION_ID`.
