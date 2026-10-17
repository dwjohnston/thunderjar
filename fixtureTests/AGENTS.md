# Fixture scenarios

Each `scenario_<n>_<what the project is>/` folder is a checked-in Thunderjar project, which the CLI is run against the way a user would. See the fixture test rules in the repo's root `AGENTS.md`.

A scenario is a project and the state it starts in, nothing more. Command tests run against it unchanged, from beside each command in `src/commands/`, and keep every expected result to themselves. `init` and a real `run` work on a copy; everything else runs in place.

## Add a variation as a scenario

✅ **Do** put any variation a test needs, such as an empty parameter folder or a run data store with a failed run, into a scenario: one that fits, or a new one.

❌ **Don't** generate a project, or patch a scenario's files, in a test. And don't name anything in a scenario after a test, or keep expected output in it.

**Why:** a variation made in a test can't be run by hand, and a scenario that knows about one test can't be shared by others.

Run any test case by hand, using the scenario's number:

```sh
bun run fixture 2 run two-pairs --dry-run
bun run fixture 1 build example
```

## Update this file as you go

✅ **Do** update the listing below in the same change that adds a scenario, or changes what one's agents, code state, prompt set or test cases do.

❌ **Don't** leave it to describe what a scenario used to be.

**Why:** this listing is how you pick a scenario for a new test without reading every fixture file. A stale entry sends a test to the wrong project.

## Real git or not

| Scenario | Code states | Prompt sets |
|---|---|---|
| 1 minimal initial setup | 📁 copied files | 📁 copied files |
| 2 typical project | 📁 copied files | 📁 copied files |
| 3 misbehaving agents | 📁 copied files | 📁 copied files |
| 4 git project | 🌿 **real git** | 🌿 **real git** |
| 5 empty parameter folders | none | none |
| 6 uninitialised project | none | none |
| 7 uninitialised JS project | none | none |
| 8 recorded executions | 📁 copied files | 📁 copied files |
| 9 broken declarations | 📁 copied files | 📁 copied files |
| 10 broken harness family | 📁 copied files | 📁 copied files |
| 11 type errors | 📁 copied files | 📁 copied files |

- 📁 **Copied files**
  - The parameter copies files kept beside its declaration, through `ctx.dir`. It reads no commits, so it builds anywhere, even outside a repository, and editing one of those files changes its hash.
- 🌿 **Real git**
  - The parameter reads real commits of *this* repository through `ctx.git`. It only builds where those commits are, so CI checks out with full history.

## What scenarios 1–3 and 8 share

Unless its entry says otherwise, scenarios 1–3 and 8 use these:

- **Base image**
  - `node20`, which is `FROM node:20-bookworm`.
- **Code state**
  - `baseline` copies its `files/` folder into `/workspace`: a `package.json` and an empty lockfile, so `npm ci` needs no network. It doesn't use git.
  - e.g.
    ```ts
    applyParameter: (_config, ctx) => `COPY ${ctx.dir}/files/ /workspace/\nRUN npm ci`,
    ```
- **Prompt sets**
  - Each copies the `FAKE_INSTRUCTIONS.md` beside its declaration into `/workspace`. It doesn't use git either.
- **Fake agents**
  - `fake-harness-alpha` writes a buggy `isPrime.ts` (2 isn't prime, 15 is) with a `@ts-ignore`.
  - `fake-harness-beta` writes a correct `isPrime.ts`.
  - Both also write a result file naming the model.

**Why no git:** editing a file beside a declaration changes its parameter hash, so these scenarios show hashing behaviour directly. They also build in place, without a repository. Real git is scenario 4's job.

## Scenarios

- `scenario_1_minimal_initial_setup`
  - The smallest project: one of everything, close to what `init` scaffolds, but with a fake agent.
  - Fake agent
    - `fake-harness-alpha@1.0.0`
  - Code state
    - `baseline`
  - Prompt set
    - `snerk`
  - Task
    - `is-prime`, with one prompt and one measurement: whether `isPrime.ts` exists.
  - Test case
    - `example`: 1 permutation, 1 iteration.

- `scenario_2_typical_project`
  - A typical project: two agents that behave, two prompt sets, two wordings of the task, and a task with no measurements.
  - Base images
    - `node20`, and `node-lts`, which is the same declaration under another name.
  - Fake agents
    - `fake-harness-alpha@1.0.0` (buggy) and `fake-harness-beta@1.0.0` (correct).
    - `fake-harness-alpha@1.1.0` overrides the family's cli: it also writes `version.txt`, so tests can see which cli ran.
  - Code state
    - `baseline`
  - Prompt sets
    - `snerk` and `glurk`, which differ only in their instructions.
    - `glurk-reworded`, which is `glurk` with one word of its instructions changed.
  - Tasks
    - `is-prime`, with the prompts `plain` and `terse` and four measurements: whether `isPrime.ts` exists, whether a README exists, the number of `@ts-ignore`s, and a template test of `isPrime`.
    - `no-measures`, with one prompt and no measurements.
  - Test cases
    - `two-pairs`: both agents, 2 permutations.
    - `is-prime-baseline`: the full matrix, 8 permutations × 5 iterations.
    - `alpha-is-prime`, `version-cli-override`, `without-measurements`: one permutation each.
    - `glurk-on-node-lts`: `glurk` and `glurk-reworded` on `node-lts`, 2 permutations.

- `scenario_3_misbehaving_agents`
  - Agents that fail, so tests can check how `run` records them.
  - Fake agents
    - `fake-harness-alpha@1.0.0` behaves.
    - `fake-harness-alpha@1.0.1` leaves a `README.md`, then exits 3.
    - `fake-harness-alpha@1.0.2` writes `started.txt`, sleeps 2 seconds, then writes `finished.txt`.
  - Code state
    - `baseline`
  - Prompt set
    - `snerk`
  - Tasks
    - `is-prime`, with the same measurements as scenario 2.
    - `wait`, whose only prompt, `impatient`, has a 1-second timeout and no measurements.
  - Test cases
    - `fails`: the failing agent beside one that behaves.
    - `times-out`: the sleeping agent, which the 1-second timeout kills.

- `scenario_4_git_project` 🌿 **real git**
  - A project whose code states and prompt sets read real commits, the way `init` scaffolds them. Its code is `fixtures/project/`, committed twice in this repository.
  - The commits
    - The first adds `project/` with `greet.js` and `prompts/house-style.md`. It's tagged `fixture-scenario-4-first`.
    - The second changes both, and adds `farewell.js`. It's tagged `fixture-scenario-4-second`.
    - The worktree's `house-style.md` has moved on from both, so tests can show a prompt file is read at its commit, not from the worktree.
  - Fake agent
    - `fake-harness-alpha@1.0.0`
  - Code states
    - `first` and `second` check out each commit with `checkoutCommit`, so `/workspace` is this whole repository at that commit, then run `npm ci` in the project.
    - `unpushed` names a commit this repository doesn't have.
  - Prompt sets
    - `house-style-first` and `house-style-second` read `prompts/house-style.md` at each commit with `ctx.git.show`.
  - Task
    - `is-prime`, as in scenario 1.
  - Test cases
    - `two-commits`: both code states × both prompt sets, 4 permutations.
    - `unpushed-commit`: the missing commit, which stops the build before anything is built.

- `scenario_5_empty_parameter_folders`
  - A project whose parameter folders are there but empty, as if every declaration had been deleted.
  - Parameter folders
    - `baseImages`, `codeStates`, `promptSets`, `tasks` and `harnessModels`, each holding only a `.gitkeep`.
  - Test cases
    - None.

- `scenario_6_uninitialised_project`
  - A project that isn't JavaScript, before `init`: only a `README.md`, with no `.thunderjar/` and no `package.json`.
  - Run `init` by hand in a copy of `fixtures/`, not through `bun run fixture`, which would write into the scenario.

- `scenario_7_uninitialised_js_project`
  - A JavaScript project before `init`: only a root `package.json`, with no `.thunderjar/`.
  - Run `init` by hand in a copy, as for scenario 6.

- `scenario_8_recorded_executions`
  - A project with history: scenario 3's agents and test cases, and a run data store checked in at `fixtures/.thunderjar/.data/runs.json` as its starting state. The root `.gitignore` un-ignores that `.data/`; it's recorded, with fixed execution IDs and a clock that moves 40 ms each read, so every container run takes 0.04s.
  - Differences from scenario 3
    - `is-prime` has no `readmeExists`: it was deleted after the second execution, so earlier executions still hold it.
    - Measurements choose several aggregate methods: `isPrimeTemplateTest` mean and sum, `tsIgnoreCount` median, min and sum.
  - The store, oldest first
    - `01k4tq3h8r0000000000000000`, `fails`, 2026-09-28 09:15: recorded before aggregation results were stored. The behaving agent's second run exited 3 and was never measured.
    - `01k4x9j2e8mqz3abcdefghjkmn`, `fails`, 2026-09-29 14:30: with `readmeExists` (count and rate), whose instrument threw `disk on fire` in each permutation's first iteration.
    - `01k4xb7q0c2tnvabcdefghjkmn`, `times-out`, 2026-09-29 15:02: no measurements, each run exited 124.
    - `01k4xc0000000000000000000a`, `fails`, 2026-09-30 08:00: the latest, without `readmeExists`.
  - A real `run` here adds to the store, so run one only in a copy.

- `scenario_9_broken_declarations`
  - A project with configuration errors beside sound declarations. Only the declarations a test case names are loaded, so each broken one stops only the test cases naming it. A task's measurements all load with it, so each broken measurement has a task of its own.
  - It has no `tsconfig.json`: its declarations don't type-check.
  - Sound declarations, as in scenario 1
    - Base image `node20`, code state `baseline`, prompt set `snerk`, `fake-harness-alpha@1.0.0/fake-model-small`, and task `is-prime` with prompt `plain` and measurement `isPrimeTsExists`.
  - Broken parameters
    - Base image `no-default-export`, which exports its value under a name.
    - Code states `unwrapped`, a plain object, and `wrongly-wrapped`, wrapped in `declareBaseImage`.
  - Tasks
    - `fizz-buzz`, whose only prompt is `fizzy`.
    - Each with prompt `plain` and one broken measurement: `unknown-instrument` (`fileCraeted`), `misfit-config` (a `fileCreated` with `path` for `glob`, and no `aggregate`), `unwrapped-measurement`, `missing-template` (a misspelt template path), `unfit-aggregate` (`fileCreated` aggregated by `mean` and `avg`) and `invalid-pattern` (a `grep` whose pattern isn't a valid regex).
  - Test cases
    - `sound`: only sound declarations, 1 permutation.
    - Each of the others is `sound` with one thing wrong: `unknown-prompt-set` (`snirk`), `unknown-task` (`is-even`), `prompt-of-another-task` (`fizzy`), `unexported-base-image`, `unwrapped-code-state`, `wrongly-wrapped-code-state`, `unknown-harness-models` (an absent version, an absent model, and a pair not of the form `family@version/model`), `empty-code-states` (`[]`, with 2.5 iterations), `zero-iterations`, and one named after each broken measurement's task.

- `scenario_10_broken_harness_family`
  - Scenario 1 with a second family, `fake-harness-beta`, whose `versions.ts` isn't wrapped in `declareHarnessVersions`. `generate` loads every family's maps, so it fails for the whole project; `plan` fails only for a test case naming that family.
  - It has no `tsconfig.json`: `generate` fails, so it can't be type-checked.
  - Test cases
    - `example`: as in scenario 1.
    - `beta`: `fake-harness-beta@1.0.0/fake-model-large`.

- `scenario_11_type_errors`
  - A project whose declarations don't type-check, beside sound ones. Each broken one is a type error only, so `tsc` reports it in its own file.
  - It has no `tsconfig.json` beside `fixtures/`, so `typecheck.test.ts` skips it. Its `.thunderjar/tsconfig.json` is the one `init` scaffolds, checked in, so the errors can be reproduced by hand: `bun run fixture 11 generate`, then `bunx tsc -p .thunderjar` in `fixtures/`.
  - Sound declarations, as in scenario 1
    - Base image `node20`, code state `baseline`, prompt set `snerk` and `fake-harness-alpha@1.0.0/fake-model-small`.
    - Code state `pinned`, whose typed `config` reaches its `applyParameter`, which calls `checkoutCommit`.
    - Task `is-prime`, with prompt `plain` and a measurement of each instrument whose config and aggregate fit: `isPrimeTsExists` (`fileCreated`), `tsIgnoreCount` (`grep`) and `isPrimeTemplateTest` (`templateTest`).
    - Task `fizz-buzz`, whose only prompt is `fizzy`.
  - Broken parameters
    - Code states `reads-missing-config` (reads `config.sha`) and `top-level-commit` (`commit` outside `config`).
    - Task `badly-measured`, with prompt `plain` and only broken measurements: `misfitConfig`, `unknownInstrument`, `withoutAggregate`, `fileCreatedByMean`, `grepByRate`, `grepWithoutPattern`, `templateTestByMax` and `templateTestWithoutTemplate`.
  - Test cases
    - `sound`: only sound declarations.
    - `unknown-prompt-set` (`snirk`), `unknown-model` (`fake-model-huge`) and `prompt-of-another-task` (`fizzy`).

### Changing scenario 4's commits

✅ **Do** add a new commit, tag it `fixture-scenario-4-<name>`, and push the tag, when scenario 4 needs another state of its project.

❌ **Don't** amend, squash or rebase away a commit a scenario 4 declaration pins.

**Why:** the declarations pin commits by hash, so a commit that stops being reachable breaks the scenario on every fresh clone, CI included. The tag keeps it reachable even if the branch is squash-merged.
