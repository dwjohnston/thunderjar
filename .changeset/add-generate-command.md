---
"thunderjar": patch
---

Add a `generate` command, which writes the parameter names declared under `.thunderjar/test-case-parameters/` to `.thunderjar/_generated/parameterNames.d.ts`. The `declareX()` functions are now typed, so a test case that names an undeclared parameter, or an initial prompt of another task, is a type error.
