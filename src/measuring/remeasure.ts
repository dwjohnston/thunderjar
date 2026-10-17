// Remeasure — spec/085-test-case-results.md#backfilling-measurements. Works out which stored
// measures a backfill takes again.

import { hashMeasurement } from "../matrix/hashing.ts";
import type { Measurement } from "../project/config.ts";
import type { ContainerRunRecord, RecordedMeasure, Result } from "../store/run-data-store.ts";

export type MeasureStatus = "missing" | "stale" | "current";

/**
 * Whether a container run's stored measure is still what `measurement` would take
 * (spec/085-test-case-results.md#name-is-identity-hash-is-version). Stale is a mismatch of
 * the full content hash, so an edited `aggregate` alone never is. An errored measure counts as
 * missing, so a backfill retries it even when its hash matches; a skipped one is a real outcome.
 */
export function measureStatus(recorded: RecordedMeasure | undefined, measurement: Measurement): MeasureStatus {
  if (recorded === undefined || recorded.outcome.outcome === "erroredWhileMeasuring") return "missing";
  return recorded.contentHash === hashMeasurement(measurement) ? "current" : "stale";
}

/** One container run's share of a backfill: the measurements to take from its postrun image. */
export interface RunRemeasure {
  executionId: string;
  postrunImage: string;
  /** Sorted by name. */
  measurementNames: string[];
}

/** A current measurement's status across an execution's runs. */
export interface MeasurementSummary {
  name: string;
  /** The full current content hash. */
  contentHash: string;
  /** `missing` if any run's measure is missing or errored, else `stale` if any is stale, else `current`. */
  status: MeasureStatus;
}

/** A name the task no longer declares, still stored in an execution's Results. */
export interface DeletedMeasurement {
  name: string;
  /** The execution's run Results holding a measure under the name, whatever its outcome. */
  storedMeasures: number;
}

/** What an execution's stored measures are, against the task's current measurements. */
export interface ExecutionSummary {
  executionId: string;
  /** Sorted by name. */
  measurements: MeasurementSummary[];
  /** Sorted by name. */
  deleted: DeletedMeasurement[];
}

/** What a backfill would do — a description only; nothing is measured or stored. */
export interface RemeasurePlan {
  /** Only runs with something to take, in the order of the records given. */
  runs: RunRemeasure[];
  /** Every execution in the records, in the order first seen, even one with nothing to take. */
  executions: ExecutionSummary[];
}

/**
 * Plans a backfill of `records` against a task's current `measurements`
 * (spec/085-test-case-results.md#backfilling-measurements): each run takes the measurements
 * whose stored measure is missing or stale. A measure under a name the task no longer declares
 * is never taken again, so a rename only schedules the new name. Runs are planned whatever
 * their agent's exit code.
 */
export function planRemeasure(records: ContainerRunRecord[], measurements: Measurement[]): RemeasurePlan {
  const runs = records.flatMap(({ executionId, postrunImage, result }) => {
    const measurementNames = measurements
      .filter((measurement) => measureStatus(result[measurement.name], measurement) !== "current")
      .map(({ name }) => name)
      .toSorted();
    return measurementNames.length === 0 ? [] : [{ executionId, postrunImage, measurementNames }];
  });
  return { runs, executions: summarizeExecutions(records, measurements) };
}

/**
 * Summarizes each execution's stored measures (spec/085-test-case-results.md#deleted-and-renamed-measurements).
 * A deleted name is reported with its count, not discarded, since its measures are kept.
 */
function summarizeExecutions(records: ContainerRunRecord[], measurements: Measurement[]): ExecutionSummary[] {
  const resultsByExecution = new Map<string, Result[]>();
  for (const { executionId, result } of records) {
    resultsByExecution.set(executionId, [...(resultsByExecution.get(executionId) ?? []), result]);
  }
  const sorted = measurements.toSorted((a, b) => (a.name < b.name ? -1 : 1));
  const declared = new Set(measurements.map(({ name }) => name));

  return [...resultsByExecution].map(([executionId, results]) => {
    const summaries = sorted.map((measurement) => {
      const statuses = results.map((result) => measureStatus(result[measurement.name], measurement));
      const status: MeasureStatus = statuses.includes("missing")
        ? "missing"
        : statuses.includes("stale")
          ? "stale"
          : "current";
      return { name: measurement.name, contentHash: hashMeasurement(measurement), status };
    });

    const storedMeasures = new Map<string, number>();
    for (const name of results.flatMap((result) => Object.keys(result)).filter((name) => !declared.has(name))) {
      storedMeasures.set(name, (storedMeasures.get(name) ?? 0) + 1);
    }
    const deleted = [...storedMeasures]
      .toSorted(([a], [b]) => (a < b ? -1 : 1))
      .map(([name, count]) => ({ name, storedMeasures: count }));

    return { executionId, measurements: summaries, deleted };
  });
}
