---
"thunderjar": patch
---

Count how long each step of `build`, `run` and `doctor` has been waiting. On a terminal, each step's line shows a timer after its `...`, updated once a second, until it ends with `done`, `ok` or `failed`. `run` also shows a `Measuring ...` line with a timer while a container run is measured, which its measures then replace. Piped output is unchanged.
