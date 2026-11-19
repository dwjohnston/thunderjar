---
"thunderjar": patch
---

Give measurement containers a run's secret environment variables: its test case's `secretEnv` and its harness's `requiredEnv`. Each is passed by name, as to the agent's container, so its value comes from the shell that runs Thunderjar, or a runtime's runner, and is never on a command line, in a log or in an image. A `shell` measurement can now use, e.g., `DATABASE_URL`. The test case's `env` already reached them, through the postrun image.
