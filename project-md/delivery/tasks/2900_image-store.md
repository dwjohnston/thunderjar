
# 2900: Image store

`run` and `build` load `thunderjar.config.ts`, check the Docker login for the image store before building, and push the images they make. `imageStore: null` keeps images in the local daemon. Closes dwjohnston/thunderjar#85.

## Version bump type

minor: breaking under 0.x. A project from an earlier `init` has the placeholder repository, so `run` and `build` now stop at the login check.

## Artifacts

- `ConfigDeclaration.imageStore` is `ImageStore | null`
- `src/config/projectConfig.ts`: loads the config, and checks the repository is a Docker repository name with no tag
- The login check, before anything is built:
  - `docker login <host>` with stdin closed
  - Dry runs don't check
- Pushes, with `docker tag` then `docker push --quiet`:
  - every prerun image the test case uses, including ones already present locally
  - each postrun image, right after its run is recorded and before measurement (spec 080)
  - a failed push stops the run, naming the repository and the `write:packages` scope
- `init` scaffolds `imageStore: null`, with a comment showing how to set a repository
- Scenario `0207_image_store`: 0201's setup with `ghcr.io/acme/thunderjar-images`
- Fake Docker supports `login`, `tag` and `push`, with a `loggedIn` option and `pushed()`

| `imageStore` | Login check | Push |
|---|---|---|
| `null` | none | none: images stay in the local daemon |
| `{ repository: "ghcr.io/acme/images" }` | `docker login ghcr.io`, stdin closed | prerun and postrun images, tagged per spec 081 |

## Example CLI Output

```
Execution <ULID>
Building thunderjar-prerun:c4220635 ... done
Pushing ghcr.io/acme/thunderjar-images:prerun-hc4220635 ... done
 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (0.4s)
      Pushing ghcr.io/acme/thunderjar-images:postrun-e<ULID>-hc4220635-i00 ... done
      isPrimeTemplateTest: {passed: 3, failed: 2}   isPrimeTsExists: true   tsIgnoreCount: 1
```

Without a login:

```
Error: Can't push to ghcr.io/acme/thunderjar-images: no valid Docker login for ghcr.io (cannot perform an interactive login from a non-TTY device). Run `docker login ghcr.io`.
```

## Decisions

- The login check is option B from the issue: `docker login <host>` with stdin closed.
  - With stored credentials, Docker re-validates them. With none, it fails at once and never prompts.
  - Checked against real Docker 29: it fails in about 20ms.
- Every fixture's config follows init's `imageStore: null`, since 0201 must match init's output.

## Tests

- Unit tests for `projectConfig` and the Docker wrapper
- `build` and `run` against `0207_image_store` with fake Docker: login check, pushes, and a failed push
- Real Docker: `build` on 0207 with an empty `DOCKER_CONFIG` stops before building

## Not yet

- Local images keep their local names (`thunderjar-prerun:<hash>`), not 081's one-repository format
- Prerun images aren't pulled from the store, so an image only in the registry is rebuilt
- No probe push (option C): a token that can log in but can't push fails at the first push
- The run record doesn't store the pushed reference
