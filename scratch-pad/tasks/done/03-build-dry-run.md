# 3. Add `build <tc> --dry-run`

See [../PLAN.md](../PLAN.md), "Product changes".

## What to do

- Print the Dockerfile for every permutation's prerun image.
- Build nothing, write nothing, and don't contact Docker: no reachability or image checks.
- Reuse the Dockerfile `build` already writes into each build context (`src/commands/build/build.ts`).
- Update the usage message and the CLI reference docs.

## Done when

`thunderjar build two-pairs --dry-run` in scenario 2 prints both Dockerfiles, with Docker unavailable.
