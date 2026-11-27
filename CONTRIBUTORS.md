
## This project contains HUMANS.md

HUMANS.md are intended for you - the human reader to read. 

They're like AGENTS.md in that they contain instructions for the agent, but agents should never touch them, whereas agents are allowed to modify their AGENTS.md.


## Versioning

Project uses changeset and standard semantic versioning. 



### Version formats

| Kind | Format | Example | npm tag | Published by |
|---|---|---|---|---|
| Stable | `x.y.z` | `0.2.0` | `latest` | Merging the "Release Version x.y.z" PR |
| Release candidate | `x.y.z-rc.N` | `0.2.0-rc.0`, `0.2.0-rc.1` | `rc` | Merging the "Release candidate" PR |
| Preview | `x.y.z-preview-<short sha>` | `0.3.0-preview-027b6e2` | `preview` | A `/preview` comment on an open PR |


### Semver while in 0.x

Project is currently in 0.x.

Below 1.0.0, shift every changeset bump down one level. Examples assume the current release is 0.1.2.

| Changeset type | Use for, while in 0.x | Release from 0.1.2 | Use for, from 1.0.0 |
|---|---|---|---|
| `major` | Not used until we decide to release 1.0.0 | 1.0.0 | Breaking change |
| `minor` | Breaking change | 0.2.0 | New feature |
| `patch` | New feature or bug fix | 0.1.3 | Bug fix |

Never use `major` until we decide to release 1.0.0. See [AGENTS.md](./AGENTS.md) for the full rule.


### Versioning skills 

The project is shipped with installable skills in the [skills](./skills/) folder. 

**I don't currently know what the strategy for versioning skills is** 

Basically changes are merged to main, they will be installable via `bunx skills add`? Maybe the instruction should be to use the the git tag? 



## Dogfooding

We have thunderjar evals in the [`.thunderjar/`](./.thunderjar/) folder. 

These files do `import {x} from "thunderjar"` regular [self references](https://nodejs.org/api/packages.html#self-referencing-a-package-using-its-name).


### Running dog food tests 

Needs an ANTHROPIC_API_KEY or CLAUDE_CLOUD_OAUTH_TOKEN

```sh
bun run dogfood:local
```


### Remote runs

With `THUNDERJAR_REMOTE=1`, `.thunderjar/thunderjar.config.ts` runs containers on a Docker daemon on Fly.io, pushes images to ghcr, and records runs in Supabase Postgres:

```sh
bun run dogfood:remote
```

It needs `fly`, `docker login ghcr.io`, `FLYIO_TOKEN`, `THUNDERJAR_DB_URL` and `ANTHROPIC_API_KEY`.

Thunderjar runs every `docker` command through the Fly client, `.thunderjar/fly-client/`. It manages the machine for you:

- The first `docker` command creates the machine if it's missing, and starts it if it's stopped.
- Once idle for `FLY_SLEEP_MINUTES` (default 30), it's stopped.
- Once idle for `FLY_DESTROY_MINUTES` (default a week), it and its volume are destroyed.
- `FLYIO_INSTANCE_SIZE` sets its CPUs. It's resized only when idle, as resizing restarts it.

You can also run it by hand:

```sh
bun run fly:up                                   # create, start or resize it now
bun run fly:status                               # its state, size and timer
bun run fly prune                                # when its disk fills: removes stopped containers and unused images
bun run fly:stop                                 # stop it now, if idle; `stop --force` stops it anyway
```

- The app `thunderjar-runtime-dwj` (`FLY_APP`) holds one machine. CI uses its own app.
- See [`.thunderjar/AGENTS.md`](./.thunderjar/AGENTS.md#the-fly-client) for how it works.

In CI, comment `/slow-tests` on a PR to run `compare-models` on the Fly machine, or `/slow-tests <test case>` for another one. The outcome comes back as a PR comment. See [`.github/workflows/slow-tests.yml`](./.github/workflows/slow-tests.yml) for the secrets it needs.
