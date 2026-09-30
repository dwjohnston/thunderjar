# Collecting Token Costs

How a container run's token usage and cost are obtained, normalised across harnesses,
and recorded. The measurements side of the same recording step is
[085-experiment-results.md](085-experiment-results.md).

## Collected, not measured

Token costs are **collected**, not measured. They are a first-class field of every
container run, produced by the harness itself and recorded automatically — not a
[measuring instrument](060-experiment-parameters.md#measuring-instruments--measurements),
and not declared per task.

The distinction matters because it's tempting to model a token count as just another
measure. It isn't: a measurement judges whether a task was done well, and varies by task.
Token cost is the same question for every run in the system, so nobody should have to
declare it. _(Referenced by: [085-experiment-results.md](085-experiment-results.md).)_

## Where the numbers come from

From the harness's own structured output — not from telemetry. Every supported harness
can be asked to emit a machine-readable result (`claude -p --output-format json`,
`codex exec --json`, `qwen --output-format json`).

Cost reporting needs no OTel collector — it parses a file.

**Future:** per-tool and per-span cost detail via OTel, once there is a trace store. See
[020-goals-non-goals.md](020-goals-non-goals.md#non-goals-v1).

## The result file

The harness's [declaration](030-terminology.md#declaration) is responsible for both
halves: its `cli` must run the agent **and** leave a file at the path Thunderjar supplies
as `ctx.resultPath`.

```
/thunderjar/result.json
```

```ts
cli: (ctx) =>
  `claude -p "${ctx.taskInstruction}" --model ${ctx.model} ` +
  `--output-format json > ${ctx.resultPath}`,
```

Thunderjar supplies the path; the harness chooses the method. A redirect is the common
case, but a harness with a native output-file flag would use that instead. The contract
is only that the file exists when the command exits.

Because it is written before `docker commit` (see
[080-docker-execution.md](080-docker-execution.md#why-commit-happens-before-measurement)),
the file is preserved **inside the postrun image**. Thunderjar reads it from the
[measurement container](030-terminology.md#measurement-container), in the same step that
applies the task's measurements — so a run's cost is re-derivable from its image alone,
years later.

## Normalising: `collectTokenCosts`

Thunderjar never parses the result file. It hands the bytes to that same harness's
`collectTokenCosts`, because harnesses disagree about shape:

- **Claude Code** emits one JSON object with a cumulative total and a per-model breakdown.
- **Codex** emits JSON-lines with per-turn counts and **no rolled-up summary**, so the
  collector has to sum them itself.
- **OpenCode** emits a final event with tokens and cost, but it is known to sometimes not
  be emitted at all.

So normalisation is harness-specific knowledge, and it lives with the harness. The
collector is a pure function from the file's contents, which keeps it unit-testable
against a fixture — layer 1 of [120-test-boundaries.md](120-test-boundaries.md).

```ts
collectTokenCosts: (raw: string) => TokenCosts;

type TokenCosts =
  | {
      outcome: "collected";
      models: ModelTokenCosts[];
      apiDurationMs?: number; // absent unless the harness reports one
    }
  | { outcome: "unavailable"; reason: "absent" | "unparseable" | "notReported" };

type ModelTokenCosts = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd?: number; // absent unless the harness reports one
  costBasis?: "list" | "managed" | "unknown";
};
```

```ts
// a collected result for a run whose skill delegated to a cheaper sub-agent
{
  outcome: "collected",
  models: [
    { model: "claude-opus-5",   inputTokens: 18402, outputTokens: 3311,
      cacheCreationTokens: 12050, cacheReadTokens: 96110,
      costUsd: 0.4123, costBasis: "list" },
    { model: "claude-haiku-4-5", inputTokens: 5120, outputTokens: 890,
      cacheCreationTokens: 0, cacheReadTokens: 0,
      costUsd: 0.0096, costBasis: "list" },
  ],
  apiDurationMs: 31870,
}
```

_(Referenced by: [060-experiment-parameters.md](060-experiment-parameters.md#harness).)_

### Why per-model, and not one total

A total is derivable by summing; a breakdown can't be recovered from a total. The model
mix is precisely what's being observed — the [model parameter](030-terminology.md#experiment-parameters)
pins only the root model, so which model a delegated sub-agent actually used is an
*outcome*, not something the matrix controls. "This prompt set made it reach for the
expensive model" is a finding, and it's only visible per-model.

### Why four buckets, unrolled

Input, output, cache-creation and cache-read are priced differently — cache creation
costs more than plain input, cache reads substantially less. Rolling them into one number
destroys more than precision: **cache-read tokens are the contamination signal.** A run
that should have started cold but reports cache reads was not an independent cost
measurement. Thunderjar can't reliably prevent that (see
[020-goals-non-goals.md](020-goals-non-goals.md#to-revisit)), so detecting it is the
available move, and it only works if the bucket survives into the record.

## Reading the right field

Claude Code's result carries both a flat usage total and a per-model breakdown, and
**they don't agree**: the flat `usage` field counts only the top-level agent loop, so
tokens spent inside sub-agents are silently missing. The per-model breakdown includes
them.

A collector that reads the convenient-looking field under-reports any run that delegated.
It fails quietly and in the direction that flatters the result, which is the worst
combination.

There is also a naming trap inside the same payload: the flat usage object uses
snake_case (`cache_read_input_tokens`) while the per-model breakdown uses camelCase
(`cacheReadInputTokens`).

## Dollars

Dollars are an **optional passthrough**, never computed. Thunderjar owns no price table.

- Not every harness reports them. Codex emits token counts per turn and no cost at all,
  so `costUsd` is absent rather than zero.
- Where a harness does report one, it is a **client-side estimate** — Claude Code computes
  it locally from a price table bundled at build time. It drifts when pricing changes and
  is wrong when the installed version doesn't recognise a model ID. It is not a bill.
- `costBasis` carries that trust signal through: `list`, `managed`, or `unknown` when the
  price table didn't match the model.

Tokens are the common denominator across harnesses. Any comparison that has to hold
across harnesses should be made on tokens; dollars are a convenience for the common case.

## API duration

Where the harness reports how long it spent waiting on API calls, the collector passes it
through as `apiDurationMs`. Like dollars, it's optional: absent rather than zero when a
harness doesn't report it.

It complements the run's execution time, which Thunderjar records itself from outside the
harness (see [085-experiment-results.md](085-experiment-results.md#execution)). The two
answer different questions: execution time is the whole of the agent's run, and API
duration is the part of it spent waiting on the model. A run whose execution time grows
while its API duration stays flat got slower in its tools, not its model.

## When collection fails

Five distinct failures, which collapse to three recorded reasons:

| What happened | `reason` |
|---|---|
| No file at `resultPath` — `cli` missing its redirect, or the agent died first | `absent` |
| File exists but is empty, truncated, or isn't the expected shape | `unparseable` |
| Harness printed an error to stdout instead of a result | `unparseable` |
| Harness ran but genuinely reported no usage | `notReported` |
| Valid, correctly shaped, and entirely zeroed — the crash case | `notReported` |

That last row is the dangerous one: a crashed session can emit a structurally perfect
result whose every cost field is zero. Nothing about it looks wrong. A collector that
recognises the condition reports `notReported`, which is the collector saying *"I parsed
this correctly and the numbers are meaningless"* — a different claim from *"something
broke."*

**Thunderjar wraps the collector call.** `collectTokenCosts` is user-written and will
throw on malformed input; the spec doesn't ask harness authors to hand-roll defensive
parsing. A throw becomes `unparseable`, exactly as an instrument that throws becomes
`erroredWhileMeasuring`.

Three consequences worth stating outright:

- **A failed collection does not invalidate the container run.** The agent ran, the
  postrun image is valid, the task's measurements still apply. The run is recorded with
  its token costs unavailable.
- **Never zero-fill in aggregates.** Any report summing or averaging cost must *exclude*
  unavailable runs, not treat them as zero. This is the failure that actually bites: a
  cost trend sloping pleasantly downward because a third of runs stopped reporting.
- **`unparseable` is recoverable; `absent` is not.** The raw file is preserved in the
  postrun image, so a corrected collector can be re-run against historical images. If the
  file was never written, the numbers are gone for good — which is the argument for
  keeping the `cli` contract simple enough that people don't get it wrong.

## Backfilling token costs

Because the raw result file lives in the postrun image, token costs get the same property
as measurements: a corrected or extended `collectTokenCosts` can be applied to historical
runs without re-running the agent. Start a measurement container from the postrun image,
re-read the file, re-collect.

The [accepted tradeoff](060-experiment-parameters.md#accepted-tradeoffs) is that
`collectTokenCosts` sits inside the harness declaration and is therefore part of its
content hash, so correcting it marks old runs as not directly comparable — a warning, not
an error.

## Open questions

- **Exact field names in each harness's payload.** The Claude Code field names above are
  described from the Agent SDK's documented shape; the CLI's `--output-format json`
  payload has not been captured and diffed against it, and may use different casing. Do
  that before implementing a collector.
- Whether the raw result file should *also* be stored verbatim in the run data store
  alongside the parsed numbers. It is a few KB of text, and without it re-collecting
  across a year of runs means pulling a year of images. It is explicitly not the OTel
  trace or session transcript, so the v1 trace-store non-goal is untouched — but it is
  the same shape of idea.
- Whether `notReported` should distinguish "harness reports no usage" from "harness
  reported zeros after a crash". They're recorded the same today.
