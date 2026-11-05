---
"thunderjar": patch
---

Add `build: { secrets: [{ id, env }], ssh }` to `declareConfig`, for credentials a prerun build needs, such as a token to clone a private repository. Each build gets `docker build --secret id=<id>,env=<env>`, and `--ssh default`, for fragments to mount with `RUN --mount=type=secret,id=<id>` or `RUN --mount=type=ssh`. Secrets are never in an image layer, the run data or a hash. `plan`, `build` and `run` stop if a secret's variable is unset.
