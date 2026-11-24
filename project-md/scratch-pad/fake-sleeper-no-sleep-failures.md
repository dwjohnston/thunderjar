<!--
🤖
This file was created with AI

Harness: Claude Code
Supervising engineer: David Johnston

Humans: add your notes here

-->

# Failing tests with fake-sleeper's `sleep 300` removed

Snapshot of 2026-11-24, toward [no ambient non-determinism](../../../thunderjar-nand/project-md/scratch-pad/no-ambient-nondeterminism-migration.md).

## Fake harnesses with real waits

Only `fake-sleeper` (scenario 0204) waited. Its run script ran `sleep 300`, so it always hit the 2s timeout in `initial-prompts/plain.ts`.

The selected test (`the timeout runs from when the agent starts…`) also waits on `fakeDocker({ slowStart: { "-3-1": 3 } })`, a 3s wait in `src/testing/`, not a fixture.

`bun run test`: 994 pass, 9 fail. Failing files then re-run alone with `bun test`.

## Fail every time

| Test | File | Error | Likely cause |
|---|---|---|---|
| 0204 misbehaving agents > an agent that times out is killed, and one that exits non-zero or leaves no result file is marked… | src/cli/commands/run/run.more.test.ts | toEndWith | fake-sleeper no longer hangs, so it doesn't time out |
| 0204 misbehaving agents > the timeout runs from when the agent starts… | src/cli/commands/run/run.more.test.ts | toContain | same |
| 0204 misbehaving agents > a container that never starts is that run's outcome… | src/cli/commands/run/run.more.test.ts | toEndWith | same |
| the diagnostic log > without --log-file: a new file in .thunderjar/logs/… | src/cli/logging.test.ts:94 | expected 1 log file, got 2 | Unclear. Probably not the sleep change: check on main |

## Hit the 5s test timeout only in the full parallel run (pass when run alone)

| Test | File | Time |
|---|---|---|
| the diagnostic log > by default: the execution, its builds and container runs, at info… | src/cli/logging.test.ts | 5017ms |
| 0202 typical project, building with the fake Docker > with build concurrency 2… | src/cli/commands/build/build.test.ts | 5005ms |
| 0211 remote runtime, with a runner > has the runtime build and push the images… | src/cli/commands/run/run.runner.test.ts | 5000ms |
| 0211 remote runtime, with a runner > --json prints the execution and its container runs… | src/cli/commands/run/run.runner.test.ts | 5005ms |
| 0211 remote runtime, with a runner > images already in the image store are neither built nor pushed | src/cli/commands/run/run.runner.test.ts | 5000ms |

### Parallelism locally

`bun run test` is `bun test --parallel`. With no number, that's one worker per CPU core: 10 in this dev container. Tests within a file run serially (no `--concurrent`). Each test also spawns the CLI as a subprocess, so the real load is higher than 10.

The "pass when run alone" re-run above was one serial `bun test` of the 5 affected files together, not each test alone.

## CI: PR #306, run 45503687070

CI runs with 4 workers (`4x PARALLEL`), Bun 1.4.5.

### [check](https://github.com/dwjohnston/thunderjar/actions/runs/45503687070/job/138833252878?pr=306): `bun run test`

1013 pass, 3 fail. Only the three 0204 misbehaving-agents tests in `run.more.test.ts` failed. No 5s timeouts and no `logging.test.ts:94` failure.

### [docker](https://github.com/dwjohnston/thunderjar/actions/runs/45503687070/job/138833252675?pr=306): `bun run test:docker:parallel`

33 pass, 1 fail:

| Test | File | Time |
|---|---|---|
| run, against real Docker > 0204 misbehaving: an agent that times out is killed, and each is committed and measured however it ended | src/cli/commands/run/run.docker.test.ts | 19964ms |

Probably the same cause: fake-sleeper no longer hangs. Error output not checked yet.

## On the host

The 5s timeouts also happen when running the tests on the host machine, outside the dev container. So they aren't specific to the dev container, but they didn't happen on CI (4 workers).

### Also failing on the host (macOS)

| Test | File | Error | Likely cause |
|---|---|---|---|
| 0101 empty project > without a .thunderjar/ folder, it fails and says to run init | src/cli/commands/generate/generate.test.ts:91 | stderr has `/private<PROJECT>` where `<PROJECT>` was expected | Not the sleep change. On macOS the temp folder is behind the symlink `/var` → `/private/var`. The CLI prints the resolved path, and the `<PROJECT>` placeholder only replaces the unresolved one. Seen only with `outsideRepo: true`, which copies to the system temp folder |

### More 5s timeouts on the host

Not seen in the dev container or on CI.

| Test | File | Time |
|---|---|---|
| refusals, on 0203 unchanged > without a terminal to ask on, and without --yes, it says what it would purge, and purges nothing | src/cli/commands/purge/purge.test.ts | 5004ms |
| refuses a bare purge, session IDs with --all, an unknown session, and deleting without asking | src/cli/commands/purge/purgeCapture.test.ts | 5359ms |
