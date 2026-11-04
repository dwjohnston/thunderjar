---
"thunderjar": minor
---

Push images to the image store, or keep them local with `imageStore: null`.

- `imageStore` in `thunderjar.config.ts` can be `null`: images stay in the local Docker daemon, and nothing is pushed. `init` now scaffolds `null`.
- With an `imageStore` set, `run` and `build` check your `docker login` for its registry before building anything, then push each prerun and postrun image to it.

**Breaking:** a project scaffolded by an earlier `init` names the placeholder `ghcr.io/your-org/thunderjar-images`, so `run` and `build` now stop at the login check. Set `imageStore: null`, or name your own repository and `docker login` to its registry.
