# Prompt Set

A named, reusable action that overlays prompt files (`CLAUDE.md`, skills, rules) into
the worktree before the harness runs.

One of the five experiment parameters. Hashing and `applyParameter` are common to all of
them — see [060-experiment-parameters.md](060-experiment-parameters.md).

## Declaration

Lives at `test-case-parameters/promptSets/<name>/index.ts`, with its prompt files in a
`files/` folder beside it.

```
promptSets/house-style/
  index.ts
  files/
    AGENTS.md
    .agents/skills/review/SKILL.md
```

```ts
// test-case-parameters/promptSets/house-style/index.ts
export default declarePromptSet({
  applyParameter: (_config, ctx) => `COPY ${ctx.dir}/ /workspace/
RUN cd /workspace && git add -A && git commit --quiet -m "Thunderjar: apply promptSet"`,
});
```

| Field | What it is |
|---|---|
| `config`, `resolve` | As every parameter has: see [060](060-experiment-parameters.md#floating-parameters-resolve). |
| `applyParameter` | Returns the Dockerfile fragment that puts its prompt files in `/workspace`, from `ctx.dir`, its `files/` folder in the build context. |

Committing them, with `git add -A`, lets the agent's changes be told from the prompt set's.

## Prompt files are hashed by content

Only the prompt set's `files/` folder reaches the build, and it's hashed by content, with
the fragment. Editing a prompt file changes the prompt set's hash, and nothing else's. A
file kept in the project tree can be linked into `files/`: links are followed, and their
targets hashed. See
[051-configuration-folder-structure.md](051-configuration-folder-structure.md#a-parameters-files-folder).

A prompt set that reads its files from a repository instead, at a commit, clones or fetches
them in its own `RUN`, as a code state does, with the commit in the text so it's hashed.

## Independent of code state

The prompt set is its own parameter, independent of the code state. That keeps the two
axes orthogonal: a matrix can vary prompt sets while holding code state fixed, which is
the single most common experiment shape.

## When it applies

Build time only. Its fragment runs after the code state's, and before the harness's.
