---
"thunderjar": patch
---

Take each task's measurements of every container run. `run` measures each run as it finishes, each measurement in a container of its own from the run's postrun image, prints its measures under it, and records them in the run data store. Measurements use the built-in `fileCreated`, `grep` and `bunTestFile` instruments; `declareMeasurement` types each one's `config` and `aggregate` by its instrument, and `plan` and `run` reject a measurement that doesn't fit its instrument. A `bunTestFile` measurement runs an ordinary Bun test file against each file the agent left that matches its `subject`, and counts the tests that pass and fail; the test finds the agent's file in `Bun.env.THUNDERJAR_SUBJECT`.
