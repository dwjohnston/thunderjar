---
"thunderjar": minor
---

Remove runner mode and `thunderjar attach`. Breaking: a config that gives `runtime.runner` is now a config error, and the `attach` command is gone. A remote runtime without a runner still works: `run` runs each Docker command on it.
