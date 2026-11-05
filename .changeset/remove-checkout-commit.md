---
"thunderjar": minor
---

Remove `checkoutCommit` and `ctx.git`. A code state now clones a repository at a pinned commit in its own `RUN`, e.g. `RUN git clone --quiet <repo> /workspace && git -C /workspace checkout --quiet --detach <commit>`, and the base image sets the git identity. `init` scaffolds both.
