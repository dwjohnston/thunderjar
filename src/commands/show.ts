// `thunderjar show <test case | execution | container run>` — spec/100-cli-reference.md#show.
// Reads recorded results back from the run data store. The argument is tried as a postrun tag,
// then an execution ID, then a test case name, meaning its latest execution; so a test case
// named like an execution ID is shadowed by it.
//
// An execution prints a table per permutation: a row per measure, a column per iteration, then
// each iteration's exit code and duration. It stands in for the spec's aggregation results until
// those are built. A container run prints its parameters, measures, duration and exit code.

import { findThunderjarRoot } from "../config.ts";
import { abbreviateHash } from "../hashing.ts";
import { AXES, permutationRows, type Permutation } from "../permutations.ts";
import {
  defaultRunDataStorePath,
  jsonFileStore,
  type ContainerRunRecord,
  type RecordedOutcome,
} from "../run-data-store.ts";
import { minute } from "./executions.ts";
import { count } from "./plan.ts";
import { duration, showValue } from "./run.ts";

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

/** Measure names across `records`, sorted, as `run` prints them. */
const measureNames = (records: ContainerRunRecord[]) =>
  [...new Set(records.flatMap(({ result }) => Object.keys(result)))].toSorted();

/** The record's parameter names as a Permutation, for permutationRows. */
const permutationOf = ({ parameters }: ContainerRunRecord) =>
  Object.fromEntries(AXES.map((axis) => [axis, parameters[axis].name])) as unknown as Permutation;

/** A measure in a table cell: its value, `skipped` or `error`. */
const cell = (outcome: RecordedOutcome) =>
  outcome.outcome === "measured" ? showValue(outcome.data) : outcome.outcome === "skipped" ? "skipped" : "error";

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

/** One execution: its header, then a block per permutation. `latestOf` is the test case it was found by. */
function showExecution(records: ContainerRunRecord[], latestOf?: string): string {
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
  permutations.forEach((runs, n) => {
    const names = measureNames(runs);
    lines.push(
      "",
      `Permutation ${abbreviateHash(runs[0]!.permutationHash)}  (${count(runs.length, "iteration")})`,
      `  ${rows[n]}`,
      "",
      ...table([
        ["MEASURE", ...runs.map((r) => `i${r.iteration + 1}`)],
        ...names.map((name) => [name, ...runs.map(({ result }) => (result[name] ? cell(result[name].outcome) : "—"))]),
        [],
        ["exit", ...runs.map(({ execution }) => String(execution.exitCode))],
        ["duration", ...runs.map(({ execution }) => duration(execution))],
      ]),
    );
  });
  return lines.join("\n");
}

/** One container run: where it sits, its parameters, its measures, and how the agent ran. */
function showContainerRun(record: ContainerRunRecord): string {
  const { postrunImage, executionId, testCase, permutationHash, iteration, ranAt, parameters, result, execution } = record;
  const names = Object.keys(result).toSorted();
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
    ...(names.length === 0 ? ["  none"] : table(names.map((name) => [name, detailed(result[name]!.outcome)]))),
    "",
    `Duration  ${duration(execution)}   exit code ${execution.exitCode}`,
  ].join("\n");
}

export async function show(target: string, cwd: string = process.cwd()): Promise<string> {
  const store = jsonFileStore(defaultRunDataStorePath(findThunderjarRoot(cwd)));

  const containerRun = await store.getContainerRun(target);
  if (containerRun) return showContainerRun(containerRun);

  const execution = await store.getExecution(target);
  if (execution.length > 0) return showExecution(execution);

  const [latest] = await store.listExecutions(target);
  if (latest) return showExecution(await store.getExecution(latest.executionId), target);

  throw new Error(`${target} is not a recorded container run, execution or test case`);
}
