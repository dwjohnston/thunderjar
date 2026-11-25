---
"thunderjar": minor
---

`run` is rebuilt, and takes over from `plan` and `build`.

- Removed the `plan` and `build` commands. Use `run <test case> --dry-run`, which now shows the plan, each container and each prerun image's Dockerfile, and `run <test case> --build-only`, which builds the prerun images and stops.
- Removed `run --local`. Where containers run is the config's `runtime`: without one, it's the local Docker daemon.
- Removed the `attach` command and the runner container. `runtime.runner` is still accepted, with a deprecation warning, and does nothing: `run` sends each Docker command to the runtime through `runtime.command`.
- `run --dry-run --json` now prints `{ manifest }`: the whole plan, its images and Dockerfiles included.
- `run` builds every prerun image before the first container starts, and redraws one frame of progress on a terminal. Off a terminal, it prints once, at the end.
- `run --build-only` needs only the build secrets set, as `build` did: the variables a harness needs are checked for a run and a dry run.
- Ctrl-C, or SIGTERM, stops `run` within about 15 seconds in any phase: no other image is built, the execution's containers are removed, postrun images still waiting are not pushed, the execution is recorded as failed and the runtime's `afterExecution` runs. A second signal stops the waiting at once.
- `run` checks the run data store before the runtime's `beforeExecution` and before anything is built.
- `run --json` writes the notes a frame would show, e.g. why runs crashed, to stderr.
