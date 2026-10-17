# 17. Add `--data-dir <dir>` to `run`

See [../PLAN.md](../PLAN.md), "Product changes".

## What to do

- Today `run` writes the run data store into the project, at `.thunderjar/.data/` (`defaultRunDataStorePath` in `src/store/run-data-store.ts`).
- Add `--data-dir <dir>` to `run`, so the store goes to that folder instead. Without it, nothing changes.
- Consider whether `executions` and `show` take it too, so they can read a store written elsewhere.
- Update the usage message and the CLI reference docs.

## Why

Real `run` tests can then run a scenario in place and send the store to a temp folder, like build contexts go to `$TMPDIR`. Tests never share a store, and no copy is needed.

## Done when

`thunderjar run <tc> --data-dir <dir>` writes the store only under `<dir>`, and leaves `.thunderjar/.data/` untouched.

## Also update the docs

Task 1 documented that a real `run` works on a copy. Once this lands, it doesn't need to: only `init` does. Update:

- Root `AGENTS.md`, "Copy only for commands that write into the project": only `init` works on a copy. A real `run` runs in place with `--data-dir` set to a temp folder, and never in a scenario with a checked-in run data store.
- `fixtureTests/AGENTS.md`, the intro: the same.
- `src/AGENTS.md`, `cli.ts`: `copyOfFixtures()` is for `init` only.
