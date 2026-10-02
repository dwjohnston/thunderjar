# Runnable Artifact

The format Thunderjar is shipped in: what a user installs, and what runs when they type
`thunderjar`. How a user installs and invokes it is in
[050-setup-and-configure.md](050-setup-and-configure.md#install-and-init); this page is
the packaging behind that.

Everything below is a proposal. No code exists yet.

## v1: one npm package

Thunderjar is published as a single npm package, `thunderjar`. It serves two roles:

1. **The CLI.** Its `bin` entry is `thunderjar`, a script starting with
   `#!/usr/bin/env bun`.
2. **The library.** Its exports are the `declareX()` functions the user's
   configuration imports: `declareConfig`, `declareExperiment`, `declareHarness`,
   `sqliteStore` and so on, following [022-coding-conventions.md](022-coding-conventions.md).

Both come from one package so the CLI version and the `declareX()` imports can never
differ. The single-package question is still open in
[150-repository-layout.md](150-repository-layout.md#open-questions).

```jsonc
{
  "name": "thunderjar",
  "bin": { "thunderjar": "./dist/cli.js" },
  "exports": { ".": "./dist/index.js" },
  "dependencies": { "bun": "<pinned>" }
}
```

### Bun as a dependency

`bun` is a regular dependency. Installing Thunderjar puts the Bun binary in
`node_modules/.bin`, which the package manager puts on `PATH` when it runs a command, so
the shebang finds it. The consequences for users are in
[How the CLI gets Bun](050-setup-and-configure.md#how-the-cli-gets-bun).

### What the package contains

- The compiled CLI and library, as JavaScript (`dist/`), so a user installs no build step.
- Type declarations for the `declareX()` functions, so a user's configuration is
  type-checked. The generated parameter names in `_generated/` are not shipped. They are
  produced per project by `thunderjar generate`.
- Nothing that runs inside a container. The harness images are a separate question — see
  [020-goals-non-goals.md](020-goals-non-goals.md#to-revisit).

### Loading the user's configuration

The CLI loads `thunderjar.config.ts` and the experiment, parameter and measurement files
directly as TypeScript. Bun runs TypeScript without a build step, which is the reason
the package targets it.

## Future formats

- **Runs on Node.** Ship the CLI as plain JavaScript with no Bun-only APIs, and load the
  user's TypeScript through a loader such as `jiti`. Users bring their own runtime.
- **Compiled binary**, from `bun build --compile`, one per platform. No runtime or
  package manager needed. Needs a way to load the user's TypeScript from inside the
  binary, and a distribution channel such as GitHub releases or a Homebrew formula.

## Open questions

- Whether the library and the CLI stay in one package or become two (`thunderjar` and
  `@thunderjar/cli`), as in [150](150-repository-layout.md#open-questions).
- Whether `bun` is a `dependency` or a `peerDependency`, and how its version is pinned
  against the Bun APIs Thunderjar uses.
- Whether a user's configuration may import other packages, and where they resolve from
  in the nested `thunderjar/package.json` layout.
