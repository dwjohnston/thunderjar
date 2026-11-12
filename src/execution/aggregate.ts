// Combining a permutation's iterations into its aggregation result (PRD 085). Each iteration's
// stored measure is read by each of its measurement's metrics, as declared today, and the scores
// combined by the metric's one statistic. Nothing is zero-filled: an iteration whose measure has no
// value (skipped, errored while measuring, never measured, or stale) is left out of every metric of
// it, and one whose score doesn't apply, or failed, is left out of that metric. Each is counted,
// with why. A recorded measure the task no longer declares is ignored.
import type { Better, Metric, Stat } from "../api/declarations.ts";
import type { Measurement } from "../config/measurements.ts";
import { type Instrument, type ScoreKind, instruments, STATS } from "../instruments/instruments.ts";
import type { ContainerRunRecord, RecordedOutcome } from "../store/runDataStore.ts";

/** One metric's scores across a permutation's iterations. */
export type AggregatedMetric = {
  kind: ScoreKind;
  stat: Stat;
  better?: Better;
  /** Its statistic over the applicable scores, booleans counting as 1 and 0; undefined if there are none. */
  value: number | undefined;
  /** The measured iterations whose score is a number or a boolean. */
  applicable: number;
  /** The measured iterations whose score is undefined: the metric doesn't apply to them. */
  notApplicable: number;
  /** The measured iterations whose score threw, or wasn't a score of the kind its statistic combines, and why. */
  failed: { iteration: number; reason: string }[];
};

/** One measurement's measures across a permutation's iterations, and its metrics. */
export type AggregatedMeasurement = {
  /** The iterations with a measure to read: measured, by the measurement as it is today. */
  measured: number;
  metrics: Record<string, AggregatedMetric>;
};

/** Why an iteration is left out of a measurement's metrics, or of one of them. */
export type LeftOut = {
  iteration: number;
  measurement: string;
  /** The metric it's left out of, or undefined if it's left out of every metric of the measurement. */
  metric?: string;
  /** For a whole measurement, its outcome, or `notMeasured` or `stale`; for a metric, `notApplicable` or `scoreFailed`. */
  why: "skipped" | "erroredWhileMeasuring" | "notMeasured" | "stale" | "notApplicable" | "scoreFailed";
  reason?: string;
};

/** A permutation's aggregation result: each measurement's, keyed by name, and what each leaves out. */
export type AggregatedPermutation = { measures: Record<string, AggregatedMeasurement>; leftOut: LeftOut[] };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => sum(xs) / xs.length;

/** The middle value, or with an even count, the mean of the two middle values. */
const median = (xs: number[]) => {
  const sorted = xs.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Each statistic, over scores as numbers: booleans as 1 and 0, so a rate is a mean, and a count a sum. */
const STATISTICS: Record<Stat, (xs: number[]) => number> = {
  rate: mean,
  count: sum,
  mean,
  median,
  min: (xs) => Math.min(...xs),
  max: (xs) => Math.max(...xs),
  sum,
};

/** `stat` over `scores`, or undefined if there are none. */
export const combine = (stat: Stat, scores: number[]): number | undefined => (scores.length === 0 ? undefined : STATISTICS[stat](scores));

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

/** Why a measure has no value to read, if it has none: by its outcome, or because it was taken by an earlier measurement. */
function noValue(run: ContainerRunRecord, { name, contentHash }: Pick<Measurement, "name" | "contentHash">): Pick<LeftOut, "why" | "reason"> | undefined {
  const measure = run.result[name];
  const outcome: RecordedOutcome | undefined = measure?.outcome;
  if (outcome === undefined) return { why: "notMeasured" };
  if (outcome.outcome === "skipped") return { why: "skipped", reason: outcome.reason };
  if (outcome.outcome === "erroredWhileMeasuring") return { why: "erroredWhileMeasuring", reason: outcome.error.message };
  if (measure!.contentHash !== contentHash) return { why: "stale", reason: "measured before the measurement or its instrument changed" };
  return undefined;
}

/**
 * One permutation's aggregation result, from its container runs, by each of `measurements`, the
 * task's as declared today, keyed by name in their order, each metric in the order declared.
 */
export function aggregatePermutation(
  runs: readonly ContainerRunRecord[],
  measurements: readonly Pick<Measurement, "name" | "declaration" | "contentHash">[],
): AggregatedPermutation {
  const leftOut: LeftOut[] = [];
  const measures = Object.fromEntries(
    measurements.map((measurement) => {
      const { name, declaration } = measurement;
      const values: { iteration: number; value: unknown }[] = [];
      for (const run of runs) {
        const why = noValue(run, measurement);
        if (why) leftOut.push({ iteration: run.iteration, measurement: name, ...why });
        else values.push({ iteration: run.iteration, value: (run.result[name]!.outcome as { data: unknown }).data });
      }
      const metrics = Object.fromEntries(
        Object.entries(declaration.metrics).map(([metricName, metric]): [string, AggregatedMetric] => {
          const scores: number[] = [];
          const failed: AggregatedMetric["failed"] = [];
          let notApplicable = 0;
          for (const { iteration, value } of values) {
            const scored = scoreOf(declaration.instrument, metric, value);
            if ("score" in scored) scores.push(Number(scored.score));
            else if ("notApplicable" in scored) {
              notApplicable++;
              leftOut.push({ iteration, measurement: name, metric: metricName, why: "notApplicable" });
            } else {
              failed.push({ iteration, reason: scored.failed });
              leftOut.push({ iteration, measurement: name, metric: metricName, why: "scoreFailed", reason: scored.failed });
            }
          }
          return [
            metricName,
            {
              kind: STATS[metric.stat],
              stat: metric.stat,
              ...(metric.better === undefined ? {} : { better: metric.better }),
              value: combine(metric.stat, scores),
              applicable: scores.length,
              notApplicable,
              failed,
            },
          ];
        }),
      );
      return [name, { measured: values.length, metrics }];
    }),
  );
  return { measures, leftOut };
}
