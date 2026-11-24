<!--
🤖
This file was created with AI

Harness: Claude Code
Supervising engineer: David Johnston

Humans: add your notes here

-->

# Plan: container timing on a fake clock

Fixes the three 0204 misbehaving-agents tests in `src/cli/commands/run/run.more.test.ts` that fail now `fake-sleeper` no longer sleeps. See [the failures](./fake-sleeper-no-sleep-failures.md) and [the spec](./non-ambient-non-determinism.md).

## The constraint

`thunderjar()` in `src/testing/cli.ts` runs the CLI as a subprocess. A `FakeClock` in the test can't reach it.

So the timing behaviour is tested one layer down, in the test's own process, against `runContainer`. The CLI tests keep only what doesn't depend on time.

## Where the time comes from today

All in `runContainer` and its helpers, `src/docker/docker.ts`.

| Ambient call | Purpose |
|---|---|
| `Bun.spawn(docker run …)` | Starts the container. Its stdout carries the start marker |
| `setTimeout` ×3 | Start timeout, agent timeout, 5s output wait after exit |
| `Date.now()` | `startedAt`, `killedAt`, `gaveUpAt` |
| `Bun.sleep(KILL_RETRY_MS)` | Between `docker kill` retries |
| `mustRun(["kill"…])`, `removeContainer` | Kill a timed-out container, remove one that didn't start |
| `startTimeoutSeconds()` reads `Bun.env` | The start timeout |

## Steps

Each step leaves the suite green except the three known failures, until step 6.

### 1. Add the `services` layer and `Clock`

Per `src/services/HUMANS.md`:

```
src/services/
  Clock/
    Clock.ts          Clock interface, realClock
    Clock.test.ts
    FakeClock.ts      advance(ms) fires due timers in time order, settling promises between each
```

- Add `"services"` to `LAYERS` in `scripts/layers.ts`, after `"log"` and before `"docker"`. Run `bun run lint:generate`.
- No callers yet.

### 2. Add a narrow `ContainerRunner` port

Only what `runContainer` needs, not a whole `DockerService`:

```ts
type ContainerProcess = {
  started: Promise<void>;   // the start marker was seen
  exited: Promise<number>;
  stderr: Promise<string>;
  kill(): void;             // SIGKILL the docker run process
};

interface ContainerRunner {
  spawn(args: string[], startMarker?: string): ContainerProcess;
  kill(name: string): Promise<void>;
  remove(name: string): Promise<void>;
}
```

```
src/services/
  ContainerRunner/
    ContainerRunner.ts       interface, realContainerRunner(runtime): today's Bun.spawn, watchFor, mustRun, moved unchanged
    FakeContainerRunner.ts
    ContainerRunner.test.ts
```

Open question: the real adapter needs `DockerRuntime` and `mustRun` from `src/docker/`, which is a later layer. Either it lives in `src/docker/` with only the interface and fake in `services/`, or those helpers move down.

### 3. Inject both into `runContainer`

New options `clock = realClock` and `runner = realContainerRunner(runtime)`. Replace every call in the table above, `killTimedOut` and `giveUpStarting` included.

Pure refactor: callers unchanged, existing tests stay as they are.

### 4. `FakeContainerRunner`

Behaviour scripted per container-name suffix, on the fake clock:

```ts
const runner = new FakeContainerRunner(clock);
runner.on("-1-1", async ({ clock, start }) => { start(); await clock.sleep(300_000); return 0; }); // hangs
runner.on("-3-1", async ({ clock, start }) => { await clock.sleep(3_000); start(); return 0; });   // slow to start
```

- `kill(name)` settles that container's pending exit with 137.
- It records what was killed and removed, for assertions.

### 5. New in-process timeline tests

`src/docker/runContainer.test.ts`, each in milliseconds:

| Case | Advance to | Assert |
|---|---|---|
| Slow start, 3s, past a 2s timeout | 3s, then 5s | `exited`, nothing killed |
| Hangs after starting | 2s | `kill` called, outcome `timedOut`, `killedAt` = fake 2s |
| Never starts | start timeout | `remove` called, outcome `notStarted` |
| Exits non-zero | — | throws `DockerContainerError` |

These take over the timing parts of the three failing 0204 tests.

### 6. Reduce the 0204 CLI tests

In `run.more.test.ts`, keep what's independent of time: the crasher's `exited 1`, the silent agent's `done, no result file`, the measurements, and that no containers are left.

- Drop the `timed out` rows and the `slowStart` setup. Step 5 covers them.
- Decide: delete `slowStart` from `fakeDocker`, or keep it.
- `fake-sleeper` stays in 0204 or goes. It no longer hangs, so its row reads as a normal run.

### 7. Leave real Docker on real time

`run.docker.test.ts` is a smoke test. The spec allows it to wait. It needs a fixture that really hangs, separate from 0204's `fake-sleeper`.

## Out of scope for this slice

- `startTimeoutSeconds()` reading `Bun.env`
- `Date.now` in `containerRun.ts` and the execution layer
- The restricted-API lint rule
- `logging.test.ts:94` and the 5s parallel timeouts

## Open questions

1. Where the real `ContainerRunner` adapter lives, given layers (step 2).
2. Is it OK for the CLI-level 0204 tests to lose their timing assertions (step 6)?
