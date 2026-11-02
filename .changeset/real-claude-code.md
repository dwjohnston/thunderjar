---
"thunderjar": patch
---

`init`'s Claude Code harness now runs as it is: it installs Claude Code as root, then runs it as the image's non-root `node` user, so it can skip its permission prompts, reads the prompt from its file, asks for JSON, reads its reply and token costs from it, and starts a session on the first turn and resumes it on the next.
