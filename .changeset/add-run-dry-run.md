---
"thunderjar": patch
---

Add a `run` command. So far only `thunderjar run <test case> --dry-run` works: it prints a new execution ID (a ULID), then, for each permutation, its prerun image `thunderjar-prerun:<hash>`, and for each iteration its postrun image `thunderjar-postrun:<execution ID>-<permutation>-<iteration>` and the harness command it would run. Nothing is built or run.
