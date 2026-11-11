---
"thunderjar": patch
---

Build several prerun images at once with `build: { concurrency: <n> }` in `thunderjar.config.ts`. With it, or a runtime `concurrency`, above 1, `run` starts each iteration as soon as its own prerun image is built, pushed and pulled, instead of waiting for every image first.
