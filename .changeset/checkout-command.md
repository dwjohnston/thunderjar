---
"thunderjar": patch
---

Add `checkout <run>`, which brings a container run's end state back as a local branch, `thunderjar/run/<test case>/<execution>/<run>`: the agent's commits, plus a commit of anything it left uncommitted. `--shell` opens a shell in its postrun image instead, on the configured runtime.
