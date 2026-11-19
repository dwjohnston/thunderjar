---
"thunderjar": patch
---

A harness's `requiredEnv` can name any one of several variables, `{ oneOf: ["A", "B"] }`: the first that's set is passed to the agent, and only it, and the run's record (`harnessEnv`) and `show` name it. `claudeCode()` now needs `CLAUDE_CODE_OAUTH_TOKEN`, a subscription token from `claude setup-token`, or `ANTHROPIC_API_KEY`, and passes the token if both are set. Its harnesses' permutation hashes change, so their prerun images are rebuilt once.
