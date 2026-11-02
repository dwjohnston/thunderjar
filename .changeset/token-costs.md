---
"thunderjar": patch
---

Collect each container run's token costs with its harness's `collectTokenCosts`, summed across turns, and record them. `run` prints each run's cost, or its tokens when its cost can't be trusted, `show` adds the mean tokens and cost of each permutation, and the per-model breakdown of one container run. The library exports `claudeCodeTokenCosts` and `claudeCodeReply`, which read `claude -p --output-format json`, and `init`'s Claude Code harness uses them.
