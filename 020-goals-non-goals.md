# Goals / Non-Goals

What's in scope vs. explicitly not.

## Non-goals (v1)

- **Retention/purge policy for preserved containers and metadata.** No TTLs, no
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

## To revisit

Unresolved, but things we *are* intending to address in v1 — unlike the non-goals above.

- **Thunderjar's own injected setup in the Docker image.** Beyond the six experiment
  parameters, Thunderjar itself may need to bake things into the image that aren't any
  experimenter's concern — e.g. OTel collector config or other instrumentation needed
  for telemetry. Where this fits in the image-build sequence is unresolved. (See
  [080-docker-execution.md](080-docker-execution.md#open-questions).)

## Open questions

_TBD_
