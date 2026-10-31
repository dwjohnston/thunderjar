# Test Boundaries

How Thunderjar itself is tested, kept distinct from how Thunderjar tests prompts. Each layer is defined by where the mock/real boundary sits.

The distinction matters because the domain invites conflating the two. Thunderjar is not a testing framework: it measures runs and reports neutral observations. Pass/fail assertions belong only to Thunderjar's own test suite, described here.

1. **Pure units** — hashing, measuring instruments.
2. **CLI with recording adapters** — Docker is never spawned.
3. **Docker image tests** — real images, fake agent.
   1. Generating the pre-run image.
   2. Generating the post-run image.
   3. Extracting measurement results from a post-run image.
   4. Restoring from a post-run image.

The real-harness smoke test sits outside these layers as a non-blocking, non-deterministic check.

Testing purge is out of scope.

## Principles

- **Dependency-inject anything non-deterministic.** That includes Docker. Tests swap in a different implementation at the seam; they do not take a different code path.
- **One strategy covers both CLI modes.** Something that is testable is testable both ways. Interactive use and one-liner use (as in a CI pipeline) run the same code once the arguments are gathered, so the interactive mode does not get a separate testing strategy.
- **Only the expensive, non-deterministic step is faked.** No real AI agent runs in Thunderjar's own suite.

- **Tests leave the developer's machine as they found it.** Anything written to the host goes to a temporary directory that the test creates and removes. Every Docker image and container a test creates carries a per-run test tag or label and is removed afterwards; fixture images are the exception (see [Fixture images](#fixture-images)). Commands that act on the current repository, such as restore, are run from a throwaway repository in that temporary directory, never from the developer's own.

## 1. Pure units

Everything real, nothing external.

- Hashing: the same parameters give the same hash, any relevant change gives a different one, key ordering does not.
- Measuring instruments, run as functions over fixture directories.

## 2. CLI with recording adapters

The CLI is real and so are the configuration files: the test invokes the CLI against real config on disk, which is loaded and resolved exactly as in normal use.

Docker is cut off entirely. Instead of running Docker, the adapter prints the Docker commands that would have been run, and the test asserts on standard out.

This proves the wiring: given this experiment definition and these arguments, these commands are issued in this order. It does not prove that the commands work.

## 3. Docker image tests

A class of tests in which Docker is real and the images are real. The only fake is the agent. Each test takes a real starting state, performs one step, and asserts on the real image or data that results.

### Fixture images

Tests do not build the images they start from. They assume those images already exist.

- A **prepare step**, run before the tests (e.g. `bun run test:prepare`), makes sure every fixture image exists, by building it or pulling it from somewhere. It skips images that are already present.
- Each test that needs a fixture image first checks that it exists. If it does not, the test fails with a clear error that names the missing image and says to run the prepare step.
- Fixture images are left in place between test runs, under a name that marks them as Thunderjar test fixtures. Images that a test itself creates are still removed by that test.

The fixture images and where their definitions live are listed in [150-repository-layout.md](150-repository-layout.md#fixture-images).

3.2 starts from a fixture pre-run image; 3.3 and 3.4 start from a fixture post-run image. No test depends on the output of another test.

### 3.1 Generating the pre-run image

Given this configuration, generate a Docker image. The image is real. Assert on what it contains:

- The expected command line tools exist.
- The file structure is as expected.

### 3.2 Generating the post-run image

Given that a real pre-run image like this exists, run the fake agent. A new real image now exists. Assert that:

- It has this tag.
- These files exist.
- The git history is correct.
- The labels are correct.

The agent is faked through the normal harness mechanism. The harness config already holds the exact CLI command to run for an agent, so the fake harness is just another harness entry whose command is a script (e.g. `node fake-agent.js`). It is not a special test-only code path. Because the script makes a known set of file changes, the resulting image can be checked exactly.

### 3.3 Extracting measurement results from a post-run image

Given that a real post-run image like this exists, run the measuring instruments against it. Assert on the measurement results that come out.

### 3.4 Restoring from a post-run image

Restore adds a branch to the repository it is run from (see [090-restore-purge.md](090-restore-purge.md)). So the test creates a throwaway git repository in a temporary directory, on `main`, and runs restore with that as the working directory.

Given that a real post-run image like this exists, run restore. Assert that, in the throwaway repository:

- The branch `thunderjar/<container run>` exists.
- Its history is the agent's commits, and its files have the content the fake agent wrote.
- The current branch is still `main`, and the working tree is unchanged.

Further cases:

- **Uncommitted changes.** The fixture image has uncommitted changes in its working tree. The branch ends in a Thunderjar commit holding them.
- **Clean working tree.** No Thunderjar commit is added.
- **Branch already exists.** Restore errors with a clear message and the existing branch is unchanged.

The post-run image is the same kind of fixture 3.3 starts from: produced by the fake agent, so its contents are known exactly and the restored state can be compared against them.

## Real-harness smoke test

None of the layers exercises a real harness talking to a real model. A small smoke test does, outside the layers. It is non-blocking because it is non-deterministic and costs money.

## Open questions

- **Which seams are injected?** Docker is settled. Git, registry, filesystem, clock and ID/randomness have been suggested, each with a real and a recording implementation.
- **Stabilising stdout assertions.** Whether to normalise timestamps and temp paths before comparing, and how tightly to assert on flag ordering.
- **Interactive rendering.** If the view-model is kept separate from rendering, what checks the thin rendering layer that is left?
- **Is a single end-to-end run still wanted?** The three image tests each cover one step from a given starting state. An earlier idea was one run from a starting image all the way to the metadata report. Chaining 3.1 to 3.3 may make that redundant.
- **Build or pull fixture images?** The prepare step can build them locally from checked-in Dockerfiles, or pull prebuilt ones from a registry. Building needs no registry; pulling is faster in CI.
- **Stale fixture images.** If a fixture's definition changes, an old image with the same name still passes the existence check. Suggested: put a hash of the fixture's definition in its tag, so a changed fixture is a missing image.
- **Shared history for restore.** The 3.4 fixture image holds a repository with fixed history, and the test's throwaway repository should share it. Suggested: one seed script, with fixed author and dates, creates the same initial commit in both.
- **Fake harness failure modes.** Should it be parameterised to crash, time out, never commit, or emit a malformed result? Should a contract check confirm its output shape matches the real harnesses?
- **How to inspect an image.** `docker run --rm <image> git log ...` versus exporting the filesystem. Either way, is there a helper that turns an image reference into a plain object for assertions?
- **How far image assertions go.** Candidates beyond those listed: tag equals the parameter hash, absent files are absent (no host leakage, no credentials), base layers match the declared base image digest, metadata report matches the image.
- **Instruments in layer 1 versus 3.3.** A unit-test instrument needs the runtime environment, not just files, so it cannot be tested as a pure function over a fixture directory. 3.3 may be where such instruments are tested, leaving layer 1 for file-only instruments.
- **Registry push/pull.** Not a current concern. If it is tested, a throwaway local registry container is preferred over a mock.
- **What blocks CI.** Only the smoke test is stated as non-blocking. Whether the Docker image tests (layer 3) run on every change or are tagged out of the fast loop is undecided.
- **Smoke test trigger.** Manual or scheduled; no cadence or harness chosen.
- **Not yet covered by any layer.** Backfill, trace extraction, hash-mismatch warnings, the run data store, per-environment config, and the `erroredWhileMeasuring` path.
