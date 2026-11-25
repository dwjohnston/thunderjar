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
| `.thunderjar/fly-client/watch.test.ts` (`bun run test:fly`) | "stops the machine once the stop deadline has passed" | The fake `fly` rewrote `machines.json` in place. The test could read it half-written, and `eventually(...).catch(() => {})` swallowed the parse error, so it failed in 131ms instead of retrying. Failed CI on [dwjohnston/thunderjar#304](https://github.com/dwjohnston/thunderjar/pull/304). | Fixed in #304: the fake writes to a temp file, then renames. |
| `src/execution/containerRun.test.ts` | "works with the real date" | `date` and Bun's clock disagree. CI once had `date` 253ms ahead. | Tolerance widened to ±1000ms. |

## Slow, or reliant on real timers

| File | Time | Slowest tests | Real timers | Flake risk |
|---|---|---|---|---|
| `src/cli/commands/run/run.more.test.ts` | 44.2s | ~~timeout runs from agent start (5.9s)~~; container never starts (5.8s); ~~agent times out (2.9s)~~; concurrency 2 (2.8s); build concurrency 2 (2.0s) | ~~`fake-sleeper` killed at a real 2s timeout~~; ~~`slowStart` of 3s~~; `slow` 1s builds; `while (started().length < 2) await Bun.sleep(50)`; ~~asserts `finishedAt - startedAt < 10_000`~~ | Medium. Concurrency tests assert line order from real overlap of 1s builds and running agents. |
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

Struck through: solved in d278ebe5. The timeout's timing is tested on `runContainer` with a fake clock, in `src/docker/runContainer.humans.test.ts` and `runContainer.comprehensive.test.ts`.

### `src/cli/commands/run/run.more.test.ts`, by test

| Describe | Test | Real timer | Status |
|---|---|---|---|
| 0204 misbehaving agents | ~~"an agent that times out is killed, and one that exits non-zero or leaves no result file is marked, each measured all the same"~~ | ~~`fake-sleeper` killed at a real 2s timeout~~ | Solved: renamed to "an agent that exits non-zero or leaves no result file is marked…", no timer |
| 0204 misbehaving agents | ~~"the timeout runs from when the agent starts: a container slower to start than the timeout still ends cleanly, and the one that hangs still times out"~~ | ~~`slowStart` 3s, real 2s timeout~~ | Solved: deleted, moved to `runContainer.humans.test.ts` |
| 0204 misbehaving agents | "a container that never starts is that run's outcome, given up on before it exists, and the execution goes on to the end" | `slowStart` 60s, `THUNDERJAR_START_TIMEOUT_SECONDS: "3"` | Open |
| 0206 leaked-secret | "a search that times out doesn't fail the run: it's recorded as not done, and run says so" | `slowStart` 5s | Open |
| 0211 remote runtime | "with concurrency 2, runs two containers at once, writing each line whole, and records every run" | Agent `sleep 1` | Open |
| 0211 remote runtime | "with build concurrency 2, builds both prerun images at once, writing each line whole" | `slow` 1s builds | Open |
| 0211 remote runtime | "with concurrency 2, starts an iteration once its own prerun image is ready, while the next is still building" | `slow` 1s build | Open |
| 0211 remote runtime | "interrupted, it removes its containers from the runtime, killing their agents, runs afterExecution, and exits 143" | `while (started().length < 2) await Bun.sleep(50)` | Open |

## Seen timing out under `bun run test`, 2026-11-25

Two full `bun run test` (`--parallel`) runs on a dev container with 10 cores and load around 2.5. Each test here hit bun's 5s default timeout, and every one passed when its file ran on its own. Which tests time out changes from run to run: the first run had 3, the second 6. So the cause looks like contention under `--parallel`, not a broken test. The serial times above don't show this.

| File | Test | Timed out in | Notes |
|---|---|---|---|
| `src/cli/commands/run/run.runner.test.ts` | "has the runtime build and push the images, then the runner runs, measures, pushes and records the execution, and run only follows it" | both runs | |
| `src/cli/commands/run/run.runner.test.ts` | "images already in the image store are neither built nor pushed" | both runs | |
| `src/cli/commands/run/run.runner.test.ts` | "--json prints the execution and its container runs, as the runner recorded them, and --timings both sides' phases" | second run | |
| `src/cli/commands/run/run.runner.test.ts` | "a test case's secretEnv reaches the runner without runner.env, and its env with the plan: the agent sees both, and only names are recorded" | second run | |
| `src/cli/commands/build/build.test.ts` | "with build concurrency 2, builds two at once, writing a line as each starts and ends" | both runs | Already above: 1s `slow` builds. |
| `src/cli/commands/run/run.more.test.ts` | "a clean run, and one whose secrets are too short to search for, record nothing, and run says nothing" (0206 leaked-secret) | second run | |

### Failing, not a timeout

| File | Test | Notes |
|---|---|---|
| `src/cli/logging.test.ts` | "without --log-file: a new file in .thunderjar/logs/, named for when and the command" | Fails on an assertion, "Received length: 2", in both full runs and when the file runs alone. Also fails at the commit before the services refactor (4938a2d5), so it wasn't caused by it. Not the verbose logging flake under Known flaky. |

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
