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

  

## Terminology

- Say "container run", not "agent", for one run of a permutation's container: what runs, is timed, crashes or leaves files.

  ```ts
  // ✅ Do
  // Four container runs have finished.
  // ❌ Don't
  // Four agents have finished.
  ```

  The container runs a harness, but what Thunderjar starts, times and records is the container run.

## `src/gauntlet`

`src/gauntlet` isn't Thunderjar code. Each folder in it is a small project of its own, with its own instructions and tools, that the test cases in `.thunderjar/` set agents to work on. oxlint and `bun test` skip it (`.oxlintrc.json`'s `ignorePatterns`, and `bunfig.toml`).

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

```ts
// ✅ Do
const log = moduleLogger("docker");
log.debug({ args, exitCode, stderr }, "docker failed");
print(`${built.length} built`);

// ❌ Don't
console.log(`docker failed: ${stderr}`);
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


## Running the tests

Run only the tests of the code you've changed, one file at a time, by path. That includes the tests of code that uses what you changed, such as a shared fixture.

✅ **Do** run each test file you've touched, and each one that depends on it, by path.

```sh
bun test src/runNext/plan/plan.test.ts
```

❌ **Don't** run the whole suite, with `bun run test` or bare `bun test`.

**Why:** the whole suite takes over a minute, and its slowest files, `src/cli/commands/run/*.test.ts` and `src/docker/docker.test.ts`, wait out real timeouts. CI runs the whole suite.

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


### Helper `fixture` script 

The `fixture` script lets a developer run any thunderjar command in a scenario's `project/`, by the scenario's ID, and observe its effects.

```sh
bun run fixture 0201 plan two-pairs
```


