# 3600: Build secrets in the config

A fragment can use a credential at build time, e.g. to clone a private repository, without it ever being written down. The config names each secret and the environment variable it's read from, and Docker reads it as it builds.

## Version bump type

minor

## Artifacts

- `declareConfig({ build: { secrets: [{ id, env }], ssh } })`, both optional
- Each build gets `docker build --secret id=<id>,env=<env>` per secret, and `--ssh default` with `ssh: true`. Fragments mount them for one `RUN`: `RUN --mount=type=secret,id=github …` reads `/run/secrets/github`, and `RUN --mount=type=ssh …` uses the agent.
- `plan`, `build` and `run` stop before anything is built if a secret's variable is unset or empty. `build --dry-run` builds nothing, so needs none.
- Secrets are never in an image layer, the run data or any hash: Thunderjar only checks that the variable is set.
- Scenario `0210_build_secrets`

```ts
export default declareConfig({
  imageStore: null,
  runDataStore: sqliteStore({ path: "./.thunderjar/.data/runs.sqlite" }),
  build: { secrets: [{ id: "github", env: "GITHUB_TOKEN" }], ssh: true },
});
```

### `docker build`, not `docker buildx build`

`buildImage` keeps running plain `docker build`, with `DOCKER_BUILDKIT=1`:

- BuildKit takes `--secret` and `--ssh`. It's `docker build`'s default builder since Docker Engine 23, and `DOCKER_BUILDKIT=1` asks for it on older engines.
- Where the buildx plugin is installed, `docker build` is buildx's own, with the builder that loads the image into the local daemon, where `run` finds it.
- `docker buildx build` fails where the plugin isn't installed. With a `docker-container` builder it would also leave the image in the builder, unless given `--load`.

## Example CLI Output

```
$ thunderjar build example
Error: Build secret "github" needs GITHUB_TOKEN, which is not set.
Export it in the shell that runs thunderjar.

$ GITHUB_TOKEN=… thunderjar build example
Building thunderjar-prerun:… ... done
1 built, 0 already present
```

## Tests

- Unit tests of the config's `build` and of the variable check
- Fake Docker tests of `build` and `run`: the flags given to `docker build`, and the secret's value in no build context or record
- Fixture + stdout tests of `plan`: it stops without the variable, and the value is in no hash

## Human interventions

None. Real builds with secrets weren't run here: Docker isn't available in this environment.
