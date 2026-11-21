---
harness: claude-code
model: opus
effort: high
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLidCEegntrXyRbJufD
Supervising engineer: David Johnston

From an ideation session. Not specced yet.

Humans: add your notes here
-->

# Fly machine lifecycle

Thunderjar manages the Fly machine itself: it creates it, starts it, and stops it when idle.

Today `.thunderjar/fly-machine.sh` does start, stop and resize, run by hand.

## Scope

- One Fly machine only.
- One client only.
- Lives in `.thunderjar/fly-client/`.

## Behaviour

1. **Size**
   - Set by an environment variable, as `FLYIO_INSTANCE_SIZE` does today.
   - Resize only when the machine is idle. Resizing restarts it, and would kill running tasks.
2. **On each command that runs tasks**
   1. If the machine doesn't exist, create it.
   2. If it's stopped, start it.
   3. Run the tasks.
3. **Client timer**
   - A git-ignored file, `.thunderjar/.fly`, records when the last task finished.
   - New tasks reset it.
   - An interrupted run, e.g. Ctrl-C while following, still writes it.
   - A detached process on the host acts on it:
     - After `SLEEP_MINUTES`: stop the machine.
     - After `DESTROY_MINUTES`: destroy the machine and its volumes.
   - Before either, check the machine is idle, e.g. no running containers.
4. **Watchdog on the machine**
   - The backstop for when the host goes away, e.g. a closed laptop or a finished CI job.
   - Stops the machine after `SLEEP_MINUTES` idle.
     - Idle: no SSH sessions and no running containers.
     - Stops by exiting its main process.
   - Destroy is skipped in this case. A stopped machine only costs storage, so that's acceptable. A started one is the real cost.

## Open questions

1. **The create recipe**
   - Image with the Docker daemon, volume, SSH keys, region. Set up by hand today.

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
