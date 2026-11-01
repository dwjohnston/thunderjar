---
"thunderjar": patch
---

A code state can check out a real commit of the repository the project is in with `checkoutCommit(ctx, commit)`: Thunderjar bundles the commit and its ancestors, and nothing after it, and straight after the base image clones it to `/workspace`, detached, with no remote. Any fragment can read a file at a commit with `ctx.git.show(commit, path)`, which returns the file's path in the build context, to `COPY`. Commits are read from the local repository, never fetched: a commit it doesn't have stops `build`, and `build --dry-run`, before anything is built.
