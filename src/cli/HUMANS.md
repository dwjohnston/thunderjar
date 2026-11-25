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

Every service is created once, in [index.ts](index.ts).

| Service | Created by | What it gives |
|---|---|---|
| `clock` | `createClockService()` | Time: `now`, `setTimeout`, `sleep` |
| `env` | `createEnvService()` | Environment variables |
| `io` | `createIoService()` | stdin, stdout, stderr and stop signals |
| `docker` | `createDockerService(clock)` | The `docker` CLI, on the local daemon |

## Planned: HostDocker and RuntimeDocker

Container runs will typically need to run on a 'runtime' - this might be a remote server, but it could be the host machine that that the thunderjar CLI runs on. 

The reason a remote runtime is needed is for performance - a developer's laptop likely can't handle running dozens of containers at the same time. 

However, there are some things that do want to be done locally: 

eg. 
- Checking images exist on a cloud registry, deleting them


The plan is to expose two services:

- **`hostDocker`**: the `docker` CLI on the machine Thunderjar runs on. It handles:
  - the registry login check, and the credentials the image store is asked with
  - `doctor`'s probe image, built and pushed here
  - local image cleanup, in `purge`
  - everything, with `--local`
- **`runtimeDocker`**: wherever containers run. It builds prerun images, pushes them from there, pulls, runs containers and removes them.

