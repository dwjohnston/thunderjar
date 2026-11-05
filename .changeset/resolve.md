---
"thunderjar": patch
---

Add `resolve` to every parameter declaration, for floating parameters such as a branch's latest commit. It runs on the host once per execution, before anything is hashed, with `ctx.exec(command)`, and its result reaches `applyParameter`, and a harness's `cli`, as `ctx.resolved`. Only the text it ends up in is hashed. Each container run records what each parameter resolved to, and `plan` and `show` display it. A `resolve` that throws stops `plan`, `build` and `run` before anything is built.
