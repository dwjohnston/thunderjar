---
"thunderjar": patch
---

Add the `filesChanged` instrument: everything changed since `refs/thunderjar/start`, committed or not, as one `FileChanges`. Untracked files count as added, git-ignored ones are left out, and a rename is a deletion plus an addition. `glob` limits it to matching paths.
