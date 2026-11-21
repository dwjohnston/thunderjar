---
harness: claude-code
model: opus
effort: high
ralph:
  session: "42c1f927-a80f-44c9-bfdd-36a207b68feb"
  capture: "thunderjar/capture/42c1f927-a80f-44c9-bfdd-36a207b68feb"
  branchedFrom: "claude/charming-cray-wxgcfy"
  date: "2026-11-21T00:55:12.553Z"
  costUsd: 6.1194760000000015
  durationMs: 1302678
  isError: false
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLidCEegntrXyRbJufD
Supervising engineer: David Johnston

From an ideation session, reviewed on PR #247.

Humans: add your notes here
-->

# 3850: Fly machine lifecycle

A client for the Fly machine that remote runs use: it creates the machine, starts it, and stops it when idle.

Today `.thunderjar/fly-machine.sh` does start, stop and resize, run by hand, and `.thunderjar/fly-docker.sh` fails if the machine isn't started.

## Version bump type

None. It's this repository's own tooling in `.thunderjar/`, not part of the package.

## Scope

- One Fly machine only.
- One client only.
- Lives in `.thunderjar/fly-client/`.
- TypeScript on Bun.
- Replaces `fly-machine.sh` and `fly-docker.sh`.
- Thunderjar is unchanged. Every interaction it has with the machine is already a `docker` command through the runtime's command, so that command is the hook.
  - e.g. in `thunderjar.config.ts`
    ```ts
    runtime: { command: ["bun", "./.thunderjar/fly-client/index.ts", "docker"] }
    ```

## CLI

- e.g.
  ```sh
  bun .thunderjar/fly-client/index.ts <command>
  ```

1. `up`
   - Creates the machine if it's missing, starts it if stopped, and resizes it if idle and the size differs.
   - Waits for its Docker daemon.
2. `docker <args…>`
   - What `fly-docker.sh` does today: forwards the command to the machine's Docker daemon over the shared SSH connection.
   - Runs `up` first, if the machine isn't started.
   - Resets the timer when the command exits, however it exits.
   - What runs on the client machine, for each call:
     1. `fly machine list -a $FLY_APP --json`
        - Finds the machine and its state.
     2. Only if it's missing or stopped: `up`.
     3. Only if the certificate is over 20 hours old: `fly ssh issue`.
     4. Only if the shared connection isn't open: `ssh -fN tjfly`.
        - Stays open in the background, through `fly ssh console … nc <machine IP> 22`.
     5. The local Docker CLI, pointed at the machine's daemon: `docker -H ssh://tjfly <args…>`.
        - Its stdin, stdout, stderr and exit code are passed through.
     6. Writes `.thunderjar/.fly`, and starts `watch` if it isn't running.
   - e.g. `ps`
     ```sh
     bun .thunderjar/fly-client/index.ts docker ps
     ```
     ```sh
     docker -H ssh://tjfly ps
     ```
   - e.g. `build`, as Thunderjar builds a prerun image
     ```sh
     bun .thunderjar/fly-client/index.ts docker build -t tj-prerun-h1a2b3c /tmp/tj-build-x7k2
     ```
     ```sh
     docker -H ssh://tjfly build --network host -t tj-prerun-h1a2b3c /tmp/tj-build-x7k2
     ```
     - `--network host` is added, as `fly-docker.sh` does today, so build steps can resolve names.
     - The context folder is on the client. The Docker CLI tars it and streams it to the machine.
   - e.g. `exec`, as Thunderjar measures a container
     ```sh
     bun .thunderjar/fly-client/index.ts docker exec -i tj-run-4f2a git -C /workspace log --oneline
     ```
     ```sh
     docker -H ssh://tjfly exec -i tj-run-4f2a git -C /workspace log --oneline
     ```
     - The client's stdin goes to the container, so `-i` works.
3. `stop`
   - Stops the machine, if idle. `--force` stops it anyway.
4. `destroy`
   - Destroys the machine and its volumes, if idle. `--force` destroys it anyway.
5. `status`
   - Machine state and size, and the timer: last `docker` command, stop and destroy deadlines.
   - Takes `--json`.
6. `prune`
   - Removes stopped containers and unused images, as `fly-machine.sh prune` does.
7. `watch`
   - The detached process that acts on the timer. `docker` starts it. Not run by hand.

## Environment variables

- `FLYIO_TOKEN`
- `FLY_APP`
- `FLYIO_INSTANCE_SIZE`
- `FLY_SLEEP_MINUTES`
- `FLY_DESTROY_MINUTES`

## Behaviour

1. **Size**
   - Set by an environment variable, as `FLYIO_INSTANCE_SIZE` does today.
   - Resize only when the machine is idle. Resizing restarts it, and would kill running tasks.
2. **On each `docker` command**
   1. If the machine doesn't exist, create it.
   2. If it's stopped, start it.
   3. Forward the command.
   4. Reset the timer when it exits.
3. **Client timer**
   - A git-ignored file, `.thunderjar/.fly`, records when the last `docker` command finished.
     - JSON.
       - The machine it's for.
       - When the last `docker` command finished.
       - The deadlines worked out from it.
       - The PID of the detached process, so a new command replaces it rather than starting a second one.
     - e.g.
       ```json
       {
         "app": "thunderjar-runtime-dwj",
         "machineId": "e784079b449483",
         "lastCommandFinishedAt": "2026-11-21T00:40:00Z",
         "stopAt": "2026-11-21T01:10:00Z",
         "destroyAt": "2026-11-28T00:40:00Z",
         "watcherPid": 48213
       }
       ```
     - Missing file: no timer is running. Nothing is stopped or destroyed.
     - Add it to `.gitignore`.
   - A long `docker run` holding an agent's container counts as one command, so the timer resets when it ends.
   - A container left running detached, e.g. the runner with `THUNDERJAR_ON_RUNTIME=1`, is covered by the idle check below.
   - A detached process on the host acts on it:
     - After `FLY_SLEEP_MINUTES`: stop the machine.
     - After `FLY_DESTROY_MINUTES`: destroy the machine and its volumes.
   - Before either, check the machine is idle, e.g. no running containers.
4. **Watchdog on the machine**
   - The backstop for when the host goes away, e.g. a closed laptop or a finished CI job.
   - Stops the machine after `FLY_SLEEP_MINUTES` idle.
     - Idle: no SSH sessions and no running containers.
     - Stops by exiting its main process.
   - Destroy is skipped in this case. A stopped machine only costs storage, so that's acceptable. A started one is the real cost.

## Creating the machine

The current machine was set up by hand.

- Take its config from Fly (`fly machine status --display-config`): image, size, volume, region, services.
- Check it in to `.thunderjar/fly-client/` as the recipe `up` creates from.
- SSH needs nothing extra: `fly ssh issue` already gives certificates for the org.
- The watchdog goes in the machine's image, so the recipe changes the image. `up` builds and pushes it when it changes.

## Update the callers

Replace `fly-machine.sh` and `fly-docker.sh` everywhere, then delete them and `fly-lib.sh`.

- `.thunderjar/thunderjar.config.ts`: the runtime command.
- `.github/workflows/slow-tests.yml`
- `scripts/gauntlet/`
- `package.json` scripts
- `.env.template`: add `FLY_SLEEP_MINUTES` and `FLY_DESTROY_MINUTES`.
- `.thunderjar/AGENTS.md`, `CONTRIBUTORS.md`

## Tests

- Unit tests with fake `fly` and `docker` commands:
  - `docker` forwards its arguments, stdin, output and exit code, and adds `--network host` to `build`.
  - `docker` runs `up` only when the machine is missing or stopped.
  - The timer file is written when a command exits, including when it fails or is interrupted.
  - `watch` stops and destroys at the deadlines, and skips both while containers are running.
  - Resizing is skipped while the machine is busy.
- One test against real Fly, skipped without `FLYIO_TOKEN`: `up`, `docker ps`, `stop`, on a throwaway app.

## Human interventions

- The real-Fly test needs `FLYIO_TOKEN`, and creates and destroys a machine. A human runs it once before merging.

## Prior art

Nothing does this on Fly. Worth reading:

- [DockBridge](https://github.com/Max-Levitskiy/DockBridge)
  - The same idea on Hetzner: creates the server on first Docker command, destroys it when idle.
  - Keeps `/var/lib/docker` on a separate volume, so the image cache survives destroy.
  - Client keep-alive and laptop lock detection.
- [Fly: exit when idle](https://fly.io/docs/launch/autostop-autostart)
  - Fly's built-in auto-stop only sees traffic through its proxy, not Docker over SSH.
- [Fly: no SSH connections means idle](https://fly.io/laravel-bytes/deus-ex-machina.md)
- [docker-watchdog](https://pypi.org/project/docker-watchdog)
  - Shuts down an idle Docker host. A possible watchdog.
