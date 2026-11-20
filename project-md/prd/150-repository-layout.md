# Repository Layout

The folder structure of the Thunderjar project itself: its source, its tests, and the fixtures those tests need.

This is distinct from [051-configuration-folder-structure.md](051-configuration-folder-structure.md), which describes the `thunderjar/` folder inside a *user's* project.

No source code exists yet, so everything below is a proposal.

Thunderjar is a single package, serving as both CLI and library. See
[141-runnable-artifact.md](141-runnable-artifact.md).

## Layout

```
thunderjar/
├── spec/                              # this specification
├── docs/                              # design conversation and its index
├── src/
│   ├── cli/                           # entry point: argument parsing, interactive mode
│   ├── commands/                      # one file per command: run, restore, …
│   ├── adapters/                      # the injected seams, each with a real and a recording implementation
│   │   └── docker/
│   └── …                              # hashing, config loading, measuring — not yet broken down
├── test/
│   ├── fixtures/
│   │   ├── images/                    # fixture Docker images — see below
│   │   ├── projects/                  # example user projects, each with a real thunderjar/ config folder
│   │   └── harnesses/
│   │       └── fake-agent.js          # the fake harness's script
│   ├── helpers/                       # requireFixtureImage, makeThrowawayRepo, …
│   ├── cli/                           # layer 2: CLI with recording adapters
│   └── docker/                        # layer 3: Docker image tests
└── scripts/
    └── prepare-tests.ts               # makes sure every fixture image exists
```

- **Pure unit tests sit next to the code they test** (`src/hashing.ts`, `src/hashing.test.ts`). They need no fixtures and no Docker.
- **Tests that cross a boundary live under `test/`**, grouped by layer from [120-test-boundaries.md](120-test-boundaries.md). This keeps the slow, Docker-dependent tests in one folder that can be run or skipped as a unit.
- **`test/fixtures/projects/`** holds the real configuration files that layer 2 runs the CLI against. Each one follows the user-side structure in [051](051-configuration-folder-structure.md).

## Fixture images

The Docker image tests start from images that already exist (see [Fixture images](120-test-boundaries.md#fixture-images) in the test boundaries page). Their definitions are checked in, one folder per image:

```
test/fixtures/images/
├── seed-repo.sh                       # creates the fixed initial commit; shared by the images and the tests
├── prerun-basic/
│   └── Dockerfile
├── postrun-committed/
│   └── Dockerfile
└── postrun-uncommitted/
    └── Dockerfile
```

| Fixture image | What it holds | Used by |
|---|---|---|
| `prerun-basic` | A pre-run image: base image, seeded repository, fake harness installed. | 3.2 generating the post-run image |
| `postrun-committed` | A post-run image whose agent committed everything. Clean working tree. | 3.3 extracting measurement results; 3.4 restore, clean case |
| `postrun-uncommitted` | A post-run image whose agent left uncommitted changes. | 3.4 restore, Thunderjar commit case |

`scripts/prepare-tests.ts` walks `test/fixtures/images/` and builds any image that is not already present. The folder name is the fixture's name, so adding a fixture image is adding a folder.

Fixture images share one image repository, `thunderjar-test-fixtures`, with the fixture name as the tag (e.g. `thunderjar-test-fixtures:postrun-uncommitted`). This keeps them recognisable and easy to remove in one go.

## The seed repository

`seed-repo.sh` creates a small git repository with fixed authors and dates, so its commit hashes are the same every time. It is used in two places:

- the fixture Dockerfiles, to put the repository inside the image;
- the `makeThrowawayRepo` test helper, to create the repository that restore is run from.

Because both come from the same script, a branch restored from a fixture image shares history with the throwaway repository.

## Open questions

- **Breakdown of `src/`.** Only the parts the test boundaries depend on are named. The rest waits for the implementation.
- **Enforcing the layout.** [140-tooling.md](140-tooling.md) mentions linting for file structure enforcement. Which rules apply here is not decided. _(Referenced by: [140-tooling.md](140-tooling.md#enforcing-folder-structure), which describes the script that enforces whatever is decided.)_
- **Fixture image tags.** Whether the tag also carries a hash of the fixture's folder, so that a changed fixture is detected as missing (see the stale-images question in [120](120-test-boundaries.md#open-questions)).
- **Post-run fixtures: hand-written or generated?** A hand-written Dockerfile can drift from what the real pipeline produces. The alternative is for the prepare step to produce post-run fixtures by running the real pipeline with the fake harness on `prerun-basic`.
- **Should `prerun-basic` be a Dockerfile at all?** Thunderjar generates prerun images from configuration, so the prepare step could generate this one from a fixture project. That makes the prepare step depend on the code under test.
- **More fixture images.** Likely candidates: a post-run image with a malformed harness result, and one with untracked or gitignored files.
