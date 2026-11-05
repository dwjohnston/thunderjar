---
name: tj-config
description: Edit a project's `.thunderjar/thunderjar.config.ts`, i.e. where images are pushed, where run data lives (a local SQLite file or a shared Postgres database), the secrets or SSH agent that prerun builds get, and where containers run. Use when the user wants to push images to a registry, keep them local, let a code state clone a private repository, or run containers on a remote or cloud Docker host.
---

# Edit `thunderjar.config.ts`

The config has four fields.

```ts
import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: null,
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
  build: { secrets: [{ id: "github", env: "GITHUB_TOKEN" }], ssh: true },
  runtime: { command: ["docker", "--context", "cloud"] },
});
```

| Field | What it is | Required |
|---|---|---|
| `imageStore` | The registry repository prerun and postrun images are pushed to, or `null` | Yes |
| `runDataStore` | Where run results are recorded: `sqliteStore` or `postgresStore` | Yes |
| `build` | Secrets and the SSH agent for prerun builds | No |
| `runtime` | Where `run` runs containers, instead of the local Docker daemon | No |

## `imageStore`

`null` keeps images in the local Docker daemon. Nothing is pushed, and no login is needed.

To push, name a repository, without a tag:

```ts
imageStore: { repository: "ghcr.io/acme/thunderjar-images" },
```

Then the user runs `docker login ghcr.io`. A repository with no host, e.g. `acme/images`, is on `docker.io`.

**Why:** `build` and `run` check the login before building anything, so a missing login fails in seconds instead of after the agents have run.

## `runDataStore`

Where run results are recorded. Two stores exist.

| Store | For | Shared |
|---|---|---|
| `sqliteStore({ path })` | One machine. `init` scaffolds this | No |
| `postgresStore({ urlEnv })` | CI and developers seeing the same runs | Yes |

### `sqliteStore`

```ts
runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
```

- `path` is relative to the project folder, the one holding `.thunderjar/`, unless it's absolute.
- The file and its folder are created on the first `run`.

✅ **Do** keep the file out of git. `init` gitignores `.thunderjar/.data/`.

❌ **Don't** put the file on a network share to share it.

**Why:** it's a binary file every `run` rewrites, so commits conflict, and SQLite's locking isn't reliable over NFS or SMB.

### `postgresStore`

```ts
import { declareConfig, postgresStore } from "thunderjar";

runDataStore: postgresStore({ urlEnv: "THUNDERJAR_DB_URL" }),
```

- `urlEnv` names the variable holding the connection URL, e.g. `postgres://user:pass@host:5432/thunderjar`.
- Thunderjar creates its two tables, `thunderjar_executions` and `thunderjar_container_runs`, on first use. The database can hold other tables.
- Errors name the store as `Postgres at $THUNDERJAR_DB_URL`, never by its URL.

✅ **Do** have the user export the variable in the shell, or CI secret store, that runs `thunderjar`. Commands that use the store stop if it's unset.

❌ **Don't** write the URL into the config.

**Why:** the URL holds the database password, and the config is committed.

### `--data-dir`

`run`, `executions`, `show` and `view` take `--data-dir <dir>` to use the SQLite file `<dir>/runs.sqlite` for one command, whichever store the config names.

## `build`

For a code state or other fragment that needs a credential only while its image builds, e.g. to clone a private repository.

- `secrets`: each `{ id, env }` is passed as `docker build --secret id=<id>,env=<env>`.
  - The fragment mounts it for one `RUN`, at `/run/secrets/<id>`.
- `ssh: true`: passes the host's SSH agent as `docker build --ssh default`, for `git clone git@github.com:…`.

e.g. the config:

```ts
build: { secrets: [{ id: "github", env: "GITHUB_TOKEN" }] },
```

and the fragment's Dockerfile:

```dockerfile
RUN --mount=type=secret,id=github git clone \
  "https://x-access-token:$(cat /run/secrets/github)@github.com/acme/private.git" /workspace
```

✅ **Do** have the user export the variable in the shell that runs `thunderjar`. `plan`, `build` and `run` stop if it's unset or empty.

❌ **Don't** write the secret's value into the config, a fragment, or a build arg.

**Why:** Docker reads a secret from the environment as it builds. It never reaches an image layer, the run data or any hash, so changing a token doesn't rebuild every image.

## `runtime`

For running containers somewhere other than the local Docker daemon, e.g. a cloud VM. `command` is any command that takes the `docker` CLI's arguments. Thunderjar puts it in front of each container command `run` sends.

```ts
runtime: { command: ["docker", "--context", "cloud"] },
// or ["docker", "-H", "ssh://me@build-host"], or ["podman", "--remote"]
```

- Prerun images are still built and pushed locally. The runtime pulls them from the image store, then runs, measures and pushes postrun images there.
- `thunderjar run --local` ignores `runtime` for one run.

✅ **Do** set `imageStore` too. A `runtime` without one is a config error.

✅ **Do** have the user log the runtime in to the image store's registry, on the runtime's side.

❌ **Don't** set up the runtime's registry login from the config or a fragment.

**Why:** The runtime pulls from and pushes to the registry itself. Thunderjar never sends credentials to it, and each platform sets up registry access its own way.

## Check the change

```sh
thunderjar plan <test case>
```

`plan` loads the config and reports each wrong field by name.

With an `imageStore` or `runtime`, also run:

```sh
thunderjar doctor
```

`doctor` checks the local `docker login`. With a runtime, it pushes a tiny probe image and pulls it through the runtime, so a missing login fails now instead of during a run.
