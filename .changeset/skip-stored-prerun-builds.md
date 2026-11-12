---
"thunderjar": patch
---

With a runtime, `run` no longer builds and pushes a prerun image the image store already has: it only pulls it into the runtime. A fresh machine, such as a CI runner, used to rebuild every prerun image, because only the local Docker daemon was asked whether it existed.
