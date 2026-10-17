# 2. Add `--image-prefix <name>`

See [../PLAN.md](../PLAN.md), "Product changes".

## What to do

- Add `--image-prefix <name>` to `build`, `run` and `plan`, parsed in `src/cli/index.ts`.
- It sets the existing `repository` option (`BuildOptions.repository` in `src/commands/build/build.ts`, `RunOptions.repository` in `src/commands/run/run.ts`), which defaults to `thunderjar`.
- Update each command's usage message and the CLI reference docs.

## Done when

Each command tags or looks up images under the given prefix, with tests showing it.
