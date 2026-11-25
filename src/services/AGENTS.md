@HUMANS.md

# The services

Each row is one folder here. All but `ContainerRunner` are fields of `Dependencies`, built once in `src/cli/index.ts`.

| Service | What it is | Fake | What the fake adds for a test |
|---|---|---|---|
| `Clock` | Time and timers: `now`, `setTimeout`, `sleep`. | `FakeClock` | `advance(ms)`: time moves only when the test says. |
| `Env` | What the command was started with: `cwd`, `variables`, and the settings read from them, e.g. `concurrency`, `uploadBacklogCap`, `tmpDir`. A plain object. | `FakeEnv(overrides)` | Safe defaults. It is a function, not a class. |
| `Random` | `bytes`, `uuid`, `ulid`. | `FakeRandom` | The same sequence every run. `setUlids`, `setBytes` pin values. |
| `Fs` | Files and folders, e.g. `readText`, `write`, `copyDir`, `removeDir`. | `FakeFs` | In memory. `files()` lists what is there. |
| `Io` | stdin, stdout, stderr, and `onStop` for Ctrl-C. An output says its `columns` and `rows` if it is a terminal. | `FakeIo` | `stdout.text()`, `stdout.lastFrame()`, `interrupt()`, `terminate()`, `stopListeners`. `rows` only if the test gives some. |
| `CommandRunner` | Runs a host command and waits: `run(command, env)` gives its exit code and stderr. `run` uses it for the runtime's hooks. | `FakeCommandRunner` | `calls`, and `fail(prefix, result)`. Everything else exits 0. |
| `Docker` | `DockerService`: what `run` asks of Docker. There are two, `hostDocker` and `runtimeDocker`. | `FakeDocker`, with `FakeRegistry` | See below. |
| `ApplicationState` | The run state the displayer shows: `get`, `update`, and helpers such as `patchRun`, `setImageStatus`, `addNote`. | `FakeApplicationState` | `history()`: every state there has been. |
| `Displayer` | Shows the state: a frame each second on a terminal, or JSON at `stop()`. A frame taller than the terminal is drawn as its last rows, then whole at `stop()`. In JSON mode the state's `notes` go to stderr. | `FakeDisplayer` | Prints nothing. Keeps the `mode` it was set to. |
| `ContainerRunner` | Old path: the three steps the real `runContainer` runs on. Not in `Dependencies`. | `FakeContainerRunner` | A `FakeDocker` under another name. |

Two services live outside this folder, beside the types they need:

| Service | Where | Fake |
|---|---|---|
| `Stores` | `src/store/stores.ts` | `FakeStores`, with `FakeRunDataStore` |
| `Measurer` | `src/execution/run/measurer.ts` | `FakeMeasurer` |

**Why:** this layer is below `store` and `execution`, so it can't import their types.

## Usage examples

The `*.humans.test.ts` file in each folder is the example to copy from, e.g. `Clock/FakeClock.humans.test.ts`.

- `CommandRunner` and `FakeRegistry` have none yet: read their `*.comprehensive.test.ts`.
- `src/execution/run/testSupport.ts` builds every fake at once, with `fakeDependencies()`.

✅ **Do** add cases to the `*.comprehensive.test.ts` beside a humans test.

❌ **Don't** edit a `*.humans.*` file.

**Why:** they are the humans' own reference for how each fake is used.

## Docker

### The errors

They are in `Docker/errors.ts`, and `src/docker` re-exports them under their old paths.

| Error | Thrown when | Carries |
|---|---|---|
| `DockerUnavailableError` | The daemon can't be reached. | |
| `DockerBuildError` | A build fails. | `image` |
| `DockerLoginError` | There is no valid login for a registry host. | |
| `DockerPushError` | A push fails. | `reference` |
| `DockerPullError` | A pull fails. | `reference` |
| `DockerContainerError` | A container can't be run, read, committed or measured. | |
| `RegistryError` | The registry's HTTP API refuses. Used by `purge`. | |

✅ **Do** import them from `Docker/errors.ts` in new code.

❌ **Don't** define a Docker error in `src/docker`.

**Why:** the fake must throw the same class as the real one, so `instanceof` works in tests, and this layer can't import from `src/docker`.

### Scripting `FakeDocker`

One `FakeDocker` is one daemon, in memory, on a clock. Several share a `FakeRegistry`.

```ts
// 👍 Good
const clock = new FakeClock();
const registry = new FakeRegistry();
const host = new FakeDocker(clock, registry);
const runtime = new FakeDocker(clock, registry);

runtime.addImage("box:1", { "/notes.txt": "hello" });
runtime.on("-1", async ({ start, write, clock }) => {
  start();
  await clock.sleep(500);
  write("/out.txt", "done");
  return 0;
});
```

- **Images**
  - `addImage(name, files)` puts one on the daemon. `build` adds one with no files.
  - `registry.add(reference)` puts one in the registry.
- **Containers**
  - `on(suffix, script)` scripts each container whose name ends in `suffix`. The first match wins.
  - A container with no script starts at once and exits 0.
  - The script gets `start`, `read`, `write`, the `clock`, and the `options` it was run with.
- **Shell sessions**
  - `onShell(handler)` answers `openShellSession` commands.
- **Failures**
  - `failBuild(image, message)`, `failPush(reference, message)`.
  - `failOn(method, error)` makes any method throw.
  - `logOut(host)` makes `checkLogin` throw.
- **Timing**
  - `takes("build" | "push" | "pull", ms)` makes each take that long on the clock.
  - `takes("run", ms)` makes each `run` take that long to create its container: until then `removeContainersNamed` finds none.
- **Looking at it**
  - `calls` and `called(method)`: every call, so a test can check which of two Dockers was asked.
  - `builds`, `images()`, `containers()`, `container(name)`, `imageFiles(image)`.

`run` stops as the real one does:

| What happened | `run` gives |
|---|---|
| The image isn't on this daemon, the name is taken, or with a `startMarker` the script never called `start()` | `notStarted`, with a reason |
| The script ran past `timeoutSeconds` once started | `timedOut` |
| The script returned 0 | `exited` |
| The script returned non-zero after `start()`, or its container was removed | throws a `DockerContainerError` |

### Two things called fake Docker

| Name | Where | What it is |
|---|---|---|
| `FakeDocker` | here | An in-memory `DockerService`, passed as a dependency. |
| `fakeDocker()` | `src/testing/fakeDocker.ts` | A stand-in for the `docker` binary, for tests that spawn the real CLI. |

The same goes for `FakeRegistry` here and `fakeRegistry()` in `src/testing`, which serves a registry's HTTP API.
