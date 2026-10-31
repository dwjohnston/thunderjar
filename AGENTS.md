# Thunderjar 

Thunderjar is a TypeScript/Bun CLI for
  - Running repeatable experiments that
     - Compare coding-agent harnesses for these combinations: 
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
- `scripts/`: release and versioned-docs build tooling.
- `.changeset/`: pending changesets. 
- `.release/`: release candidate state (`rc.json`).
- `.github/`: CI workflows.
- `.agents/`: agent skills.

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

For paths and files, `src/platform/` has what Bun lacks: POSIX path functions in `path.ts`, in place of `node:path`, and file helpers in `fs.ts`, in place of `node:fs` and `node:os`. Code anywhere in the repository may import them.

```ts
// ✅ Do
import { join } from "../src/platform/path.ts";
import { makeTempDir } from "../src/platform/fs.ts";

// ❌ Don't
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
```

**Rationale:** Bun has no path module of its own, and its file APIs don't cover everything, such as temp directories or recursive listing. One shared set of helpers saves every file from writing its own. `bun run lint` fails a `node:` import anywhere: `src/`, `scripts/` and tests alike.

## Delivery

At each step of a delivery, this project should produce a _working_ npm-publishable artifact.

All commands in the CLI should work, even if working means printing a "Not implemented" message.

That is, `npx thunderjar init` should produce code that has no import or type errors.

### Committing and tests

Don't leave code uncommitted. Always commit changes before handing back to the user.

Commit changes in sensible blocks. Use your judgement as to whether an `--amend` commit is appropriate.

When given feedback that behaviour should change:

- Write a test that detects the behaviour first, and commit it with a message starting with the 🔴 emoji, to show the test fails.
- Write the fix, and commit it with a message starting with the 🟢 emoji.

## Source layout

`src/` is in layers that only import downward. The CLI is in `src/cli/`: each command has a folder under `src/cli/commands/`, and `src/cli/program.ts` adds them to the Commander program. Read [src/AGENTS.md](src/AGENTS.md) before adding or moving a module.

## Fixture tests

Each scenario is described in [fixtureTests/AGENTS.md](fixtureTests/AGENTS.md).

`fixtureTests/` holds checked-in Thunderjar projects that the CLI is run against, the way a user would run it. Every command test runs against one of these scenarios.

**Rationale:** a test that builds its project in a temp folder can't be checked by hand. With a real project on disk, a developer can run the same command the test runs and see the same output:

```sh
bun run fixture scenario_2 run two-pairs --dry-run   # or just: bun run fixture 2 …
```

### Run against a scenario, unchanged

✅ **Do** run the command against a checked-in scenario as it is, and assert only on what the command produced: its output, its exit code, and the files or images it wrote.

❌ **Don't** generate a project or patch a scenario's files in a test. Any variation a test needs, such as an empty parameter folder or a store with a failed run, belongs in a scenario: add it to one that fits, or add a scenario.

**Rationale:** a project made or changed by a test only exists while the test runs, so nobody can run the command against it by hand.

### Scenarios don't know about their tests

✅ **Do** keep every expected result in the test. A scenario is a project and the state it starts in: its declarations, and anything already on disk, such as a checked-in run data store.

❌ **Don't** name anything in a scenario after a test, or keep expected output in it.

**Rationale:** tests of many commands share a scenario. One that holds a test's expectations can't be read as a plain project, or changed for another test without breaking the first.

### Copy only for commands that write into the project

✅ **Do** run in place, in the scenario's `fixtures/`. Only `init`, which writes into the project, works on a copy (`copyOfFixtures()` in `src/testing/cli.ts`). A real `run` runs in place too, with `--data-dir` set to a temp folder, and never in a scenario with a checked-in run data store. `remeasure` writes into that store, so it runs in place with `--data-dir` set to a temp folder holding an unmodified copy of the scenario's `runs.json`. `generate` writes only the gitignored `.thunderjar/_generated/`, so it runs in place, and its test deletes that file first.

❌ **Don't** copy a scenario for a command that only reads it, such as `plan`, `show` or a dry run.

**Rationale:** in place, a test runs exactly what `bun run fixture` runs. The copy is only there so no test changes a checked-in scenario: `git status` is clean after the full suite.

### Other rules

- **Each folder is a scenario, not a feature.** Name it `scenario_<n>_<what the project is>`, e.g. `scenario_2_typical_project`, not `run`. A scenario is a kind of project, and tests of any command can use it.
- **Each scenario has `fixtures/.thunderjar/`** (the project) and a `tsconfig.json`, so `fixtureTests/typecheck.test.ts` type-checks it too. The exceptions are a project before `init`, which has neither, and a project broken on purpose, which has no `tsconfig.json`: its declarations don't type-check, or `generate` fails. `thunderjar` resolves from every scenario through the checked-in link `fixtureTests/node_modules/thunderjar`.
- **A command's tests sit beside the command**, e.g. `build`'s are in `src/cli/commands/build/build.test.ts`. They reach a scenario through `scenario()` in `src/testing/cli.ts`. See [src/AGENTS.md](src/AGENTS.md).
- **Tests drive the CLI**, not internal functions, using `src/testing/cli.ts`. They normalise only what changes between runs (execution ID, `$TMPDIR`, durations), so expected output reads like what's printed.
- **Real-Docker tests tag their images with a throwaway prefix** and delete every image under it afterwards. They sit in `<command>.docker.test.ts` and run under `bun run test:docker` only.
- **Behaviour the CLI can't trigger** (e.g. a crash injected through a runner) stays in `src/` unit tests.

## Never refer to real agents in tests

Fixtures and `src/` unit tests never name a real agent: no real harness (claude-code, codex, …), no real model, and none of their files (`CLAUDE.md`, …). Use:

| | Name | Model ID | Behaviour |
|---|---|---|---|
| harness | `fake-harness-alpha` | | writes a buggy `isPrime.ts` with a `@ts-ignore` |
| harness | `fake-harness-beta` | | writes a correct `isPrime.ts` |
| model | `fake-model-small` | `fake-model-small-001` | |
| model | `fake-model-large` | `fake-model-large-001` | |

Both harnesses' `cli` really run, so any test case can be run for real by hand, and the two give different measures. Misbehaving agents (failing, hanging) are further versions of `fake-harness-alpha`; see `fixtureTests/scenario_3_misbehaving_agents`.

The one exception is `src/cli/commands/init/init.ts` and its test: `init` scaffolds claude-code for real users, and the test checks exactly that.

**Rationale:** tests mustn't look like they depend on, cost money with, or endorse a real product, and an obviously fake name makes it clear which agent produced what.

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
3. Real git tests 
   - For parameters that read real commits: code states that use `checkoutCommit`, and prompt sets that use `ctx.git.show`.
     - eg. `build`, `build --dry-run`
   - The scenarios live in `03_real_git/`. Each one's project is committed to this repository several times, and its declarations pin those commits by hash.
     - e.g.
       ```ts
       export default declareCodeState({
         config: { commit: "65bcb92cc069821e4695433b11582962ee6d68bd" },
         applyParameter: (config, ctx) => checkoutCommit(ctx, config.commit),
       });
       ```
   - Run on the scenario unchanged, and assert that each file comes from its own commit, not from the worktree.
     - The worktree's copy of each file has moved on from every pinned commit, so a file read from the worktree fails the test.
     - With real Docker, also assert that `/workspace` is detached at the commit, with no remote and nothing after it.
   - Include a commit this repository doesn't have, and assert that the build stops before anything is built.
   - Pinned commits must stay reachable:
     - ✅ Add a new commit for a new state, tag it `fixture-<scenario>-<name>`, and push the tag.
     - ❌ Don't amend, squash or rebase away a pinned commit, or move its tag.
     - CI checks out with full history and tags (`fetch-depth: 0`).
     - **Why:** a commit that's only on a branch disappears when the branch is squash-merged or deleted. Then the scenario breaks on every fresh clone, CI included.
4. Create docker image tests
    - eg. `build`
   - Uses real docker 
   - Run the command, assert on the created docker image, then clean up docker image.
5. Read from docker image tests
   - For commands that read from an existing image, but do not need to act on it 
    - e.g. `remeasure`, 
   - The image is presumed to already exist 
6. Run on docker container tests
   - eg. `run`. Start
   -  containers from an existing image, execute some behaviour, then assert on effects both inside the container and out.
7. Regular unit tests
   - For comprehensive business logic

## Fixtures 

Fixtures are example projects with sample thunderjar configurations. 

### Folder structure

```
fixtures/
  01_unitialised/
    0101_javascript_project/
      project/
    0102_bash_project/
      project/
  02_regular/
    0101_minimal_existing_setup/
      tsconfig.json 
      project/
  03_real_git/
  04_unhappy/ 
```

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
const dir = scenario("0201");
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

A helper script `fixture` should exist. This allows the human developer to run arbitrary thunderjar commands against a given scenario and observe its effects. 


```sh
bun run fixture 2 plan two-pairs
```