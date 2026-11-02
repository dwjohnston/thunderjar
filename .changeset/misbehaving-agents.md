---
"thunderjar": patch
---

Enforce an initial prompt's `timeoutSeconds`: an agent still running after it is killed, and its container committed and measured all the same. `run` says whether each agent timed out, exited non-zero or left no result file, `show` lists those container runs below an execution's table, and shows how one ended. A timed out run makes the execution `failed`.
