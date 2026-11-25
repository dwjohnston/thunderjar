---
name: codestate-tags-via-resolve
description: Code states should name a tag in config, resolve it to a SHA in `resolve`, and keep applyParameter deterministic
metadata:
  type: feedback
---

Code states name a pushed tag (e.g. `eval/<task>`) in `config`, not a raw commit SHA. A tag or branch must never appear in `applyParameter`: look it up in `resolve` (`git ls-remote`) and pin `ctx.resolved`.

**Why:** applyParameter must be deterministic (the canonical rule); tags are readable and survive squash-merges.

**How to apply:** any skill, example or scaffold that writes a code state.
