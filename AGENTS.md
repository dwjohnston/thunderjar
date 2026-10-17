## Delivery 

At each step of a delivery this project should produce a _working_ npm-publishable artifact.

All commands in the CLI should work (even if by work that is to print a 'Not implemented' message). 

That is: an `npx thunderjar init` should produce code that does not have import or type errors. 


### Committing and tests 

Do not leave code uncommited. Always commit changes before handing back to the user. 

Commit changes in sensible blocks. Use your judgement as to whether an `--amend` commit is appropriate. 

If being provided feedback for behaviour to change: 

- Write a test that will detect the behaviour first, and commit it with a message starting with the 🔴 emoji to indicate the failing test. 
- Write the fix and commit it with a message starting with the 🟢 emoji. 


### Source layout

`src/` is in layers that only import downward, with one folder per command. Read [src/AGENTS.md](src/AGENTS.md) before adding or moving a module.

### Fixture tests

Each scenario is described in [fixtureTests/AGENTS.md](fixtureTests/AGENTS.md).

`fixtureTests/` holds checked-in Thunderjar projects that the CLI is run against, the way a user would run it. Every command test runs against one of these scenarios.

**Why:** a test that builds its project in a temp folder can't be checked by hand. With a real project on disk, a developer can run the same command the test runs and see the same output:

```sh
bun run fixture scenario_2 run two-pairs --dry-run   # or just: bun run fixture 2 …
```

#### Run against a scenario, unchanged

✅ **Do** run the command against a checked-in scenario as it is, and assert only on what the command produced: its output, its exit code, and the files or images it wrote.

❌ **Don't** generate a project or patch a scenario's files in a test. Any variation a test needs, such as an empty parameter folder or a store with a failed run, belongs in a scenario: add it to one that fits, or add a scenario.

**Why:** a project made or changed by a test only exists while the test runs, so nobody can run the command against it by hand.

#### Scenarios don't know about their tests

✅ **Do** keep every expected result in the test. A scenario is a project and the state it starts in: its declarations, and anything already on disk, such as a checked-in run data store.

❌ **Don't** name anything in a scenario after a test, or keep expected output in it.

**Why:** tests of many commands share a scenario. One that holds a test's expectations can't be read as a plain project, or changed for another test without breaking the first.

#### Copy only for commands that write into the project

✅ **Do** run in place, in the scenario's `fixtures/`. Only `init`, which writes into the project, works on a copy (`copyOfFixtures()` in `src/testing/cli.ts`). A real `run` runs in place too, with `--data-dir` set to a temp folder, and never in a scenario with a checked-in run data store. `remeasure` writes into that store, so it runs in place with `--data-dir` set to a temp folder holding an unmodified copy of the scenario's `runs.json`. `generate` writes only the gitignored `.thunderjar/_generated/`, so it runs in place, and its test deletes that file first.

❌ **Don't** copy a scenario for a command that only reads it, such as `plan`, `show` or a dry run.

**Why:** in place, a test runs exactly what `bun run fixture` runs. The copy is only there so no test changes a checked-in scenario: `git status` is clean after the full suite.

#### Other rules

- **Each folder is a scenario, not a feature.** Name it `scenario_<n>_<what the project is>`, e.g. `scenario_2_typical_project`, not `run`. A scenario is a kind of project, and tests of any command can use it.
- **Each scenario has `fixtures/.thunderjar/`** (the project) and a `tsconfig.json`, so `fixtureTests/typecheck.test.ts` type-checks it too. The exceptions are a project before `init`, which has neither, and a project broken on purpose, which has no `tsconfig.json`: its declarations don't type-check, or `generate` fails. `thunderjar` resolves from every scenario through the checked-in link `fixtureTests/node_modules/thunderjar`.
- **A command's tests sit beside the command**, e.g. `build`'s are in `src/commands/build/build.test.ts`. They reach a scenario through `scenario()` in `src/testing/cli.ts`. See [src/AGENTS.md](src/AGENTS.md).
- **Tests drive the CLI**, not internal functions, using `src/testing/cli.ts`. They normalise only what changes between runs (execution ID, `$TMPDIR`, durations), so expected output reads like what's printed.
- **Real-Docker tests tag their images with a throwaway prefix** and delete every image under it afterwards. They sit in `<command>.docker.test.ts` and run under `bun run test:docker` only.
- **Behaviour the CLI can't trigger** (e.g. a crash injected through a runner) stays in `src/` unit tests.

### Never refer to real agents in tests

Fixtures and `src/` unit tests never name a real agent: no real harness (claude-code, codex, …), no real model, and none of their files (`CLAUDE.md`, …).

**Why:** tests mustn't look like they depend on, cost money with, or endorse a real product, and an obviously fake name makes it clear which agent produced what. Use:

| | Name | Model ID | Behaviour |
|---|---|---|---|
| harness | `fake-harness-alpha` | | writes a buggy `isPrime.ts` with a `@ts-ignore` |
| harness | `fake-harness-beta` | | writes a correct `isPrime.ts` |
| model | `fake-model-small` | `fake-model-small-001` | |
| model | `fake-model-large` | `fake-model-large-001` | |

Both harnesses' `cli` really run, so any test case can be run for real by hand, and the two give different measures. Misbehaving agents (failing, hanging) are further versions of `fake-harness-alpha`; see `fixtureTests/scenario_3_misbehaving_agents`.

The one exception is `src/commands/init/init.ts` and its test: `init` scaffolds claude-code for real users, and the test checks exactly that.


#### Annotated tags 

The final commit should contain an annotated tag of the format `<task-name>-complete`. 

The tag contents should contain details of what was delivered and high light any important design decisions made. 
