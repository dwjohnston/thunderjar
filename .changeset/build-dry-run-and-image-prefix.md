---
"thunderjar": patch
---

Add `thunderjar build <test case> --dry-run`, which prints each prerun image's name and Dockerfile and builds nothing. `plan` now shows whether each permutation's prerun image is `built` or `missing` (or `unknown`, with a warning, when Docker can't be reached). `build`, `run` and `plan` take `--image-prefix <name>`, to name images `<name>-prerun:<hash>` and `<name>-postrun:…` instead of `thunderjar-…`.
