<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLjgpo4Xt5XwzGG2TNX
Supervising engineer: David Johnston

A plan to hand to an agent. Builds on #313, #321 (landed on main as #328) and the Ctrl+C spec in #327.

Humans: add your notes here
-->

# Remove `attach` and runner mode; Ctrl+C through an `Interrupts` service

Two PRs, stacked:

1. **Remove `attach` and runner mode.** Breaking: a `minor` changeset.
2. **Add the `Interrupts` service, and wind down `run` on Ctrl+C as #327 specs.** A `patch` changeset.

## Read first

- The spec. It's on #327's branch, `claude/kind-einstein-owmwtt`, not yet on main:
  - `project-md/human-safe-space/refactor-work/interrupts.md`
  - `project-md/human-safe-space/refactor-work/architecture-plan.md`, its "Ctrl+C" section
  - `project-md/remote-architecture.md`, diagram 1: the network calls Ctrl+C has to stop
  - e.g. `git fetch origin claude/kind-einstein-owmwtt && git show origin/claude/kind-einstein-owmwtt:project-md/human-safe-space/refactor-work/interrupts.md`
- `src/runNext/AGENTS.md`: the levels, and how services reach them.
- The repo's `AGENTS.md` and `HUMANS.md`: Bun APIs only, no `console`, a fake for every service, never edit a `*.humans.*` file.

## Background

- **Runner mode** is `runtime.runner` in `thunderjar.config.ts`. In this repo it's on only when `THUNDERJAR_ON_RUNTIME=1`.
  - The whole execution runs on the runtime, in a "runner" container. `run` only submits it and follows its log.
  - Ctrl+C detaches and leaves the execution running. `attach <id>` follows it again, and `attach <id> --stop` stops it.
- **`attach` exists only for runner mode.**
  - #318 removed `attach` alone, and #322 reverted it, because runner executions could then never be followed or stopped. So both go together.
- **A remote runtime without a runner stays.** It already runs on `runNext`, and the `/slow-tests` Fly job uses it.
- **Runner mode is all on the old path.** #321 marked it `.deprecated.ts` and deleted its only tests.

## PR 1: remove `attach` and runner mode

### Delete

- `src/cli/commands/attach/`
- `src/cli/commands/runner/`
  - The hidden `runner` command: what the runner container runs.
- `src/cli/commands/run/runOnRunner.deprecated.ts`, `followRunner.deprecated.ts`, `runDisplay.deprecated.ts`
- `src/execution/runner.ts`, `runnerEvents.ts`, `runnerSpec.ts`, `runnerImage.ts`, `onRuntime.ts`, `runExecution.ts`, and their tests
  - Check each has no other importer first. The ones found so far are all on the runner path.
- From `src/docker/docker.ts`, `src/services/Docker/Docker.ts`, `FakeDocker.ts` and `src/testing/fakeDocker.ts`: whatever only those files used.
  - Candidates: `startDetached`, `stopContainer`/`stop`, `containerState`, `stderrTail`, `followLogs`, `writeContainerFile`/`writeFile`.
  - `src/services/ContainerRunner/` mentions runners too. Check whether it's the same thing before you touch it.

### Move out of `runDisplay.deprecated.ts` before deleting it

- `showMeasures`, used by `src/services/Displayer/renderRun/renderRun.ts`. Move it beside `renderRun`.
- `storeFailure`, used by `src/cli/commands/run/runFailure.ts`. Move it into `runFailure.ts`.

### Change

- `src/cli/commands/run/run.ts`
  - Drop `usesRunner` and the `runOnRunner` branch. `run` always goes through `runCommand`.
- `src/cli/program.ts`
  - Unregister `attach` and `runner`.
- Config: `src/api/declarations.ts` (`RuntimeConfig.runner`, `RunnerConfig`) and `src/config/projectConfig.ts` (`runnerProblem`, the "can't be given with a runner" rule, the parsed `runner`)
  - A config that still gives `runtime.runner` must be a `ConfigError` that says runner mode was removed, not something silently ignored. Test it in `projectConfig.test.ts`.
  - `beforeExecution` and `afterExecution` are no longer exclusive with anything. Update their doc comments.
- `.thunderjar/thunderjar.config.ts`
  - Drop `onRuntime`, `THUNDERJAR_ON_RUNTIME` and the `runner` line.
- Docs and instructions that mention `attach`, the runner or `THUNDERJAR_ON_RUNTIME`:
  - `CONTRIBUTORS.md`, `skills/tj-config/SKILL.md`, `skills/tj-oneshot/SKILL.md`, `src/runNext/AGENTS.md` (its "Runner mode is the one exception" line), `fixtures/AGENTS.md`, `docs/`
  - Find the rest with `grep -rn -i "attach\|runner\|ON_RUNTIME"`. Ignore GitHub Actions' "runner", `CHANGELOG.md`, `src/gauntlet/`, `project-md/delivery/tasks/done|archive` and `scratch-pad/`.
- `project-md/human-safe-space/` is human-maintained.
  - Don't edit it. List what's out of date in the PR description, ending with 🔔📄.

### Changeset

`minor`: breaking, under the 0.x rule. Say that `runtime.runner` and `thunderjar attach` are gone, and that a remote runtime without a runner still works.

### Done when

- `bun run typecheck`, `bun run lint` and `bun test --changed=main` pass.
- `bun run fixture 0211 run <test case> --dry-run` still works.
  - That's the remote runtime scenario. Check its test case names in `fixtures/AGENTS.md`.
- `grep` finds no `attach`, `runOnRunner`, `followRunner`, `runDisplay` or `RunnerConfig` left in `src/`.

## PR 2: the `Interrupts` service, and winding `run` down

The behaviour is the spec's table:

| Where the run is | 1st Ctrl+C (`windDown`) | 2nd Ctrl+C, or SIGTERM (`forceQuit`) |
| --- | --- | --- |
| Waiting for a slot | Never starts: `abandoned` | |
| Agent running, not yet committed | Container removed: `abandoned`, no commit, no image | |
| Committed, measuring | Finishes, result saved | Measurement containers killed, result lost |
| Committed, in the upload queue | Uploaded | Push cancelled |

### Decided in planning

- **SIGTERM fires `forceQuit` at once**, aborting `windDown` too, and exits 143.
  - What sends it (`docker stop`, a cancelled CI job) follows up with SIGKILL, so there's no time to wind down.
- Any interrupted `run` exits 130, or 143 for SIGTERM.
  - That includes a wind-down that finishes on its own, so scripts can tell that it was interrupted.
- Abandoned runs are recorded in the run data store, like crashes and timeouts. That includes runs that never started.

### The service: `src/services/Interrupts/`

- `Interrupts.ts`

  ```ts
  interface Interrupts {
    windDown: AbortSignal;  // 1st Ctrl+C
    forceQuit: AbortSignal; // 2nd Ctrl+C, or SIGTERM
    /** Starts listening for SIGINT and SIGTERM. Returns a function that stops. */
    listen(): () => void;
  }
  ```

  - Build it on `Io.onStop`: `createInterrupts(io: Pick<Io, "onStop">)`.
    - Keep `Io.onStop` itself: `FakeIo.humans.test.ts` uses it, and that file can't change.
  - `listen()` differs from the spec, which has `main` build the service with its handler already on. Call `listen()` in `runCommand` and its stop function in `finally`.
    - Why: a SIGINT listener in Node or Bun replaces the default exit. If `main` registered it, Ctrl+C would stop exiting `show`, `view` and every other command.
    - Mention this in the PR description, so the spec can be updated.
- `FakeInterrupts.ts`
  - `press()` aborts the next signal. `terminate()` aborts both.
  - Add `*.comprehensive.test.ts` tests, and a `*.test.ts` for the real one against `FakeIo`.
  - Don't write a `*.humans.test.ts` file. Those are for the humans to write.
- Wiring
  - Build it in `src/cli/index.ts`, and add `interrupts` to `Services` (`src/cli/services.ts`) and `Dependencies` (`src/runNext/types.ts`).
  - Remove `onStop` and `signal` from `Dependencies`, and update `dependencies()` in `run.ts` and `src/runNext/testing/fixtures.ts`.

### Each level

- **`runCommand`** (`src/runNext/runCommand/runCommand.ts`)
  - Replace the `stopping` AbortController, `interrupt()` and `INTERRUPT_SETTLE_MS` race with the two signals.
  - On `windDown`:
    - Record "Interrupted (SIGINT)" in the run state, as now.
    - Don't race `running`: let it finish.
  - On `forceQuit`:
    - `removeContainersNamed` for the execution, as `interrupt()` does today, so measurement containers die.
    - Stop waiting on `running`, and run `afterExecution` once, via `runHook`, which already dedupes.
    - Return 130, or 143 for SIGTERM. Keep which signal it was so the code can be picked.
  - When a wind-down finishes on its own, return 130, not the usual 0 or 1.
  - In `--dry-run` there's nothing to wind down: exit 130 on the first press.
- **`runTestCase` and `ensureImages`**
  - Not in the spec.
  - Default: on `windDown`, start no new build or pull; ones in progress finish. Then `runManifest` abandons every run.
  - `forceQuit` doesn't wait for them, because `runCommand` returns.
- **Scheduler** (`src/runNext/scheduler/scheduler.ts`)
  - Its `shouldStop` becomes `windDown.aborted`. Better, take the signal so the backpressure sleep wakes on it.
  - Runs that never start must now come back as `abandoned` records instead of being left out, so they can be recorded. Update the `Scheduler.run` doc comment.
- **`runPermutation`** (`src/runNext/runPermutation/runPermutation.ts`)
  - On `windDown` before the commit:
    - `removeContainer(run.container)`, which makes `docker.run` return.
    - Skip the commit and the image, record an `abandoned` container run, and set the state's status to `abandoned`.
    - It still never throws.
  - Abort listeners must check whether the run has reached its commit yet. Once it has, `windDown` changes nothing.
  - On `forceQuit` while measuring:
    - Remove its measurement containers (`${run.container}-measure-*`).
    - Don't save the measures. Leave the run `completed`, with why in `error`, as a failed measurement is today.
  - A crash or timeout that commits is still committed and uploaded, as now.
- **Upload queue** (`src/runNext/uploadQueue/uploadQueue.ts`)
  - Take `forceQuit`. Once it aborts, start no push, cancel those in progress, and resolve `drain()`.
  - Record a cancelled push as an upload failure, with a reason that says it was cancelled.
  - Cancelling needs `DockerService.push(image, reference, signal?)`.
    - `pushImage` uses Bun's `` $ ``, which takes no signal. Use `Bun.spawn` with `signal` for the `push` step.
    - Check that killing the `docker push` client also stops the push on the daemon, and say in the PR whether it does.
- **`runManifest`** (`src/runNext/runManifest/runManifest.ts`)
  - Pass the signals to the scheduler and the upload queue, as the architecture plan's `runManifest` example shows.
  - On `windDown`, wait for `uploads.drain()`. Today it skips the drain once stopped.
  - Record the execution as `failed` if it was interrupted, as now.

### Types and records

- `RunOutcome` (`src/runNext/types.ts`) and `RunStatus` (`src/services/ApplicationState/ApplicationState.ts`) gain `"abandoned"`.
- `Execution` in `src/services/RunDataStore/RunDataStore.ts` gains something like `abandoned?: "beforeStart" | "running"`.
  - Records are a JSON column, so no migration is needed. See the comment at the top of that file.
  - An abandoned run that never started has no container times. Copy how `failedToStart` records are built.
- Check the readers handle `abandoned`: `show`, `view`, `executions`, `remeasure` (it mustn't measure them) and `renderRun`.

### Display

- Run state gains a phase, e.g. `stopping?: { uploadsLeft: number }`, set on `windDown`.
- `renderRun` shows `Stopping: 2 uploads left. Ctrl+C again to force quit.` while it's set, and abandoned runs as abandoned.

### Tests

- Fakes only, no real timers or Docker.
- Use the spec's example:

  ```ts
  const interrupts = new FakeInterrupts();
  // press() from inside a FakeDockerService onRun script, so it lands while the agent runs
  ```

- Cover each row of the table above, SIGTERM, a press in `--dry-run`, and that `listen()`'s stop function removes the handlers.
- Replace the `signal` test in `runManifest.test.ts` (around line 99) and the interrupt tests in `runCommand.test.ts`.
- Don't modify the `*.humans.test.ts` files.
  - If one now fails because the behaviour changed as specced, stop and say which, with 🔔📄 in the PR description.

### Changeset

`patch`: Ctrl+C now winds `run` down, and a second Ctrl+C force-quits.
