# 8. Move the `generate` tests to scenarios

See [../PLAN.md](../PLAN.md).

## What to do

- Run `generate` in place against a checked-in scenario.
- Assert in the test on the written `.thunderjar/_generated/parameter-names.d.ts`.
- Delete the file first, so a leftover from an earlier run can't hide a failure.
- A test needing empty parameter folders gets a scenario with them.

## Done when

`generate.test.ts` and `parameter-names.test.ts` use no `createFixtureProject`.
