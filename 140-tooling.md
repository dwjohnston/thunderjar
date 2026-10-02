# Tooling

The tools Thunderjar is built with, and the one custom script that keeps its folder
structure honest. The structure itself is in
[150-repository-layout.md](150-repository-layout.md).

Everything below is a proposal. No code exists yet.

| Concern | Tool |
|---|---|
| Runtime, package manager, test runner | Bun (`bun test`) |
| Language | TypeScript |
| CLI argument parsing | Commander |
| Linting and formatting | Biome |
| Folder-structure enforcement | `scripts/sync-biome-layout.ts`, which writes rules into the Biome config |
| Versioning and release notes | Changesets (`.changeset/`) |
| CI | GitHub Actions |
| Documentation | VitePress, hosted on GitHub Pages |

- **Bun** runs the CLI, the scripts and the tests, with no build step in development. It is
  also what Thunderjar ships on; see [141-runnable-artifact.md](141-runnable-artifact.md).
  Tests are `*.test.ts` files run by `bun test`, laid out as in
  [150-repository-layout.md](150-repository-layout.md).
- **TypeScript** throughout, type-checked with `tsc --noEmit`. Bun runs the code but does not
  check it.
- **Commander** defines the commands in [100-cli-reference.md](100-cli-reference.md). Each
  command is one file under `src/commands/`, registered by the entry point in `src/cli/`.
- **Biome** does linting and formatting in one tool, so there is one config file.
- **Changesets** versions and publishes the `thunderjar` package described in
  [141-runnable-artifact.md](141-runnable-artifact.md). A change that affects users adds a
  file under `.changeset/` saying which bump it needs and what to put in the changelog.
  Releasing consumes those files, bumps the version and writes `CHANGELOG.md`. The
  `package.json` scripts `changeset`, `version` and `release` wrap the Changesets CLI.
- **GitHub Actions** runs three workflows:
  - **CI** (`ci.yml`). On a pull request to `main`: install with Bun, `bun run lint` (which
    includes the layout sync check below), `bun run typecheck` and `bun test`. On a push to
    `main`: `bun run build`.
  - **Release** (`release.yml`). On a push to `main`, `changesets/action` either opens a
    "Version Packages" pull request, when changesets are waiting, or publishes to npm, when
    that pull request has just been merged. It runs after Bun installs and builds, with Node
    set up as well because the action shells out to `npm`.
  - **Docs** (`docs.yml`). Described below.
- **VitePress** builds the documentation site, with `docs:dev`, `docs:build` and
  `docs:preview` scripts.
- **GitHub Pages** hosts it. The docs workflow builds the site and deploys it using
  `actions/upload-pages-artifact` and `actions/deploy-pages`, so no `gh-pages` branch is
  kept. It runs only when a pull request merged into `main` carries the `update-docs`
  label, or when triggered by hand. The release workflow adds that label to every
  "Version Packages" pull request, so docs are deployed per release, and a docs-only fix is
  deployed by labelling its pull request.

## Enforcing folder structure

Biome's built-in rules cover naming and imports, not where a file may live. What it offers
instead is scoping: a rule or a [GritQL plugin](https://biomejs.dev/linter/plugins/) can be
limited to a set of globs. The script turns a description of the layout into that scoping.

### How it works

1. The layout is written once, as data, in `scripts/layout.ts`: each folder under `src/` and
   `test/`, what it may contain, and what it may import from.
2. `scripts/sync-biome-layout.ts` reads that file and rewrites the generated section of
   `biome.json`.
3. `bun run lint` runs the script, then `biome check`. CI additionally fails if running the
   script changes `biome.json`, so the committed config can't drift from the layout.

```ts
// scripts/layout.ts
export const layout = {
  "src/cli": { allowedFiles: ["*.ts"], mayImport: ["src/commands"] },
  "src/commands": { allowedFiles: ["*.ts"], mayImport: ["src/adapters", "src/hashing"] },
  "src/adapters/docker": { allowedFiles: ["real.ts", "recording.ts", "index.ts"] },
};
```

The script owns one marked region of `biome.json` and leaves the rest alone, so hand-written
settings such as formatter options are untouched:

```jsonc
{
  "formatter": { "indentStyle": "space" },        // hand-written

  // sync-biome-layout: begin — generated, do not edit
  "overrides": [
    {
      "includes": ["src/cli/**"],
      "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error",
        "options": { "patterns": [{ "group": ["**/adapters/**"], "message": "src/cli may not import adapters" }] }
      } } } }
    }
  ]
  // sync-biome-layout: end
}
```

Biome's config permits comments (`biome.jsonc`), which is what lets the markers sit inside
the file. Whether the script edits that file textually between markers, or parses and
re-serialises it, is open below.

### What it can enforce

- **Import direction between folders.** Generated as per-folder `noRestrictedImports`
  overrides. This is the part Biome supports directly.
- **File names within a folder.** Generated as per-folder `useFilenamingConvention` options.
- **Files in the wrong place.** Not a built-in rule. Proposed: a generated GritQL plugin that
  reports on the program node of any file it runs on, scoped by the plugin's `includes` to the
  folders where no file is allowed (everything under `src/` that no layout entry covers). A
  file there is then a lint error with a message naming the layout page.

## Open questions

- **Does the "wrong place" plugin work?** It relies on a plugin scoped by `includes` firing
  once per file. Biome's plugin documentation says nothing about matching a file path inside a
  pattern, so scoping is the only lever. Needs a spike before this is relied on.
- **Which rules apply.** Which folders get an import restriction, and whether non-source
  folders (`scripts/`, `test/fixtures/`) are covered at all. See also
  [150-repository-layout.md](150-repository-layout.md#open-questions).
- **Editing `biome.json`.** Textual replacement between markers keeps comments and hand-written
  formatting. Parse and re-serialise is simpler but loses comments.
- **Where the layout data lives.** `scripts/layout.ts` as above, or derived from a tree in
  [150-repository-layout.md](150-repository-layout.md) so the spec and the lint rules
  can't disagree.
- **Biome version.** Plugins and `overrides` behaviour have changed between major versions;
  pin an exact version, as for Bun.
- **Which tests run in CI.** Pull requests run `bun test`; whether that includes the Docker
  image tests (layer 3) is open in
  [120-test-boundaries.md](120-test-boundaries.md#open-questions), as is the smoke test's
  trigger. Fixture images would need building on the runner, or pulling.
- **Where the docs source lives.** VitePress reads from `docs/`, which in this repository
  holds the design conversation. Whether the docs site is the pages in `spec/` or a separate
  user-facing set is not decided, and neither is its place in
  [150-repository-layout.md](150-repository-layout.md).
- **Requiring a changeset.** Whether a pull request without one fails CI, or only warns.
- **Commander confirmed?** Chosen on the strength of familiarity; nothing else in the spec
  depends on it.
