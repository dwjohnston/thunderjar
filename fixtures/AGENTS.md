# Fixture scenarios

Each scenario is a checked-in project that the CLI runs against, the way a user would run it. The general fixture rules are in the root `AGENTS.md`, under "Fixtures".

## Layout

```
fixtures/
  node_modules/thunderjar      link to the repo root, so scenarios resolve `thunderjar`
  01_unitialised/              projects before `init`
  02_regular/                  initialised projects that work
  04_unhappy/                  projects broken on purpose
  05_real_agents/              projects that run a real agent
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

## Scenario catalogue

- **What the scenarios share**
  - Initialised scenarios start from what `init` scaffolds in an empty project: base image `node20`, code state `baseline`, prompt set `snerk`, task `is-prime` with initial prompt `plain` and measurement `isPrimeTsExists`, and, where `init` scaffolds them, `isPrimeTests` (a `bunTestFile`, its metric `passRate`), `isPrimeShape` (a `shell` command printing JSON, read by three metrics) and `tsIgnoreCount`. Each measurement declares `metrics`, one per statistic. In place of init's test cases, which use real harnesses, they have test case `example`: one fake agent, one iteration.
  - `node20` installs `bun` and sets a git identity for every user. Code state `baseline` leaves `/workspace` empty, and prompt set `snerk` adds nothing, as `init` scaffolds them outside a git repository.
  - The agent is the fake `fake-harness-alpha`, which declares version `1.0.0`, on model ID `fake-model-small-001`, instead of Claude Code. Fake harness folders aren't named after their version, as init's are: only `index.ts` holds it.
  - `thunderjar.config.ts` has `imageStore: null`, as `init` scaffolds it, so nothing asks Docker for a login or pushes.
  - Each checks in its `_generated/parameterNames.d.ts`, though `.thunderjar/.gitignore` ignores it, so it type-checks without running `generate`.
- **01_unitialised**: projects before `init`.
  - `0101_empty_project`: an empty project, not JavaScript. `init` gives it a nested `.thunderjar/package.json`.
  - `0102_javascript_project`: a JavaScript project with its own `package.json`. `init` gives it no nested one.
- **02_regular**: initialised projects that work.
  - `0201_minimal_existing_setup`: exactly the shared setup. Has type tests of the generated names.
  - `0202_typical_project`: a matrix of two prompt sets, two fake agents and two wordings of the task.
    - Prompt sets `snerk` and `glurk`, each writing its own `FAKE_INSTRUCTIONS.md`.
    - A second fake agent, `fake-harness-beta`, version `1.0.0`, on model IDs `fake-model-small-001` and `fake-model-large-001`. It writes a correct `isPrime.ts`, where alpha's is buggy.
    - Alpha's result file is shaped like Claude Code's `--output-format json`, read by the library's `claudeCodeReply` and `claudeCodeTokenCosts`: its reply is `Arr, isPrime.ts be written.`, and it spent 12,480 tokens and $0.061 (`costBasis: "list"`). Beta's is plain JSON with a `reply`, `I wrote isPrime.ts, and tested it up to 100.`, which its own `collectReply` reads, and its `collectTokenCosts` reports none (`notReported`).
    - `fake-harness-alpha` needs `FAKE_HARNESS_KEY` (`requiredEnv`), so `plan` and `run` of its test cases stop without it: `FAKE_HARNESS_KEY=x bun run fixture 0202 plan example`. Both fake agents write `set` to `/thunderjar/fake-harness-key` if they see it, or an empty line if not, never its value.
    - A third fake agent, `fake-echo`, version `1.0.0`, on `fake-model-small-001`, which only copies the prompt file it's given into its result file.
    - Base image `node20` installs `bun`, which the `bunTestFile` instrument runs its tests with.
    - Task `is-prime` has two more initial prompts, `terse`, and `awkward`, two lines full of shell syntax: quotes, `$HOME`, backticks, a backslash and `%`. Its measurements: `isPrimeTests`, a `bunTestFile` of `isPrime.test.ts`, which falls back to `isPrime.reference.ts` when run on the host, with metrics `passRate` (the default score) and `passed` (a score of its own) (5 tests; alpha's `isPrime.ts` passes 3 of 5, beta's all 5), `isPrimeShape`, a `shell` command printing the lines, comments and exports of `isPrime.ts` as JSON, read by metrics `lines`, `comments` and `singleExport` (alpha's has 3 lines and 2 comments, beta's 2 and 1; both 1 export; no `isPrime.ts` and every metric doesn't apply), `tsIgnoreCount`, a `grep` for `@ts-ignore` (alpha's has 1, beta's none), and `saysArr`, a `replyMatches` of `\bArr\b` (true of alpha's reply, false of beta's).
    - Test cases: `example`, and `is-prime-baseline`: both prompt sets, `fake-harness-alpha/fake-model-small-001` and `fake-harness-beta/fake-model-large-001`, `plain` and `terse`, 5 iterations. Matrix shape 1/1/2/2/2. `two-harnesses`: alpha and beta, one iteration each. `quoting`: `fake-echo` with `awkward`.
  - `0203_recorded_executions`: `0202_typical_project` as it was before 1600, with a run data store checked in at `.thunderjar/.data/`, as if four executions had already run. Fixed execution IDs and timestamps, in UTC.
    - `.thunderjar/.gitignore` ignores `.data/`, so its files are force-added.
    - `01m3vf68s54p5eyn5s3t1ygkdj`: `is-prime-baseline`, started 2026-10-01 10:12, complete. All 40 container runs, 8 permutations × 5 iterations, every agent exiting 0.
    - `01m3ygz4g89aqh8yey8em0twpq`: `two-harnesses`, started 2026-10-02 14:40, failed. Both container runs: permutation 1, `fake-harness-alpha`, exits 0; permutation 2, `fake-harness-beta`, exits 3 and leaves no result file.
    - `01m40g5972dza3k7g3d36k55zw`: `example`, started 2026-10-03 09:05, still running. 1 × 1, with no container run recorded yet.
    - `01m430hgt00w0g80g80m3g2102`: `two-harnesses`, started 2026-10-04 08:30, failed. `fake-harness-alpha`'s run timed out after 600s, leaving no result file, but measured as usual; `fake-harness-beta`'s exits 0. Unlike the older executions' runs, these were recorded with a `reply` and `tokenCosts`: alpha's are unavailable, beta's collected, 9,300 tokens and $0.045.
    - Its task's measurements are 0202's but `saysArr`, and every container run recorded has a measure of each in its `result`, taken by those measurements as they are now, so its content hash is theirs: mostly alpha's and beta's usual measures, with a few runs differing, an `erroredWhileMeasuring` measure (`01m3vf68s54p5eyn5s3t1ygkdj` 2-4), runs that left no `isPrime.ts`, so two measures are `skipped` and `isPrimeShape`'s metrics don't apply (`01m3vf68s54p5eyn5s3t1ygkdj` 6-3, and beta's failed run in `01m3ygz4g89aqh8yey8em0twpq`), and an `isPrimeShape` whose stdout has a warning before its JSON, so its metrics' scores fail (`01m3vf68s54p5eyn5s3t1ygkdj` 1-3).
  - `0204_misbehaving_agents`: the shared setup, with three misbehaving fake agents in place of `fake-harness-alpha`, and initial prompt `plain`'s `timeoutSeconds` cut to 2.
    - `fake-sleeper` sleeps 300s before doing anything, so it's killed at the timeout. `fake-crasher` writes a result file, then exits 1. `fake-silent` writes `isPrime.ts` and exits 0, but no result file.
    - Test case `misbehaving`, instead of `example`: one container run of each.
    - `fake-rememberer`: on turn 0, keeps its prompt in `$HOME/.fake-rememberer/<session ID>` and replies `I will remember that: <prompt>`. On later turns, replies `You told me: <what it kept>`, which is empty unless the session carried over.
    - Task `rubber-ducky`, with initial prompt `tell-then-ask` of two turns, `My rubber ducky is called Eli.` then `What is my rubber ducky called?`, and two `replyMatches` measurements: `remembersName` (`Eli`, in the last reply) and `promisedToRemember` (`remember`, in turn 1's reply).
    - Test case `remember`, instead of `example`: one container run.
  - `0206_run_options`: the shared setup, with a fake agent that sandboxes itself, and a second base image that lets it.
    - `fake-sandboxer` tries to make a user namespace, with `unshare --user`, as Claude Code's bubblewrap sandbox does, and replies `sandboxed`, or `no sandbox`. Docker's default seccomp profile blocks it. (`unshare` stands in for `bwrap`, which would have to be installed with apt.)
    - Base image `node20-unconfined` is `node20` with `runOptions` `--security-opt seccomp=unconfined --security-opt apparmor=unconfined`. On Ubuntu 23.10 and later, the host must also allow unprivileged user namespaces, `sysctl kernel.apparmor_restrict_unprivileged_userns=0`, as CI does.
    - Task `sandbox`, in place of `is-prime`, with initial prompt `plain`, `Sandbox yourself.`, and measurement `sandboxed`, a `replyMatches` of `^sandboxed$`.
    - Test case `sandboxed`, instead of `example`: both base images.
  - `0207_image_store`: the shared setup, with `imageStore: { repository: "ghcr.io/acme/thunderjar-images" }`, so `run` and `build` check the `docker login` for `ghcr.io`, then push each image. The fake Docker has a login only when a test gives it one: `fakeDocker({ loggedIn: ["ghcr.io"] })`.
  - `0208_parameter_files`: the shared setup, with a fake agent whose script is kept in its `files/` folder.
    - `fake-scripted`, version `1.0.0`, on `fake-model-small-001`, copies `files/scripts/` from `ctx.dir` to `/opt/fake-scripted/`, and its `cli` runs `agent.sh` from there, which writes a correct `isPrime.ts` and replies `Ran from /opt/fake-scripted.` Its `notes.md`, beside `index.ts` but not in `files/`, never reaches the build.
    - Test case `example` names `fake-scripted` in place of `fake-harness-alpha`.
  - `0209_floating_code_state`: the shared setup, with a code state that floats.
    - Code state `follow-main` resolves the latest commit of the sandbox repository's `main` with `ctx.exec("git ls-remote --exit-code …")`, and clones it at that commit. Tests put a fake `git` first on the `PATH` with `fakeCommand("git", { stdout })`, so nothing reaches the network.
    - Test case `follow-main`, in place of `example`, names it.
  - `0210_build_secrets`: the shared setup, with build secrets.
  - `0211_remote_runtime`: `0207`'s image store, plus `runtime: { command: [<THUNDERJAR_DOCKER>, "--context", "cloud"] }`, so `run` runs its containers through the runtime, whose commands the fake Docker records with `--context cloud`. `fakeDocker({ pullDenied: true })` makes the runtime's pulls fail. Tests of a runtime's runner copy it and add `runner: {}`: the fake Docker then really runs the runner, from the runner image's build context.
    - `thunderjar.config.ts` gives `build: { secrets: [{ id: "github", env: "GITHUB_TOKEN" }], ssh: true }`, so `plan`, `build` and `run` stop without `GITHUB_TOKEN`.
    - Code state `private` clones a made-up private repository with `RUN --mount=type=secret,id=github`, reading the token from `/run/secrets/github`. The fake Docker doesn't run it.
    - Test case `example` names `private` in place of `baseline`.
- **04_unhappy**: projects broken on purpose.
  - `0401_type_errors`: the shared setup, but test case `example` names prompt set `snerkk`, which isn't declared. Fails to type-check.
  - `0402_broken_declarations`: the shared setup, beside declarations broken in ways only loading finds. No `tsconfig.json` or `_generated/`: it isn't type-checked.
    - Base image `no-default-export`, which exports its declaration under a name.
    - Code states `unwrapped`, a plain object, and `wrongly-wrapped`, wrapped in `declareBaseImage`.
    - Task `fizz-buzz`, whose only initial prompt is `fizzy`.
    - One task per broken measurement, each with initial prompt `plain` and a test case of its own name: `unknown-instrument` (`fileCraeted`), `misfit-config` (`fileCreated` given a `path`), `unfit-stat` (`fileCreated` by `mean`), `missing-metrics` (no `metrics`), `leftover-aggregate` (`aggregate` instead of `metrics`), `missing-test` (a `bunTestFile` test that isn't there), `invalid-regex` (a `grep` pattern that doesn't parse) and `unwrapped-measurement`.
    - Harness `fake-harness-bad-env`, whose `requiredEnv` is `["API KEY", 3]`, initial prompt `untimed`, whose `timeoutSeconds` is 0, and initial prompt `legacy`.
    - Test cases, instead of `example`: `sound`, as `example` is in the shared setup, and one per mistake: `bad-required-env` (names `fake-harness-bad-env`), `zero-timeout` (names `untimed`), `legacy-prompt` (names `legacy`, which gives its prompt as the old `prompt` field), `reserved-run-options` (names base image `reserved-options`, whose `runOptions` include `--rm`), `unknown-prompt-set` (`snirk`), `unknown-task` (`is-even`), `prompt-of-another-task` (`fizzy`), `unexported-base-image`, `unwrapped-code-state`, `wrongly-wrapped-code-state`, `unknown-harness-models` (an undeclared harness, a pair in the old `harness@version/model` form, and a pair with no model ID), `empty-code-states` (`codeState: []` and 2.5 iterations), `zero-iterations`, `unresolvable-code-state` (names code state `unresolvable`, whose `resolve` throws), and `trespassing-prompt-set` (names prompt set `trespasser`, whose fragment copies from the harness's folder in the build context, `parameters/harness`).
  - `0403_broken_harness_family`: the shared setup, with a second fake agent, `fake-harness-beta`, which declares no `version`. No `tsconfig.json` or `_generated/`.
    - Test cases: `example`, and `beta`, which names `fake-harness-beta/fake-model-large-001`.
  - `0404_empty_parameter_folders`: the shared setup with every declaration deleted: each parameter folder holds only a `.gitkeep`. Test case `example` is left. No `tsconfig.json` or `_generated/`.

- **05_real_agents**: projects that run a real agent against a real model, for `bun run test:agent`.
  - `0501_claude_code`: exactly what `init` scaffolds in an empty project.
    - Test cases, init's: `compare-models`, Claude Code on Haiku 4.5 and Haiku 5.5, which needs `ANTHROPIC_API_KEY`, and `compare-harnesses`, Haiku 5.5 in Claude Code, Copilot CLI and OpenCode, which also needs `COPILOT_GITHUB_TOKEN` and `OPENCODE_API_KEY`. The real agent test runs only `compare-models`.

Keep it in this format:

- **What the scenarios share**
  - The base image, code state, prompt sets and fake agents that most scenarios use, so entries only list their differences.
- **One entry per scenario**
  - `<NNNN>_<name>`: what the project is, in one line.
    - Fake agents, code states, prompt sets, tasks and test cases, where they differ from the shared ones.
    - Whether it uses real git.
