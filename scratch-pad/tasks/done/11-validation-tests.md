# 11. Move the configuration error tests to scenarios

See [../PLAN.md](../PLAN.md).

## What to do

- Move `src/commands/validation.test.ts` onto scenarios with broken declarations and test cases.
- First check whether one broken file stops the whole project from loading. If it does, that error needs its own scenario.
- Assert in the test on stderr and the exit code.

## Done when

`validation.test.ts` uses no `createFixtureProject` or `stub`.
