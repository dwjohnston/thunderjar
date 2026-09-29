# User Experience

Two audiences share the same engine: a developer iterating locally, and CI running
on a schedule. Assumes the application is already set up (see
[Setup and Configure](050-setup-and-configure.md)).

## Local workflows

### Experiment candidates

Not every session is worth turning into an experiment. Three recurring scenarios:

1. **Clean pass.** The agent nails the task, no notes. Still worth capturing as a
   baseline/regression experiment — it locks in today's good behavior, so a future
   prompt, model, or code change that breaks it gets caught.
2. **Near miss.** The agent almost nails it, but messes up one specific thing.
   Capture the task with a measurement that isolates exactly that mistake. Update
   the prompt set to guard against it, rerun, and confirm the measurement flips
   from fail to pass — direct before/after evidence the prompt fix worked.
3. **Clear, measurable failure.** The agent messes up badly, in a way that's cheap
   to detect mechanically — e.g. it silenced type errors with `@ts-ignore` instead
   of fixing them. A good candidate not because the failure is severe, but because
   the measurement is trivial and reliable to write.

The common thread: a good candidate is one whose outcome — good or bad — can be
captured as an automated measurement, not just something a human happens to notice
by eye.

### Reusing a captured experiment

Once an experiment exists, it's not a one-shot script — the same task and
measurements get rerun against different parameter values to answer new
questions later:

- **Cost check (scenario 1).** The baseline still passes with today's model. Swap
  in a cheaper model, rerun, and see if the pass rate holds — turning a "no notes"
  pass into evidence for a cheaper default, without re-litigating whether the task
  itself still works.
- **Guardrail authoring (scenario 3).** The `@ts-ignore` experiment reliably
  reproduces the failure. Iterate on the prompt set (e.g. "never suppress a type
  error, fix the underlying type") and rerun against the same experiment — the
  same before/after loop as scenario 2, just starting from a harder failure.

This is why an experiment is captured as task + measurements against a stable
identity, rather than thrown away after the session that produced it: the
[experiment parameters](030-terminology.md#experiment-parameters) (model, prompt
set, code state) are the axis you vary later, holding the rest fixed.

## CI workflows

- Runs on a cadence (e.g. weekly), not per-commit — running the full matrix on
  every commit would be too expensive.
- **Pinned experiments:** exact code state + prompt set, expected to keep
  producing the same result run after run. A change here is a signal, surfaced
  loudly through standard reporting.
- **Floating experiments** *(deferred)*: same idea, but pointed at "current" code
  state / prompts, to catch slow drift as the codebase and prompt set grow. Out of
  scope for the first pass — pinned only for now.
- CI invocation is non-interactive and scriptable: exit code plus a JSON summary,
  no interactive UI.

### Regression triage

The motivating case for floating experiments: between two scheduled runs, one
experiment's measurement suddenly degrades — a real regression, not noise. From
there, the loop hands off from CI back to a developer's machine:

1. A developer picks the failing run and **restores** it locally — the exact code
   state and prompt set that run used (see [Restore / Purge](090-restore-purge.md)).
2. They reproduce locally and iterate on the prompt set — the same before/after
   loop as [guardrail authoring](#reusing-a-captured-experiment) above — until
   they isolate the offending prompt change.

CI's job is to notice drift cheaply and reliably on a schedule; local is where
root-causing and fixing it actually happens.

## CLI shape

The CLI has two modes over the same underlying engine:

- **Scriptable mode**, for CI — one-shot commands, machine-readable output,
  exit-code driven.
- **Interactive mode**, for local exploration — browsing past runs, drilling into
  an iteration, triggering a restore.

## Open questions

- Whether interactive mode is a dedicated TUI (e.g. `thunderjar explore`) or a set
  of composable single-shot commands (e.g. `thunderjar show <execution-id>`).
- What "promoting" a local run to canonical/CI status looks like, if that's a thing
  at all.
- How floating experiments actually get designed, once pinned-only ships.
