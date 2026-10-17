# 13. Move the real `run` tests to scenarios

Needs tasks 2, 4 and 17. See [../PLAN.md](../PLAN.md).

## What to do

- Run the scenario in place against real Docker, with a throwaway `--image-prefix` and `--data-dir` set to a temp folder. Use a scenario without a checked-in run data store.
- Assert on stdout, the run data store, and the prerun and postrun images.
- Delete the images after the test run.
- Crashes injected through the runner stay as `src/` unit tests.

## Done when

No real `run` test generates or patches a project.
