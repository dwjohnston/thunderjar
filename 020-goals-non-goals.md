# Goals / Non-Goals

What's in scope vs. explicitly not.

## Non-goals (v1)

- **Retention/purge policy for preserved images and metadata.** No TTLs, no
  differentiated retention by pass/fail, no pruning. Assume everything is kept
  indefinitely for now; revisit once storage cost or volume actually becomes a
  problem. (Touches [080-docker-execution.md](080-docker-execution.md) and
  [090-restore-purge.md](090-restore-purge.md).)
- **Extracting session logs/telemetry out of the container into a separate trace
  store.** The OTel trace and session transcript aren't pulled out into their own
  storage for v1 — if you want them, pull the postrun image and read them from its
  filesystem instead. Most likely the first fast-follow after v1, not a long-term
  non-goal. (See [085-experiment-results.md](085-experiment-results.md) and
  [070-data-architecture.md](070-data-architecture.md).)

- **Instrument-owned aggregation.** Measuring instruments declaring a default way their
  values combine across iterations, so a measurement file needn't state one. In v1 each
  measurement chooses its own (see
  [085-experiment-results.md](085-experiment-results.md#how-a-measures-values-combine)).
  Most likely to return as a default that a measurement's own choice overrides.

## To revisit

Unresolved, but things we *are* intending to address in v1 — unlike the non-goals above.

- **Thunderjar's own injected setup in the Docker image.** Beyond the six experiment
  parameters, Thunderjar itself may need to bake things into the image that aren't any
  experimenter's concern — e.g. OTel collector config or other instrumentation needed
  for telemetry. Where this fits in the image-build sequence is unresolved. (See
  [080-docker-execution.md](080-docker-execution.md#open-questions).) Related to the
  harness image question below — both are "frozen tooling layered into the prerun
  image", and may want one mechanism rather than two.
- **Where harness images come from.** A harness declaration's `applyParameter` can layer
  the agent tool in from a pre-built, version-pinned image (`COPY --from=…`) rather than
  installing it at build time. That is more reproducible — a pinned `npm install` still
  floats its transitive dependencies — and it decouples the harness from the base image,
  since a self-contained harness image carries its own runtime, so the two parameters
  stay genuinely orthogonal. Unresolved: who builds and publishes those images, where
  they are hosted, and what someone does when they want a harness Thunderjar doesn't
  publish. A workable v1 answer is that `applyParameter` returns whatever Dockerfile
  fragment the author wants — `RUN npm install …` or `COPY --from=…` — and Thunderjar
  publishes nothing, which keeps the registry question a fast-follow rather than a
  blocker. (See [060-experiment-parameters.md](060-experiment-parameters.md).)
- **Prompt cache isolation between container runs.** Parallel container runs sharing a
  prompt prefix can hit each other's prompt cache, so the second run's cost isn't an
  independent measurement. Container isolation does *not* help — the cache lives
  server-side, not in the container. The requirement is awkward: no cache at the start of
  a container run, but normal caching *within* it.

  No clean mechanism exists. There is no cache-key, cache-namespace or cache-partition
  parameter in the Claude API; caching isolates per workspace (per organization on
  Bedrock and Vertex) and nothing finer. An earlier draft of this spec asserted a
  `prompt-cache-key` header — it does not exist, and any decision resting on it is void.

  The options, none settled:
  - **Detect rather than prevent.** Cache-read tokens are already collected per
    [087-collecting-token-costs.md](087-collecting-token-costs.md), so a run that should
    have started cold but reports cache reads flags itself as contaminated, and cost
    comparisons exclude it. Costs nothing to implement.
  - **Vary the prompt prefix per run**, e.g. a unique string via
    `--append-system-prompt`. Only partial: it appends to the *end* of the system prompt,
    so the harness's own boilerplate prefix stays shareable across runs. It does isolate
    the parts that vary by permutation.
  - **A pool of workspaces**, round-robined across concurrent runs. Isolates properly,
    but workspaces carry their own credentials and are an org-admin construct.
  - **Set `CLAUDE_CODE_PROMPT_CACHE_TTL=5m`** regardless, so nothing silently inherits a
    1-hour cache.

  If Anthropic ever ships a cache-key header, `ANTHROPIC_CUSTOM_HEADERS` means the
  claude-code harness can set it with no new mechanism. (See
  [080-docker-execution.md](080-docker-execution.md).)

- **Missing values in aggregation results.** How `skipped` / `erroredWhileMeasuring`
  iterations are counted when a measure's values are combined. Excluding them silently
  flatters the aggregate; counting them as zero is wrong. See
  [085-experiment-results.md](085-experiment-results.md#how-a-measures-values-combine).

## Open questions

_TBD_
