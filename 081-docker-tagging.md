# Docker Tagging

How prerun and postrun images are named. See [030-terminology.md](030-terminology.md) for
**prerun image**, **postrun image**, **parameter hash**, **matrix shape**, and
**single-permutation experiment**; see [080-docker-execution.md](080-docker-execution.md)
for the run mechanics these tags get attached to.

## Tag formats

```
prerun-h<parameter hash>
postrun-e<execution ID>-h<parameter hash>-i<iteration index>
```

Example:

```
prerun-h4f9a21c8
postrun-e01k4x9j2e8mqz3-h4f9a21c8-i00
```

- `h<parameter hash>` — an 8-character abbreviated parameter hash (git-style; the full
  hash lives in the run data store, and any real comparability check should use that, not
  this truncated copy). Identical on a permutation's prerun tag and on every postrun tag
  produced from it, so which prerun image a postrun image started from is readable
  directly off its own tag — no separate lookup needed.
- `e<execution ID>` — the full, untruncated execution ID (a ULID). Kept full length
  because, unlike the hash, it's load-bearing for uniqueness: it's what stops two
  different experiment executions from colliding on the same postrun tag.
- `i<iteration index>` — zero-padded iteration index (`i00`, `i01`, …) within the
  permutation.

Single repository, prefix-discriminated (`prerun-` vs `postrun-`) rather than two
repositories. _(Referenced by: [070-data-architecture.md](070-data-architecture.md).)_
No permutation index in the tag: the parameter hash already changes
whenever any parameter changes — including model, even though model alone doesn't affect
the image's filesystem — so a separate positional index would be redundant, and worse,
unstable in meaning across executions if the matrix ever gets resolved in a different
order.

## Worked examples

### 1. Single-permutation experiment, 3 iterations, rerun later

Matrix shape `1/1/1/1/1/1` — every parameter fixed, one permutation. Parameter hash stays
`h4f9a21c8` for as long as the base image, code state, prompt set, harness, model, and
task instruction stay pinned.

**First execution** (`e01k4x9j2e8mqz3`), 3 iterations:

```
prerun-h4f9a21c8                          (built)
postrun-e01k4x9j2e8mqz3-h4f9a21c8-i00
postrun-e01k4x9j2e8mqz3-h4f9a21c8-i01
postrun-e01k4x9j2e8mqz3-h4f9a21c8-i02
```

**Rerun weeks later** (`e01k5f2n0a7xrbq`), nothing about the parameters changed:

```
prerun-h4f9a21c8                          (already exists — reused, not rebuilt)
postrun-e01k5f2n0a7xrbq-h4f9a21c8-i00
postrun-e01k5f2n0a7xrbq-h4f9a21c8-i01
postrun-e01k5f2n0a7xrbq-h4f9a21c8-i02
```

Same prerun tag both times. Six distinct postrun images across the two occasions — this
is what makes the month-over-month regression comparison work.

### 2. Matrix shape `1/1/2/1/1/1`, 1 iteration, rerun later

1 base image, 1 code state, 2 prompt sets, 1 harness, 1 model, 1 task instruction —
2 permutations, 1 iteration each. The two prompt sets produce two different parameter
hashes:
`h4f9a21c8` and `h9d3e77a0`.

**First execution** (`e01k4x9j2e8mqz3`):

```
prerun-h4f9a21c8                          (built)
prerun-h9d3e77a0                          (built)
postrun-e01k4x9j2e8mqz3-h4f9a21c8-i00
postrun-e01k4x9j2e8mqz3-h9d3e77a0-i00
```

**Rerun weeks later** (`e01k5f2n0a7xrbq`), prompt sets unchanged:

```
prerun-h4f9a21c8                          (reused)
prerun-h9d3e77a0                          (reused)
postrun-e01k5f2n0a7xrbq-h4f9a21c8-i00
postrun-e01k5f2n0a7xrbq-h9d3e77a0-i00
```

Both prerun images are reused as-is; only new postrun images are produced.

## Open questions

- **Human-readable execution ID?** Could `e<execution ID>` be a readable date/timestamp
  (e.g. `e20260929-1430`) instead of an opaque ULID. Held back for now because of
  collision risk: two executions starting close together — parallel local runs,
  concurrent CI triggers — could land on the same tag and silently overwrite each
  other's postrun images. A ULID's random component avoids that by construction; getting
  the same safety from a date format would need enough extra precision/disambiguation
  that it stops being more readable anyway.
