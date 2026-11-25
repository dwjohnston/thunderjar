@HUMANS.md

# Thunderjar 

Thunderjar is a TypeScript/Bun CLI for
  - Running repeatable experiments that
     - Compare coding-agent harnesses for these combinations: 
        - Base docker image
        - Initial code state
        - Prompsets (AGENTS.md, SKILL.md files etc)
        - The harness model pair 
        - The task 
  - Experiments are run in docker containers
  - After the run is complete, measurements are applied 
  - Different configurations of a run can be compared by comparing the same measurements 

  

## Folder structure 

- `fixtures`: Fixtures - see below for details. 
- `src/`: the implementation. Its folders are layers, lowest first (see below).
  - `log/`: the diagnostic logger (pino).
  - `services/`: the injected services, one folder each, with its in-memory fake beside it, e.g. `Clock/Clock.ts` and `FakeClock.ts`.
  - `testing/`: the fixture harness that tests use to run the CLI in a scenario, plus a fake `docker` binary and a fake registry server.
  - `api/`: the public API a project's `.thunderjar/` files use, e.g. the `declareX()` functions and their types.
  - `instruments/`: the built-in measuring instruments, one folder each.
  - `config/`: finds a project's `.thunderjar/` folder and loads its declarations.
  - `docker/`: everything Thunderjar asks of Docker: building images, running and committing containers. Also the adapter that makes a `DockerService` of them.
  - `store/`: the run data store (SQLite or Postgres), the `Stores` service that opens it, and its fake.
  - `execution/`: what the commands do with an experiment: naming and hashing its images, measuring, aggregating results.
    - `run/`: everything `run` does. See "Architecture of `run`" below.
  - `measureTesting/`: `measure()`, shipped as `thunderjar/testing`, for a project's own tests of its measurements.
  - `capture/`: the hooks that capture a coding-agent session as git records.
  - `cli/`: 
    - `index.ts`: the entry point, and the only place that builds real services.
    - `program.ts`: builds the commander program.
    - `commands/`: one folder per command
      - `<command>/`
        - `<command>.ts`
        - `<command>.test.ts`  
  - `gauntlet/`: challenges that Thunderjar's own experiments set agents, one folder each. Not Thunderjar code: see below.
- `docs/`: the VitePress docs site.
  - `.vitepress/`: site config.
  - `cli/`: CLI reference pages, generated per command.
  - `index.md`: landing page.
- `project-md/`: markdown files live here
  - `candidates`: tracking various commits points across varios projects that will make good thunderjar test cases
  - `research`: preserved unstructured investigations
  - `prd` - product requirements docs
  - `delivery`: concreted planned work goes here 
    - `ralph.ts`: runs the ready tasks one at a time with `claude -p`, each to a draft PR
    - `tasks`
      - `archive`: tasks from before the ralph loop
      - `done`: completed tasks go here
      - `draft`: draft tasks here 
      - `<task-number>_<task-name>.md`: ready tasks here 
- `scripts/`: release, versioned-docs and lint tooling.
  - `ci-metrics/`: uploads CI test timings to Supabase, and a local Grafana dashboard for them. See its README.
- `.changeset/`: pending changesets. 
- `.release/`: release candidate state (`rc.json`).
- `.github/`: CI workflows.
- `.agents/`: agent skills.

## Layers of `src/`

Each top-level folder of `src/` is a layer. A file may import from its own layer and the layers before it, never from one after it. `bun run lint` enforces this, with oxlint rules generated from `scripts/layers.ts`.

To add a layer, when its first module arrives:

1. Add the folder to `LAYERS` in `scripts/layers.ts`, in its place in the order.
2. Run `bun run lint:generate`. It rewrites the `overrides` of `.oxlintrc.json`.
3. Commit both files.

```ts
// scripts/layers.ts, lowest first
export const LAYERS: readonly string[] = ["project", "cli"];
```

✅ **Do** change the layers in `scripts/layers.ts`, and the other rules in `.oxlintrc.json` outside `overrides`.

❌ **Don't** edit the `overrides` of `.oxlintrc.json` by hand. The next `lint:generate` overwrites them.

`bun run lint` fails when a folder in `src/` is not a layer, or when `.oxlintrc.json` is out of date. Rules also apply to files in subfolders, so re-run `bun run lint:generate` after adding a deeper folder too.

**Why:** later modules land in their final place, so nothing needs restructuring. Overrides replace a top-level rule rather than adding to it, so the generator copies the top-level `no-restricted-imports` patterns (the `node:` ban) into each one.

`src/gauntlet` is the exception: it's in `NOT_LAYERS`, not `LAYERS`. Each folder in it is a small project of its own, with its own instructions and tools, that the test cases in `.thunderjar/` set agents to work on. oxlint and `bun test` skip it (`.oxlintrc.json`'s `ignorePatterns`, and `bunfig.toml`).

## Use Bun

The `node` APIs are banned. 

Use Bun's APIs instead.

```ts
// ✅ Do
import { file } from "bun";
const config = await file("config.json").json();

// ❌ Don't
import { readFile } from "node:fs/promises";
const config = JSON.parse(await readFile("config.json", "utf8"));
```

If needing to execute shell commands, use bun's `$` command.

```ts
// ✅ Do
import { $ } from "bun";
await $`git status --short`;

// ❌ Don't
import { execSync } from "node:child_process";
execSync("git status --short");
```

## Output and logging

Never use `console` in `src/`. The `no-console` lint rule bans it.

- A command's output, what the user reads, goes through `src/cli/output.ts`: `print` for stdout, `printError` and `printWarning` for stderr. Tests assert on it.
  - `run` is the exception. Its code only updates the run state, and the `Displayer` service draws it: a frame each second on a terminal, one final frame off one.
- A command that reports results takes `--json` (`jsonOption()` in `src/cli/json.ts`), and prints them with `printJson`. With `--json`, `print` and waiting lines go to stderr, so stdout is the JSON alone. Errors stay on stderr, with a non-zero exit code.
- Diagnostics go through the pino logger in `src/log/logger.ts`. Take one per module with `moduleLogger("<module>")`.
  - It writes readable lines to a file, never the terminal: a new file in `.thunderjar/logs/` (git-ignored) per command, or `--log-file`.
  - It logs at `info`, unless `-v` (debug), `--log-level` or `THUNDERJAR_LOG_LEVEL` says otherwise.
  - The test harness sends it to a file under `fixtures/.tmp/`. Pass `{ log: true }` to `thunderjar()` to read it.

```ts
// ✅ Do
const log = moduleLogger("docker");
log.debug({ args, exitCode, stderr }, "docker failed");
print(`${built.length} built`);

// ❌ Don't
console.log(`docker failed: ${stderr}`);
```

**Why:** stdout is the command's output, which users and tests read, and on a terminal parts of it are redrawn in place. Log lines written to the terminal in between would garble that, so the log goes to a file, where it can say far more, e.g. Docker's whole error, where the output shows only its last line.

## Versioning while in 0.x

While the package is below 1.0.0, shift every changeset bump down one level.

| Change | Changeset type | Example from 0.1.0 |
|---|---|---|
| Breaking change | `minor` | 0.2.0 |
| New feature | `patch` | 0.1.1 |
| Bug fix | `patch` | 0.1.1 |

Never use `major` until we decide to release 1.0.0.

✅ **Do this**

```md
---
"thunderjar": patch
---

Add an `init` command.
```

❌ **Don't do that**

```md
---
"thunderjar": minor
---

Add an `init` command.
```

**Rationale:** Changesets applies bump types literally. It has no setting for 0.x, so a `minor` changeset for a new feature releases 0.2.0, and a `major` one releases 1.0.0. Under the 0.x convention, a minor version bump means a breaking change, so you have to choose the shifted type yourself.

## Docs are versioned

The docs site publishes the docs of every stable release, not of main.

- A docs change only goes live with a release.
  - To fix the published docs, add a patch changeset to the PR.
- Releases with identical docs share one build, and one entry in the version switcher.
- Build the whole site locally with `bun run docs:build:versions`.
  - Output goes to `.versioned-docs/dist`.


## The CLI commands

These are the planned CLI commands. See the [CLI reference](./project-md/prd/100-cli-reference.md) for full details.

| Command      | Purpose                                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| `init`       | Scaffold the configuration folder.                                                 |
| `doctor`     | Check that the environment is ready to run.                                        |
| `generate`   | Emit the typed parameter names.                                                    |
| `run`        | Run an experiment: one execution. Builds any missing image first. `--dry-run` shows the plan and builds nothing. `--build-only` builds the images and runs nothing. |
| `executions` | List past experiment executions.                                                   |
| `show`       | Show recorded results for an execution or a container run.                         |
| `compare`    | Compare two executions.                                                            |
| `remeasure`  | Apply the current measurements to past runs.                                       |
| `checkout`   | Bring a container run's end state back, as a branch or a shell, to inspect it.        |

There is no `plan` or `build` command: `run --dry-run` and `run --build-only` replaced them. `run --local`, `attach` and the runner container are gone too.

## Architecture of `run`

`run` is three levels over injected services, in `src/execution/run/`. Read [src/execution/run/AGENTS.md](./src/execution/run/AGENTS.md) before changing it.

- `runCommand` resolves the test case, `runTestCase` plans and builds, `runManifest` runs.
- Lower levels write to the run state and never print.
- Only `src/cli/index.ts` builds real services. What each service and its fake is: [src/services/AGENTS.md](./src/services/AGENTS.md).

## Test types

### Prefer in-memory fakes

✅ **Do** test behaviour by passing fakes to the function, and asserting on state and records.

```ts
// 👍 Good
const fakes = fakeDependencies();
const manifest = aManifest();
for (const { image } of manifest.images) fakes.runtimeDocker.addImage(image);
fakes.runtimeDocker.on("", fakeAgent());

const running = runManifest(manifest, fakes.deps);
await fakes.clock.advance(120_000);

expect((await running).execution.status).toBe("complete");
```

❌ **Don't** spawn the CLI in a scenario to test what a command does after it has read the project.

**Why:** a fake needs no process, no files and no waiting, and can make Docker fail in ways a scenario can't. All of `run`'s behaviour is tested this way.

### The types

1. In-memory fake tests
   - For code that takes services: all of `src/execution/run/`, and the services' own fakes.
   - Every service has a fake beside it. `fakeDependencies()` in `src/execution/run/testSupport.ts` builds them all.
   - Time is a `FakeClock`: nothing happens until the test calls `advance`.
2. Regular unit tests
   - For pure logic, e.g. `plan`, `render`, hashing, aggregating.
3. Fixture + stdout tests
   - For code that reads a real `.thunderjar/` folder: loading the config, resolving a test case, and commands that only read, e.g. `show`, `executions`, `run --dry-run`.
   - Run on the scenario unchanged, and assert on stdout.
   - `run` has one such file, `src/cli/commands/run/run.test.ts`. It only shows that the command line reaches `runCommand` with real services.
4. Real file creating tests
   - For commands that need to create files
      - eg. `init`, `generate`
   - Create a copy of scenario in a temp directory and run there, and then assert on the files created. 
5. Real Docker tests
   - For what only a real daemon can show: the functions in `src/docker`, and commands that read an image a run left, e.g. `remeasure`, `checkout`, `purge`.
   - Those commands' tests seed their image with a real `run` first.
   - Tests of this type should have the extension `.docker.test.ts`
   - `bun test` skips them. Run them with `bun run test:docker` (one at a time). CI runs `bun run test:docker:parallel`.
   - Pass `{ docker: "real" }` to the `thunderjar()` test helper, and a throwaway `--image-prefix`, unique to the run.
   - `run` has no real-Docker test of its own.
6. Real agent tests
   - Run a real agent against a real model. The one file is `src/capture/capture.agent.test.ts`, session capture with Claude Code.
   - Tests of this type should have the extension `.agent.test.ts`
   - `bun test` skips them. Run them with `bun run test:agent`. Each run costs a fraction of a cent.
   - In CI, on demand: the "Real agent tests" workflow (`agent.yml`).
   - `run` has no real agent test. Real models run through `run` in `slow-tests.yml`, only on a `/slow-tests` PR comment, on the release candidate and release PRs, or by hand: the dogfood run, and step 4 of `src/cli/commands/capture/capture.docker.test.ts`, a real job in each harness. Claude Code uses `ANTHROPIC_API_KEY`; the other harnesses use OpenRouter, with the `OPENROUTER_TOKEN` secret.
7. The installed package's smoke test
   - `bun run test:package` packs Thunderjar, installs the tarball into an empty project in a temporary folder, and runs `init`, `generate` and `run example --dry-run` there with the installed `thunderjar`.
   - Every other test runs Thunderjar from source. This one catches what only the package gets wrong, such as a file left out of `files`.

## Running the tests

Run as little of the suite as the change needs while you work.

✅ **Do** run the tests of the code you're changing, by path, while you work.

```sh
bun test src/execution/run
```

✅ **Do** run the whole suite with `bun run test`, once, before you commit.

❌ **Don't** run bare `bun test` for the whole suite.

**Why:** `bun run test` adds `--parallel`, and finishes in about half the time of bare `bun test` (about 15s against 30s). `bunfig.toml` can't set `parallel`, so the flag lives in the script.

- The tests of `run` are no longer the slow ones: they run in memory, on a fake clock.
- The slowest file is now `src/docker/docker.test.ts`, which waits out real timeouts. Leave it out unless you've touched that code.

## Fixtures 

Fixtures are example projects with sample thunderjar configurations. 

### Folder structure

```
fixtures/
  node_modules/thunderjar   link to the repo root, so scenarios resolve `thunderjar`
  01_unitialised/
    0101_empty_project/
      project/
    0102_javascript_project/
      project/
  02_regular/
    0201_minimal_existing_setup/
      tsconfig.json 
      project/
  04_unhappy/ 
```

See [`fixtures/AGENTS.md`](./fixtures/AGENTS.md) for the harness, the placeholders in the CLI's output, and the catalogue of scenarios.

#### Why a scenario has its own `tsconfig.json`

The `tsconfig.json` beside `project/` lets a scenario be type-checked the way a user's editor would check it.

- e.g.
  ```jsonc
  {
    "extends": "./project/.thunderjar/tsconfig.json", // the tsconfig init scaffolds
    "compilerOptions": { "types": ["bun"] },
    "files": ["parameterNames.test.ts"]               // the scenario's type tests
  }
  ```

- **Each scenario is its own TypeScript program.**
  - `generate` writes the parameter names as global types, e.g. `type TaskName = "is-prime" | "wait"`. Two scenarios in one program would each declare `TaskName`, and the check would fail on the duplicates.
- **It sits outside `project/`.**
  - It adds the type tests and Bun's types, which a user's project wouldn't have.
- **Not every scenario has one.**
  - Uninitialised projects have nothing to check yet. Scenarios broken on purpose would fail the check, and their tests expect that.

The fixtures represent _scenarios_. 

Tests for the individual commands are then run against one or more scenarios. 

Tests should never modify the scenarios. 

### Where tests live

#### Tests of a command go beside the command

✅ **Do** put a command's tests next to its code, and have them run against whichever scenarios they need.

```
// 👍 Good
src/cli/commands/
  show/
    show.ts
    show.test.ts        runs against 0201, 0203
fixtures/
  02_regular/
    0201_minimal_existing_setup/
      project/
```

❌ **Don't** put a command's tests in the scenario folders.

```
// 👎 Bad
fixtures/
  02_regular/
    0201_minimal_existing_setup/
      show.test.ts
      project/
    0202_typical_project/
      show.test.ts
      project/
```

#### Refer to a scenario by its ID, through one helper

✅ **Do** reach a scenario through a single helper, by its ID.

```ts
// 👍 Good
const dir = scenario("0201");             // fixtures/02_regular/0201_…/project
const folder = scenarioFolder("0201");    // fixtures/02_regular/0201_…
```

❌ **Don't** hard-code a scenario's path in a test, or keep a list in a scenario of the tests that use it.

```ts
// 👎 Bad
const dir = "fixtures/02_regular/0201_minimal_existing_setup/project";
```

**Why:** the helper fails loudly for an unknown ID, so renaming a scenario folder breaks no tests. To find what uses a scenario, search for its ID. A "used by" list goes stale.


#### Escape hatch: Specific scenario tests 

There are some scenarios where a scenario specific test is warranted. 

```
0201_minimal_existing_setup/
  tsconfig.json
  config-typings.test.ts
  project/
    .thunderjar/
```

In this case it's tests that checking the behaviour of the typings. These tests _need_ to be located beside the tsconfig for that scenario. 

### Helper `fixture` script 

The `fixture` script lets a developer run any thunderjar command in a scenario's `project/`, by the scenario's ID, and observe its effects.

```sh
FAKE_HARNESS_KEY=x bun run fixture 0202 run two-harnesses --dry-run
```


### Dos and Don'ts 

- You don't need to keep the `project-md/prd` up to date. Let it drift. 
- _do not_ update the the docs in `./docs` let the user do that. 

