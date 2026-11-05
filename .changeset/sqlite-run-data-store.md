---
"thunderjar": patch
---

The run data store is now a SQLite file, at the config's `runDataStore: sqliteStore({ path })`, resolved against the project folder. `--data-dir <dir>` now means `<dir>/runs.sqlite`. `run`, `executions`, `show` and `view` all read and write it; the folder of JSON files is gone. A `runDataStore` that isn't a store is a config error.
