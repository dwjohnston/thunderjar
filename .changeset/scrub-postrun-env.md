---
"thunderjar": patch
---

Postrun images no longer hold the values of the environment variables an agent ran with.

`docker commit` saved the agent container's whole environment into the postrun image's config, including each harness's `requiredEnv`, e.g. `ANTHROPIC_API_KEY`, and anything a base image's `runOptions` passed with `-e` or `--env-file`. Now, when the container is committed, every variable its prerun image doesn't set is blanked, and every one it does set gets the prerun image's value back.

**If you ran earlier versions:** their postrun images hold the values of the variables passed to the agent. Rotate those keys, and delete those images, locally and from any registry they were pushed to.

Measurement containers start from the postrun image, so they no longer see those variables either. A later change will pass them in where measurements need them.
