---
"thunderjar": patch
---

`purge image --from store` now covers runs recorded before pushed image references were recorded. Their records name the postrun image by its local name, so they were treated as never pushed: nothing was deleted from the store for them, and `--record-only` marked none of them. With an image store, such a run is now purged from the store under the name it was pushed as.
