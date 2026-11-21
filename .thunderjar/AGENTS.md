<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLku3njWFHedFBQJ6Mb
Supervising engineer: David Johnston

Humans: add your notes here
-->

# .thunderjar

This folder dogfoods thunderjar on its own repo.

## Defaults for new test cases

Use these when writing a new test case, unless the user asks for something else. Write each value into the test case: they're never applied at run time.

- baseImage: node20
- promptSet: none
- harnessModel, for a first run: claude-code / claude-haiku-5-5
- harnessModel, to compare harnesses: claude-code / claude-haiku-5-5, codex / openai/gpt-6-luna, copilot / anthropic/claude-haiku-5.5, opencode / openrouter/anthropic/claude-haiku-5.5
- iterations, for a first run: 1
- iterations, to compare: 5

A harness is named without its version: use the newest version of it in `parameters/harnessModels/`, e.g. `claude-code-2.1.311/claude-haiku-5-5`.

There's no default code state. A test case starts where the task needs it to, so choose one each time.

## Import from `thunderjar`

```ts
import { declareTestCase } from "thunderjar";
```

- There's no dependency on Thunderjar. The import resolves to this repo's own source, through the `exports` of the root package.json.
- So `.thunderjar/` always runs the current code, and the `dogfood:*` scripts run the CLI from source.
- Why no dependency: Changesets rewrites any dependency named `thunderjar` to the version it's about to release. That version isn't on npm yet, so `bun install` would fail on the release PR.

## Gauntlet test cases

`test-cases/gauntlet-*.ts` set agents the challenges in `src/gauntlet/`, in this repository with its everyday AGENTS.md and skills. Their code state, `thunderjar-gauntlet`, pins the commit that added the challenges, from before their tasks were added here, so the agent can't read the measurements.

Run one remotely, from the repository root, with the CLI from source:

```sh
THUNDERJAR_REMOTE=1 bun src/cli/index.ts run gauntlet-wrong-failing-test                  # 1 iteration
THUNDERJAR_REMOTE=1 bun src/cli/index.ts run gauntlet-wrong-failing-test --iterations 5   # 5 iterations
```

It needs `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, and what the remote config in `thunderjar.config.ts` needs: `FLYIO_TOKEN`, `THUNDERJAR_DB_URL`, a `docker login ghcr.io` that can push, and the `fly` CLI.

### Getting a fresh cloud container ready

`scripts/gauntlet/bootstrap.sh` installs `fly` and `ssh`, starts a local Docker daemon if none runs, runs `docker login ghcr.io` when `GHCR_USER` and `GHCR_TOKEN` are set, then prints which tools and variables are present or missing (names only). It exits non-zero if any are missing. Re-running it is safe.

```sh
scripts/gauntlet/bootstrap.sh
source scripts/gauntlet/env.sh    # maps THUNDERJAR_DB_CONNECTION, OPENROUTER_TOKEN, FLYIO_TOKEN, AAK to the names read here; sets THUNDERJAR_REMOTE=1
bun src/cli/index.ts run gauntlet-wrong-failing-test
# or, without sourcing:
scripts/gauntlet/bootstrap.sh run run gauntlet-wrong-failing-test
```

`env.sh` also sets, unless already set:

- `THUNDERJAR_RUN_DATA=sqlite`: run data goes to the local SQLite file, for sandboxes that can't reach Postgres. Set it to `postgres` to use Supabase.
- `THUNDERJAR_GAUNTLET_PAIRS=openrouter`, only when there's no `ANTHROPIC_API_KEY` (or `AAK`): just the Copilot and OpenCode pairs. With a key, all 12 pairs run.
- `THUNDERJAR_DOCKER` to `fly-client/docker`: prerun images build on the Fly machine.

Daemon log and tool-install logs go to `/tmp/gauntlet/`. Never run these with `set -x`.

## The Fly client

`fly-client/` manages the one Fly machine remote runs use: it creates it, starts it, and stops it when idle. Thunderjar knows nothing of it. It's the runtime's command in `thunderjar.config.ts`, so every `docker` command Thunderjar runs goes through it.

```sh
bun .thunderjar/fly-client/index.ts <up | docker <args…> | stop [--force] | destroy [--force] | status [--json] | prune>
```

- `docker <args…>`
  - Starts the machine first, with `up`, if it's missing or stopped.
  - Forwards the command to its daemon over one shared SSH connection, with stdin, output and exit code passed through.
  - Adds `--network host` to `build`, so build steps can resolve names.
  - Resets the timer when it exits, however it exits.
  - `fly-client/docker` is the same, as one executable, for `THUNDERJAR_DOCKER`.
- The timer
  - `.thunderjar/.fly`, git-ignored: when the last `docker` command finished, and the deadlines from it.
  - A detached `watch` process acts on it: it stops the machine after `FLY_SLEEP_MINUTES`, and destroys it and its volume after `FLY_DESTROY_MINUTES`.
  - Either only if idle: no running containers, and no `docker` command in flight.
- The watchdog on the machine
  - The backstop for when the client has gone, e.g. a closed laptop.
  - Stops the machine after `FLY_SLEEP_MINUTES` with no running containers and no SSH sessions. It never destroys it.
- `fly-client/machine/`
  - The recipe `up` creates the machine from, and its image: a Docker daemon and the watchdog.
  - `up` builds and pushes the image when a file in it changes, and moves the machine to it once idle.
- Tests
  - `bun run test:fly`, with fake `fly`, `docker` and `ssh`. `bun test` skips them, as this folder is hidden.
  - `bun run test:fly:real` runs `up`, `docker ps` and `stop` on a throwaway app on real Fly. Needs `FLYIO_TOKEN`.
