// `thunderjar show <test case | execution | container run>` — spec/100-cli-reference.md#show.
// Reads recorded results back from the run data store. The argument is tried as a postrun tag,
// then an execution ID, then a test case name, meaning its latest execution; so a test case
// named like an execution ID is shadowed by it.
//
// An execution prints each permutation's stored aggregation result: a row per measure, with how
// many iterations it was measured in and its combined value by each chosen method, then the
// iterations' exit codes and durations. Its per-iteration values are in each container run's
// view, which prints its parameters, measures, duration and exit code. A measure there is marked
// `(stale)` when its task's measurement of that name, as declared today, has another content hash;
// a row of an execution is marked "stale, run `remeasure`" when any value it combines is.
//
// `--data-dir` reads a store kept outside the project.

import { abbreviateHash, hashMeasurement } from "../../matrix/hashing.ts";
import { AXES, permutationRows, type Permutation } from "../../matrix/permutations.ts";
import { findThunderjarRoot, loadMeasurements, type Measurement } from "../../project/config.ts";
import {
  jsonFileStore,
  runDataStorePath,
  type AggregatedMeasure,
  type AggregatedValue,
  type AggregationMethod,
  type AggregationResult,
  type ContainerRunRecord,
  type RecordedMeasure,
  type RecordedOutcome,
} from "../../store/run-data-store.ts";
import { count, duration, minute, seconds, showValue } from "../format.ts";

/** `label  value` lines, with the labels padded to the widest so the values line up. */
const labelled = (lines: [label: string, value: string][]) => {
  const width = Math.max(...lines.map(([label]) => label.length));
  return lines.map(([label, value]) => `${label.padEnd(width)}  ${value}`);
};

/**
 * Rows of cells as columns two spaces apart, each padded to its widest cell (the last isn't
 * padded), indented by two. An empty row is a blank line, and doesn't count towards widths.
 */
function table(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((row) => row[i]?.length ?? 0)));
  return rows.map((row) =>
    row.length === 0 ? "" : `  ${row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!))).join("  ")}`,
  );
}

/** The record's parameter names as a Permutation, for permutationRows. */
const permutationOf = ({ parameters }: ContainerRunRecord) =>
  Object.fromEntries(AXES.map((axis) => [axis, parameters[axis].name])) as unknown as Permutation;

/**
 * Decimal places a method's value is shown to, as in the spec's examples: a rate to two, a mean
 * or median to one. The rest are counts, sums and single values, shown as they are.
 */
const PLACES: Partial<Record<AggregationMethod, number>> = { rate: 2, mean: 1, median: 1 };

/** A method's value, rounded for its method; a record of them key by key, `{passed: 8, failed: 2}`. */
function aggregatedValue(method: AggregationMethod, value: AggregatedValue): string {
  const places = PLACES[method];
  const number = (n: number) => (places === undefined ? showValue(n) : n.toFixed(places));
  if (typeof value === "number") return number(value);
  return `{${Object.entries(value)
    .map(([key, n]) => `${key}: ${number(n)}`)
    .join(", ")}}`;
}

/** A measure's AGGREGATE cell: each method and its value, in the order chosen, or — if nothing was measured. */
function aggregateCell({ measured, ...methods }: AggregatedMeasure): string {
  if (measured === 0) return "—";
  return Object.entries(methods)
    .map(([method, value]) => `${method} ${aggregatedValue(method as AggregationMethod, value)}`)
    .join(", ");
}

/** How the runs exited, `2/2 exited 0` or `1/2 exited 0, 1/2 exited 3`, by code. */
function exits(runs: ContainerRunRecord[]): string {
  const byCode = new Map<number, number>();
  for (const { execution } of runs) byCode.set(execution.exitCode, (byCode.get(execution.exitCode) ?? 0) + 1);
  return [...byCode]
    .toSorted(([a], [b]) => a - b)
    .map(([code, n]) => `${n}/${runs.length} exited ${code}`)
    .join(", ");
}

/** A summary line below a permutation's table, its value in a column of its own. */
const summary = (label: string, value: string) => `  ${label.padEnd(11)}${value}`;

/**
 * Whether a stored measure is stale against `measurements`, its task's today: the measurement of
 * its name hashes differently now (spec/085-test-case-results.md#name-is-identity-hash-is-version).
 * A name no longer declared was deleted, which doesn't make its measure stale.
 */
function staleness(measurements: Measurement[]): (name: string, measure: RecordedMeasure) => boolean {
  const currentHashes = new Map(measurements.map((measurement) => [measurement.name, hashMeasurement(measurement)]));
  return (name, { contentHash }) => {
    const current = currentHashes.get(name);
    return current !== undefined && current !== contentHash;
  };
}

/**
 * One permutation's aggregation result: a row per measure, sorted by name. A row is marked stale
 * if any of `runs`' values it combines is; a run's measure that isn't a value doesn't count.
 */
function aggregationTable(
  { iterations, measures }: AggregationResult,
  runs: ContainerRunRecord[],
  isStale: (name: string, measure: RecordedMeasure) => boolean,
): string[] {
  const names = Object.keys(measures).toSorted();
  if (names.length === 0) return ["  no measures"];
  const staleRow = (name: string) =>
    runs.some(({ result }) => {
      const measure = result[name];
      return measure?.outcome.outcome === "measured" && isStale(name, measure);
    });
  return table([
    ["MEASURE", "MEASURED", "AGGREGATE"],
    ...names.map((name) => [
      name,
      `${measures[name]!.measured}/${iterations}`,
      `${aggregateCell(measures[name]!)}${staleRow(name) ? "  stale, run `remeasure`" : ""}`,
    ]),
  ]);
}

/** A measure in the container run view, with why it has no value if it hasn't. */
const detailed = (outcome: RecordedOutcome) =>
  outcome.outcome === "measured"
    ? showValue(outcome.data)
    : outcome.outcome === "skipped"
      ? `skipped${outcome.reason === undefined ? "" : `  (${outcome.reason})`}`
      : `error  (${outcome.error.message})`;

/** Records grouped by permutation, keeping their order. */
function byPermutation(records: ContainerRunRecord[]): ContainerRunRecord[][] {
  const groups = new Map<string, ContainerRunRecord[]>();
  for (const record of records) {
    const group = groups.get(record.permutationHash);
    if (group) group.push(record);
    else groups.set(record.permutationHash, [record]);
  }
  return [...groups.values()];
}

/**
 * One execution: its header, then a block per permutation, from its aggregation result.
 * `measurements` are its task's today. `latestOf` is the test case it was found by.
 */
function showExecution(
  records: ContainerRunRecord[],
  aggregations: AggregationResult[],
  measurements: Measurement[],
  latestOf?: string,
): string {
  const [{ executionId, testCase, task }] = records as [ContainerRunRecord];
  const ranAt = records.map((r) => r.ranAt).toSorted()[0]!;
  const lines = labelled([
    ["Execution", `${executionId}${latestOf === undefined ? "" : `  (latest of ${latestOf})`}`],
    ["Test case", testCase],
    ["Task", task],
    ["Date", minute(ranAt)],
  ]);

  const permutations = byPermutation(records);
  const rows = permutationRows(permutations.map(([first]) => permutationOf(first!)));
  const byHash = new Map(aggregations.map((a) => [a.permutationHash, a]));
  const isStale = staleness(measurements);
  permutations.forEach((runs, n) => {
    const aggregation = byHash.get(runs[0]!.permutationHash);
    lines.push(
      "",
      `Permutation ${abbreviateHash(runs[0]!.permutationHash)}  (${count(runs.length, "iteration")})`,
      `  ${rows[n]}`,
      "",
      // Only for runs recorded before aggregation results were stored.
      ...(aggregation ? aggregationTable(aggregation, runs, isStale) : ["  no aggregation result recorded"]),
      "",
      summary("exit", exits(runs)),
      ...(aggregation
        ? [summary("duration", `mean ${seconds(aggregation.duration.mean)}, max ${seconds(aggregation.duration.max)}`)]
        : []),
    );
  });
  return lines.join("\n");
}

/**
 * One container run: where it sits, its parameters, its measures, and how the agent ran.
 * `measurements` are its task's today, against which a measure may be stale.
 */
function showContainerRun(record: ContainerRunRecord, measurements: Measurement[]): string {
  const { postrunImage, executionId, testCase, permutationHash, iteration, ranAt, parameters, result, execution } = record;
  const names = Object.keys(result).toSorted();
  const isStale = staleness(measurements);
  const cell = (name: string) => `${detailed(result[name]!.outcome)}${isStale(name, result[name]!) ? " (stale)" : ""}`;
  return [
    ...labelled([
      ["Container run", postrunImage],
      ["Execution", `${executionId}  (${testCase})`],
      ["Permutation", `${abbreviateHash(permutationHash)}, iteration ${iteration + 1}`],
      ["Ran at", minute(ranAt)],
    ]),
    "",
    "Parameters",
    ...table(AXES.map((axis) => [axis, parameters[axis].name, parameters[axis].parameterHash.slice(0, 4)])),
    "",
    "Measures",
    ...(names.length === 0 ? ["  none"] : table(names.map((name) => [name, cell(name)]))),
    "",
    `Duration  ${duration(execution)}   exit code ${execution.exitCode}`,
  ].join("\n");
}

export async function show(
  target: string,
  { cwd = process.cwd(), dataDir }: { cwd?: string; dataDir?: string } = {},
): Promise<string> {
  const store = jsonFileStore(runDataStorePath(cwd, dataDir));
  /** A task's measurements as declared today, which a stored measure may be stale against. */
  const todays = (task: string) => loadMeasurements(findThunderjarRoot(cwd), task);

  const containerRun = await store.getContainerRun(target);
  if (containerRun) return showContainerRun(containerRun, await todays(containerRun.task));

  const execution = await store.getExecution(target);
  if (execution.length > 0) {
    return showExecution(execution, await store.getAggregationResults(target), await todays(execution[0]!.task));
  }

  const [latest] = await store.listExecutions(target);
  if (latest) {
    const { executionId } = latest;
    const records = await store.getExecution(executionId);
    return showExecution(records, await store.getAggregationResults(executionId), await todays(records[0]!.task), target);
  }

  throw new Error(`${target} is not a recorded container run, execution or test case`);
}
