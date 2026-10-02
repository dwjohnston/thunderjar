# Code State

The codebase applied on top of the base image: a git commit from the user's repository,
plus any setup the codebase needs before the agent starts.

One of the six experiment parameters. Hashing and `applyParameter` are common to all of
them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `experiment-parameters/codeStates/<name>/index.ts`.

```ts
// experiment-parameters/codeStates/baseline/index.ts
export default declareCodeState({
  commit: "a1b2c3",
  applyParameter: () => `RUN npm ci`,
});
```

| Field | What it is |
|---|---|
| `commit` | The commit the agent starts from. A SHA, or a function of `ctx` for a floating code state. |
| `applyParameter` | Returns a Dockerfile fragment run in `/workspace` after the commit is checked out: installing dependencies, seeding fixtures. |

A code state is always a git commit. `applyParameter` can add to it, but can't replace it.

```ts
// experiment-parameters/codeStates/with-fixture/index.ts
export default declareCodeState({
  commit: "a1b2c3",
  applyParameter: () => `RUN npm ci && ./scripts/seed-fixture-data.sh`,
});
```

## How the code gets into the image

Thunderjar puts the commit into the image itself. The code state doesn't clone or check
anything out.

1. On the host, Thunderjar packs the commit and its history into a file in the build
   context: `git bundle create code.bundle <commit>`.
2. Straight after the base image's fragment, the prerun build clones that bundle to
   `/workspace`, checks out the commit detached, removes the remote, and sets a git
   identity so the agent can commit.
3. The code state's own fragment runs next, with `/workspace` as the working directory.

```dockerfile
FROM node:20-bookworm                              # base image
COPY code.bundle /tmp/code.bundle                  # Thunderjar
RUN git clone /tmp/code.bundle /workspace \
  && git -C /workspace checkout --detach a1b2c3 \
  && git -C /workspace remote remove origin \
  && rm /tmp/code.bundle                           # Thunderjar
WORKDIR /workspace
RUN npm ci                                         # code state's fragment
```

_(Referenced by: [060-experiment-parameters.md](060-experiment-parameters.md#declarations-and-applyparameter),
[063-prompt-set.md](063-prompt-set.md), [090-restore-purge.md](090-restore-purge.md),
[061-base-image.md](061-base-image.md).)_

- **Only history up to the commit.** The bundle holds the commit and its ancestors, never
  other branches or later commits. Otherwise the agent could find the commit that solves
  its task with `git log --all`.
- **No credentials.** The code comes from the local repository, so a private repository
  needs nothing in the image build.
- **A real repository.** The agent can use git, and [restore](090-restore-purge.md) can
  fetch the agent's commits back on top of a commit the developer already has.

## Where the commit comes from

**Thunderjar assumes the environment it runs in has enough git history for every
parameter it applies.** It reads commits from the repository it is run in, found from the
`thunderjar/` folder, and never fetches. Keeping that repository up to date is the
environment's job: a developer pulls, and a CI pipeline checks out with enough history
(e.g. `fetch-depth: 0`).

_(Referenced by: [050-setup-and-configure.md](050-setup-and-configure.md#prerequisites),
[063-prompt-set.md](063-prompt-set.md).)_

- **A missing commit fails before anything is built**, naming the commit and the
  parameter that needs it:
  ```
  error: commit a1b2c3 (code state "baseline") is not in this repository.
  Fetch it, or check that it has been pushed.
  ```
- **A missing commit can't produce a different run.** A SHA means the same content on
  every machine, so a commit is either there and correct, or the run stops.
- **A commit is only needed to build.** If the permutation's prerun image is already in
  the image store, it is pulled, and the commit isn't read.
- **A pinned commit must be pushed** for anyone else, CI included, to build from it.

## Following a moving target

A code state can follow a moving target, such as the tip of `main`, by declaring
`determineHash` and taking its commit from `ctx.resolvedHash` (see
[060-experiment-parameters.md](060-experiment-parameters.md#parameters-that-follow-a-moving-target)).
This can be called a *floating parameter*.

```ts
// experiment-parameters/codeStates/main/index.ts
export default declareCodeState({
  determineHash: () => `git rev-parse origin/main`,
  commit: (ctx) => ctx.resolvedHash,
  applyParameter: () => `RUN npm ci`,
});
```

Resolve against the remote-tracking branch (`origin/main`), not a local one. Every
machine's local `main` can be at a different commit, so "latest `main`" would mean
something different on each. Even `origin/main` is only as fresh as the environment's
last fetch.

## When it applies

Build time only. Thunderjar's checkout runs after the base image's fragment, and the code
state's fragment runs after that and before the prompt set's.

## Future

- Experiments kept in a different repository from the code they run against, and
  Thunderjar fetching a missing commit itself. See
  [020-goals-non-goals.md](020-goals-non-goals.md#non-goals-v1).

## Open questions

- A parameter folder can bundle files, such as a fixture script, and they count toward
  its parameter hash (see
  [051-configuration-folder-structure.md](051-configuration-folder-structure.md)). How a
  bundled file reaches the image build is not defined.
- Bundling the commit's full history makes every prerun image carry it. Whether to limit
  the depth, and how deep restore needs it to be.
