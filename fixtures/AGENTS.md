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

- A scenario in `04_unhappy/` must fail, with exactly the errors the test lists for it.
- Any other scenario must pass.
- The test doesn't run `generate`, so a checked scenario checks in its `_generated/` folder. A test of `generate` keeps it up to date.

## Add a variation as a scenario

✅ **Do** put any variation a test needs, such as an empty parameter folder or a failed run, into a scenario: one that fits, or a new one.

❌ **Don't** generate a project, or patch a scenario's files, in a test. And don't name anything in a scenario after a test, or keep expected output in it.

**Why:** a variation made in a test can't be run by hand, and a scenario that knows about one test can't be shared by others.

## Keep the catalogue up to date

✅ **Do** update the catalogue below in the same change that adds a scenario, or changes what one's agents, code states, prompt sets or test cases do.

❌ **Don't** leave it describing what a scenario used to be.

**Why:** the catalogue is how you pick a scenario for a new test without reading every fixture file. A stale entry sends a test to the wrong project.

## Scenario catalogue

- **What the scenarios share**
  - Initialised scenarios start from what `init` scaffolds in an empty project: base image `node20`, code state `baseline`, prompt set `snerk`, task `is-prime` with initial prompt `plain` and measurement `isPrimeTsExists`, and test case `example`.
  - The agent is the fake `fake-harness-alpha`, version `1.0.0`, model `fake-model-small`, instead of `claude-code`.
  - Each checks in its `_generated/parameterNames.d.ts`, though `.thunderjar/.gitignore` ignores it, so it type-checks without running `generate`.
- **01_unitialised**: projects before `init`.
  - `0101_empty_project`: an empty project, not JavaScript. `init` gives it a nested `.thunderjar/package.json`.
  - `0102_javascript_project`: a JavaScript project with its own `package.json`. `init` gives it no nested one.
- **02_regular**: initialised projects that work.
  - `0201_minimal_existing_setup`: exactly the shared setup. Has type tests of the generated names.
- **04_unhappy**: projects broken on purpose.
  - `0401_type_errors`: the shared setup, but test case `example` names prompt set `snerkk`, which isn't declared. Fails to type-check.
  - `0402_broken_declarations`: the shared setup, beside declarations broken in ways only loading finds. No `tsconfig.json` or `_generated/`: it isn't type-checked.
    - Base image `no-default-export`, which exports its declaration under a name.
    - Code states `unwrapped`, a plain object, and `wrongly-wrapped`, wrapped in `declareBaseImage`.
    - Task `fizz-buzz`, whose only initial prompt is `fizzy`.
    - Test cases, instead of `example`: `sound`, as `example` is in the shared setup, and one per mistake: `unknown-prompt-set` (`snirk`), `unknown-task` (`is-even`), `prompt-of-another-task` (`fizzy`), `unexported-base-image`, `unwrapped-code-state`, `wrongly-wrapped-code-state`, `unknown-harness-models` (an unknown version, an unknown model, and a pair not of the form `harness@version/model`), `empty-code-states` (`codeState: []` and 2.5 iterations) and `zero-iterations`.
  - `0403_broken_harness_family`: the shared setup, with a second fake agent, `fake-harness-beta`, whose `versions.ts` isn't wrapped in `declareHarnessVersions`. No `tsconfig.json` or `_generated/`.
    - Test cases: `example`, and `beta`, which names `fake-harness-beta@1.0.0/fake-model-large`.
  - `0404_empty_parameter_folders`: the shared setup with every declaration deleted: each parameter folder holds only a `.gitkeep`. Test case `example` is left. No `tsconfig.json` or `_generated/`.

Keep it in this format:

- **What the scenarios share**
  - The base image, code state, prompt sets and fake agents that most scenarios use, so entries only list their differences.
- **One entry per scenario**
  - `<NNNN>_<name>`: what the project is, in one line.
    - Fake agents, code states, prompt sets, tasks and test cases, where they differ from the shared ones.
    - Whether it uses real git.
