---
"thunderjar": patch
---

With a `runtime` in `thunderjar.config.ts`, prerun images, and a runner's image, are now built on the runtime's Docker daemon and pushed to the image store from there, instead of being built and pushed on this machine and pulled into the runtime. `build` builds there too. `build --local` and `run --local` build on the local Docker daemon instead.
