# Setup and Configure

Getting the application running, plus a high-level configuration overview that references out to the detailed config pages below.

## Prerequisites

- **A JavaScript package manager**, to install Thunderjar: npm, pnpm, yarn or Bun. Thunderjar
  itself runs on Bun, but users don't need to install Bun separately. See
  [How the CLI gets Bun](#how-the-cli-gets-bun).
- **Docker**, and **git**.
- A **registry** the user is logged in to (`docker login`), for the image store.

The user's own project can be in any language. JavaScript tooling is needed only for
Thunderjar's control plane, since the agent and the user's codebase run inside Docker
containers.

## Install and `init`

Where Thunderjar is installed depends on whether the project already has a root
`package.json`. The commands, config and folders are the same afterwards. Examples use
npm; the pnpm, yarn and Bun equivalents work the same way.

**JS project.** Thunderjar is a dev dependency of the project:

```
npm install -D thunderjar
npx thunderjar init
```

**Non-JS project.** There is no root `package.json`, so `init` creates one inside
`thunderjar/` with Thunderjar as its dependency, and Thunderjar never touches the
project's root. This follows AWS CDK and Pulumi, which scaffold a self-contained
TypeScript project beside an application in any language.

```
npx thunderjar init
cd thunderjar && npm install
```

Either way, then from the project root:

```
export ANTHROPIC_API_KEY=...
npx thunderjar plan is-prime-baseline
npx thunderjar run is-prime-baseline
```

Commands are run through the package manager (`npx`, `pnpm exec`, `bunx`, or a
`package.json` script), not by invoking `node_modules/.bin/thunderjar` directly. See below.

The CLI finds `thunderjar/` by walking up from the current directory to the nearest one.
The location is fixed: `./thunderjar/`, with no flag or setting to move it. A monorepo
runs the CLI from each package that has its own.

`init` creates:

- `thunderjar/package.json`, **only when the project has no root `package.json`**;
- `thunderjar/thunderjar.config.ts`;
- the folder structure from [051-configuration-folder-structure.md](051-configuration-folder-structure.md);
- a runnable **example experiment** (a cheap model, one iteration, a trivial task), so
  `plan` and `run` work straight away and the example documents the layout;
- `thunderjar/.gitignore`, ignoring `_generated/` and `.data/` (and `node_modules/` when
  `init` created the nested `package.json`). Everything else is committed, and the
  project's own `.gitignore` is untouched.

### How the CLI gets Bun

See [141-runnable-artifact.md](141-runnable-artifact.md) for the package behind this.

Thunderjar's bin has a `#!/usr/bin/env bun` shebang, and Thunderjar lists the npm `bun`
package as a dependency. That package installs the Bun binary into `node_modules/.bin`,
and a package manager puts that directory on `PATH` when it runs a command, so the
shebang finds the project's own Bun. Users on npm, pnpm or yarn never install Bun
themselves, and the Bun version is pinned with the project.

- **Run commands through the package manager.** Invoking `node_modules/.bin/thunderjar`
  straight from a shell skips the `PATH` setup, and `env bun` then fails unless Bun is
  installed globally.
- **Non-JS users still need a way to install.** They have no package manager to begin
  with, so they need either Node with npm, or Bun, as a one-off bootstrap.

**Future:** a CLI that runs on Node, loading `thunderjar.config.ts` through a TypeScript
loader (as Vite and Drizzle do), or a compiled binary (`bun build --compile`), so that
neither Bun nor a package manager is a prerequisite.

## Open questions about install

- Installs with scripts disabled (`--ignore-scripts`, common in some CI setups) may not
  place the `bun` binary. Needs testing.
- Windows: the package manager's `.cmd` shims should honour the shebang. Not yet verified.

## Verifying setup

`thunderjar doctor` checks Docker, registry access, required environment variables, the
run data store and the configuration, without running anything. See
[100-cli-reference.md](100-cli-reference.md#doctor).

## Credentials

Each [harness](064-harness.md#requiredenv-credentials) declares the names of the
environment variables its agent needs (`requiredEnv`). The user exports them in the shell
or CI secret store that runs Thunderjar. Thunderjar passes only those variables into that
harness's containers, and fails before building anything if one is unset.

`thunderjar.config.ts` has no environment section, and no secret is ever written to a
config file, an image or the run data store.

## `thunderjar.config.ts`

Global configuration holds the two stores from [070-data-architecture.md](070-data-architecture.md):

```ts
import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: { repository: "ghcr.io/acme/thunderjar-images" },
  runDataStore: sqliteStore({ path: "./thunderjar/.data/runs.sqlite" }),
});
```

- **`imageStore`** is the registry repository holding prerun and postrun images.
- **`runDataStore`** is a pluggable store behind a small interface (record a container run,
  list executions, fetch a run's results, re-measure). v1 ships only `sqliteStore`. A remote
  backend, e.g. `postgresStore({ urlEnv: "THUNDERJAR_DB_URL" })`, is a later drop-in.
- Container defaults such as concurrency are not in v1.

### Authentication

Three rules, all of the same shape: config names things, never holds secrets.

| What | How it authenticates | Who reads it |
|---|---|---|
| Harness (agent API key) | `requiredEnv` on the harness declaration | Passed into that harness's containers |
| Run data store (remote) | An env var named in the config, holding a connection URL with credentials, e.g. `urlEnv: "THUNDERJAR_DB_URL"` | The Thunderjar process on the host. No container sees it. |
| Image store | The user's existing `docker login` for the registry. Thunderjar holds no registry credentials. In CI the pipeline logs in first. | Docker |

A connection URL (`postgres://user:password@host/db`) is the one near-standard way to
authenticate to a remote database, and the `DATABASE_URL` convention. Cloud IAM tokens and
secrets managers are later store constructors behind the same interface.

## Open questions

- Sharing the run data store between CI and a developer's machine. See
  [071-data-persistence.md](071-data-persistence.md).
- Whether `plan` and `run` also run the `doctor` checks first, or leave them to `doctor`.

- Harnesses whose required variables depend on the model's provider (Bedrock, Vertex).
  v1 declares one harness per provider.
