# 14. Delete unused test helpers

Needs tasks 5 to 13.

## What to do

- Move `linkThunderjar` out of `src/testing/fixture-project.ts`, then delete `fixture-project.ts`.
- Delete `src/testing/seed-repo.ts` if nothing uses it.
- Delete the recording fake Docker (`src/testing/fake-docker.ts`) if nothing uses it.

## Done when

`bun test`, `bun run typecheck` and `bun run lint` pass with the files gone.
