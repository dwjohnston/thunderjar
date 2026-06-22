# Todos

## Write tests

### e96345f
- [ ] Test: results output structure — assert folder name format, file-per-permutation naming, JSON shape
- [ ] Test: worktree creation — assert worktrees are created at the expected paths for a given experiment

### 6029fdb
- [ ] Test: worktree branches — assert each worktree is on a branch named `thunderjar/<runId>--<timestamp>`

### 8b1b918
- [ ] Test: checkout guard — assert checkout is blocked when working tree has uncommitted, unstaged, or untracked changes

## Review

- [ ] Revisit worktree cleanup placement — currently removed immediately after the run; confirm this is the right point in the lifecycle once real harness execution is wired up
