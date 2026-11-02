---
"thunderjar": patch
---

An initial prompt can be a list of `turns`, beside a single `prompt`. Each turn runs the harness's `cli` again in the same container, with `ctx.turn` and `ctx.sessionId`, a fresh UUID per container run, so the agent can resume its session. Each turn's reply is recorded, `replyMatches` takes an optional `turn`, `run --dry-run` prints each turn's command, and `show` each turn's reply. The timeout covers every turn together, and a turn that exits non-zero stops the turns after it.
