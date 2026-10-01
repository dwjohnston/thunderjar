# Prompt Set

A named, reusable action that overlays prompt files (`CLAUDE.md`, skills, rules) into
the worktree before the harness runs.

One of the six experiment parameters. Hashing and `applyParameter` are common to all of
them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `experiment-parameters/promptSets/<name>/index.ts`.

```ts
// experiment-parameters/promptSets/snerk/index.ts
const commit = "e4f5a6";

export default declarePromptSet({
  applyParameter: () =>
    `RUN git checkout ${commit} -- prompts/snerk.md && cp prompts/snerk.md CLAUDE.md`,
});
```

| Field | What it is |
|---|---|
| `applyParameter` | Returns a Dockerfile fragment that puts the prompt files in place. |

## Prompt files come from a pinned commit

Prompt files are checked out from a pinned commit, not taken from whatever happens to
be in the worktree. Otherwise the declaration's content hash stays the same while the
file it applies changes underneath it — the silent drift the hash exists to catch.

The prompt files themselves stay in the normal project tree (`prompts/snerk.md` above).
The declaration points at them rather than copying them into `thunderjar/`.

## Independent of code state

The commit is the prompt set's own, independent of the code state's. That keeps the two
axes orthogonal: a matrix can vary prompt sets while holding code state fixed, which is
the single most common experiment shape.

## When it applies

Build time only. Its fragment runs after the code state's and before the harness's.
