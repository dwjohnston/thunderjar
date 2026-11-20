---
"thunderjar": patch
---

Add the `commits` instrument: the commits the agent made since `refs/thunderjar/start`, oldest first, each with its `sha`, `message` and `files` added, modified and deleted. Also exports the `Commit` and `FileChanges` types.
