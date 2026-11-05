---
"thunderjar": patch
---

`thunderjar plan <test case>` also prints the test case's matrix shape and every permutation, each with the first 8 characters of its content hash. The hash comes from the content of each parameter's declaration, not its name, plus the model ID the harness resolves the model to. A harness's `models.ts` and `versions.ts` (beyond the chosen entries) and a task's measurements are left out.
