<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: 45581a86-346e-4ac5-a6e9-0b06f43efc84
Supervising engineer: David Johnston

Humans: add your notes here
-->

# Injected services

Every service is created once, in [index.ts](index.ts), and passed to the program. Commands get them as `Services` ([services.ts](services.ts)). Nothing else creates a real service: see [src/services/HUMANS.md](../services/HUMANS.md).

| Service | Created by | What it gives |
|---|---|---|
| `clock` | `createClockService()` | Time: `now`, `setTimeout`, `sleep` |
| `env` | `createEnvService()` | Environment variables |
| `io` | `createIoService()` | stdin, stdout, stderr and stop signals |
| `docker` | `createDockerService(clock)` | The `docker` CLI, on the local daemon |

Each service has a fake for tests in its folder under `src/services/`, e.g. `FakeClock`.

## Planned: HostDocker and RuntimeDocker

Today there is one `docker` service. It always talks to the local daemon, and code that needs the remote runtime builds its own runtime from the config. That split is easy to get wrong: many functions in `src/docker/docker.ts` fall back to local Docker when no runtime is passed.

The plan is two Docker services, named by role, not by place:

- **`hostDocker`**: the `docker` CLI on the machine Thunderjar runs on. It handles:
  - the registry login check, and the credentials the image store is asked with
  - `doctor`'s probe image, built and pushed here
  - local image cleanup, in `purge`
  - everything, with `--local`
- **`runtimeDocker`**: wherever containers run. It builds prerun images, pushes them from there, pulls, runs containers and removes them.

How they relate:

- **No runtime configured, or `--local`:** both are the same object, so code never checks for `null`.
- **Inside a runner:** the runtime is the runner's own socket, so both are the same daemon. "Host" and "runtime" still describe them correctly there, where "local" and "remote" wouldn't.
- **Every call site picks one.** No silent fallback to local Docker, so a choice like `remeasure` running on the host is visible in the code.

`runtimeDocker` can't be created when `index.ts` starts. The runtime comes from `thunderjar.config.ts`, which needs a project root, and `--local` can override it. So `index.ts` will pass a factory, e.g. `dockerFor(runtimeConfig | null)`, which a command calls once it has loaded the config. That keeps every service created in `index.ts`, and lets tests pass fakes for both.

Open question: the pull policy (`never` on the host, `missing` on a remote runtime) is part of the runtime today. It may belong on the call instead, since `remeasure` runs on the host with `missing`.
