# Base Image

The image a permutation's prerun image is built `FROM`, before code state is applied:
the base OS and runtime, plus any extra services a task needs (a database, a message
broker) that code state, prompt set and harness don't provision themselves.

One of the six experiment parameters. Hashing and `applyParameter` are common to all of
them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `experiment-parameters/baseImages/<name>/index.ts`.

```ts
// experiment-parameters/baseImages/node20/index.ts
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm`,
});
```

| Field | What it is |
|---|---|
| `applyParameter` | Returns the Dockerfile fragment carrying the `FROM`. |

## When it applies

Build time only. Its fragment is the first in the prerun build, so it is the seed every
other parameter's fragment layers onto. The base image needs no special case in the
build: it is simply the fragment that carries the `FROM`.

## When it needs attention

Most experiments use one plain, minimal base image like the one above. This parameter
only needs attention when a task depends on something the codebase itself doesn't set
up.
