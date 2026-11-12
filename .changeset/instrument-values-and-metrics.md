---
"thunderjar": minor
---

Breaking: measurements declare `metrics` instead of `aggregate`, and instruments store values of any shape.

- `aggregate` is removed. A measurement declares one or more `metrics`, each `{ score?, stat, better? }`: `metrics: { count: { stat: "mean" } }` replaces `aggregate: ["mean"]`. A `score` reads a number or a boolean from the instrument's value, or `undefined` where the metric doesn't apply; left out, the instrument's default score is used. Metrics are computed when results are read, so changing one needs no remeasuring. `show` has a column per metric, `<measurement>.<metric>`.
- `templateTest` is replaced by `bunTestFile`: an ordinary Bun test file, which reads the agent's file from `Bun.env.THUNDERJAR_SUBJECT`. Its value is `{ passed, total }`, and its default score the pass rate.
- `shell`'s stored value is now `{ exitCode, stdout, stdoutTruncated }`, not a boolean. Its default score is still whether it exited 0. stdout is stored as it is, up to 64 KiB, so a command that prints secrets will persist them.
- Measures stored before this release are stale: their content hash now includes the instrument's version. Run again to measure them.
