// How one metric scores a value of its instrument: shared by a run's aggregation and by
// `measure()`, the test helper, which ships in the package, so it imports only the api and instruments.
import type { Metric } from "../api/declarations.ts";
import { type Instrument, instruments, STATS } from "../instruments/instruments.ts";

const show = (value: unknown) => (typeof value === "number" ? String(value) : (JSON.stringify(value) ?? String(value)));

/** A metric's score of one value, as `stat` combines it, or that it doesn't apply, or why it failed. */
export type Scored = { score: number | boolean } | { notApplicable: true } | { failed: string };

/**
 * Reads `value`, a stored measure of `instrument`, with `metric`: its own `score`, or the
 * instrument's default. A score that throws, or isn't a number or a boolean of the kind its
 * `stat` combines, fails, with why. `undefined` doesn't apply.
 */
export function scoreOf(instrument: string, metric: Metric, value: unknown): Scored {
  const kind = STATS[metric.stat];
  const score = (metric.score ?? (instruments as Record<string, Instrument<unknown, unknown>>)[instrument]?.defaultScore?.score) as
    | ((value: unknown) => unknown)
    | undefined;
  if (!score) return { failed: `${instrument} has no default score, and the metric no score` };
  let result: unknown;
  try {
    result = score(value);
  } catch (error) {
    return { failed: `score threw: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (result === undefined) return { notApplicable: true };
  if (typeof result === "number" && !Number.isFinite(result)) return { failed: `score returned ${result}` };
  if (typeof result !== kind) return { failed: `score returned ${show(result)}, not a ${kind}, which "${metric.stat}" combines` };
  return { score: result as number | boolean };
}
