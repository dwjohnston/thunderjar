---
"thunderjar": patch
---

Add parameter overrides to `run`: `--base-image`, `--code-state`, `--prompt-set`, `--harness-model`, `--initial-prompt` and `--iterations` each replace one of the test case's lists for one execution, comma-separated. An unknown name fails before anything builds, listing the known ones. The execution records its overrides, and `executions` and `show` list them.
