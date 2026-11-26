---
"thunderjar": patch
---

Add the `toolCalled` and `fileRead` instruments, and `declareHarness`'s `collectToolCalls`, which `claudeCode()`, `codex()`, `copilot()` and `opencode()` set. Each tool call keeps the harness's own name for its tool, e.g. `Read` or `view`, and has a kind every harness shares, e.g. `read` or `shell`. `fileRead` counts read tools and shell commands such as `cat` or `grep` given the file.
