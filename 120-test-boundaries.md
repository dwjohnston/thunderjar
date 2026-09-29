# Test Boundaries

How Thunderjar itself is tested, kept distinct from how Thunderjar tests prompts. Each layer is defined by where the mock/real boundary sits.

1. **Pure units** — hashing, measuring instruments.
2. **CLI with recording adapters** — Docker is never spawned.
3. **Real Docker with a fake harness** — pipeline end to end.
4. **Artifact assertions** — image tag, git history, files, labels (the image as the unit under test).
5. **Lifecycle** — restore/purge from an existing image.

The real-harness smoke test sits outside these layers as a non-blocking, non-deterministic check.

## Open questions

_TBD_
