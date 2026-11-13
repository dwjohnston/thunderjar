
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

The repo runs thunderjar on itself from [`.thunderjar/`](./.thunderjar/). It uses a published release, installed as an npm alias devDependency:

```json
"thunderjar-published": "npm:thunderjar@0.3.0-preview-476b801"
```

`.thunderjar/` code imports from `thunderjar-published`, not `thunderjar`.

Why the alias: Changesets rewrites any dependency named `thunderjar` to the version it's about to release. That version isn't on npm yet, so `bun install` fails on the "Release Version x.y.z" PR. The alias has a different name and an `npm:` range, so Changesets leaves it alone.

To dogfood a newer release, bump the version in the alias by hand.

To run it, with Docker and `ANTHROPIC_API_KEY`:

```sh
bun run dogfood:local
```

It runs the `compare-models` test case with the installed `thunderjar-published`, on the local Docker daemon. The Dogfood workflow runs it on every pull request, with the `ANTHROPIC_API_KEY` repository secret, and keeps the run data as an artifact. See [.thunderjar/AGENTS.md](./.thunderjar/AGENTS.md).

### Remote runs

With `THUNDERJAR_REMOTE=1`, `.thunderjar/thunderjar.config.ts` runs containers on a Docker daemon on Fly.io, pushes images to ghcr, and records runs in Supabase Postgres:

```sh
bun run dogfood:remote
```

It needs `fly`, `docker login ghcr.io`, `FLYIO_TOKEN`, `THUNDERJAR_DB_URL` and `ANTHROPIC_API_KEY`.

The Fly machine isn't stopped after each execution:

- `.thunderjar/fly-runtime.sh up` starts it if it's stopped, and resizes it only if it's too small and no other execution is using it.
- `down` only releases it.
- A watchdog on the machine, `.thunderjar/fly-machine-init.sh`, stops it once it has been idle for an hour. Set `FLY_IDLE_MINUTES` for another period.

In CI, comment `/slow-tests` on a PR to run `compare-models` this way, or `/slow-tests <test case>` for another one. The outcome comes back as a PR comment. See [`.github/workflows/slow-tests.yml`](./.github/workflows/slow-tests.yml) for the secrets it needs.
