// How commands print things they share: counts, durations, measured values, times. A command
// never imports another command; what two of them print alike lives here.

import type { RecordedOutcome } from "../store/run-data-store.ts";

/** `1 permutation`, `2 permutations`. */
export const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** A measured value as `run` prints it: JSON, but with an object's keys unquoted, `{passed: 4, failed: 1}`. */
export const showValue = (value: unknown): string =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? `{${Object.entries(value)
        .map(([key, v]) => `${key}: ${showValue(v)}`)
        .join(", ")}}`
    : (JSON.stringify(value) ?? String(value));

/** A measure as `run` and `remeasure` print it: its value, or what kept it from having one. */
export const showOutcome = (outcome: RecordedOutcome) =>
  outcome.outcome === "measured"
    ? showValue(outcome.data)
    : outcome.outcome === "skipped"
      ? "skipped"
      : `erroredWhileMeasuring: ${outcome.error.message}`;

/** Milliseconds as a duration: `0.04s`. */
export const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

/** How long a container run took: `0.04s`. */
export const duration = ({ startedAt, finishedAt }: { startedAt: number; finishedAt: number }) =>
  seconds(finishedAt - startedAt);

/** `2026-09-29 14:30`, from an ISO timestamp. */
export const minute = (iso: string) => iso.slice(0, 16).replace("T", " ");
