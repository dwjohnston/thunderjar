---
harness: claude-code
model: sonnet
effort: medium
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: session_01LCLeLjFb1Gy2NHaFDTB6tk
Supervising engineer: David Johnston

Split from PR #218's roadmap plan.

Humans: add your notes here
-->

# 4100: `codeStateGitCheckout`

A helper for a code state at a commit, a branch or a tag of a git repository.

Roadmap item 1.

## Version bump type

minor

## Artifacts

Adds `codeStateGitCheckout` to `src/api`, beside `claudeCode`.

```ts
export default codeStateGitCheckout({ repo, commit: "530f477…" });
export default codeStateGitCheckout({ repo, branch: "main" });
export default codeStateGitCheckout({ repo, tag: "v0.4.0" });
```

1. Config is `{ commit } | { branch } | { tag }`, with the other keys typed `never`.
   - A bare `ref` string would be ambiguous: `abc123` could be a branch.
2. Branches and tags pin to a commit through `resolve`, with `git ls-remote` on the host.
   - The hash changes when the branch moves, so a stale image is never reused.
   - The run records the commit it resolved to.
   - Tags are peeled (`refs/tags/<tag>^{}`), so annotated tags give their commit.
3. Fetches the commit directly (`git fetch origin <sha>`), not a plain clone.
   - Squash-merged commits work, on hosts that allow it (GitHub does).
4. Then replaces the hand-written fragments in `.thunderjar/parameters/codeStates/`.

Out of scope: a subfolder to start in, installing dependencies.

## Example CLI Output

```sh
$ thunderjar plan compare-models
…
code state  thunderjar-main  github.com/dwjohnston/thunderjar @ main → 6c21138
```

## Tests

- Unit tests of the config types and the generated fragment.
- A `.docker.test.ts` that builds a code state from a tag.

## Human interventions

None.
