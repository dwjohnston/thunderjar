---
"thunderjar": patch
---

Take each task's measurements of every container run. `run` measures each run as it finishes, each measurement in a container of its own from the run's postrun image, prints its measures under it, and records them in the run data store. Measurements use the built-in `fileCreated`, `grep` and `templateTest` instruments; `declareMeasurement` types each one's `config` and `aggregate` by its instrument, and `plan` and `run` reject a measurement that doesn't fit its instrument. `init`'s `tsconfig.json` leaves out `*.template.ts` files.
