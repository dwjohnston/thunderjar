@HUMANS.md

# `src/docker`

## Two paths to Docker

| Path | What it is | Who uses it |
|---|---|---|
| Old | The functions in `docker.ts`, `registry.ts`, `localImages.ts` and `shellSession.ts`, each taking a `DockerRuntime`. | `doctor`, `purge`, `checkout`, `remeasure` |
| New | `DockerService`, declared in `src/services/Docker`, passed as `hostDocker` and `runtimeDocker`. | `run` |

`dockerServiceAdapter.ts` joins them: `createDockerServiceAdapter(clock, runtime)` is a `DockerService` whose every method is one of the old functions.

- It is still temporary, and still the only real `DockerService`. `src/cli/index.ts` builds both Dockers with it.
- `inRegistry` and `checkLogin` use the local `docker` CLI whatever the runtime, on either instance.
- `startDetached`, `stop`, `followLogs` and `stderrTail` served the deleted runner. `run` no longer calls them.

✅ **Do** write new callers against `DockerService`, and add a method to the interface, the adapter and `FakeDocker` together.

❌ **Don't** call a function of `docker.ts` from code that takes `Dependencies`.

**Why:** a call that skips the service can't be faked, and ignores which Docker the caller was given.

## The errors moved

The Docker error classes are defined in `src/services/Docker/errors.ts`. `docker.ts` and `registry.ts` re-export them, so old imports and `instanceof` still work.

❌ **Don't** define a new Docker error here.

**Why:** `FakeDocker` must throw the same class, and the services layer can't import from this one.

## Tests

- `docker.test.ts` runs the old functions against the fake `docker` binary in `src/testing`.
- `docker.docker.test.ts` runs them against real Docker.
- `runContainer.humans.test.ts` and `runContainer.comprehensive.test.ts` run the real `runContainer` on a fake's `spawnRun`, `killContainer` and `removeContainer`, on a `FakeClock`.
  - Never edit the humans file: add cases to the comprehensive one.
- The adapter has no test of its own. `src/cli/commands/run/run.test.ts` reaches the fake binary through it.
