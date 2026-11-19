---
"thunderjar": patch
---

A container run's record can say that its postrun image was purged: when, from where (the local daemon, the image store, or both), and why. `show` lists an execution's purged runs below its table, and a container run's purge beside its postrun image; `--json` and `view`'s API include it. Its measures still count.
