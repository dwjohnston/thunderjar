# Code State

The codebase applied on top of the base image.

One of the six experiment parameters. Hashing and `applyParameter` are common to all of
them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `experiment-parameters/codeStates/<name>/index.ts`.

```ts
// experiment-parameters/codeStates/baseline/index.ts
export default declareCodeState({
  applyParameter: () => `RUN git checkout a1b2c3`,
});
```

| Field | What it is |
|---|---|
| `applyParameter` | Returns a Dockerfile fragment that produces the codebase. |

## What the fragment can do

Most commonly it checks out a pinned git commit. It can return any fragment that
produces the same codebase every time: applying a patch or running a fixture generator
aren't special cases.

A code state can also follow a moving target, such as the tip of `main`, by declaring
`determineHash` (see
[060-experiment-parameters.md](060-experiment-parameters.md#parameters-that-follow-a-moving-target)).
This can be called a *floating parameter*. The rule above still holds, applied to
the resolved value: `determineHash` may return a different value on a later execution,
but any one value it returns must always mean the same codebase. `git rev-parse main`
qualifies, because a commit SHA identifies exactly one tree. The command itself should
be a deterministic evaluation of local state. The user shouldn't make API calls or do anything else that could have give different code state conditions for the same hash. 

```ts
// experiment-parameters/codeStates/with-fixture/index.ts
export default declareCodeState({
  applyParameter: () =>
    `RUN git checkout a1b2c3 && ./scripts/seed-fixture-data.sh`,
});
```

## Where the code lives

The user's code stays in the normal project tree. A code state points at it by pinned
commit rather than copying it into `thunderjar/`.

## When it applies

Build time only. Its fragment runs after the base image's and before the prompt set's.

## Open questions

- A parameter folder can bundle files, such as a fixture script, and they count toward
  its content hash (see
  [051-configuration-folder-structure.md](051-configuration-folder-structure.md)). How a
  bundled file reaches the image build is not defined.
