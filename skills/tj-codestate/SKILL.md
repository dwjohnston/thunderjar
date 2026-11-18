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

// This repository at tag tj-add-json-flag, the commit before the --json flag was added, with
// dependencies installed. resolve looks up the tag's commit, so the Dockerfile pins a SHA.
export default declareCodeState({
  config: {
    repo: "https://github.com/acme/cli.git",
    tag: "tj-add-json-flag",
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

## Scenarios

Pick the one that matches where the agent should start.

### 1. A codebase at a commit

Tag the commit, push the tag, and resolve it to a SHA, as in the example at the top.

- Name the tag `tj-<code-state-name>`, e.g. `tj-add-json-flag`.

### 2. A floating parameter

e.g. the latest commit of a branch, looked up on each `plan`, `run` or `build`.

```ts
config: { repo: "https://github.com/acme/cli.git", branch: "main" },
resolve: async (config, ctx) =>
  (await ctx.exec(`git ls-remote --exit-code ${config.repo} refs/heads/${config.branch}`)).split("\t")[0]!,
applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${ctx.resolved} \\
  && git -C /workspace remote remove origin`,
```

### 3. A sandbox task

A few files written inline, with no repository behind them.

```ts
applyParameter: () => `RUN mkdir -p /workspace && cd /workspace && git init --quiet \\
  && cat > isPrime.ts <<'EOF'
export function isPrime(n: number): boolean { return false; }
EOF
RUN cd /workspace && git add -A && git commit --quiet -m start`,
```

### 4. Uncommitted changes

This is not currently supported, but if the user insists you're welcome to think of a workaround.

### 5. The output of a generator

Run the generator, then commit what it made.

```ts
applyParameter: () => `RUN bunx create-vite@6.0.1 /workspace --template react-ts \\
  && cd /workspace && git init --quiet && git add -A && git commit --quiet -m start`,
```

✅ **Do** pin the generator's version.

**Why:** an unpinned generator makes different files from the same text, which breaks the one rule.

## Every code state

1. Ends with everything committed at `/workspace`, tagged `thunderjar-start`, so measurements can diff against it.
2. Is sealed: no `origin`, and no measurements in the tree.
3. Sets `WORKDIR` to where the agent starts. Default: `/workspace`.
4. Installs what measurements need, e.g. `bun install --frozen-lockfile`.
5. Is checked before any paid run: the task's checks fail, and the typecheck and tests pass.

## Explain it in a comment

Say in a comment above `declareCodeState`:

- What's on disk, and why that starting point
- How it's sealed
- Anything a later reader must keep true, e.g. "keep this tag on a commit from before the measurements were added"
