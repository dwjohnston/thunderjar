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

✅ **Do** reuse an existing code state if one already starts at the right place.

## Steps

1. Choose what's on disk
2. Tag it
3. Seal it
4. Choose where the agent starts
5. Make it ready to measure
6. Check the starting state

### 1. Choose what's on disk

| Starting point | How |
|---|---|
| A commit | tag it, resolve the tag, check out the SHA |
| A commit plus uncommitted changes | commit them on a snapshot branch, and tag that commit |
| A subfolder of a repo | as for a commit, then `WORKDIR` into the folder, or check out only that folder |
| A small scenario | write the files inline with `RUN cat > … <<'EOF'` |
| A generated project | run the generator, e.g. `RUN bun create …`, then `git init` and commit |

✅ **Do** end with a git repository at `/workspace`, with everything committed.

Tag the starting commit `thunderjar-start` inside the image, as the example does, so measurements can compare against it.

**Why:** measurements and prompt sets compare against the starting commit. Without it, the agent's changes can't be told apart from the starting files.

### 2. Tag it

Tag the starting commit, push the tag, and look the tag up in `resolve`.

e.g.

```sh
git tag eval/add-json-flag <commit>
git push origin eval/add-json-flag
```

✅ **Do** name the tag after what it's for, e.g. `eval/<task>`.

❌ **Don't** name a tag or a branch in `applyParameter`.

**Why:** `applyParameter` must be deterministic: the same text must always build the same image. A tag or branch can move, so the text would stay the same while the image changed. `resolve` turns the tag into a SHA once per `plan`, `run` or `build`, records it with each run, and `applyParameter` pins that SHA.

Tags over raw SHAs in `config`:
- A tag says what the starting point is. A SHA doesn't.
- A tag survives its branch being squash-merged and deleted. A commit on that branch may not.

`resolve` runs on the host and must only read, e.g. `git ls-remote`. `--exit-code` makes a missing tag fail, rather than resolve to nothing.

⚠️ **Warning:** don't move a pushed tag. Runs before and after would start from different commits under the same name. For a new starting point, make a new tag.

### 3. Seal it

The agent mustn't be able to see the answers.

- Remove `origin`, so it can't fetch anything newer.
- Tag a commit from before the task's measurements were added to `.thunderjar/`.
  - Or check out only the folder the agent needs.

**Why:** an agent that can read the measurements, or the fix, isn't doing the task.

### 4. Choose where the agent starts

Set `WORKDIR` to the folder the agent starts in. The default is `/workspace`.

e.g. one package of a monorepo:

```
WORKDIR /workspace/packages/cli
```

The same tag can make two code states, e.g. `nested-skills-root` and `nested-skills-a`, if where the agent starts is what's being compared.

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

- What's on disk, and why that starting point
- How it's sealed
- Anything a later reader must keep true, e.g. "keep this tag on a commit from before the measurements were added"
