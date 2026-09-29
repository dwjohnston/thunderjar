# Human Zone-Out

Places where the user has flagged that they stopped paying close attention.

## What this page is for

Spec pages read with a uniform confidence. They don't distinguish a decision the
user argued through from one an agent proposed and the user waved past while
thinking about something else. Both end up as the same calm prose.

This page records the second kind. An entry here does **not** mean the content is
wrong — it may well be right. It means it was never really reviewed, so it carries
less authority than the text around it and shouldn't be cited as settled.

Distinct from the two sections in
[020-goals-non-goals.md](020-goals-non-goals.md):

| Where | Means |
|---|---|
| 020 — Non-goals | Deliberately out of scope for v1 |
| 020 — To revisit | Known to be unresolved, and we intend to settle it in v1 |
| **021 — this page** | *Might* be resolved. Nobody was really watching when it was. |

Entries are a work queue, not a permanent record: once the user has actually read
the thing properly, the entry goes, whether or not the content changed.

## Entries

- **Measuring instruments in
  [060-experiment-parameters.md](060-experiment-parameters.md#measuring-instruments--measurements).**
  The whole section, but specifically the parts that were agent-proposed rather than
  user-decided:
  - The `MeasurementContext` interface — its exact field list (`exec`, `readFile`,
    `writeFile`, `glob`, `harnessResult`, `workdir`) was proposed wholesale and never
    discussed field by field. Worth noting that `context` is undefined in the source
    design conversation too, so this has no prior art behind it either — it is the
    least-grounded shape in the spec.
  - The `templateTest` config shape. The *concept* is the user's, and a good one: the
    supplied file is a template because the thing it tests doesn't exist yet and won't
    have a predictable name. But the concrete config keys (`subject`, `template`) and
    the `{{defaultExport}}` / `{{subjectPath}}` binding convention are invented.
  - Its value type being a count rather than a boolean, and the mapping of "glob matched
    nothing" to `skipped` and "template couldn't bind" to `erroredWhileMeasuring`.

- **[087-collecting-token-costs.md](087-collecting-token-costs.md), the whole page.**
  Several of its decisions *are* the user's — that `cli` writes the result file, that
  `collectTokenCosts` lives in the harness declaration, that the page stays scoped to
  token cost. The dollars material is documentation-backed rather than invented, as is
  `modelUsage` undercounting sub-agents. What wasn't reviewed:
  - The `TokenCosts` and `ModelTokenCosts` type shapes — field names and which fields are
    optional.
  - The three `reason` values (`absent` / `unparseable` / `notReported`) and the decision
    to collapse five failure modes into them.
  - `/thunderjar/result.json` as the concrete path. Invented; nothing depends on that
    exact string, but it is now written down as though chosen.
  - Recording two durations (`apiMs`, `containerMs`) at all, and that shape.
  - "Never zero-fill in aggregates" — a rule the agent introduced.
  - **The per-harness claims about Codex, OpenCode and Qwen** come from the source design
    conversation, which has since been shown to state non-existent APIs with full
    confidence (it invented a `prompt-cache-key` header — see the cache isolation item in
    [020-goals-non-goals.md](020-goals-non-goals.md#to-revisit)). Treat "Codex has no
    rolled-up summary" and "OpenCode sometimes omits its final event" as unverified.

- **[085-experiment-results.md](085-experiment-results.md), the record shapes.** The
  surrounding decisions are the user's — commit before measurement, the measurement
  container being short-lived and never committed, backfill as the same path. The data
  shapes are not:
  - `MeasurementKey` as `instrument-h<contentHash>`, and using a keyed map rather than an
    array.
  - The `RecordedMeasure` and `ContainerRunRecord` shapes in full, including field names.
  - `measuredAt` existing as a field separate from the run date.
  - Storing each parameter by *both* name and content hash.
  - Which three items got recorded as that page's open questions, and which were treated
    as settled instead.
