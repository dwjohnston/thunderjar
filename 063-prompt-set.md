# Prompt Set

A named, reusable action that overlays prompt files (`CLAUDE.md`, skills, rules) into
the worktree before the harness runs.

One of the six experiment parameters. Hashing and `applyParameter` are common to all of
them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `experiment-parameters/promptSets/<name>/index.ts`.

```ts
// experiment-parameters/promptSets/snerk/index.ts
export default declarePromptSet({
  commit: "e4f5a6",
  files: { "prompts/snerk.md": "CLAUDE.md" },
  applyParameter: () => ``,
});
```

| Field | What it is |
|---|---|
| `commit` | The commit the prompt files are read from. |
| `files` | Each prompt file's path in the repository, mapped to where it goes in `/workspace`. |
| `applyParameter` | Returns a Dockerfile fragment run after the files are in place. Usually empty. |

## Prompt files come from a pinned commit

Prompt files are read from a pinned commit, not taken from whatever happens to be in the
worktree. Otherwise the declaration's parameter hash stays the same while the file it
applies changes underneath it — the silent drift the hash exists to catch.

On the host, Thunderjar reads each file with `git show e4f5a6:prompts/snerk.md` into the
build context, and the prerun build copies it into `/workspace`:

```dockerfile
COPY prompt-set/CLAUDE.md /workspace/CLAUDE.md     # Thunderjar
```

Only the files are copied, never the commit's history, so a prompt set from a later
commit than the code state doesn't show the agent anything after the code state's commit.
The commit must be in the local repository, as for a code state — see
[062-code-state.md](062-code-state.md#where-the-commit-comes-from).

The prompt files themselves stay in the normal project tree (`prompts/snerk.md` above).
The declaration points at them rather than copying them into `thunderjar/`.

## Independent of code state

The commit is the prompt set's own, independent of the code state's. That keeps the two
axes orthogonal: a matrix can vary prompt sets while holding code state fixed, which is
the single most common experiment shape.

## When it applies

Build time only. Its files are copied in after the code state's fragment, and before the harness's fragment.
