---
"thunderjar": patch
---

Run several containers at once.

- `runtime: { command: [...], concurrency: 4 }` in `thunderjar.config.ts` runs up to 4 iterations' containers on the runtime at once. It defaults to 1, one after another, as before.
- `run --concurrency <n>` overrides it for one run, including with `--local`.
- With more than one at once, `run` writes `Up to <n> containers at once`, then each line whole, starting with its iteration: `started`, how its agent ended, its postrun push, and its measures.
- If Docker fails, no more containers start, and those running finish before `run` stops.
