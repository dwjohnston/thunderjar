---
"thunderjar": minor
---

`run` is rebuilt on injected services, and `--local` is removed from `run` and `build`.

- **Breaking:** `run --local` and `build --local` are gone. To choose between the local Docker daemon and a runtime per command, have `thunderjar.config.ts` read an environment variable, and give `runtime` only when it's set.
- `run` builds, pushes and pulls every prerun image before the first container starts.
- Postrun images are pushed in the background, a few at once, so a container's slot frees up as soon as it's committed.
- A container that never starts, or that Docker fails under, is that run's outcome. The other runs still run, and the execution is recorded as `failed`.
- A run that times out is committed and recorded, but not measured.
- With more than one container at once, the first iteration of each permutation gets 5 seconds to write the prompt cache before the rest start. `THUNDERJAR_CACHE_WARMUP_MS` changes it.
- `run --build-only` builds the missing prerun images and stops.
- `THUNDERJAR_CONCURRENCY` sets how many containers run at once, over the runtime's `concurrency` and under `--concurrency`.
