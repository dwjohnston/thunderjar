---
"thunderjar": patch
---

Add a `remeasure <test case | execution>` command. It takes the task's measurements, as they are on disk now, of past container runs, each in a new measurement container from its postrun image, without running the agent again. The new measures are what `show` shows; the earlier ones are kept beside them, in the record's `earlierResults`. Runs whose postrun image was purged, or whose container never started, are skipped and listed. Supports `--json`.
