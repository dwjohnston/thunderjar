# Code State

The codebase applied on top of the base image: a repository cloned at a pinned commit,
plus any setup the codebase needs before the agent starts.

One of the five experiment parameters. Hashing and `applyParameter` are common to all of
them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `parameters/codeStates/<name>/index.ts`.

```ts
// parameters/codeStates/baseline/index.ts
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git",
    commit: "24dc11c26e2716a12cf33b82fec895a7f02b3e8a",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin
RUN npm ci`,
});
```

| Field | What it is |
|---|---|
| `config` | Its settings, typically the repository and the commit the agent starts from. |
| `resolve` | Optional, for a floating code state: see [below](#following-a-moving-target). |
| `applyParameter` | Returns a Dockerfile fragment that gets the codebase into `/workspace`, then sets it up: installing dependencies, seeding fixtures. |

A JavaScript template string needs `\\` to put a line-continuation `\` into the Dockerfile.

A code state with files of its own, such as a fixture script, keeps them in its `files/`
folder, at `ctx.dir` in the build context:

```ts
// parameters/codeStates/with-fixture/index.ts — its script is with-fixture/files/seed-fixture-data.sh
export default declareCodeState({
  config: { repo: "https://github.com/acme/widgets.git", commit: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" },
  applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${config.commit}
COPY ${ctx.dir}/seed-fixture-data.sh /tmp/
RUN npm ci && sh /tmp/seed-fixture-data.sh`,
});
```

## How the code gets into the image

The code state's own fragment gets it there. Thunderjar adds only `WORKDIR /workspace`,
straight after the base image's fragment, so the code state runs in `/workspace`.

```dockerfile
FROM node:20-bookworm                                       # base image
RUN git config --system user.name "Thunderjar agent" \
  && git config --system user.email agent@thunderjar.invalid
WORKDIR /workspace                                          # Thunderjar
RUN git clone --quiet https://github.com/acme/widgets.git /workspace \
  && git -C /workspace checkout --quiet --detach a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0 \
  && git -C /workspace remote remove origin                # code state
RUN npm ci                                                  # code state
```

_(Referenced by: [060-experiment-parameters.md](060-experiment-parameters.md#declarations-and-applyparameter),
[063-prompt-set.md](063-prompt-set.md), [090-restore-purge.md](090-restore-purge.md),
[061-base-image.md](061-base-image.md).)_

- **Pin the commit.** The commit is in the fragment's text, so it's in the code state's
  hash: changing it changes only the code state's hash. A branch name in the text would
  hash the same whatever the branch points at. To follow a branch, use `resolve`.
- **Detached, with no remote.** So the agent can't fetch, or find the commit that solves
  its task with `git log --all`. A clone carries the repository's other branches until the
  remote is removed; a `--single-branch` clone, or a shallow one, carries less.
- **A git identity.** The base image sets one with `git config --system`, so the agent, and
  a prompt set that commits, can commit, whichever user they run as.
- **A private repository** needs a credential at build time: a build secret, mounted for the
  one `RUN` that clones. It's never in an image layer, the run data or any hash. See
  [060](060-experiment-parameters.md#build-secrets).

  ```dockerfile
  RUN --mount=type=secret,id=github \
    git clone "https://x-access-token:$(cat /run/secrets/github)@github.com/acme/private.git" /workspace
  ```

- **A real repository.** The agent can use git, and [restore](090-restore-purge.md) can
  fetch the agent's commits back on top of a commit the developer already has.

## Where the commit comes from

The build fetches it, from wherever the code state's `RUN` clones. The repository the
project is in doesn't need it, and Thunderjar never reads it.

- **A pinned commit must be pushed** for the build to fetch it.
- **A commit is only needed to build.** If the permutation's prerun image is already in
  the image store, it is pulled, and nothing is fetched.

## Following a moving target

A code state can follow a moving target, such as the tip of `main`, with `resolve`. It
runs on the host once per execution, before anything is hashed, and its result is
`ctx.resolved` (see
[060-experiment-parameters.md](060-experiment-parameters.md#floating-parameters-resolve)).
This can be called a *floating parameter*.

```ts
// parameters/codeStates/follow-main/index.ts
export default declareCodeState({
  config: { repo: "https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git", branch: "main" },
  resolve: async (config, ctx) =>
    (await ctx.exec(`git ls-remote --exit-code ${config.repo} refs/heads/${config.branch}`)).split("\t")[0] as string,
  applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${ctx.resolved} \\
  && git -C /workspace remote remove origin`,
});
```

The resolved commit is in the fragment, so the hash changes exactly when `main` moves, and
Docker can't reuse a layer built from an earlier commit. Each run records the commit it
resolved to.

## When it applies

Build time only. The code state's fragment runs after `WORKDIR /workspace`, and before the
prompt set's.

## Open questions

- Whether Thunderjar should check that a code state leaves no remote and no later commits,
  rather than leave it to the fragment.
