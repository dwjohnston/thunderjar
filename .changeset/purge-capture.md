---
"thunderjar": patch
---

Add `purge capture`, which deletes captured sessions from both stores, `refs/thunderjar/capture/<session>/*` and the `thunderjar/capture/<session>` branches, here or with `--from remote|all` on a remote. Picks sessions by ID, `--older-than`, `--verdict` or `--all`, and takes `-y`, `--dry-run` and `--json`.
