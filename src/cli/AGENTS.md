@HUMANS.md

# `src/cli`

## What changed with the new `run`

`HUMANS.md` above still describes the services as they were. Until it is updated, this is what the code does.

- **The commands**
  - `init`, `generate`, `run`, `doctor`, `db`, `executions`, `show`, `view`, `remeasure`, `checkout`, `purge`, `capture`.
  - `plan`, `build`, `attach` and the hidden `runner` are gone. `run --dry-run` and `run --build-only` replace the first two.
  - `run --local` is gone. Where containers run is the config's `runtime`.
- **`index.ts` builds twelve services, once**
  - `env`, `clock`, `random`, `fs`, `io`, `hostDocker`, `runtimeDocker`, `commands`, `stores`, `measurer`, `state`, `displayer`.
  - Together they are `Dependencies`, declared in `src/execution/run/types.ts`. `services.ts` re-exports it, also as `Services`.
  - What each is: [src/services/AGENTS.md](../services/AGENTS.md).
- **The two Dockers**
  - `hostDocker` is `createDockerServiceAdapter(clock, localRuntime())`.
  - `runtimeDocker` is the same adapter over `remoteRuntime(command)` when the config gives a runtime. Otherwise it is `hostDocker` itself.
  - `DockerService` is no longer empty: it has every method `run` needs.
- **Only `run` is given the services**
  - Every other command still calls the functions in `src/docker` directly, and opens the store with `openStore` in `dataDir.ts`.

## A command file is wiring

`commands/run/run.ts` declares the flags and calls one function.

```ts
// 👍 Good
.action(async (name: string, options: RunOptions) => {
  const exitCode = await runCommand(name, options, deps);
  process.exitCode = exitCode;
  if (exitCode === INTERRUPTED || exitCode === TERMINATED) process.exit(exitCode);
});
```

The `process.exit` is the one exception to "wiring only". After Ctrl-C, `runCommand` may have given up waiting for a `docker` process, which would otherwise keep Thunderjar alive.

✅ **Do** put what a command does in a function that takes `Dependencies`, in a lower layer, and test it there with fakes.

❌ **Don't** build a service, read `process.env`, or decide anything in the command file.

**Why:** the logic is then tested in memory, and the CLI test only has to show that the command line reaches it.

`run` writes nothing through `output.ts`. Its output is the displayer's, drawn from the state. See [src/execution/run/AGENTS.md](../execution/run/AGENTS.md).

## Building services in `index.ts`

✅ **Do** build a new service here, and add it to `Dependencies`.

❌ **Don't** build one anywhere else in `src/`, tests aside.

**Why:** one composition root means a test can swap any of them for its fake.

- Building a service must not connect, log in or read the project. A dry run pays for none of it.
- The displayer is the exception to "built up front": a thin wrapper makes the real one on first use, because the log path is only known after commander's `preAction` hook.
- `index.ts` reads the project config once, before commander runs, only to find the runtime's command. A config that doesn't load gives no runtime here, and the command that needs it reports the error.

## Testing a command that takes services

One small test of the real CLI beside the command, in a fixture scenario. `commands/run/run.test.ts` is the example: `--dry-run`, `--dry-run --json`, `--build-only`, and one full run through the fake `docker` binary.

✅ **Do** test behaviour in the lower layer, with fakes.

❌ **Don't** add a CLI test for each branch of `run`.

**Why:** each CLI test spawns a process and reads real files. The old `run` tests were the slowest in the suite.
