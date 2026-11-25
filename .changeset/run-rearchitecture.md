---
"thunderjar": minor
---

`run` is rebuilt, and takes over from `plan` and `build`.

- Removed the `plan` and `build` commands. Use `run <test case> --dry-run`, which now shows the plan, each container and each prerun image's Dockerfile, and `run <test case> --build-only`, which builds the prerun images and stops.
- Removed `run --local`. Where containers run is the config's `runtime`: without one, it's the local Docker daemon.
- Removed the `attach` command and the runner container. `runtime.runner` is still accepted, with a deprecation warning, and does nothing: `run` sends each Docker command to the runtime through `runtime.command`.
- `run --dry-run --json` now prints `{ manifest }`: the whole plan, its images and Dockerfiles included.
- `run` builds every prerun image before the first container starts, and redraws one frame of progress on a terminal. Off a terminal, it prints once, at the end.
