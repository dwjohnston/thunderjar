# 5. Move the `build` tests to scenarios

Needs tasks 2 and 3. See [../PLAN.md](../PLAN.md).

## What to do

- The fake-Docker tests in `src/commands/build/build.test.ts` become `build --dry-run` tests that assert on stdout.
- Real-Docker tests (`build.docker.test.ts`) use a throwaway `--image-prefix` and delete their images afterwards. They also check what only the copied files show: a prompt file read at its commit, and a bundle with nothing after its commit.
- The "not in a git repository" test uses scenario 4 with `GIT_CEILING_DIRECTORIES`. Remove the seed-repository tests.

## Done when

No `build` test uses `createFixtureProject` or the seed repository.
