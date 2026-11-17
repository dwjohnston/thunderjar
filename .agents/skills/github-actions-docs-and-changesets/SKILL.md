---
name: github-actions-docs-and-changesets
description: Set up or audit a TypeScript npm package's CI/release pipeline with Changesets for versioning and publishing to npm via GitHub Actions (OIDC trusted publishing), and VitePress docs deployed to GitHub Pages.
---

# npm publishing with Changesets + VitePress docs

This skill assumes the following tech stack:

- Github actions as CI platform
- NPM for publishing (though alternative package repositories can easily be accomodated)
- Vitepress for documentation. 

Templates for every file are in
[templates/](templates/). Copy them, then adapt the scripts and package names.

## Behaviour to reproduce

| Concern | Behaviour |
|---|---|
| PR checks | Typecheck + test on PRs to `main`. |
| Post-merge | Build only, on push to `main` (cheap sanity check). |
| Versioning | Changesets. Contributors add a changeset per PR; the bot maintains a single "Version Packages" PR. |
| Publishing | Merging the Version Packages PR publishes to npm. Uses OIDC trusted publishing, so no `NPM_TOKEN` secret. |
| Docs | VitePress, deployed to GitHub Pages. Not on every merge: only on manual dispatch, or when a merged PR to `main` has the `update-docs` label. |
| Docs on release | `release.yml` applies `update-docs` to the Version Packages PR, so docs redeploy with each release. |

## Files to create

| Template | Destination |
|---|---|
| `templates/ci.yml` | `.github/workflows/ci.yml` |
| `templates/release.yml` | `.github/workflows/release.yml` |
| `templates/docs.yml` | `.github/workflows/docs.yml` |
| `templates/changeset-config.json` | `.changeset/config.json` |

## package.json requirements

Scripts the workflows call (names must match, or edit the workflows):

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "docs:dev": "vitepress dev",
    "docs:build": "vitepress build",
    "docs:preview": "vitepress preview",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.31.0",
    "vitepress": "^2.0.0-alpha.18"
  }
}
```

- `build` is package-specific; keep the one the project already has.
- Swap `bun` for the project's package manager if it isn't Bun (also in the
  `setup-bun` / `bun install` steps).
- VitePress output is assumed at `.vitepress/dist` (docs at repo root). If docs
  live in a subfolder (e.g. `docs/`), change the upload `path` in `docs.yml` and
  the `docs:*` scripts.

## One-time setup the user must do (cannot be automated from the repo)

1. **npm trusted publisher:** on npmjs.com, package settings → Trusted Publisher →
   GitHub Actions, with the repo owner/name and workflow filename `release.yml`.
   The package must already exist on npm (publish a first version manually if not).
2. **GitHub Pages:** repo Settings → Pages → Source: "GitHub Actions".
3. **Actions permissions:** Settings → Actions → General → Workflow permissions:
   enable "Allow GitHub Actions to create and approve pull requests", otherwise
   the Version Packages PR can't be opened.
4. Run `npx changeset init` only if `.changeset/` doesn't exist; otherwise use the
   template config.

Tell the user about these rather than assuming they are done.

## Adapting

- Set `"access": "public"` in the changeset config for public packages; scoped
  packages need it.
- `package.json` should have `repository`, `files`, and a `publishConfig` if
  needed; trusted publishing requires `repository.url` to match the GitHub repo.
- Monorepos: keep the same workflows; Changesets handles multiple packages, and
  `fixed` / `linked` / `ignore` in the config become relevant.
- If the project has no docs, drop `docs.yml` and the label step in `release.yml`.
- Pin `bun-version` if reproducibility matters more than staying current.

## Authoring a change (for the project's own contributors)

```
bun run changeset      # choose bump type, write a summary, commit the generated .md
```

Docs-only fix with no release: add the `update-docs` label to the PR by hand.
