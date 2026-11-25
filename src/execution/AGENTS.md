@HUMANS.md

# `src/execution`

## The run architecture

`run` lives in [run/](run/). Read [run/AGENTS.md](run/AGENTS.md) before changing it: the three levels, the rules, how to test and how to add things.

## What is where

- **`run/`**
  - Everything `run` does, on injected services.
- **Files beside it that `run` uses**
  - Naming images and containers, the prerun Dockerfile, hashing permutations, the run script, the secret search, measuring, and reading the agent's output.
  - Other commands use these too. Image and container names are how `show`, `checkout`, `remeasure` and `purge` find what a run left, so keep them as they are.
- **Files for the other commands**
  - `remeasure.ts`, `checkout.ts`, `purge.ts`, `runtimeProbe.ts`, `aggregate.ts`.
  - These are still on the old path: they call the functions in `src/docker` directly, and take no `Dependencies`.

## Gone with the old `run`

The runner container, the `plan` and `build` commands and `run --local` were deleted, with their modules here.

✅ **Do** look in `run/` for what replaced something you remember.

| Was | Now |
|---|---|
| `runExecution.ts`, `containerRun.ts` | `run/runManifest.ts`, `run/runPermutation.ts`, `run/parseExecution.ts` |
| `planExecution.ts` | `run/resolveTestCase.ts`, `run/plan.ts` |
| `prerunBuilds.ts`, `inParallel.ts` | `run/ensureImages.ts`, `run/scheduler.ts` |
| `runtimeHooks.ts` | `runTestCase` in `run/`, through the `CommandRunner` service |
| `ulid.ts` | `ulid()` on the `Random` service |
| `timings()` in `timings.ts` | `run/timed.ts`. `timings.ts` keeps only `PHASES` and its types. |
| `runner*.ts`, `onRuntime.ts` | Nothing. The runtime is reached through `runtime.command`. |

❌ **Don't** bring back a runner, or code that asks whether it is running on the runtime.

**Why:** `runtimeDocker` is plain Docker reached with the config's `runtime.command`. Nothing of Thunderjar runs on the runtime.

`imageStore.ts` keeps only `checkImageStore` and `ImageStoreLoginError`. `doctor` and `purge` call `checkImageStore`. `run` checks the login in `ensureImages`, on `hostDocker`, and throws the same error.
