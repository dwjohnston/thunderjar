---
"thunderjar": patch
---

Write the initial prompt to a file in the container, `ctx.promptPath`, so a harness's `cli` can pass it to the agent intact, quotes, `$`, backticks and newlines included. `init`'s Claude Code harness reads it with `claude -p "$(cat ...)"`, and `run --dry-run` shows the prompt beside the command.
