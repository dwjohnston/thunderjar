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
const { stdout, exitCode } = await thunderjar(scenario("0202"), ["plan", "is-prime-baseline"]);

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
bun run fixture 0202 plan is-prime-baseline
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

## Changing a real git scenario's commits

✅ **Do** add a new commit holding only the scenario's project change when a real git scenario needs another state, tag it `fixture-<scenario>-<name>`, e.g. `fixture-0301-third`, and push the tag.

❌ **Don't** amend, squash or rebase away a commit a declaration pins, or move its tag.

**Why:** the declarations pin commits by hash. A commit that's only on a branch disappears when the branch is squash-merged or deleted, and then the scenario breaks on every fresh clone, CI included. The tag keeps it reachable, and CI checks out with full history and tags (`fetch-depth: 0`).

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
  - `0202_typical_project`: a matrix of two prompt sets, two fake agents and two wordings of the task.
    - Prompt sets `snerk` and `glurk`, each writing its own `FAKE_INSTRUCTIONS.md`.
    - A second fake agent, `fake-harness-beta`, version `1.0.0`, models `fake-model-small` and `fake-model-large`. It writes a correct `isPrime.ts`, where alpha's is buggy.
    - Base image `node20` installs `bun`, which the `templateTest` instrument runs its tests with.
    - Task `is-prime` has a second initial prompt, `terse`, and two more measurements: `isPrimeTemplateTest`, a `templateTest` of `isPrime.test.template.ts` (5 tests; alpha's `isPrime.ts` passes 3 and fails 2, beta's passes all 5), and `tsIgnoreCount`, a `grep` for `@ts-ignore` (alpha's has 1, beta's none).
    - Test cases: `example`, and `is-prime-baseline`: both prompt sets, `fake-harness-alpha@1.0.0/fake-model-small` and `fake-harness-beta@1.0.0/fake-model-large`, both initial prompts, 5 iterations. Matrix shape 1/1/2/2/2.
  - `0203_recorded_executions`: `0202_typical_project`, with a run data store checked in at `.thunderjar/.data/`, as if three executions had already run. Fixed execution IDs and timestamps, in UTC.
    - `.thunderjar/.gitignore` ignores `.data/`, so its files are force-added.
    - `01m3vf68s54p5eyn5s3t1ygkdj`: `is-prime-baseline`, started 2026-10-01 10:12, complete. All 40 container runs, 8 permutations × 5 iterations, every agent exiting 0.
    - `01m3ygz4g89aqh8yey8em0twpq`: `two-harnesses`, started 2026-10-02 14:40, failed. Both container runs: permutation 1, `fake-harness-alpha`, exits 0; permutation 2, `fake-harness-beta`, exits 3 and leaves no result file.
    - `01m40g5972dza3k7g3d36k55zw`: `example`, started 2026-10-03 09:05, still running. 1 × 1, with no container run recorded yet.
    - Its task's measurements are 0202's, and every container run recorded has a measure of each in its `result`, taken by those measurements as they are now: mostly alpha's and beta's usual measures, with a few runs differing, an `erroredWhileMeasuring` measure (`01m3vf68s54p5eyn5s3t1ygkdj` 2-4), and runs that left no `isPrime.ts`, so two measures are `skipped` (`01m3vf68s54p5eyn5s3t1ygkdj` 6-3, and beta's failed run in `01m3ygz4g89aqh8yey8em0twpq`).
- **03_real_git**: projects whose code states and prompt sets read real commits of this repository. See "Changing a real git scenario's commits" above.
  - `0301_git_project`: a JavaScript project committed twice, whose code states check out each commit and whose prompt sets read a file at each.
    - Real git, through `checkoutCommit` and `ctx.git.show`. Its `project/` is committed to this repository at two pinned states:
      - `first`, tagged `fixture-0301-first`: `greet.js`, `package.json`, `package-lock.json` and `prompts/house-style.md`.
      - `second`, tagged `fixture-0301-second`: `greet.js` takes a name, `farewell.js` is added, and `prompts/house-style.md` changes.
      - The worktree's `greet.js`, `farewell.js` and `prompts/house-style.md` have moved on from both, so a file read from the worktree fails the tests.
    - Code states `first` and `second` check out each commit with `checkoutCommit`, so `/workspace` is this whole repository at that commit, then run `npm ci` in the project. `unpushed` names a commit this repository doesn't have.
    - Prompt sets `house-style-first` and `house-style-second` copy `prompts/house-style.md`, read at each commit with `ctx.git.show`, to `/workspace/HOUSE_STYLE.md`.
    - Test cases, instead of `example`: `two-commits`, both code states × both prompt sets, and `unpushed-commit`, the missing commit, which stops the build before anything is built.
- **04_unhappy**: projects broken on purpose.
  - `0401_type_errors`: the shared setup, but test case `example` names prompt set `snerkk`, which isn't declared. Fails to type-check.
  - `0402_broken_declarations`: the shared setup, beside declarations broken in ways only loading finds. No `tsconfig.json` or `_generated/`: it isn't type-checked.
    - Base image `no-default-export`, which exports its declaration under a name.
    - Code states `unwrapped`, a plain object, and `wrongly-wrapped`, wrapped in `declareBaseImage`.
    - Task `fizz-buzz`, whose only initial prompt is `fizzy`.
    - One task per broken measurement, each with initial prompt `plain` and a test case of its own name: `unknown-instrument` (`fileCraeted`), `misfit-config` (`fileCreated` given a `path`), `unfit-aggregate` (`fileCreated` by `mean`), `missing-template` (a `templateTest` template that isn't there), `invalid-regex` (a `grep` pattern that doesn't parse) and `unwrapped-measurement`.
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
