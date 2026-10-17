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

- 📁 **Copied files**
  - The parameter copies files kept beside its declaration, through `ctx.dir`. It reads no commits, so it builds anywhere, even outside a repository, and editing one of those files changes its hash.
- 🌿 **Real git**
  - The parameter reads real commits of *this* repository through `ctx.git`. It only builds where those commits are, so CI checks out with full history.

## What scenarios 1–3 share

Unless its entry says otherwise, scenarios 1–3 use these:

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
  - Fake agents
    - `fake-harness-alpha@1.0.0` (buggy) and `fake-harness-beta@1.0.0` (correct).
    - `fake-harness-alpha@1.1.0` overrides the family's cli: it also writes `version.txt`, so tests can see which cli ran.
  - Code state
    - `baseline`
  - Prompt sets
    - `snerk` and `glurk`, which differ only in their instructions.
  - Tasks
    - `is-prime`, with the prompts `plain` and `terse` and four measurements: whether `isPrime.ts` exists, whether a README exists, the number of `@ts-ignore`s, and a template test of `isPrime`.
    - `no-measures`, with one prompt and no measurements.
  - Test cases
    - `two-pairs`: both agents, 2 permutations.
    - `is-prime-baseline`: the full matrix, 8 permutations × 5 iterations.
    - `alpha-is-prime`, `version-cli-override`, `without-measurements`: one permutation each.

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

### Changing scenario 4's commits

✅ **Do** add a new commit, tag it `fixture-scenario-4-<name>`, and push the tag, when scenario 4 needs another state of its project.

❌ **Don't** amend, squash or rebase away a commit a scenario 4 declaration pins.

**Why:** the declarations pin commits by hash, so a commit that stops being reachable breaks the scenario on every fresh clone, CI included. The tag keeps it reachable even if the branch is squash-merged.
