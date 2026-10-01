# Thunderjar Spec

Working specification for Thunderjar, split into focused pages so each concern
can be read, written, and reviewed independently. See `030-terminology.md` for the
project glossary before diving into the rest.

## Pages

1. [Motivation](010-motivation.md) — The problem being solved.
2. [Goals / Non-Goals](020-goals-non-goals.md) — What's in scope vs. explicitly not.
2.1. [Human Zone-Out](021-human-zone-out.md) — Places the user has flagged that they stopped paying close attention. Content listed there was never really reviewed and shouldn't be treated as settled.
2.2. [Coding Conventions](022-coding-conventions.md) — Conventions for the TypeScript a Thunderjar user writes, and so for every code example in the spec. `declareX()` wrappers, not bare exports.
3. [Terminology](030-terminology.md) — Glossary of project-specific terms, used consistently across all other spec pages.
4. [User Experience](040-user-experience.md) — Local workflows and CI workflows.
5. [Setup and Configure](050-setup-and-configure.md) — Getting the application running, plus a high-level configuration overview that references out to the detailed config pages below.
5.1. [Configuration Folder Structure](051-configuration-folder-structure.md) — Where Thunderjar configuration lives in a user's project: parameter folders, tasks with their measurements, experiments, and generated types.
5.5. [Declaring Experiments](055-declaring-experiments.md) — The `declareExperiment` file: the parameter matrix, typed names, and the harness × model compatibility check.
6. [Experiment Parameters](060-experiment-parameters.md) — Parameter hashing and identity (ensuring comparability), what every declaration has in common, an example declaration of each parameter, and measuring instruments.
6.1. [Base Image](061-base-image.md) — The image a prerun image is built `FROM`.
6.2. [Code State](062-code-state.md) — The codebase applied on top of the base image.
6.3. [Prompt Set](063-prompt-set.md) — Overlaying prompt files from a pinned commit.
6.4. [Harness](064-harness.md) — The agent tool: installing it, the `cli` contract, token costs, and the `models` map.
6.5. [Model](065-model.md) — The root LLM, and why its ID belongs to the harness.
6.6. [Task](066-task.md) — The initial prompt, and the task measurements that live beside it.
7. [Data Architecture](070-data-architecture.md) — The run data store and image store.
8. [Docker Execution](080-docker-execution.md) — The Docker run mechanics and resulting artifacts.
8.1. [Docker Tagging](081-docker-tagging.md) — The prerun/postrun image tag formats, and why.
8.5. [Experiment Results](085-experiment-results.md) — What gets recorded to the run data store after a container run.
8.7. [Collecting Token Costs](087-collecting-token-costs.md) — How a container run's token usage and cost are obtained from the harness, normalised across harnesses, and recorded.
9. [Restore / Purge](090-restore-purge.md) — Lifecycle management: restoring archived containers, purging old ones.
10. [CLI Reference](100-cli-reference.md) — The actual CLI commands.
11. [CLI Report Visualization](110-cli-report-visualization.md) — Detailed page on the interactive CLI's report visualization.
12. [Test Boundaries](120-test-boundaries.md) — How Thunderjar itself is tested, kept distinct from how Thunderjar tests prompts. Each layer is defined by where the mock/real boundary sits.
13. [Open Questions](130-open-questions.md) — Risks, deferred work, unresolved design questions (e.g. floating experiments, container-run naming risk).
14. [Tooling](140-tooling.md) — Bun, TypeScript, linting for file structure enforcement.
