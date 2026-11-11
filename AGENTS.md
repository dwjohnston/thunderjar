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
- `src/`: the implementation.
  - `cli/`: 
    - `index.ts`:" the entry point.
    - `program.ts`: builds it
    - `commands/`: one folder per command
      - `<command>/`
        - `<command>.ts`
        - `<command>.test.ts`  
  - `log/`: the diagnostic logger (pino).
  - `config/`: finds a project's `.thunderjar/` folder and loads its declarations.
  - `testing/`: the fixture harness that tests use to run the CLI in a scenario.
- `docs/`: the VitePress docs site.
  - `.vitepress/`: site config.
  - `cli/`: CLI reference pages, generated per command.
  - `index.md`: landing page.
- `project-md/`: markdown files live here
  - `candidates`: tracking various commits points across varios projects that will make good thunderjar test cases
  - `research`: preserved unstructured investigations
  - `prd` - product requirements docs
  - `delivery`: concreted planned work goes here 
    - `tasks`
      - `done`: completed tasks go here
      - `draft`: draft tasks here 
      - `<task-number>_<task-name>.md`: ready tasks here 
- `scripts/`: release, versioned-docs and lint tooling.
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

- A command's output, what the user reads, goes through `src/cli/output.ts`: `print` for stdout, `printError` for stderr. Tests assert on it.
- Diagnostics go through the pino logger in `src/log/logger.ts`. Take one per module with `moduleLogger("<module>")`. It writes JSON lines to stderr, and is silent unless `--log-level` or `THUNDERJAR_LOG_LEVEL` asks for a level.

```ts
// ✅ Do
const log = moduleLogger("docker");
log.debug({ args, exitCode, stderr }, "docker failed");
print(`${built.length} built`);

// ❌ Don't
console.log(`docker failed: ${stderr}`);
```

**Why:** stdout is the command's output, which users and tests read, so it stays plain text. The log can say far more, e.g. Docker's whole error, where the output shows only its last line, without cluttering it.

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
| `plan`       | Dry run: show what an experiment would do.                                         |
| `build`      | Build the Docker images for a given experiment.                                    |
| `run`        | Builds the required images if needed. Run an experiment: one experiment execution. |
| `executions` | List past experiment executions.                                                   |
| `show`       | Show recorded results for an execution or a container run.                         |
| `compare`    | Compare two executions.                                                            |
| `remeasure`  | Apply the current measurements to past runs.                                       |
| `restore`    | Bring a container run's end state into the current repository.                     |

## Test types



1. Real file creating tests
   - For commands that need to create files
      - eg. `init`, `generate`
   - Create a copy of scenario in a temp directory and run there, and then assert on the files created. 
2. Fixture + stdout tests
   - For commands that only read the project
     -`plan` or `show`, or commands with a `--dry-run`
   - Run on the scenario unchanged, and assert on stdout. 
3. Create docker image tests
    - eg. `build`
   - Uses real docker 
   - Run the command, assert on the created docker image, then clean up docker image.
   - Tests of this type should have the extension `.docker.test.ts`
   - `bun test` skips them. Run them with `bun run test:docker`, which CI runs too.
   - Pass `{ docker: "real" }` to the `thunderjar()` test helper, and a throwaway `--image-prefix`, unique to the run.
4. Read from docker image tests
   - For commands that read from an existing image, but do not need to act on it 
    - e.g. `remeasure`, 
   - The image is presumed to already exist 
   - Tests of this type should have the extension `.docker.test.ts`
   - `bun test` skips them. Run them with `bun run test:docker`, which CI runs too.
   - Pass `{ docker: "real" }` to the `thunderjar()` test helper, and a throwaway `--image-prefix`, unique to the run.
5. Run on docker container tests
   - eg. `run`. Start
   -  containers from an existing image, execute some behaviour, then assert on effects both inside the container and out.
   - Tests of this type should have the extension `.docker.test.ts`
   - `bun test` skips them. Run them with `bun run test:docker`, which CI runs too.
   - Pass `{ docker: "real" }` to the `thunderjar()` test helper, and a throwaway `--image-prefix`, unique to the run.
6. Regular unit tests
   - For comprehensive business logic
7. Real agent tests
   - Run a real agent, against a real model, through `run`, e.g. scenario `0501` running Claude Code.
   - Tests of this type should have the extension `.agent.test.ts`
   - `bun test` skips them. Run them with `bun run test:agent`, with Docker and `ANTHROPIC_API_KEY` set. Each run costs a few cents.
   - Not run in CI yet: an on-demand workflow is still to be added.
8. The installed package's smoke test
   - `bun run test:package` packs Thunderjar, installs the tarball into an empty project in a temporary folder, and runs `init`, `generate`, `plan example` and `run example --dry-run` there with the installed `thunderjar`.
   - Every other test runs Thunderjar from source. This one catches what only the package gets wrong, such as a file left out of `files`.

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
  plan/
    plan.ts
    plan.test.ts        runs against 0201, 0202, 0401
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
      plan.test.ts
      project/
    0202_typical_project/
      plan.test.ts
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
bun run fixture 0201 plan two-pairs
```


### Dos and Don'ts 

- You don't need to keep the `project-md/prd` up to date. Let it drift. 
- _do not_ update the the docs in `./docs` let the user do that. 

