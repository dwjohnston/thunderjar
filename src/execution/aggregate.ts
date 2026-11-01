// Combining a permutation's iterations into its aggregation result: each measurement's values
// across the container runs, by the methods its declaration chooses (PRD 085). An iteration that
// gave a measure no value (skipped, errored while measuring, or never measured) is left out of
// it, and counted as left out. A recorded measure the task no longer declares is ignored. Recorded
// values the methods declared today can't combine are marked incompatible, not thrown over.
import type { AggregateFor } from "../api/declarations.ts";
import type { Measurement } from "../config/measurements.ts";
import type { ContainerRunRecord } from "../store/runDataStore.ts";

/** Every way a measure's values can combine. */
export type AggregateMethod = AggregateFor<boolean> | AggregateFor<number> | AggregateFor<Record<string, number>>;

/** A combined value: a number, or a number per key for records such as `{ passed, failed }`. */
export type AggregatedValue = number | Record<string, number>;

/** One measurement's values across a permutation's iterations. */
export type AggregatedMeasure = {
  /** The iterations that gave it a value. */
  measured: number;
  /** Its value by each of its measurement's methods, in the order declared. Empty if none was measured, or if incompatible. */
  values: Partial<Record<AggregateMethod, AggregatedValue>>;
  /** Why the recorded values don't combine by the methods declared today, if they don't. */
  incompatible?: string;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => sum(xs) / xs.length;

/** The middle value, or with an even count, the mean of the two middle values. */
const median = (xs: number[]) => {
  const sorted = xs.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** `combine` applied key by key, over every key any record has; a record without one counts it as 0. */
const byKey = (records: Record<string, number>[], combine: (xs: number[]) => number) => {
  const keys = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return Object.fromEntries(keys.map((key) => [key, combine(records.map((record) => record[key] ?? 0))]));
};

type Methods<T> = Partial<Record<AggregateMethod, (values: T[]) => AggregatedValue>>;

const ofBooleans: Methods<boolean> = {
  rate: (bs) => bs.filter(Boolean).length / bs.length,
  count: (bs) => bs.filter(Boolean).length,
};

const ofNumbers: Methods<number> = { mean, median, min: (xs) => Math.min(...xs), max: (xs) => Math.max(...xs), sum };

const ofRecords: Methods<Record<string, number>> = {
  sum: (records) => byKey(records, sum),
  mean: (records) => byKey(records, mean),
};

const isRecordOfNumbers = (value: unknown): value is Record<string, number> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((v) => typeof v === "number");

/** The methods for `values`' type, or undefined if they don't share one that combines. */
function menuFor(values: unknown[]): [kind: string, Methods<never>] | undefined {
  if (values.every((v) => typeof v === "boolean")) return ["booleans", ofBooleans];
  if (values.every((v) => typeof v === "number")) return ["numbers", ofNumbers];
  if (values.every(isRecordOfNumbers)) return ["records of numbers", ofRecords];
  return undefined;
}

/** Values combined, keyed by method, or why they can't be, e.g. recorded before the measurement changed. */
export type Combined = { values: Partial<Record<AggregateMethod, AggregatedValue>> } | { incompatible: string };

/**
 * `values` combined by each of `methods`, keyed by method, in the order given. No values give no
 * keys. Values that aren't all booleans, numbers or records of numbers, or a method that doesn't
 * combine their type, give why instead.
 */
export function aggregateValues(values: readonly unknown[], methods: readonly AggregateMethod[]): Combined {
  if (values.length === 0) return { values: {} };
  const menu = menuFor([...values]);
  if (!menu) return { incompatible: "recorded values aren't all booleans, numbers or records of numbers" };
  const [kind, menuMethods] = menu;
  const unfit = methods.filter((method) => !menuMethods[method]);
  if (unfit.length > 0) {
    const list = unfit.map((method) => `"${method}"`).join(", ");
    return { incompatible: `recorded values are ${kind}; ${list} ${unfit.length === 1 ? "doesn't" : "don't"} combine them` };
  }
  return {
    values: Object.fromEntries(methods.map((method) => [method, (menuMethods[method] as (values: unknown[]) => AggregatedValue)([...values])])),
  };
}

/**
 * One permutation's measures, from its container runs, by each of `measurements`, the task's as
 * declared today, keyed by name in their order.
 */
export function aggregatePermutation(
  runs: readonly ContainerRunRecord[],
  measurements: readonly Pick<Measurement, "name" | "declaration">[],
): Record<string, AggregatedMeasure> {
  return Object.fromEntries(
    measurements.map(({ name, declaration }) => {
      const values = runs.flatMap(({ result }) => {
        const outcome = result[name]?.outcome;
        return outcome?.outcome === "measured" ? [outcome.data] : [];
      });
      const combined = aggregateValues(values, declaration.aggregate);
      const measure: AggregatedMeasure =
        "incompatible" in combined ? { measured: values.length, values: {}, incompatible: combined.incompatible } : { measured: values.length, values: combined.values };
      return [name, measure];
    }),
  );
}
