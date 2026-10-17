# 12. Move the declarations typecheck tests to scenarios

See [../PLAN.md](../PLAN.md).

## What to do

- `src/commands/declarations.typecheck.test.ts` writes bad test cases and measurements, then runs `tsc`.
- Make each bad declaration part of a scenario instead, and assert in the test on `tsc`'s output.

## Done when

The test writes no files into a project.
