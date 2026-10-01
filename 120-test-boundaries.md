# Test Boundaries

How Thunderjar itself is tested, kept distinct from how Thunderjar tests prompts. Each layer is defined by where the mock/real boundary sits.

The distinction matters because the domain invites conflating the two. Thunderjar is not a testing framework: it measures runs and reports neutral observations. Pass/fail assertions belong only to Thunderjar's own test suite, described here.

1. **Pure units** — hashing, measuring instruments.
2. **CLI with recording adapters** — Docker is never spawned.
3. **Real Docker with a fake harness** — pipeline end to end.
4. **Artifact assertions** — image tag, git history, files, labels (the image as the unit under test).
5. **Lifecycle** — restore/purge from an existing image.

The real-harness smoke test sits outside these layers as a non-blocking, non-deterministic check.

## Principles

- **Dependency-inject anything non-deterministic.** That includes Docker. Tests swap in a different implementation at the seam; they do not take a different code path.
- **One strategy covers both CLI modes.** Something that is testable is testable both ways. Interactive use and one-liner use (as in a CI pipeline) go through the same command layer, so the interactive mode does not get a separate testing strategy.
- **Only the expensive, non-deterministic step is faked.** No real AI agent runs in Thunderjar's own suite.

## 1. Pure units

Everything real, nothing external.

- Hashing: the same parameters give the same hash, any relevant change gives a different one, key ordering does not.
- Measuring instruments, run as functions over fixture directories.

## 2. CLI with recording adapters

Docker is cut off entirely. Instead of running Docker, the adapter prints the Docker commands that would have been run, and the test asserts on standard out.

This proves the wiring: given this experiment definition and these arguments, these commands are issued in this order. It does not prove that the commands work.

## 3. Real Docker with a fake harness

Docker is real; the agent is not. The harness config already holds the exact CLI command to run for an agent, so the fake harness is just another harness entry whose command is a script (e.g. `node fake-agent.js`). It is not a special test-only code path.

Starting from a known Docker image, the fake harness makes a known set of file changes. The test runs the pipeline all the way up to creating the metadata report.

## 4. Artifact assertions

Given an experiment like this, it creates a Docker image; now assert on that image. The file changes made by the fake harness are deterministic, so the resulting image can be checked exactly:

- The expected images were created, with the right tags.
- Correct git history.
- Correct files.
- Correct labels.

This is a separate layer from 3. When layer 3 fails, the pipeline broke; when layer 4 fails, the artifact contract broke.

## 5. Lifecycle

Given that a Docker image already exists:

- **Restore** — expect these branches to exist, these files to exist.
- **Purge** — given completed runs, their summary and their images, expect the right things to be removed.

## Real-harness smoke test

None of the layers exercises a real harness talking to a real model. A small smoke test does, outside the layers. It is non-blocking because it is non-deterministic and costs money.

## Open questions

- **Which seams are injected?** Docker is settled. Git, registry, filesystem, clock and ID/randomness have been suggested, each with a real and a recording implementation.
- **Stabilising stdout assertions.** Whether to normalise timestamps and temp paths before comparing, and how tightly to assert on flag ordering.
- **Interactive rendering.** If the view-model is kept separate from rendering, what checks the thin rendering layer that is left?
- **Fake harness failure modes.** Should it be parameterised to crash, time out, never commit, or emit a malformed result? Should a contract check confirm its output shape matches the real harnesses?
- **How to inspect an image.** `docker run --rm <image> git log ...` versus exporting the filesystem. Either way, is there a helper that turns an image reference into a plain object for assertions?
- **How far artifact assertions go.** Candidates beyond the four listed: tag equals the parameter hash, absent files are absent (no host leakage, no credentials), base layers match the declared base image digest, metadata report matches the image.
- **Fixture image source for lifecycle tests.** A checked-in fixture image, or the output of a layer 3 run?
- **Purge expectations.** Removal per retention policy, nothing still referenced removed, safe to run twice — none of this is specified yet.
- **Registry push/pull.** Not a current concern. If it is tested, a throwaway local registry container is preferred over a mock.
- **Runtime-dependent instruments.** A unit-test instrument needs the runtime environment, not just files, which conflicts with treating instruments as pure functions over fixture directories in layer 1.
- **What blocks CI.** Only the smoke test is stated as non-blocking. Whether the Docker-backed layers (3–5) run on every change or are tagged out of the fast loop is undecided.
- **Smoke test trigger.** Manual or scheduled; no cadence or harness chosen.
- **Not yet covered by any layer.** Backfill, trace extraction, hash-mismatch warnings, the run data store, per-environment config, and the `erroredWhileMeasuring` path.
