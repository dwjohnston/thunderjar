@HUMANS.md

# `src/testing`

Helpers for tests that run the real CLI in a fixture scenario. See [fixtures/AGENTS.md](../../fixtures/AGENTS.md) for the scenarios.

| File | What it gives |
|---|---|
| `cli.ts` | `thunderjar()`, which runs the CLI in a folder, and `copyScenarioProject()`. |
| `scenario.ts` | `scenario(id)` and `scenarioFolder(id)`. |
| `placeholders.ts` | Replaces what changes between runs, e.g. a ULID, in the CLI's output. |
| `fakeDocker.ts` | A stand-in for the `docker` binary, and `fakeDocker()` to set up and read its state. |
| `fakeRegistry.ts` | `fakeRegistry()`, a registry's HTTP API on localhost. |
| `runData.ts` | `KEY`, `dataDir()`, `removeDataDirs()` and `usePostgres()`, shared by the tests of commands that read run data. |

## This is not where `run`'s fakes are

✅ **Do** test what `run` does with the in-memory fakes: `fakeDependencies()` in `src/execution/run/testSupport.ts`, built from the fakes in `src/services`.

❌ **Don't** reach for `fakeDocker()` to test a step of `run`.

**Why:** the fake binary needs a spawned process and real files for every call. The in-memory fakes run on a fake clock.

| Name | Where | Use it for |
|---|---|---|
| `fakeDocker()` | here | Tests that spawn the CLI, and tests of the old functions in `src/docker`. |
| `FakeDocker` | `src/services/Docker` | Everything that takes a `DockerService`. |
| `fakeRegistry()` | here | Tests of `src/docker/registry.ts` and `purge`. |
| `FakeRegistry` | `src/services/Docker` | The registry several `FakeDocker`s share. |

## What changed with the new `run`

- **`runData.ts` is new.**
  - It holds what other commands' tests used to import from `run`'s deleted test support.
- **`fakeCommand.ts` is gone.**
  - It put a fake binary on the `PATH`. Take a `CommandRunner` and pass a `FakeCommandRunner`, or pass a fake `exec`, as `hashPermutations.test.ts` does.
- **The fake `docker` binary no longer plays a runner.**
  - Its detached-runner start and runner `exec` branches were removed, with `FAKE_RUNNER_ENV`.
  - It still answers `logs`, `inspect` and `stop`.

## A trap with `bun run fixture`

Running a command by hand in a scenario writes a log into the scenario's `.thunderjar/logs/`. The folder is git-ignored, but `copyScenarioProject` copies it, and a test that counts log files then fails.

✅ **Do** delete a scenario's `.thunderjar/logs/` after running a command in it by hand. After a `run` without `--data-dir`, delete its `.thunderjar/.data/` too.
