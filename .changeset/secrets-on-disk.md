---
"thunderjar": patch
---

Look for a run's secrets in the files of its postrun image before it's pushed. The agent, or what it runs, can write a key into a file, e.g. a log line, a `.env` or a session file, which would be committed and pushed with the image. So once each container run is committed, a short-lived container from its postrun image is given the run's secret variables by name, its harness's `requiredEnv` and its test case's `secretEnv`, and searches its files for their values, skipping `/proc`, `/sys`, `/dev` and other mounts. The values never leave Docker: only the names found, and the paths of the files holding them, are recorded with the run, as `secretsFound`.

`run` and `attach` warn of each as they finish, and `show` and `--json` say so. The run is only flagged: its image is still committed, measured and pushed, so treat a secret found in a pushed image as exposed, and rotate it.

Values shorter than 12 characters, or on more than one line, aren't searched for. A search that fails, or takes longer than `THUNDERJAR_SECRET_SEARCH_TIMEOUT_SECONDS` (120 by default), doesn't fail the run: it's recorded as `secretSearchFailed`, with why, and `run` and `show` say so.
