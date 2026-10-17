# 13. Move the real `run` tests to scenarios

Needs tasks 2 and 4. See [../PLAN.md](../PLAN.md).

## What to do

- Copy the scenario, then run against real Docker with a throwaway `--image-prefix`.
- Assert on stdout, the run data store, and the prerun and postrun images.
- Delete the images after the test run.
- Crashes injected through the runner stay as `src/` unit tests.

## Done when

No real `run` test generates or patches a project.
