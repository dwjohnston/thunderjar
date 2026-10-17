# 7. Move the `run --dry-run` tests to scenarios

See [../PLAN.md](../PLAN.md).

## What to do

- Run `run --dry-run` in place against a checked-in scenario and assert on stdout.
- Test cases a test needs, such as a version's cli override, belong in a scenario.

## Done when

No `run --dry-run` test generates or patches a project.
