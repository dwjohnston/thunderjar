---
"thunderjar": patch
---

Add `--json` to `executions`, `plan`, `doctor`, `build` and `run`, like `show --json`: the command's results on stdout as JSON, for scripts. With `--json`, progress and human-readable text go to stderr instead. `build --dry-run --json` and `run --dry-run --json` print the dry run as JSON.
