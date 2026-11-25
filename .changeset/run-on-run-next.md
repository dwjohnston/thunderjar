---
"thunderjar": minor
---

`run` is reimplemented, and what it prints has changed.

- It shows one view of the whole execution, redrawn each second on a terminal: each prerun image and each run, with how it ended and its measures.
- `run --json` prints the final run state: the manifest, each run's status and record, and the execution's record.
- `run --dry-run --json` prints the manifest.
- New: `run --build-only` builds, or pulls, the prerun images and runs nothing.
- Removed: `run --local`. To run on the local Docker daemon, use a config without a `runtime`.
- Every prerun image is ready before the first run starts.
- An agent that exits non-zero or times out is still committed, recorded and pushed, but no longer measured.
- Docker failing under one run fails that run, not the whole execution.
- Execution IDs are lower case.
- New settings, from the environment: `THUNDERJAR_CONCURRENCY`, `THUNDERJAR_UPLOAD_BACKLOG_CAP`, `THUNDERJAR_UPLOAD_CONCURRENCY` and `THUNDERJAR_CACHE_WARMUP_MS`.
