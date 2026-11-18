---
name: tj-promptset
description: Create a Thunderjar promptset, i.e. the instructions (AGENTS.md, CLAUDE.md, skills) put over the code state, so a test case can compare them. Use when the user wants to compare instructions, e.g. "does this AGENTS.md help", "compare these two skill descriptions", "try it with and without the skill".
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Supervising engineer: David Johnston

Humans: add your notes here
-->

# Create a promptset

First, read the tj-general skill: the order parameters are applied in, and the one rule all of them follow.

A promptset is the instructions put over the code state, before the agent starts. It's what a test case varies to compare instructions.

It lives in `.thunderjar/parameters/promptSets/<name>/index.ts`.

✅ **Do** use the empty promptset, e.g. `none`, when the user isn't comparing instructions.

**Why:** the code state already holds the repo's own AGENTS.md and skills. Copying them into a promptset changes nothing, and hides where they came from.

## Files beside the declaration

The usual case. Put the files in a `files/` folder beside `index.ts`, laid out as they go in `/workspace`.

```
promptSets/house-style/
  index.ts
  files/
    AGENTS.md
    .agents/skills/x/SKILL.md
```

```ts
import { declarePromptSet } from "thunderjar";

// The files in files/, copied over /workspace and committed.
export default declarePromptSet({
  applyParameter: (_config, ctx) => `COPY ${ctx.dir}/ /workspace/
RUN cd /workspace && git add -A && git commit --quiet -m "Thunderjar: apply promptSet"`,
});
```

## Files from a tag

For instructions that already live in the repo, at another commit. Name the tag `thunderjar/promptset/<promptset-name>`. Look the tag up in `resolve`: see the one rule in tj-general.

```ts
import { declarePromptSet } from "thunderjar";

// src/skills as they are at tag thunderjar/promptset/skills-v2, checked out over the code state's and committed.
export default declarePromptSet({
  config: { repo: "https://github.com/acme/cli.git", tag: "thunderjar/promptset/skills-v2", path: "src/skills" },
  resolve: async (config, ctx) =>
    (await ctx.exec(`git ls-remote --exit-code ${config.repo} refs/tags/${config.tag}`)).split("\t")[0]!,
  applyParameter: (config, ctx) => `RUN git -C /workspace fetch --quiet ${config.repo} ${ctx.resolved} \\
  && git -C /workspace checkout ${ctx.resolved} -- ${config.path} \\
  && git -C /workspace commit --quiet -m "Thunderjar: apply promptSet"`,
});
```

❌ **Don't** check out the tag directly in `applyParameter`.

```ts
// 👎 Bad
applyParameter: (config) => `RUN git -C /workspace fetch --quiet ${config.repo} tag ${config.tag} \\
  && git -C /workspace checkout ${config.tag} -- ${config.path}`,
```

**Why:** if the tag moves, the fragment's text stays the same, so a stale image is reused, and runs can't say which commit their instructions came from.

## Every promptset

1. Commits what it adds, so the agent's changes can be told apart from it.
2. Uses `git add -A`, not `git commit -a`, which skips new files such as a new skill.
3. Works for every harness the test case runs. Claude Code reads CLAUDE.md and `.claude/skills/`, the others AGENTS.md and `.agents/skills/`. e.g. a CLAUDE.md that only says `@AGENTS.md`, and `.claude/skills` as a link to `.agents/skills`.
4. Changes one thing from the promptset it's compared with.

**Why:** if two promptsets differ in two ways, a difference in the results can't be put down to either.
