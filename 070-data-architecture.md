# Data Architecture

Where Thunderjar keeps what a container run produces: two stores, one small and
queryable, one large.

## The two stores

1. **Run data store** — small, queryable metadata: date, experiment parameters and
   parameter hash, measurements, cost, tokens, duration. See
   [030-terminology.md](030-terminology.md#storage) and
   [085-experiment-results.md](085-experiment-results.md).
2. **Image store** — a single Docker registry repository holding both prerun and postrun
   images together, discriminated by tag prefix (`prerun-` / `postrun-`) rather than by
   separate repositories. See [081-docker-tagging.md](081-docker-tagging.md) for the tag
   scheme.

A container run's OTel trace and session transcript live in its postrun image, alongside
everything else the run left behind. To read them, pull the image.

**Future:** a separate trace store, so viewing a trace or transcript doesn't need a full
image pull. See [020-goals-non-goals.md](020-goals-non-goals.md#non-goals-v1).

## Open questions

_TBD_
