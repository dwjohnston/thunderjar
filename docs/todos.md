# Todos

## Write tests (as of e96345f)


### e96345f
- Results output structure — assert folder name format, file-per-permutation naming, JSON shape
- Worktree creation — assert worktrees are created at the expected paths for a given experiment


### 6029fdb
- Worktree branches — assert each worktree is on a branch named `thunderjar/<runId>--<timestamp>`

### 8b1b918
- Checkout guard — assert checkout is blocked when working tree has uncommitted, unstaged, or untracked changes