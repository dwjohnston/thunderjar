---
"thunderjar": patch
---

Pass each harness's `requiredEnv` into its own containers, as `docker run -e NAME`. `plan` and `run` stop before building anything when one is unset, naming the variable and the harness that needs it, and `run --dry-run` lists the variables each container run is given, by name.
