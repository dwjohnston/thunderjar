---
"thunderjar": patch
---

`thunderjar plan <test case>` summarises the parameters a test case names. A broken `.thunderjar/` folder is reported by `plan` and `generate` as `Error:` lines naming the file and field, with exit code 1, instead of a stack trace.
