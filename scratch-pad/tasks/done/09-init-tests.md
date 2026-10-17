# 9. Move the `init` tests to scenarios

See [../PLAN.md](../PLAN.md).

## What to do

- Each starting state is a scenario, e.g. an empty folder, and a folder with a `package.json`.
- Copy the scenario, run `init`, and assert in the test on the files it created or skipped and their contents.

## Done when

`src/commands/init/init.test.ts` builds no starting folder by hand.
