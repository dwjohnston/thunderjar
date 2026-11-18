---
name: tj-oneshot-eval
description: Run /tj-oneshot for a prompt that asks to create a Thunderjar eval, after creating and pushing the git tag its code state will pin, since the subprocess can't reach the internet. Use when told to one-shot the creation of an eval, e.g. `/tj-oneshot-eval set up an eval for 'add a --json flag to list'`.
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Supervising engineer: David Johnston


Humans: add your notes here


-->

# One-shot an eval

Follow [tj-oneshot](../tj-oneshot/SKILL.md), with one extra step: create the code state's tag before spawning the subprocess.

```text
/tj-oneshot-eval set up an eval for 'add a --json flag to the list command'
/tj-oneshot-eval --harness codex create an eval from issue #42
```

## Why a tag

An eval's code state usually pins a tagged commit, e.g. tag `eval/humans-md`:

```ts
// This repository at tag eval/humans-md, where AGENTS.md includes @HUMANS.md …
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    commit: "3e614b510673f25596579be65c41cab611becd32",
  },
  // …
});
```

The tag keeps the commit reachable on the remote, so the image can always fetch it.

The subprocess runs under "Don't access the internet", so it can't push a tag. You push it for them.

## Steps

Follow tj-oneshot's steps 1 to 4 as written. Then, before step 5:

### Create the tag

Skip this when the prompt names an existing code state, tag or commit to start from. Pass that on unchanged.

Otherwise:

1. Choose the commit: the one the prompt describes, or the worktree's `HEAD` (the base branch) if it doesn't say.
2. Name the tag `eval/<slug>`, using the slug from step 3.
   - It already exists on the remote: stop and ask the user. Don't move it.
3. Create and push it:

   ```sh
   git -C <worktree> tag eval/<slug> <commit>
   git -C <worktree> push origin eval/<slug>
   ```

4. Add it to the subprocess's context block, under its own heading:

   ```markdown
   ### Code state

   The tag `eval/<slug>` is pushed to origin, at commit `<sha>`.
   Declare the eval's code state at this commit, and name the tag in a comment beside it.
   ```

✅ **Do** push the tag before spawning the subprocess.

❌ **Don't** ask the subprocess to create or push the tag.

**Why:** a tag it creates stays local. The code state would pin a commit the image build can't fetch.

Then carry on from tj-oneshot step 5. Mention the tag in your final reply, next to the pull request URL.

## If the subprocess needs a different commit

It may decide the starting state needs changes first, e.g. dependencies installed or a failing test fixed (tj-eval step 5). It can commit those, but can't push them.

In that case its pull request carries the new commit. Tell the user the tag points at the old base, and that the code state needs re-pinning once the branch merges.
