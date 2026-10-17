# 10. Move the `executions` and `show` tests to scenarios

See [../PLAN.md](../PLAN.md).

## What to do

- Add a scenario with a checked-in run data store as its starting state, with fixed IDs and timestamps. Un-ignore `.data/` for that scenario.
- The store holds what the tests need: several executions, failed runs, errored measures, and an execution with no aggregation results.
- Run `executions` and `show` in place, and assert in the test on stdout.

## Done when

Neither test file runs `run` first, or writes `runs.json` itself.
