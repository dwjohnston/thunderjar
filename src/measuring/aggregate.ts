// Combining a permutation's iterations into its aggregation result — spec/085-test-case-results.md#aggregation-results.
// Each measurement chooses how its values combine, from a menu typed by its instrument's value
// type: spec/085-test-case-results.md#how-a-measures-values-combine.
//
// An iteration that gave a measure no value — skipped, errored while measuring, or never
// measured for it — is left out of that measure, and `measured` counts the ones that weren't.
// This is the spec's likely answer to a question it leaves open (spec/020-goals-non-goals.md#to-revisit).
// A stored measure the task no longer declares is left out entirely. A stale one is still
// combined; marking it is for `remeasure`.

import type { AggregateFor } from "../api/declarations.ts";
import type {
  AggregatedMeasure,
  AggregatedValue,
  AggregationMethod,
  AggregationResult,
  ContainerRunRecord,
  RunDataStore,
} from "../store/run-data-store.ts";

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
  const keys = [...new Set(records.flatMap((r) => Object.keys(r)))];
  return Object.fromEntries(keys.map((key) => [key, combine(records.map((r) => r[key] ?? 0))]));
};

type Methods<T> = Partial<Record<AggregationMethod, (values: T[]) => AggregatedValue>>;

const ofBooleans: Methods<boolean> = {
  rate: (bs) => bs.filter(Boolean).length / bs.length,
  count: (bs) => bs.filter(Boolean).length,
};

const ofNumbers: Methods<number> = {
  mean,
  median,
  min: (xs) => Math.min(...xs),
  max: (xs) => Math.max(...xs),
  sum,
};

const ofRecords: Methods<Record<string, number>> = {
  sum: (rs) => byKey(rs, sum),
  mean: (rs) => byKey(rs, mean),
};

const isRecordOfNumbers = (value: unknown): value is Record<string, number> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => typeof v === "number");

/** The methods for `values`' type, or undefined if they don't share one the menu covers. */
function menuFor(values: unknown[]): [kind: string, Methods<never>] | undefined {
  if (values.every((v) => typeof v === "boolean")) return ["booleans", ofBooleans];
  if (values.every((v) => typeof v === "number")) return ["numbers", ofNumbers];
  if (values.every(isRecordOfNumbers)) return ["records of numbers", ofRecords];
  return undefined;
}

function combine(values: unknown[], methods: readonly AggregationMethod[]): Partial<Record<AggregationMethod, AggregatedValue>> {
  if (values.length === 0) return {};
  const menu = menuFor(values);
  if (!menu) throw new Error(`can't combine ${JSON.stringify(values)}: not all booleans, numbers or records of numbers`);
  const [kind, menuMethods] = menu;
  return Object.fromEntries(
    methods.map((method) => {
      const apply = menuMethods[method] as ((values: unknown[]) => AggregatedValue) | undefined;
      if (!apply) throw new Error(`"${method}" doesn't combine ${kind}`);
      return [method, apply(values)];
    }),
  );
}

/**
 * Combines one measurement's values across iterations, with a key per method, in the order
 * given. No values give no keys. A method `values`' type doesn't have is a type error, and
 * throws if the type checker is bypassed.
 */
export function aggregateMeasure<T>(
  values: readonly T[],
  methods: readonly AggregateFor<T>[],
): Partial<Record<AggregateFor<T>, AggregatedValue>> {
  return combine([...values], methods as readonly AggregationMethod[]);
}

/** What aggregatePermutation needs of a measurement: its name and how its values combine. */
export interface AggregatedMeasurement {
  name: string;
  aggregate: readonly AggregationMethod[];
}

/**
 * One permutation's aggregation result, from its iterations' records and the task's current
 * measurements. Each measure counts the iterations that gave it a value as `measured`, and
 * combines those values by its measurement's methods. Throws unless `records` are of one
 * permutation of one execution, and there is at least one.
 */
export function aggregatePermutation(
  records: readonly ContainerRunRecord[],
  measurements: readonly AggregatedMeasurement[],
): AggregationResult {
  const [first] = records;
  if (!first) throw new Error("no container runs to aggregate");
  const { executionId, permutationHash } = first;
  if (records.some((r) => r.executionId !== executionId || r.permutationHash !== permutationHash)) {
    throw new Error("container runs to aggregate must be of one permutation of one execution");
  }

  const measures: Record<string, AggregatedMeasure> = {};
  for (const { name, aggregate } of measurements) {
    const values = records.flatMap(({ result }) => {
      const outcome = result[name]?.outcome;
      return outcome?.outcome === "measured" ? [outcome.data] : [];
    });
    measures[name] = { measured: values.length, ...combine(values, aggregate) };
  }

  const durations = records.map(({ execution }) => execution.finishedAt - execution.startedAt);
  return {
    executionId,
    permutationHash,
    iterations: records.length,
    measures,
    duration: { mean: mean(durations), max: Math.max(...durations) },
  };
}

/**
 * Recomputes and stores the aggregation result of one permutation of one execution from the
 * container runs recorded for it. Called whenever a measure is recorded, so a stored result
 * is never stale relative to the Results it was built from.
 */
export async function recomputeAggregationResult(
  store: RunDataStore,
  executionId: string,
  permutationHash: string,
  measurements: readonly AggregatedMeasurement[],
): Promise<AggregationResult> {
  const records = (await store.getExecution(executionId)).filter((r) => r.permutationHash === permutationHash);
  const result = aggregatePermutation(records, measurements);
  await store.recordAggregationResult(result);
  return result;
}
