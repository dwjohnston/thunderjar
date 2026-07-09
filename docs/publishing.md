<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-sonnet-5
Supervising engineer: David Johnston

Level of human supervision: None
-->

# Publishing & Releases

Thunderjar uses [Changesets](https://github.com/changesets/changesets) to manage version bumps, changelogs, and (eventually) npm publishing.

## Current status: not yet published to npm

`package.json` still has `"private": true`. Today Thunderjar is consumed only via relative import from a sibling project's `thunderjar.config.ts` (see the root `README.md` / `docs/index.md`), not as a published package. There's no settled public API boundary yet — `src/` has no `index.ts`/`exports` map defining what's actually meant to be importable versus internal.

The Changesets tooling and release workflow below are wired up regardless, because they're useful on their own (they give every PR a place to log user-facing changes, and produce changelog-driven "Version Packages" PRs). The actual `npm publish` step is intentionally a no-op for now — see [`scripts/release-publish.sh`](../scripts/release-publish.sh), which checks `package.json`'s `private` flag and skips publishing while it's `true`.

**Before flipping `private` to `false`:**
1. Decide what's actually public API (likely `src/defineConfig.ts`, `src/ThunderJarConfig.ts`, `src/types.ts`, and the `thunderjar` CLI binary) and add an explicit `exports` map / `main` entry to `package.json` for it.
2. Confirm the `thunderjar` name is available on npm (or pick a scoped name, e.g. `@dwjohnston/thunderjar`).
3. Add an `NPM_TOKEN` secret to the repo for `.github/workflows/release.yml` to use.
4. Remove `"private": true` from `package.json` — at that point `scripts/release-publish.sh` will stop skipping and will run `bunx changeset publish` for real.

## Adding a changeset

Any PR with a user-facing change (bug fix, new feature, breaking change) should include a changeset describing it:

```sh
bunx changeset
```

This prompts for:
- which package(s) changed (there's only one, `thunderjar`, in this repo)
- the bump type: `patch` / `minor` / `major`
- a short changelog summary (this text ends up in `CHANGELOG.md`)

It writes a markdown file under `.changeset/` — commit that file as part of your PR. Changes that are purely internal (refactors, tests, docs, CI) don't need one.

## Release workflow

`.github/workflows/release.yml` runs on every push to `main`:

1. Installs dependencies, runs `bun run typecheck` and `bun test`.
2. Runs [`changesets/action`](https://github.com/changesets/action), which:
   - If there are pending `.changeset/*.md` files: opens/updates a "Version Packages" PR that bumps `package.json`'s version and rolls the changesets into `CHANGELOG.md`.
   - If that PR has just been merged (no pending changesets left): runs the publish step (`bun run release:publish`, i.e. `scripts/release-publish.sh`), which — as noted above — currently no-ops because the package is private.

No manual version bumping or changelog editing should be needed; it's all driven by the changeset files added in PRs.
