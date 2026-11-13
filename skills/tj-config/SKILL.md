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
| `build` | Secrets and the SSH agent for prerun builds, and how many build at once | No |
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

### `concurrency`

How many prerun images `build` and `run` build at once. It defaults to 1, one after another.

```ts
build: { concurrency: 4 },
```

- With more than 1 here, or a runtime `concurrency` above 1, `run` starts each iteration as soon as its own prerun image is built, pushed and pulled, while the rest are still building.
- If a build fails after some iterations have started, those finish and are recorded, and the execution is recorded as failed.

✅ **Do** size it to the machine that runs `thunderjar`, not to the runtime. Builds and prerun pushes are always local.

**Why:** Each build uses the local CPU, memory and upload bandwidth. Too many at once take longer in total than fewer.

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

### `concurrency`

How many containers run on the runtime at once. It defaults to 1, one after another.

```ts
runtime: { command: ["docker", "--context", "cloud"], concurrency: 4 },
```

- `thunderjar run --concurrency <n>` overrides it for one run, and is the only way to run several at once with `--local`.
- With more than one at once, `run` writes each line whole, starting with its iteration, as containers finish in any order.

✅ **Do** ask the user how much CPU and memory the runtime has, and size `concurrency` to it.

❌ **Don't** set it to the number of iterations just to finish sooner.

**Why:** Each container is an agent that also runs builds and tests. Too many at once starve each other, so timings and timeouts stop being comparable between runs.

### `runner`

Runs each whole execution on the runtime, instead of one Docker command at a time from this machine.

```ts
runtime: {
  command: ["docker", "--context", "cloud"],
  runner: { registryLogin: { usernameEnv: "GHCR_USER", passwordEnv: "GHCR_TOKEN" } },
},
```

- `run` builds a runner image, holding Thunderjar and the `.thunderjar/` folder, pushes it to the image store, and starts it on the runtime with the runtime's Docker socket.
- The runner runs the containers, measures them, pushes postrun images and writes the run data store. `run` only follows it.
- Ctrl-C leaves the execution running. `thunderjar attach <execution ID>` follows it again, and `attach <execution ID> --stop` stops it.
- `{}` is enough to turn it on.
  - `registryLogin`: the variables holding a user and token for the image store's registry. The runner logs in with them.
  - `env`: more variables to give the runner, by name.
  - `runOptions`: more `docker run` options for the runner's container, e.g. another path for the Docker socket.

✅ **Do** use it when the runtime is far away, or `run` should survive this machine disconnecting.

❌ **Don't** give `beforeExecution` or `afterExecution` with it. Start the runtime before `run`, and stop it yourself when done.

**Why:** the execution carries on after `run` is interrupted, so `run` can't tell when the runtime is free to stop.

✅ **Do** use a `postgresStore` with it. With a `sqliteStore`, the runner's records are copied to the local file only once `run` or `attach` has followed the execution to its end.

**Why:** Each Docker command sent to a distant runtime is a round trip. On the runtime, they're local. The variables' values are sent as the runner starts, and kept in its memory only.

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
