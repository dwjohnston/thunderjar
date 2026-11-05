---
name: tj-config
description: Edit a project's `.thunderjar/thunderjar.config.ts`, i.e. where images are pushed, where run data lives, and the secrets or SSH agent that prerun builds get. Use when the user wants to push images to a registry, keep them local, or let a code state clone a private repository.
---

# Edit `thunderjar.config.ts`

The config has three fields.

```ts
import { declareConfig, sqliteStore } from "thunderjar";

export default declareConfig({
  imageStore: null,
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
  build: { secrets: [{ id: "github", env: "GITHUB_TOKEN" }], ssh: true },
});
```

| Field | What it is | Required |
|---|---|---|
| `imageStore` | The registry repository prerun and postrun images are pushed to, or `null` | Yes |
| `runDataStore` | Where run results are recorded. Only `sqliteStore` exists | Yes |
| `build` | Secrets and the SSH agent for prerun builds | No |

## `imageStore`

`null` keeps images in the local Docker daemon. Nothing is pushed, and no login is needed.

To push, name a repository, without a tag:

```ts
imageStore: { repository: "ghcr.io/acme/thunderjar-images" },
```

Then the user runs `docker login ghcr.io`. A repository with no host, e.g. `acme/images`, is on `docker.io`.

**Why:** `build` and `run` check the login before building anything, so a missing login fails in seconds instead of after the agents have run.

## `runDataStore`

Leave it as `init` scaffolded it.

⚠️ The `path` is not read yet. Run data always goes to `.thunderjar/.data/`, or to the folder a command's `--data-dir` names.

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

## Check the change

```sh
thunderjar plan <test case>
```

`plan` loads the config and reports each wrong field by name.
