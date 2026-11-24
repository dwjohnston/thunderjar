<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLiaD9ag4hZ5NydoFDz
Supervising engineer: Claude

Humans: add your notes here

-->

# Slow, flaky and real-timer tests

Snapshot of 2026-11-24. Covers the default `bun test` suite (98 files, 1070 tests).

- **Time** is the file's total, from one serial `bun test` run with the JUnit reporter (152s in all). `bun run test` runs files in parallel, so wall-clock is lower.
- **Real timers** means the test waits on wall-clock time: `Bun.sleep`, a timeout in seconds, polling, or `Date.now()`.
- Fake Docker delays come from `src/testing/fakeDocker.ts`:
  - `slow` makes a build take 1s.
  - `slow-start` delays `docker run` by N seconds.
  - `logs --follow` and `stop` poll every 50ms.

## Known flaky

| File | Test | Cause | Status |
|---|---|---|---|
| `src/capture/branch.test.ts` | "pushes only a branch store to a remote…" | `afterEach` runs `rm -rf` without `.nothrow()` while a git process may still write into the folder. | Open, [dwjohnston/thunderjar#234](https://github.com/dwjohnston/thunderjar/issues/234). |
| `src/capture/capture.test.ts`, `src/cli/logging.test.ts` | the verbose logging test | Bun faulted (`EEXIST` from `epoll_ctl`) on pino's lazy first load under `--parallel`. | Worked around in 6aacf40 by loading pino before any test runs. |
| `src/execution/containerRun.test.ts` | "works with the real date" | `date` and Bun's clock disagree. CI once had `date` 253ms ahead. | Tolerance widened to ±1000ms. |

## Slow, or reliant on real timers

| File | Time | Slowest tests | Real timers | Flake risk |
|---|---|---|---|---|
| `src/cli/commands/run/run.more.test.ts` | 44.2s | timeout runs from agent start (5.9s); container never starts (5.8s); agent times out (2.9s); concurrency 2 (2.8s); build concurrency 2 (2.0s) | `fake-sleeper` killed at a real 2s timeout; `slowStart` of 3s; `slow` 1s builds; `while (started().length < 2) await Bun.sleep(50)`; asserts `finishedAt - startedAt < 10_000` | Medium. Concurrency tests assert line order from real overlap of 1s builds and running agents. |
| `src/cli/commands/run/run.runner.test.ts` | 21.4s | never starts on the runner (3.8s); connection drops while following (3.7s) | `THUNDERJAR_START_TIMEOUT_SECONDS: "3"`; `startSlowRun` polls for a file, then `await Bun.sleep(300)` to guess run is following | Medium. The fixed 300ms sleep is a guess, not a signal. |
| `src/cli/commands/run/run.test.ts` | 17.9s | is-prime-baseline (4.6s); failed execution (2.9s); unreachable Postgres (2.7s) | Unreachable Postgres waits out real connection retries | Low |
| `src/docker/docker.test.ts` | 13.5s | timed-out container it can't kill (10.1s); start marker (2.5s) | Three `docker kill` tries 2s apart, asserted `< 20_000ms`; `slowStart` 2s with a 1s timeout | Low to medium. The start-marker test depends on 2s start vs 1s timeout vs `sleep 0.5`. |
| `src/cli/commands/build/build.test.ts` | 9.1s | build concurrency 2 (4.3s) | 8 images × 1s `slow` builds | Low to medium. Asserts the first two lines are both `Building` before either ends. |
| `src/cli/commands/plan/plan.test.ts` | 7.6s | many small tests, none over 0.6s | none | Low |
| `src/capture/capture.test.ts` | 5.3s | gives each capture its verdict (1.7s) | none (real git) | See known flaky |
| `src/store/runDataStore.test.ts` | 2.6s | unreachable Postgres named by its label (2.5s) | Real retry delays to `127.0.0.1:1`; another test asserts `>= 60ms` elapsed | Low |
| `src/cli/logging.test.ts` | 2.5s | default logging (1.0s) | none | See known flaky |
| `src/cli/commands/purge/purge.test.ts` | 3.3s | none over 0.4s | `--older-than` computed from `Date.now()` against a fixed date | Low. Rounds down to whole hours, so a slow run crossing an hour boundary still lands between 2026-10-02 and 10-04. |
| `src/cli/commands/purge/purgeCapture.test.ts` | 2.0s | none over 0.5s | Capture dates are `Date.now() - daysAgo` | Low |
| `src/execution/runnerSpec.test.ts` | <1s | `receiveSubmission` | `await Bun.sleep(350)` before writing the file; a 200ms give-up | Low |
| `src/execution/inParallel.test.ts` | <1s | — | Jobs `Bun.sleep(5)`; asserts max concurrency and start order | Low to medium. Order assertions rely on 5ms jobs not finishing out of order. |
| `src/execution/containerRun.test.ts` | <1s | "works with the real date" | `Date.now()` vs `date` | See known flaky |

## Excluded from `bun test`, slow by design

Not timed here. They need Docker, a real model or Fly.io.

| File | Kind |
|---|---|
| `src/docker/docker.docker.test.ts` | Docker |
| `src/instruments/commits/commits.docker.test.ts` | Docker |
| `src/instruments/filesChanged/filesChanged.docker.test.ts` | Docker |
| `src/cli/commands/build/build.docker.test.ts` | Docker |
| `src/cli/commands/build/codeStateGitCheckout.docker.test.ts` | Docker |
| `src/cli/commands/checkout/checkout.docker.test.ts` | Docker |
| `src/cli/commands/remeasure/remeasure.docker.test.ts` | Docker |
| `src/cli/commands/purge/purge.docker.test.ts` | Docker. Polls a local registry: 50 × `Bun.sleep(100)`. |
| `src/cli/commands/run/run.docker.test.ts` | Docker. Real 2s agent timeout. |
| `src/cli/commands/capture/capture.docker.test.ts` | Docker, plus a real model in step 4. Up to 900s. |
| `src/cli/commands/run/run.agent.test.ts` | Real model |
| `src/capture/capture.agent.test.ts` | Real model |
| `.thunderjar/fly-client/fly.real.test.ts` | Fly.io, up to 1200s |
