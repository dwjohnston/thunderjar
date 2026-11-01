---
"thunderjar": patch
---

Add a `show` command. `thunderjar show <execution>` prints a row per permutation, by its varying parameters, with each measure aggregated across its iterations by its measurement's methods: a `rate` as `<true>/<measured>`, a `mean` or `median` to one decimal place. Skipped or errored measures are left out of the aggregate, which is starred, and listed with their reasons. `thunderjar show <execution> <permutation>-<iteration>` prints one container run: its parameters, harness and model, duration, exit code, and each measure. Both take `--data-dir`.
