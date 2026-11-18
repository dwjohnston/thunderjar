---
"thunderjar": patch
---

`thunderjar capture` can keep each session on a branch, `thunderjar-capture/<session>`, for remotes that take only branches: set `THUNDERJAR_CAPTURE_STORE=branch`, the default in Claude Code cloud sessions. `capture list` and `capture push` read both stores, and `capture import` copies branch captures into `refs/thunderjar/capture/`.
