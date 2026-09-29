# Thunderjar Spec

Working specification for Thunderjar, split into focused pages so each concern
can be read, written, and reviewed independently. See `030-terminology.md` for the
project glossary before diving into the rest.

## Pages

1. [Motivation](010-motivation.md) — The problem being solved.
2. [Goals / Non-Goals](020-goals-non-goals.md) — What's in scope vs. explicitly not.
3. [Terminology](030-terminology.md) — Glossary of project-specific terms, used consistently across all other spec pages.
4. [User Experience](040-user-experience.md) — Local workflows and CI workflows.
5. [Setup and Configure](050-setup-and-configure.md) — Getting the application running, plus a high-level configuration overview that references out to the detailed config pages below.
6. [Experiment Parameters](060-experiment-parameters.md) — Parameter hashing and identity (ensuring comparability), plus the bulk of the detailed configuration reference: harnesses, prompt sets, tasks, measuring instruments.
7. [Data Architecture](070-data-architecture.md) — The three-tier metadata + trace + artifact store design.
8. [Docker Execution](080-docker-execution.md) — The Docker run mechanics and resulting artifacts.
8.1. [Docker Tagging](081-docker-tagging.md) — The prerun/postrun image tag formats, and why.
8.5. [Experiment Results](085-experiment-results.md) — What gets recorded to the run data store after a container run, and why the trace store isn't populated yet.
9. [Restore / Purge](090-restore-purge.md) — Lifecycle management: restoring archived containers, purging old ones.
10. [CLI Reference](100-cli-reference.md) — The actual CLI commands.
11. [CLI Report Visualization](110-cli-report-visualization.md) — Detailed page on the interactive CLI's report visualization.
12. [Test Boundaries](120-test-boundaries.md) — How Thunderjar itself is tested, kept distinct from how Thunderjar tests prompts. Each layer is defined by where the mock/real boundary sits.
13. [Open Questions](130-open-questions.md) — Risks, deferred work, unresolved design questions (e.g. floating experiments, container-run naming risk).
14. [Tooling](140-tooling.md) — Bun, TypeScript, linting for file structure enforcement.
