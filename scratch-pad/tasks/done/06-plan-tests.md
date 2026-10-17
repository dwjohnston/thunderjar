# 6. Move the `plan` tests to scenarios

See [../PLAN.md](../PLAN.md).

## What to do

- Run `plan` in place against a checked-in scenario and assert on stdout.
- Any variation a test needs (a 1/1/1/1/1 test case, a renamed parameter, an edited file beside a declaration) belongs in a scenario.

## Done when

`src/commands/plan/plan.test.ts` uses no `createFixtureProject` or `stub`.
