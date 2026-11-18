---
name: tj-codestate
description: Create a Thunderjar code state, i.e. the workspace an agent starts in: what's on disk (a commit, a patch on top, a subfolder, generated files), the folder it starts in, and what's installed. Use when a test case needs to start somewhere new, e.g. "start from commit abc123", "start in packages/cli", "start from my uncommitted changes".
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

// This repository at the commit before the --json flag was added, with dependencies installed.
export default declareCodeState({
  config: {
    repo: "https://github.com/acme/cli.git",
    commit: "3e614b510673f25596579be65c41cab611becd32",
  },
  applyParameter: (config) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${config.commit} \\
  && git -C /workspace checkout --quiet --detach ${config.commit} \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile
WORKDIR /workspace`,
});
```

It lives at `.thunderjar/parameters/codeStates/<name>/index.ts`.

✅ **Do** reuse an existing code state if one already starts at the right place.

## Steps

1. Choose what's on disk
2. Pin it
3. Seal it
4. Choose where the agent starts
5. Make it ready to measure
6. Check the starting state

### 1. Choose what's on disk

| Starting point | How |
|---|---|
| A commit | clone, fetch the SHA, check it out |
| A commit plus uncommitted changes | push them to a snapshot branch, and pin that commit |
| A subfolder of a repo | clone, then `git checkout <commit> -- <folder>`, or `WORKDIR` into it |
| A small scenario | write the files inline with `RUN cat > … <<'EOF'` |
| A generated project | run the generator, e.g. `RUN bun create …`, then `git init` and commit |

✅ **Do** end with a git repository at `/workspace`, with everything committed.

**Why:** measurements and prompt sets compare against the starting commit. Without it, the agent's changes can't be told apart from the starting files.

### 2. Pin it

Pin a commit SHA, never a branch or a tag name.

✅ **Do** push the commit before building, and fetch it by SHA.

❌ **Don't** pin a commit that exists only on your machine.

**Why:** the same file must always build the same thing. A branch moves. An unpushed commit fails the build. Fetching by SHA still works after a branch is squash-merged and deleted, because GitHub keeps the commit under the pull request's ref.

For a commit worth naming, also tag it, e.g. `eval/<name>`, and push the tag. The tag is for people to find it, the SHA is what the code state uses.

### 3. Seal it

The agent mustn't be able to see the answers.

- Remove `origin`, so it can't fetch anything newer.
- Pin a commit from before the task's measurements were added to `.thunderjar/`.
  - Or check out only the folder the agent needs.

**Why:** an agent that can read the measurements, or the fix, isn't doing the task.

### 4. Choose where the agent starts

Set `WORKDIR` to the folder the agent starts in. The default is `/workspace`.

e.g. one package of a monorepo:

```
WORKDIR /workspace/packages/cli
```

The same commit can make two code states, e.g. `nested-skills-root` and `nested-skills-a`, if where the agent starts is what's being compared.

### 5. Make it ready to measure

Measurements run in the agent's container after it finishes. Whatever they need must be in the image.

- Dependencies installed, e.g. `bun install --frozen-lockfile`
- Tools on the path, e.g. bun, in the base image
- Anything the measurements build on, e.g. a first build

**Why:** a check that fails because a dependency is missing reads as an agent failure.

### 6. Check the starting state

Before any agent runs, check the code state by hand:

- The checks for the task's own changes fail
- The typecheck and test suite pass

e.g.

```sh
thunderjar build <test case>
docker run --rm -it <image> bash
```

✅ **Do** fix the code state, or drop the check, if a check already passes or the suite already fails.

❌ **Don't** start a paid run before checking.

**Why:** a check that already passes measures nothing. If the suite already fails, every run looks like the agent broke it.

## Explain it in a comment

Say in a comment above `declareCodeState`:

- What's on disk, and why that commit
- How it's sealed
- Anything a later reader must keep true, e.g. "keep this commit before the measurements were added"
