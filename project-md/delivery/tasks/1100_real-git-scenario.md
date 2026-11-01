# 1100: Real git scenario

Code states and prompt sets that read real commits of this repository, pinned by tags.

This replaces the PR's seed repository (28eba43) rather than adding it first.

From row 18. See [planned reapplication](../../research/planned-reapplication.md), step 11.

## Version bump type

minor

## Artifacts

- `checkoutCommit` and `ctx.git.show`
- Scenario `fixtures/03_real_git/0301_git_project/`
- `fixture-0301-<name>` tags, pushed
- `fetch-depth: 0` in CI

## Example CLI Output

```
$ thunderjar build --dry-run
# thunderjar-prerun:c9d0e1f2
FROM node:20
RUN git checkout --detach 65bcb92c...
```

## Tests

- Real git tests: each file comes from its pinned commit, not the worktree
- With real Docker, `/workspace` is detached at the commit, with no remote
- A commit this repository doesn't have stops the build before anything is built

## Human interventions

- Push the `fixture-0301-*` tags.
