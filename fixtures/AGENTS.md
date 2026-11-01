# Fixture scenarios

Each scenario is a checked-in project that the CLI runs against, the way a user would run it. The general fixture rules are in the root `AGENTS.md`, under "Fixtures".

## Layout

```
fixtures/
  node_modules/thunderjar      link to the repo root, so scenarios resolve `thunderjar`
  01_unitialised/              projects before `init`
  02_regular/                  initialised projects that work
  03_real_git/                 parameters that read real commits of this repository
  04_unhappy/                  projects broken on purpose
    <NNNN>_<what it is>/       a scenario, e.g. 0201_minimal_existing_setup
      project/                 the user's project: the CLI runs here
      tsconfig.json            optional: type-checks the scenario, see below
      *.test.ts                optional: the scenario's type tests
```

- A scenario's ID is its 4 digits. The first two are its group's number.
- A folder only counts as a scenario if it has a `project/`.
- Anything that isn't part of the user's project sits beside `project/`, not in it.
- `.tmp/` holds the copies that tests write to. It is git-ignored.

## The harness

Tests reach scenarios through `src/testing/`.

```ts
import { thunderjar, copyScenarioProject } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

// Read-only commands run on the scenario unchanged.
const { stdout, exitCode } = await thunderjar(scenario("0201"), ["plan", "two-pairs"]);

// Commands that write files run on a copy.
await using copy = await copyScenarioProject("0101");
await thunderjar(copy.dir, ["init"]);
```

`thunderjar()` replaces what changes between runs with placeholders.

| Output | Placeholder |
|---|---|
| The directory it ran in | `<PROJECT>` |
| The repo root | `<REPO>` |
| Paths passed in `paths`, e.g. a `--data-dir` | Your choice, e.g. `<TMP>` |
| A ULID | `<ULID>` |
| A duration, e.g. `123ms` or `1.2s` | `<duration>` |

Run a command by hand in a scenario with its ID:

```sh
bun run fixture 0201 plan two-pairs
```

## Type-checked scenarios

`src/testing/scenarios.typecheck.test.ts` runs `tsc --noEmit -p <scenario>/tsconfig.json` for each scenario with a `tsconfig.json` beside its `project/`. A scenario without one isn't checked.

## Add a variation as a scenario

✅ **Do** put any variation a test needs, such as an empty parameter folder or a failed run, into a scenario: one that fits, or a new one.

❌ **Don't** generate a project, or patch a scenario's files, in a test. And don't name anything in a scenario after a test, or keep expected output in it.

**Why:** a variation made in a test can't be run by hand, and a scenario that knows about one test can't be shared by others.

## Keep the catalogue up to date

✅ **Do** update the catalogue below in the same change that adds a scenario, or changes what one's agents, code states, prompt sets or test cases do.

❌ **Don't** leave it describing what a scenario used to be.

**Why:** the catalogue is how you pick a scenario for a new test without reading every fixture file. A stale entry sends a test to the wrong project.

## Scenario catalogue

None yet.

Fill it in with this format:

- **What the scenarios share**
  - The base image, code state, prompt sets and fake agents that most scenarios use, so entries only list their differences.
- **One entry per scenario**
  - `<NNNN>_<name>`: what the project is, in one line.
    - Fake agents, code states, prompt sets, tasks and test cases, where they differ from the shared ones.
    - Whether it uses real git.
