---
"thunderjar": minor
---

Run containers on a remote runtime, and check the setup with `thunderjar doctor`.

- `runtime: { command: [...] }` in `thunderjar.config.ts` names any command that takes the `docker` CLI's arguments, e.g. `["docker", "--context", "cloud"]` or `["docker", "-H", "ssh://me@build-host"]`. `run` sends every container command there: run, exec, copy, commit, push of postrun images, and removal.
- Prerun images are still built and pushed locally. The runtime pulls them from the image store before any agent runs, and runs them with `--pull missing`. So a `runtime` needs an `imageStore`, and the runtime needs its own login for the registry.
- `run --local` ignores the runtime and runs on the local Docker daemon.
- New `thunderjar doctor` checks the config and the image store login, and, with a runtime, builds and pushes a tiny probe image, then pulls it through the runtime.
