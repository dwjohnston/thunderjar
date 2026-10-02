# Setup and Configure

Getting the application running, plus a high-level configuration overview that references out to the detailed config pages below.

## Prerequisites

- **Bun**, to run the CLI. The user's own project can be in any language: Bun is needed
  only for Thunderjar's control plane, since the agent and the user's codebase run inside
  Docker containers.
- **Docker**, and **git**.
- A **registry** the user is logged in to (`docker login`), for the image store.

## Install and `init`

Where Thunderjar is installed depends on whether the project already has a root
`package.json`. The commands, config and folders are the same afterwards.

**JS project.** Thunderjar is a dev dependency of the project:

```
bun add -d thunderjar
bunx thunderjar init
```

**Non-JS project.** There is no root `package.json`, so `init` creates one inside
`thunderjar/` with Thunderjar as its dependency, and Thunderjar never touches the
project's root. This follows AWS CDK and Pulumi, which scaffold a self-contained
TypeScript project beside an application in any language.

```
bunx thunderjar init
cd thunderjar && bun install
```

Either way, then from the project root:

```
export ANTHROPIC_API_KEY=...
bunx thunderjar plan is-prime-baseline
bunx thunderjar run is-prime-baseline
```

Bun is needed only for Thunderjar's control plane. The agent and the user's codebase run
inside Docker containers, so the project itself can be in any language.

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

**Future:** a compiled binary (`bun build --compile`) so Bun is not a prerequisite.

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

- Sharing the run data store between CI and a developer's machine. With only `sqliteStore`
  in v1, the file must be shared by hand (CI artifact, synced directory), which the
  regression triage loop in [040-user-experience.md](040-user-experience.md#regression-triage)
  depends on.
- Whether `plan` and `run` also run the `doctor` checks first, or leave them to `doctor`.

- Harnesses whose required variables depend on the model's provider (Bedrock, Vertex).
  v1 declares one harness per provider.
