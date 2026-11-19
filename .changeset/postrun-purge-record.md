---
"thunderjar": patch
---

Add `thunderjar purge image`, which deletes the images executions left, from the local Docker daemon and the image store, and records each postrun image purged on its container run. Choose executions by ID, `--test-case` or `--all`, narrowed with `--older-than`, and prerun images with `--kind prerun`. It says what it would purge and asks first; `--yes` skips the question, `--dry-run` only prints, and `--record-only` marks images removed some other way. The image store is purged through the registry's standard API, or, where the registry refuses deletes, by the new `imageStore.deleteCommand`. `show` lists an execution's purged runs below its table, and a container run's purge beside its postrun image; `--json` and `view`'s API include it. A purged run's measures still count.
