# 3100: Remove `checkoutCommit` and `ctx.git`

A code state gets its codebase the way any Dockerfile would: it clones a repository at a pinned commit in its own `RUN`. Thunderjar no longer bundles commits of the local repository into the build context, and `ctx.git.show` is gone. The git identity the agent commits with is set by the base image.

## Version bump type

major

## Artifacts

- Removes `checkoutCommit` and `ctx.git`, and the bundle and file export they used
- `renderPrerun` only joins fragments: base image, `WORKDIR /workspace`, code state, prompt set, harness, initial prompt
- `init` scaffolds:
  - a code state that clones the project's `origin` at its current commit, or leaves `/workspace` empty, with an example, when there is no `origin`
  - a base image that sets a git identity with `git config --system`
  - a prompt set `snerk` that adds nothing
- Removes scenario `0301_git_project` and its real git tests

```ts
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git",
    commit: "24dc11c26e2716a12cf33b82fec895a7f02b3e8a",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin`,
});
```

## Example CLI Output

```
$ thunderjar build example --dry-run
# thunderjar-prerun:83405d8a
FROM node:20-bookworm
RUN npm install --global bun@1.3.14
RUN git config --system user.name "Thunderjar agent" \
  && git config --system user.email agent@thunderjar.invalid
WORKDIR /workspace
RUN echo "install fake-harness-alpha@1.0.0"
```

## Tests

- File creating tests of `init`
- Fixture + stdout tests of `build --dry-run`
- Unit tests of `renderPrerun`

## Human interventions

None. The `fixture-0301-*` tags can be deleted from the remote once this is merged.
