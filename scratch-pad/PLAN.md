# Thunderjar command test strategy

## Context

Command tests in `src/commands/` currently generate throwaway projects (`src/testing/fixture-project.ts`) and patch them per test. The goal is that every command test runs against a checked-in scenario in `fixtureTests/scenario_*/fixtures/`, unchanged, and only asserts on what the command produced. This table sets out, per command, what it produces and how it's tested. It also covers two product changes the strategy needs: `build --dry-run` and a custom image prefix.

**Scenarios don't know about the tests that use them.** A scenario is only a project: its declarations, and any state it starts in, such as a run data store. Every expected result lives in the test. Nothing in a scenario is named after a test or holds expected output.

## Commands, what they produce, and how they're tested

Every command also sets an exit code, and can report errors on stderr.

| Command | What it produces | Test strategy |
|---|---|---|
| `init` | `.thunderjar/` in the project: config, tsconfig, `.gitignore`, starter parameters and test case, and a nested `package.json` if there's no root one. | **Copy, then run.** Each starting state is a scenario (e.g. empty folder, folder with a `package.json`). Copy it, run `init`, and assert in the test on the files it created or skipped and their contents. |
| `generate` | `.thunderjar/_generated/parameter-names.d.ts` (gitignored, deterministic). | **In place.** Assert in the test on the written file's contents. |
| `plan <tc>` | stdout: parameters with hashes, and each permutation's prerun image. | **In place.** Assert on stdout, with the fake Docker saying which images exist. |
| `run <tc> --dry-run` | stdout: each permutation's prerun image, and each iteration's postrun image and harness command. | **In place.** Assert on stdout. |
| `build <tc> --dry-run` *(new)* | stdout: the Dockerfile for each permutation's prerun image. Nothing is built. | **In place.** Assert on stdout. Replaces the recording-fake-Docker build tests. |
| `build <tc>` (real Docker) | Prerun images in Docker. | **In place, against real Docker**, tagged with a throwaway prefix (see below) and deleted after the test run. Assert on what's inside each image, including what only the copied files show (a prompt file read at its commit, a bundle with nothing after its commit). Runs under `test:docker` only. |
| `run <tc>` | Builds any missing prerun images, then runs each iteration. Produces the prerun images, the postrun images, and the run data store in `.thunderjar/.data/`. | **Copy, then run, against real Docker.** Assert on stdout, the store it wrote, and the prerun and postrun images. Images use a throwaway prefix and are deleted after the test run. |
| `executions [<tc>]` | stdout: executions, newest first. Reads the run data store. | **In place, against a store checked into the scenario** as its starting state, with fixed IDs and timestamps. The expected listing is in the test. |
| `show <tc \| execution \| container run>` | stdout: aggregation results, or one container run's details. Reads the run data store. | **In place, against a store checked into the scenario**, including failed runs, errored measures and an execution with no aggregation results. |

## Product changes this needs

1. **`build --dry-run`.** Prints the Dockerfile for **every** permutation's prerun image, and writes nothing. It skips the build, the Docker reachability check and the image checks, so the output doesn't depend on Docker's state. The Dockerfile is the one `build` already writes into each build context (`src/commands/build/build.ts:112-116`).
2. **Custom image prefix.** `BuildOptions.repository` and `RunOptions.repository` already exist (`build.ts:43`, `run.ts:50`, default `LOCAL_REPOSITORY` = `thunderjar`), but only tests can set them. Expose this as a CLI flag, `--image-prefix <name>`, on `build`, `run` and `plan` (plan prints the tags), parsed in `src/cli/index.ts`. Real-Docker tests pass a throwaway prefix and delete every image under it afterwards, as `src/commands/build/build.docker.test.ts` already does.
3. **`run` builds, then runs.** Today `run` runs each agent on the host (`createHostRunner`, `src/commands/run/run.ts:82`) and only looks up prerun images. It should build any missing prerun image the way `build` does, reusing `build`'s code, then run each iteration in a container from that image, leaving a postrun image. Both kinds of image are tagged with `--image-prefix`.

## Not covered by scenarios

These stay as `src/` unit tests: crashes injected through the runner, and the hashing comparisons in `src/matrix/hashing.test.ts`.

## Verification

- `bun test`, `bun run typecheck`, `bun run lint`.
- `bun run test:prepare && bun run test:docker` for the real-Docker build and run tests; afterwards `docker image ls <prefix>` lists nothing.
- `git status` is clean after the full suite, which shows no test wrote into a checked-in scenario.
