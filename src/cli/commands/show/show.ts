// `thunderjar show <execution> [container run]`: the recorded results of an execution, one row per
// permutation with its measures aggregated across its iterations, or one container run's record.
// The aggregates are computed when shown, by the methods the task's measurements declare today.
import { Command } from "commander";
import { findThunderjarRoot } from "../../../config/loader.ts";
import { loadMeasurements, type Measurement } from "../../../config/measurements.ts";
import { AXES, abbreviateHash } from "../../../config/permutations.ts";
import type { ModelTokenCosts, Reply, TokenCosts } from "../../../api/declarations.ts";
import { type ExecutionSummary, type PermutationSummary, runName, summariseExecution } from "../../../execution/executionSummary.ts";
import { type ContainerRunRecord, type ExecutionRecord, type RecordedOutcome, RunDataStoreError } from "../../../store/runDataStore.ts";
import { type Paint, padEnd, painter, plain, visibleLength } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption, displayPath, openStore } from "../../dataDir.ts";
import { dollars, duration, minute, paintStatus, plural, showAggregate, showResolved, showValue, thousands } from "../../format.ts";
import { print, printError } from "../../output.ts";

const GAP = "   ";

/** `label  value` lines, the labels padded to the widest so the values line up. */
const labelled = (lines: [label: string, value: string][], paint: Paint) => {
  const width = Math.max(...lines.map(([label]) => label.length));
  return lines.map(([label, value]) => `${paint.dim(label.padEnd(width))}  ${value}`);
};

/** Rows of cells in columns two spaces apart, each padded to its widest cell, indented by two. */
function columns(rows: string[][]): string[] {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((row) => visibleLength(row[i] ?? ""))));
  return rows.map((row) => `  ${row.map((cell, i) => padEnd(cell, widths[i]!)).join("  ")}`.trimEnd());
}

/** A recorded measure's value, or why it has none, with its reason. */
function showOutcome(outcome: RecordedOutcome | undefined, paint: Paint): string {
  if (outcome === undefined) return paint.dim("not measured");
  if (outcome.outcome === "skipped") return paint.yellow(`skipped${outcome.reason === undefined ? "" : `  (${outcome.reason})`}`);
  if (outcome.outcome === "erroredWhileMeasuring") return paint.red(`errored while measuring  (${outcome.error.message})`);
  return showValue(outcome.data, undefined, paint);
}

/** Why a run's token costs weren't collected. */
const notCollected = (costs: TokenCosts | undefined, paint: Paint) =>
  paint.dim(costs === undefined ? "not recorded" : costs.outcome === "unavailable" ? `not reported  (${costs.reason})` : "");

/**
 * A permutation's mean tokens and mean cost, over the runs that have them, starred if that leaves
 * one out: never counting a run without them as zero. A cost only from runs whose cost can be
 * trusted, and `—` if none's can.
 */
function costColumns({ iterations, tokens, costUsd }: PermutationSummary, paint: Paint): [tokens: string, cost: string] {
  const star = (n: number) => (n < iterations ? paint.yellow("*") : "");
  return [
    tokens === undefined ? paint.dim("not reported") : `${thousands(tokens.mean)}${star(tokens.of)}`,
    costUsd === undefined ? paint.dim("—") : `${dollars(costUsd.mean)}${star(costUsd.of)}`,
  ];
}

/** A run's token costs, a row per model, or why there are none. */
function tokenCostLines(costs: TokenCosts, paint: Paint): string[] {
  if (costs.outcome === "unavailable") return [paint.dim(`  none  (${costs.reason})`)];
  const cost = ({ costUsd, costBasis }: ModelTokenCosts) =>
    costUsd === undefined
      ? paint.dim("not reported")
      : costBasis === "unknown"
        ? paint.dim(`not reported  (its price table doesn't know the model)`)
        : dollars(costUsd);
  return columns([
    ["model", "input", "output", "cache write", "cache read", "cost"].map(paint.dim),
    ...costs.models.map((model) => [
      paint.magenta(model.model),
      thousands(model.inputTokens),
      thousands(model.outputTokens),
      thousands(model.cacheCreationTokens),
      thousands(model.cacheReadTokens),
      cost(model),
    ]),
  ]);
}

/**
 * The execution's table: a header naming each measurement above its methods, then a row per
 * permutation, `<n>  <its varying parameters>`, with its container runs and each aggregate. The
 * container runs whose agent exited non-zero, timed out or left no result file are listed below.
 * An aggregate that leaves an iteration out is starred, and the iterations left out listed below.
 * A measure whose recorded values its methods can't combine shows `?`, and why below.
 */
function permutationTable(summary: ExecutionSummary, paint: Paint): string[] {
  const { execution, measurements, recordsTokenCosts, permutations } = summary;
  // With none varying, every parameter shows.
  const axes = summary.varyingAxes.length > 0 ? summary.varyingAxes : [...AXES];
  const methodColumns = measurements.flatMap(({ name, aggregate }) => aggregate.map((method, i) => ({ name, method, first: i === 0 })));
  const numberWidth = String(execution.matrix.permutations).length;

  const rows: string[][] = [];
  const leftOut: string[][] = [];
  const incompatible = new Map<string, Set<string>>();
  for (const permutation of permutations) {
    const number = String(permutation.permutation).padStart(numberWidth);
    const { parameters, measures, iterations } = permutation;
    if (parameters === undefined) {
      rows.push([paint.bold(number), paint.dim("no container runs")]);
      continue;
    }
    for (const [name, measure] of Object.entries(measures)) {
      if (measure.incompatible !== undefined) incompatible.set(name, (incompatible.get(name) ?? new Set()).add(measure.incompatible));
    }
    for (const { run, measure, outcome } of permutation.leftOut) leftOut.push([paint.bold(run), paint.blue(measure), showOutcome(outcome, paint)]);
    if (recordsTokenCosts) {
      for (const { run, tokenCosts } of permutation.withoutTokenCosts) leftOut.push([paint.bold(run), paint.blue("tokens"), notCollected(tokenCosts, paint)]);
    }
    rows.push([
      paint.bold(number),
      paint.magenta(axes.map((axis) => parameters[axis]).join(" | ")),
      (iterations < execution.matrix.iterations ? paint.yellow : paint.dim)(`${iterations}/${execution.matrix.iterations}`),
      ...methodColumns.map(({ name, method }) => {
        const { measured, values, incompatible } = measures[name]!;
        if (incompatible !== undefined) return paint.yellow("?");
        const value = values[method];
        if (value === undefined) return paint.dim("—");
        return `${showAggregate(method, value, measured)}${measured < iterations ? paint.yellow("*") : ""}`;
      }),
      ...(recordsTokenCosts ? costColumns(permutation, paint) : []),
    ]);
  }

  const header = ["", axes.join(" | "), "runs", ...methodColumns.map(({ method }) => method), ...(recordsTokenCosts ? ["tokens (mean)", "cost (mean)"] : [])];
  const widths = header.map((cell, i) => Math.max(cell.length, ...rows.map((row) => visibleLength(row[i] ?? ""))));
  // Widen a measurement's last column until its name fits above its methods.
  for (const { name, aggregate } of measurements) {
    const start = 3 + methodColumns.findIndex((column) => column.name === name);
    const end = start + aggregate.length - 1;
    const span = widths.slice(start, end + 1).reduce((a, b) => a + b, 0) + GAP.length * (end - start);
    if (span < name.length) widths[end]! += name.length - span;
  }
  const line = (cells: string[]) => ` ${cells.map((cell, i) => padEnd(cell, widths[i]!)).join(GAP)}`.trimEnd();
  const column = (i: number) => 1 + widths.slice(0, i).reduce((a, b) => a + b + GAP.length, 0);
  const names = methodColumns.reduce((text, { name, first }, i) => (first ? `${padEnd(text, column(3 + i))}${paint.blue(name)}` : text), "");

  const lines = [...(measurements.length > 0 ? [names] : []), paint.dim(line(header)), ...rows.map(line)];
  const unclean = permutations.flatMap((permutation) => permutation.unclean);
  if (unclean.length > 0) {
    lines.push("", paint.red("! Agents that didn't end cleanly:"), ...columns(unclean.map(({ run, end }) => [paint.bold(run), paint.red(end)])));
  }
  if (leftOut.length > 0) lines.push("", paint.yellow("* Left out of the aggregate:"), ...columns(leftOut));
  if (incompatible.size > 0) {
    const reasons = [...incompatible].flatMap(([name, why]) => [...why].map((reason) => [paint.blue(`${name}:`), `${reason} ${paint.dim("(remeasure)")}`]));
    lines.push("", paint.yellow("? Can't aggregate as declared today:"), ...columns(reasons));
  }
  return lines;
}

/** One execution: what it was, then its permutation table, or that it has no container runs. */
export function renderExecution(execution: ExecutionRecord, runs: ContainerRunRecord[], measurements: Measurement[], paint: Paint = plain): string {
  const { executionId, testCase, task, startedAt, status, matrix } = execution;
  const header = labelled(
    [
      ["Execution", paint.bold(executionId)],
      ["Test case", paint.magenta(testCase)],
      ["Task", task],
      ["Started", minute(startedAt)],
      ["Status", paintStatus(status, paint)],
      ["Matrix", `${plural(matrix.permutations, "permutation")} × ${plural(matrix.iterations, "iteration")}`],
    ],
    paint,
  );
  const body = runs.length === 0 ? [paint.dim("No container runs recorded.")] : permutationTable(summariseExecution(execution, runs, measurements), paint);
  return [...header, "", ...body].join("\n");
}

/** A recorded reply, after `label`, its later lines lined up under its first: its text, or why there's none. */
const showReply = (reply: Reply, paint: Paint, label = "") => {
  const lines = reply.outcome === "collected" ? reply.text.split("\n") : [paint.dim(`none  (${reply.reason})`)];
  return lines.map((line, i) => `  ${i === 0 ? paint.dim(label) : " ".repeat(label.length)}${line}`.trimEnd());
};

/** A container run's reply, or with several turns, each turn's, numbered from 1. */
const showReplies = ({ reply, turns }: ContainerRunRecord, paint: Paint) =>
  turns ? turns.flatMap((turn, i) => showReply(turn.reply, paint, `Turn ${i + 1}:  `)) : showReply(reply as Reply, paint);

/** One container run: where it sits, its parameters, how the agent ran, its reply if it was recorded with one, and its measures. */
export function renderContainerRun(record: ContainerRunRecord, paint: Paint = plain): string {
  const { executionId, testCase, permutation, permutationHash, iteration, postrunImage, ranAt, parameters, harnessModel, execution, harnessResult, reply, result } =
    record;
  const turnsRan = execution.turns === undefined ? [] : [["Turns", `${execution.turns.length} of ${record.turns?.length ?? "?"} ran`] as [string, string]];
  const names = Object.keys(result).toSorted();
  const exit = execution.timedOut ? paint.red(`timed out after ${execution.timeoutSeconds}s`) : (execution.exitCode === 0 ? paint.green : paint.red)(String(execution.exitCode));
  return [
    ...labelled(
      [
        ["Container run", paint.bold(runName(record))],
        ["Execution", `${paint.bold(executionId)}  ${paint.dim(`(${testCase})`)}`],
        ["Permutation", `${permutation}  ${paint.dim(`(${abbreviateHash(permutationHash)})`)}, iteration ${iteration}`],
        ["Postrun image", paint.cyan(postrunImage)],
        ["Ran at", minute(ranAt)],
      ],
      paint,
    ),
    "",
    paint.bold("Parameters"),
    ...columns(
      AXES.map((axis) => {
        const { name, parameterHash, resolved } = parameters[axis];
        return [
          paint.dim(axis),
          paint.magenta(name),
          paint.dim(abbreviateHash(parameterHash)),
          ...(resolved === undefined ? [] : [`${paint.dim("resolved")} ${paint.cyan(showResolved(resolved))}`]),
        ];
      }),
    ),
    "",
    ...labelled(
      [
        ["Harness", `${harnessModel.harness} ${harnessModel.version}`],
        ["Model", harnessModel.model === undefined ? harnessModel.modelId : `${harnessModel.model}  ${paint.dim(`(${harnessModel.modelId})`)}`],
        ["Duration", duration(execution.finishedAt - execution.startedAt)],
        ["Exit", exit],
        ...turnsRan,
        ["Result file", harnessResult === null ? paint.red("none") : plural(new TextEncoder().encode(harnessResult).length, "byte")],
      ],
      paint,
    ),
    "",
    ...(reply === undefined ? [] : [paint.bold("Reply"), ...showReplies(record, paint), ""]),
    ...(record.tokenCosts === undefined ? [] : [paint.bold("Token costs"), ...tokenCostLines(record.tokenCosts, paint), ""]),
    paint.bold("Measures"),
    ...(names.length === 0 ? [paint.dim("  none")] : columns(names.map((name) => [paint.blue(name), showOutcome(result[name]!.outcome, paint)]))),
  ].join("\n");
}

/** `value` as indented JSON. */
const asJson = (value: unknown) => JSON.stringify(value, null, 2);

/** Prints `message` as an error, with exit code 1. */
function fail(message: string): void {
  printError(message);
  process.exitCode = 1;
}

/**
 * Shows execution `executionId`, or its container run `containerRun`. The store is in `dataDir`, or
 * the one the config names of the nearest `.thunderjar/` folder in `cwd` or above it. An execution's aggregates are
 * by the measurements of that folder's task.
 */
async function show(cwd: string, executionId: string, containerRun?: string, dataDir?: string, json = false): Promise<void> {
  const root = containerRun === undefined || dataDir === undefined ? await findThunderjarRoot(cwd) : undefined;
  const { store } = await openStore(cwd, dataDir, root);
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
    const measurements = await loadMeasurements(root!, execution.task);
    print(json ? asJson(summariseExecution(execution, runs, measurements)) : renderExecution(execution, runs, measurements, painter()));
    return;
  }
  const record = runs.find((run) => runName(run) === containerRun || run.postrunImage === containerRun);
  if (!record) return fail(`Execution ${executionId} has no container run ${containerRun}.`);
  print(json ? asJson(record) : renderContainerRun(record, painter()));
}

export function createShowCommand(): Command {
  return new Command("show")
    .description(
      "Show an execution's recorded results: a row per permutation, with each measure aggregated across its iterations by its measurement's methods. Given a container run, show that one iteration instead: its parameters, how the agent ran, and each measure.",
    )
    .argument("<execution>", "the execution's ID, as listed by `thunderjar executions`")
    .argument("[container run]", "one of its container runs, as `<permutation>-<iteration>`, e.g. `1-1`, or its postrun image")
    .addOption(dataDirOption())
    .option("--json", "print it as JSON: an execution's summary, with each permutation's aggregates, or a container run's record")
    .action(
      reportingConfigErrors(async (executionId: string, containerRun: string | undefined, options: { dataDir?: string; json?: boolean }) => {
        await show(process.cwd(), executionId, containerRun, options.dataDir, options.json);
      }),
    );
}
