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

The application is tested using the following 

- real file creating tests
- fixture + stdout tests
- create docker image tests
- read from docker image tests
- run on docker container tests
- regular unit tests

### Real file creating tests