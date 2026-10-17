# Fixture scenarios

Each `scenario_<n>_<what the project is>/` folder is a checked-in Thunderjar project, which the CLI is run against the way a user would. See the fixture test rules in the repo's root `AGENTS.md`.

Run any test case by hand, using the scenario's number:

```sh
bun run fixture 2 run two-pairs --dry-run
bun run fixture 1 build example
```

## Update this file as you go

✅ **Do** update the listing below in the same change that adds a scenario, or changes what one's agents, code state, prompt set or test cases do.

❌ **Don't** leave it to describe what a scenario used to be.

**Why:** this listing is how you pick a scenario for a new test without reading every fixture file. A stale entry sends a test to the wrong project.

## What every scenario shares

Unless its entry says otherwise, a scenario uses these:

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

**Why no git:** editing a file beside a declaration changes its parameter hash, so the scenarios show hashing behaviour directly. They also build in place, without a repository. Tests of parameters that read commits through `ctx.git` live in `src/`, against the seed repository.

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
  - Tests
    - Type-level assertions on the generated parameter names.
    - `build` in place.

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
    - `two-pairs`: both agents, 2 permutations. Most `run` and `build` tests use this one.
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
