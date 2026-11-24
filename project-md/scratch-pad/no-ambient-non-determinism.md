# Getting to "no ambient non-determinism"

> AI-generated plan (Claude Opus 5.5). A proposal to argue with, not a decision.

How Thunderjar's code and tests get from where they are now to the spec: time, Docker, environment and randomness come in as injected services, and tests drive them with fakes in one process.

## Where we are

| Problem | Where |
| --- | --- |
| Docker is shelled out to with `$` from ~20 modules' worth of free functions | [src/docker/docker.ts](../../src/docker/docker.ts), [shellSession.ts](../../src/docker/shellSession.ts), [localImages.ts](../../src/docker/localImages.ts), plus direct `$` in [execution/](../../src/execution/) |
| The fake Docker is a separate process, a stand-in `docker` binary with state in a folder | [src/testing/fakeDocker.ts](../../src/testing/fakeDocker.ts) |
| Fake agents really run, and some really sleep | `fake-sleeper` runs `sleep 300`; fake Docker's `slow`, `slow-start`, and `Bun.sleep(50)` polling loops |
| The core polls real time | `Date.now` and `setTimeout` in `docker.ts` (start timeout, kill retries), `Bun.sleep` in `run.ts`, `runner.ts`, `runDataStore.ts`, `setInterval` in `liveRows.ts` |
| Tests assert on stdout | Most command tests, so a state change and a wording change break the same test |
| `process.env` read in place | ~33 call sites outside tests |

What already works, and stays:

- Declaring what Docker already holds: `fakeDocker({ images: [...] })`.
- Driving the app with real CLI arguments: `["build", "is-prime-baseline"]`.

## The end state

```ts
const clock = new FakeClock();
const docker = new FakeDockerService({ clock, images: ["thunderjar-prerun:ded54607"] });
docker.onExec("fake-sleeper", ({ clock, signal }) => clock.sleep(Infinity, { signal }));

const app = createApp({ clock, docker, fs: scenarioFs("0204"), env: {}, out: new CapturedOutput() });
const exit = app.cli(["run", "misbehaving"]);

await clock.advance(2_000);
expect(app.state().containers[0]).toMatchObject({ status: "timedOut" });
```

- `createApp(services)` is the composition root's inner half. `src/cli/index.ts` builds the real services and calls it; tests build fakes and call it.
- `app.state()` returns the command's state model. Command tests assert on it.
- Rendering state to stdout is a pure function, `render(state, now)`, tested on its own with hand-built states.

## The `DockerService` port

Proposed interface. It's the existing exports of `docker.ts`, regrouped, with two changes:

1. No `runtime` argument on each call. A `DockerService` is bound to one runtime; `onRuntime` gets a second instance.
2. **No timing inside the port.** Today `runContainer` owns the start timeout, the run timeout and kill retries. Those move to the core, on the clock. The port only starts, execs, waits and kills.

```ts
interface DockerService {
  // Daemon
  info(): Promise<{ daemonId: string } | { unavailable: string }>;
  diskUsage(): Promise<string[]>;

  // Images
  build(contextDir: string, image: string, options: BuildOptions): Promise<void>;
  imagesIn(repository: string): Promise<Set<string>>;
  imageEnv(image: string): Promise<string[]>;
  imageConfig(image: string): Promise<ImageConfig>;      // entrypoint, cmd, env
  tag(image: string, reference: string): Promise<void>;
  removeImage(image: string): Promise<LocalRemoval>;

  // Registry
  login(host: string, username: string, password: string): Promise<void>;
  checkLogin(host: string): Promise<void>;
  push(image: string, reference: string): Promise<void>;
  pull(reference: string): Promise<void>;
  inRegistry(reference: string): Promise<boolean>;

  // Containers
  create(image: string, name: string, options: ContainerOptions): Promise<void>;   // env, setEnv, secretEnv, runOptions
  start(name: string): Promise<void>;                                              // resolves once it's running
  exec(name: string, command: string[], options?: { signal?: AbortSignal; onLine?: (line: string) => void }): Promise<ExecResult>;
  kill(name: string): Promise<void>;
  stop(name: string, graceSeconds: number): Promise<void>;
  state(name: string): Promise<ContainerState | undefined>;
  readFile(name: string, path: string): Promise<string | undefined>;
  writeFile(name: string, path: string, text: string): Promise<void>;
  commit(name: string, image: string, changes: CommitChanges): Promise<void>;
  remove(name: string): Promise<void>;
  removeNamed(prefix: string): Promise<string[]>;
  logs(name: string, onLine: (line: string) => void, signal?: AbortSignal): Promise<number>;
  stderrTail(name: string, lines?: number): Promise<string>;

  // Interactive
  shell(image: string, name: string, env?: string[]): Promise<ShellSession>;
}
```

Open questions:

- `run` today is one `docker run … sh -c script`. Splitting it into `create` / `start` / `exec` is what makes "starting" and "running" separately observable, and lets `onStart` and `onExec` be scripted apart. It costs one extra Docker call per container. I think it's worth it.
- `checkout`'s shell and `attach` hand the terminal to Docker. Those stay `Bun.spawn` in the real adapter, behind `shell` / an `attach` method, and are covered by smoke tests only.
- `registry.ts` already takes its credentials as a parameter: fold it in as a separate `RegistryClient` port rather than into `DockerService`.

### `FakeDockerService`

In-process, in-memory, driven by the clock:

- Constructor takes `{ clock, images?, logins?, failing?, env? }`, the same declarations `fakeDocker()` takes today.
- Containers keep their files in an in-memory map. A built image's starting files come from the Dockerfile's `COPY <<'EOF'` heredocs, as now.
- `exec` resolves at once with exit code 0 and runs **no script**, by default.
- Per-image hooks: `onStart`, `onExec`, `onMeasure`, `onBuild`. A hook gets `{ clock, signal, image, files }`, and may write files.
- `kill` aborts the exec's signal, settling it.
- It records what happened: `commands`, `killed`, `pushed`, `runningContainers()`.

## Fake agents never sleep

- Fixture harnesses stop encoding behaviour in shell. `fake-sleeper`'s run script becomes something trivial; the test says "this image hangs" with `onExec`.
- Delete fake Docker's `slow` and `slow-start` files, and the `Bun.sleep` polling loops.
- Where a fixture's harness must leave files behind (e.g. `isPrime.ts`), the hook writes them. A scenario can ship a default hook set, e.g. `scenarioHooks("0204")`, so each test doesn't repeat it.

## The `Clock` port

As in the spec: `now`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`, `sleep(ms, { signal })`.

Callers to move onto it:

- Container start timeout, run timeout, kill retries (out of `docker.ts`, into `containerRun.ts`).
- `INTERRUPT_SETTLE_MS` in `run.ts`, `STOP_SETTLE_MS` in `runner.ts`.
- Retry back-off in `runDataStore.ts`.
- The live rows' one-second tick in `liveRows.ts`. It already takes `ticker` and `now`, so it's the template.
- Timings recorded on runs (`startedAt`, `killedAt`).

`purge.ts`'s `now = Date.now()` default parameter is already the right shape: the default moves to the composition root.

## Order of work

Each step is shippable on its own and leaves the suite green.

1. **Lint first.** Add `no-restricted-globals` / `-properties` / `-imports` for the spec's table to `.oxlintrc.json`, each message naming the service. Existing offenders get a per-file `oxlint-disable` with a `TODO(no-ambient)` comment, so the list of files to fix is greppable and only shrinks. Allowed: `src/cli/index.ts`, real adapters (`src/docker/`, a new `src/platform/`), `*.docker.test.ts`, `*.agent.test.ts`.
2. **`Clock` and `FakeClock`**, with `FakeClock`'s own unit tests (ordering, nested timers, `sleep` with abort). Thread it through `liveRows` and `runDataStore` first: small, self-contained.
3. **`DockerService` interface and real adapter**, by wrapping the existing free functions. No behaviour change. Pass it from the composition root through `execution/`. This is the big mechanical step; do it a command at a time, starting with `build` (fewest calls).
4. **Move timeouts into the core**, on the clock, using `create` / `start` / `exec` / `kill`. Delete the timing code from `docker.ts`.
5. **`createApp` and `FakeDockerService`.** Port `build` tests first, since they're simplest and the `["build", …]` style is already liked. Then `plan`, `run`.
6. **State model per command**, and the `render(state, now)` split. Port `run`'s timeout tests to the timeline style. Delete `fake-sleeper`'s sleep, fake Docker's `slow*` and polling.
7. **Contract tests**: one suite run against `FakeDockerService` and, as a `.docker.test.ts`, the real adapter.
8. **Retire the process fake.** Once no unit test sets `THUNDERJAR_DOCKER`, delete `src/testing/fakeDocker.ts`. The `.docker.test.ts` and smoke tests use real Docker.
9. **Then the rest**: `Config` for `process.env`, a filesystem service with an in-memory fake for scenarios, `Random`/`IdGenerator` behind `ulid.ts`. Each is a lint-allowlist burn-down like step 1.

## Risks

- **Two fakes at once.** Between steps 5 and 8, the process fake and the in-process fake coexist. Keep the window short, and don't add features to the old one.
- **The fake drifts from Docker.** The process fake caught real CLI-argument mistakes. The contract tests in step 7 have to replace that, so they must exist before step 8.
- **Real I/O sneaking into unit tests.** `FakeClock.advance` can't flush real I/O, so a test that hits disk or a socket mid-timeline will hang or race. The filesystem service (step 9) closes that; until then, keep scenario reads before the first `advance`.
- **`logger` timestamps** stay ambient until the logger takes the clock. Low priority: the spec allows it if the sink adds them.
