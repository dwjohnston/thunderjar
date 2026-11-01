// `thunderjar show <execution> [container run]`: the recorded results of an execution, one row per
// permutation with its measures aggregated across its iterations, or one container run's record.
// The aggregates are computed when shown, by the methods the task's measurements declare today.
import { Command } from "commander";
import { findThunderjarRoot } from "../../../config/loader.ts";
import { loadMeasurements, type Measurement } from "../../../config/measurements.ts";
import { AXES, abbreviateHash } from "../../../config/permutations.ts";
import { type AggregatedValue, type AggregateMethod, aggregatePermutation } from "../../../execution/aggregate.ts";
import { type ContainerRunRecord, type ExecutionRecord, fileStore, type RecordedOutcome, RunDataStoreError } from "../../../store/runDataStore.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOf, dataDirOption, displayPath, resolvePath } from "../../dataDir.ts";
import { minute, plural } from "../../format.ts";

const GAP = "   ";

/** `label  value` lines, the labels padded to the widest so the values line up. */
const labelled = (lines: [label: string, value: string][]) => {
  const width = Math.max(...lines.map(([label]) => label.length));
  return lines.map(([label, value]) => `${label.padEnd(width)}  ${value}`);
};

/** Rows of cells in columns two spaces apart, each padded to its widest cell, indented by two. */
function columns(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((row) => row[i]?.length ?? 0)));
  return rows.map((row) => `  ${row.map((cell, i) => cell.padEnd(widths[i]!)).join("  ")}`.trimEnd());
}

/** A number as it is, or to `places` decimal places. */
const decimal = (n: number, places?: number) => (places === undefined ? String(n) : n.toFixed(places));

/** A value as recorded or combined; a record of numbers as `{passed: 3, failed: 2}`. */
function showValue(value: unknown, places?: number): string {
  if (typeof value === "number") return decimal(value, places);
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const entries = Object.entries(value).map(([key, v]) => `${key}: ${typeof v === "number" ? decimal(v, places) : JSON.stringify(v)}`);
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

/** A combined value as shown: a rate as `<true>/<measured>`, a mean or median to one decimal place. */
function showAggregate(method: AggregateMethod, value: AggregatedValue, measured: number): string {
  if (method === "rate" && typeof value === "number") return `${Math.round(value * measured)}/${measured}`;
  return showValue(value, method === "mean" || method === "median" ? 1 : undefined);
}

/** A recorded measure's value, or why it has none, with its reason. */
function showOutcome(outcome: RecordedOutcome | undefined): string {
  if (outcome === undefined) return "not measured";
  if (outcome.outcome === "skipped") return `skipped${outcome.reason === undefined ? "" : `  (${outcome.reason})`}`;
  if (outcome.outcome === "erroredWhileMeasuring") return `errored while measuring  (${outcome.error.message})`;
  return showValue(outcome.data);
}

/** `ms` as minutes and seconds, e.g. `0:31`. */
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A container run's name in its execution: `<permutation>-<iteration>`, as its record's file is named. */
const runName = ({ permutation, iteration }: ContainerRunRecord) => `${permutation}-${iteration}`;

/** The axes whose parameter differs between `runs`, or every axis if none does. */
function varyingAxes(runs: ContainerRunRecord[]) {
  const varying = AXES.filter((axis) => new Set(runs.map(({ parameters }) => parameters[axis].name)).size > 1);
  return varying.length > 0 ? varying : [...AXES];
}

/**
 * The execution's table: a header naming each measurement above its methods, then a row per
 * permutation, `<n>  <its varying parameters>`, with its container runs and each aggregate. An
 * aggregate that leaves an iteration out is starred, and the iterations left out listed below.
 */
function permutationTable(execution: ExecutionRecord, runs: ContainerRunRecord[], measurements: Measurement[]): string[] {
  const axes = varyingAxes(runs);
  const methodColumns = measurements.flatMap(({ name, declaration }) => declaration.aggregate.map((method, i) => ({ name, method, first: i === 0 })));
  const numberWidth = String(execution.matrix.permutations).length;

  const rows: string[][] = [];
  const leftOut: string[][] = [];
  for (let permutation = 1; permutation <= execution.matrix.permutations; permutation++) {
    const number = String(permutation).padStart(numberWidth);
    const own = runs.filter((run) => run.permutation === permutation);
    const [first] = own;
    if (!first) {
      rows.push([number, "no container runs"]);
      continue;
    }
    const measures = aggregatePermutation(own, measurements);
    for (const { name } of measurements) {
      for (const run of own) {
        const outcome = run.result[name]?.outcome;
        if (outcome?.outcome !== "measured") leftOut.push([runName(run), name, showOutcome(outcome)]);
      }
    }
    rows.push([
      number,
      axes.map((axis) => first.parameters[axis].name).join(" | "),
      `${own.length}/${execution.matrix.iterations}`,
      ...methodColumns.map(({ name, method }) => {
        const { measured, values } = measures[name]!;
        const value = values[method];
        if (value === undefined) return "—";
        return `${showAggregate(method, value, measured)}${measured < own.length ? "*" : ""}`;
      }),
    ]);
  }

  const header = ["", axes.join(" | "), "runs", ...methodColumns.map(({ method }) => method)];
  const widths = header.map((cell, i) => Math.max(cell.length, ...rows.map((row) => row[i]?.length ?? 0)));
  // Widen a measurement's last column until its name fits above its methods.
  for (const { name, declaration } of measurements) {
    const start = 3 + methodColumns.findIndex((column) => column.name === name);
    const end = start + declaration.aggregate.length - 1;
    const span = widths.slice(start, end + 1).reduce((a, b) => a + b, 0) + GAP.length * (end - start);
    if (span < name.length) widths[end]! += name.length - span;
  }
  const line = (cells: string[]) => ` ${cells.map((cell, i) => cell.padEnd(widths[i]!)).join(GAP)}`.trimEnd();
  const column = (i: number) => 1 + widths.slice(0, i).reduce((a, b) => a + b + GAP.length, 0);
  const names = methodColumns.reduce((text, { name, first }, i) => (first ? `${text.padEnd(column(3 + i))}${name}` : text), "");

  const lines = [...(measurements.length > 0 ? [names] : []), line(header), ...rows.map(line)];
  if (leftOut.length > 0) lines.push("", "* Left out of the aggregate:", ...columns(leftOut));
  return lines;
}

/** One execution: what it was, then its permutation table, or that it has no container runs. */
export function renderExecution(execution: ExecutionRecord, runs: ContainerRunRecord[], measurements: Measurement[]): string {
  const { executionId, testCase, task, startedAt, status, matrix } = execution;
  const header = labelled([
    ["Execution", executionId],
    ["Test case", testCase],
    ["Task", task],
    ["Started", minute(startedAt)],
    ["Status", status],
    ["Matrix", `${plural(matrix.permutations, "permutation")} × ${plural(matrix.iterations, "iteration")}`],
  ]);
  const body = runs.length === 0 ? ["No container runs recorded."] : permutationTable(execution, runs, measurements);
  return [...header, "", ...body].join("\n");
}

/** One container run: where it sits, its parameters, how the agent ran, and its measures. */
export function renderContainerRun(record: ContainerRunRecord): string {
  const { executionId, testCase, permutation, permutationHash, iteration, postrunImage, ranAt, parameters, harnessModel, execution, result } = record;
  const names = Object.keys(result).toSorted();
  return [
    ...labelled([
      ["Container run", runName(record)],
      ["Execution", `${executionId}  (${testCase})`],
      ["Permutation", `${permutation}  (${abbreviateHash(permutationHash)}), iteration ${iteration}`],
      ["Postrun image", postrunImage],
      ["Ran at", minute(ranAt)],
    ]),
    "",
    "Parameters",
    ...columns(AXES.map((axis) => [axis, parameters[axis].name, abbreviateHash(parameters[axis].parameterHash)])),
    "",
    ...labelled([
      ["Harness", `${harnessModel.harness} ${harnessModel.version}`],
      ["Model", `${harnessModel.model}  (${harnessModel.modelId})`],
      ["Duration", duration(execution.finishedAt - execution.startedAt)],
      ["Exit code", String(execution.exitCode)],
    ]),
    "",
    "Measures",
    ...(names.length === 0 ? ["  none"] : columns(names.map((name) => [name, showOutcome(result[name]!.outcome)]))),
  ].join("\n");
}

/** Prints `message` as an error, with exit code 1. */
function fail(message: string): void {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

/**
 * Shows execution `executionId`, or its container run `containerRun`. The store is `dataDir`, or
 * the one in the nearest `.thunderjar/` folder in `cwd` or above it. An execution's aggregates are
 * by the measurements of that folder's task.
 */
async function show(cwd: string, executionId: string, containerRun?: string, dataDir?: string): Promise<void> {
  const root = containerRun === undefined || dataDir === undefined ? await findThunderjarRoot(cwd) : undefined;
  const store = fileStore(dataDir === undefined ? dataDirOf(cwd, root!) : resolvePath(cwd, dataDir));
  let execution: ExecutionRecord | undefined;
  let runs: ContainerRunRecord[];
  try {
    execution = (await store.listExecutions()).find((record) => record.executionId === executionId);
    if (!execution) return fail(`No execution ${executionId} recorded. List them with \`thunderjar executions\`.`);
    runs = await store.containerRunsOf(executionId);
  } catch (error) {
    if (!(error instanceof RunDataStoreError)) throw error;
    return fail(`Can't read ${displayPath(cwd, error.path)}: ${error.message}`);
  }

  if (containerRun === undefined) {
    console.log(renderExecution(execution, runs, await loadMeasurements(root!, execution.task)));
    return;
  }
  const record = runs.find((run) => runName(run) === containerRun || run.postrunImage === containerRun);
  if (!record) return fail(`Execution ${executionId} has no container run ${containerRun}.`);
  console.log(renderContainerRun(record));
}

export function createShowCommand(): Command {
  return new Command("show")
    .description(
      "Show an execution's recorded results: a row per permutation, with each measure aggregated across its iterations by its measurement's methods. Given a container run, show that one iteration instead: its parameters, how the agent ran, and each measure.",
    )
    .argument("<execution>", "the execution's ID, as listed by `thunderjar executions`")
    .argument("[container run]", "one of its container runs, as `<permutation>-<iteration>`, e.g. `1-1`, or its postrun image")
    .addOption(dataDirOption())
    .action(
      reportingConfigErrors(async (executionId: string, containerRun: string | undefined, options: { dataDir?: string }) => {
        await show(process.cwd(), executionId, containerRun, options.dataDir);
      }),
    );
}
