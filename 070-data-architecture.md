# Data Architecture

The three-tier metadata + artifact store design.

## The three tiers

1. **Run data store** — small, queryable metadata: date, experiment parameters and
   parameter hash, measurements, cost, tokens, duration. See
   [030-terminology.md](030-terminology.md#storage) and
   [085-experiment-results.md](085-experiment-results.md).
2. **Trace store** — a container run's OTel trace and session transcript, kept separate
   from its image so viewing them doesn't require a full image pull. **Not populated in
   v1** — extracting these out of the container is a non-goal for now (see
   [020-goals-non-goals.md](020-goals-non-goals.md)); pull the postrun image to get them
   instead.
3. **Image store** — a single Docker registry repository holding both prerun and postrun
   images together, discriminated by tag prefix (`prerun-` / `postrun-`) rather than by
   separate repositories. See [081-docker-tagging.md](081-docker-tagging.md) for the tag
   scheme.

## Open questions

_TBD_
