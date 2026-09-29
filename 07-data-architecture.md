# Data Architecture

The two-tier metadata + artifact store design.

## The two tiers

- **Run data store** — small, queryable metadata: measurements, cost, tokens, duration,
  git history, final text block. See [03-terminology.md](03-terminology.md#storage).
- **Image store** — a single Docker registry repository holding both prerun and postrun
  images together, discriminated by tag prefix (`prerun-` / `postrun-`) rather than by
  separate repositories. See [081-docker-tagging.md](081-docker-tagging.md) for the tag
  scheme.

## Open questions

_TBD_
