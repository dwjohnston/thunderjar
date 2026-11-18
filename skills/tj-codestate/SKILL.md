---
name: tj-codestate
description: Create a Thunderjar code state, i.e. the workspace an agent starts in, made of what's on disk (a commit, a patch on top, a subfolder, generated files), the folder it starts in, and what's installed. Use when a test case needs to start somewhere new, e.g. "start from commit abc123", "start in packages/cli", "start from my uncommitted changes".
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Supervising engineer: David Johnston

Humans: add your notes here
-->

# Create a code state

A code state is the workspace the agent wakes up in:

1. What's on disk
2. Which folder it starts in
3. What's ready to use, e.g. installed dependencies

e.g.

```ts
import { declareCodeState } from "thunderjar";

// This repository at tag eval/add-json-flag, the commit before the --json flag was added, with
// dependencies installed. resolve looks up the tag's commit, so the Dockerfile pins a SHA.
export default declareCodeState({
  config: {
    repo: "https://github.com/acme/cli.git",
    tag: "eval/add-json-flag",
  },
  resolve: async (config, ctx) => {
    const tag = `refs/tags/${config.tag}`;
    const lines = (await ctx.exec(`git ls-remote --exit-code ${config.repo} ${tag} '${tag}^{}'`)).split("\n");
    // An annotated tag lists its own object, then the commit it points to, with ^{}.
    const line = lines.find((l) => l.endsWith("^{}")) ?? lines[0]!;
    return line.split("\t")[0]!;
  },
  applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${ctx.resolved} \\
  && git -C /workspace checkout --quiet --detach ${ctx.resolved} \\
  && git -C /workspace tag thunderjar-start \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile
WORKDIR /workspace`,
});
```

It lives at `.thunderjar/parameters/codeStates/<name>/index.ts`.


## ‼️ Important! The one rule! ‼️ 

`applyParameter` must be deterministic: the same text must always build the same image.

If you need to have content that is dynamic (a 'floating parameter') make use of the `resolve` function to resolve the dynamic parts. 



e.g.

```ts
// 👍 Good
resolve: (config, ctx) => ctx.exec(`git ls-remote --exit-code ${config.repo} refs/tags/${config.tag} | cut -f1`),
applyParameter: (config, ctx) => `RUN … checkout --detach ${ctx.resolved}`,

// 👎 Bad
applyParameter: (config) => `RUN git clone --branch ${config.tag} …`,
```

**Why:** images are cached by the hash of the text `applyParameter` returns. If the tag moves, the text stays the same, so a stale image is reused, and runs can't say which commit they started from. `resolve` runs once per `plan`, `run` or `build`, and each run records what it returned.

## Steps

1. **Choose what's on disk**
   - A commit: tag it, resolve the tag, check out the SHA.
   - Uncommitted changes: commit them on a snapshot branch, and tag that.
   - A subfolder: as for a commit, then `WORKDIR` into it, or check out only that folder.
   - A small scenario: write the files inline, e.g. `RUN cat > … <<'EOF'`.
   - A generated project: run the generator, then `git init` and commit.
   - Always end with everything committed at `/workspace`, tagged `thunderjar-start`, so measurements can diff against it.
2. **Tag it**
   - Tag the starting commit `eval/<task>`, push it, and look it up in `resolve` (see the one rule).
   - Tag, not SHA: it says what it is, and survives a squash-merge.
   - ⚠️ Never move a pushed tag. Make a new one.
3. **Seal it**
   - Remove `origin`.
   - Tag a commit from before the task's measurements existed, or check out only the folder the agent needs.
4. **Choose where the agent starts**
   - Set `WORKDIR`, e.g. `/workspace/packages/cli`. Default: `/workspace`.
5. **Make it ready to measure**
   - Install what measurements need, e.g. `bun install --frozen-lockfile`. A missing dependency reads as an agent failure.
6. **Check the starting state, before any paid run**
   - The task's checks fail, and the typecheck and tests pass.
   - e.g. `thunderjar build <test case>`, then `docker run --rm -it <image> bash`.

## Explain it in a comment

Say in a comment above `declareCodeState`:

- What's on disk, and why that starting point
- How it's sealed
- Anything a later reader must keep true, e.g. "keep this tag on a commit from before the measurements were added"
