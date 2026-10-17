// `thunderjar remeasure <test case | execution>` — spec/100-cli-reference.md#remeasure. Applies
// today's measurements to past container runs without rerunning the agent, printing what it did
// (spec/110-cli-report-visualization.md#remeasure). An execution prints each of its task's
// current measurements, up to date or new / changed, each name deleted from the task with how
// many measures of it are kept, then each measure it took. A test case prints every execution of
// it, not only its latest as `show` does, and which of them have nothing to do, then how many
// runs it measured.
//
// Each run takes only its missing or stale measures (spec/085-test-case-results.md#backfilling-measurements),
// each from a context over its postrun image, as `run` opens them, and they're merged into its
// stored Result, so every other measure, a deleted one among them, keeps its value and
// `measuredAt`. Then every aggregation result of each execution it was given is recomputed and
// stored from the Results now stored, even with nothing to measure, so an edited `aggregate` or
// a deleted measurement is picked up (delivery story 2400).
//
// The argument is tried as an execution ID, then a test case name, as `show` resolves it; a
// postrun tag isn't a target. Each execution is planned, measured and aggregated against its
// stored task's measurements, not today's test case declaration. `--data-dir` reads and writes a
// store kept outside the project.

import { dockerCli } from "../../adapters/docker/docker.ts";
import { LOCAL_REPOSITORY } from "../../images/prerun.ts";
import { abbreviateHash } from "../../matrix/hashing.ts";
import { recomputeAggregationResult } from "../../measuring/aggregate.ts";
import { measureContainerRun } from "../../measuring/measure.ts";
import { planRemeasure, type ExecutionSummary, type RemeasurePlan } from "../../measuring/remeasure.ts";
import { findThunderjarRoot, loadMeasurements } from "../../project/config.ts";
import { createDockerMeasurementOpener, type MeasurementOpener } from "../../running/runner.ts";
import {
  jsonFileStore,
  runDataStorePath,
  type ContainerRunRecord,
  type ExecutionSummary as RecordedExecution,
  type Result,
  type RunDataStore,
} from "../../store/run-data-store.ts";
import { count, showOutcome } from "../format.ts";

/** A run that was measured, and the measures it took. */
interface Measured {
  record: ContainerRunRecord;
  result: Result;
}

/** How every report ends: what was updated and recomputed, and that no agent ran. */
const footer = (updated: number, recomputed: number) => [
  `Updated ${count(updated, "container run")}. Recomputed ${count(recomputed, "aggregation result")}.`,
  "The agent was not rerun.",
];

const NOTHING_TO_DO = "Already current, nothing to do.";

/** Each measure taken, in run order: `8ffdda6e i00  isPrimeTemplateTest  {passed: 3, failed: 2}`. */
function measuredLines(measured: Measured[]) {
  const taken = measured.flatMap(({ record, result }) => Object.entries(result).map((entry) => ({ record, entry })));
  const width = Math.max(...taken.map(({ entry: [name] }) => name.length));
  return taken.map(
    ({ record: { permutationHash, iteration }, entry: [name, { outcome }] }) =>
      `  ${abbreviateHash(permutationHash)} i${String(iteration).padStart(2, "0")}  ${name.padEnd(width)}  ${showOutcome(outcome)}`,
  );
}

/** An execution's plan: its header, a row per measurement name, current ones first, in one column; then what it took. */
function executionReport(
  task: string,
  containerRuns: number,
  { executionId, measurements, deleted }: ExecutionSummary,
  measured: Measured[],
  recomputed: number,
) {
  const rows: [name: string, status: string][] = [
    ...measurements.map(({ name, contentHash, status }): [string, string] => [
      name,
      status === "current" ? "up to date" : `new / changed (${abbreviateHash(contentHash)})`,
    ]),
    ...deleted.map(({ name, storedMeasures }): [string, string] => [
      name,
      `deleted from task; ${count(storedMeasures, "stored measure")} kept, excluded from aggregates`,
    ]),
  ];
  const width = Math.max(...rows.map(([name]) => name.length));
  return [
    `Execution ${executionId}  (${count(containerRuns, "container run")})`,
    `Current measurements for task ${task}:`,
    ...rows.map(([name, status]) => `  ${name.padEnd(width)}  ${status}`),
    "",
    ...(measured.length === 0
      ? [NOTHING_TO_DO]
      : ["Measuring from each postrun image:", ...measuredLines(measured), ""]),
    ...footer(measured.length, recomputed),
  ].join("\n");
}

/** A test case's executions, as listed: a row each with its runs and day, marking those with nothing to take; then how many runs it measured. */
function testCaseReport(
  testCase: string,
  executions: (RecordedExecution & { plan: RemeasurePlan })[],
  updated: number,
  recomputed: number,
) {
  const rows = executions.map(({ executionId, containerRuns, ranAt, plan }) => ({
    executionId,
    runs: count(containerRuns, "run"),
    day: ranAt.slice(0, 10),
    current: plan.runs.length === 0,
  }));
  const width = Math.max(...rows.map(({ runs }) => runs.length));
  const total = executions.reduce((sum, { containerRuns }) => sum + containerRuns, 0);
  return [
    `${testCase} has ${count(executions.length, "execution")} (${count(total, "container run")})`,
    ...rows.map(
      ({ executionId, runs, day, current }) =>
        `  ${executionId}  ${runs.padEnd(width)}  ${day}${current ? "  (already current, nothing to do)" : ""}`,
    ),
    "",
    updated === 0 ? NOTHING_TO_DO : `Measuring ${count(updated, "container run")}...  done`,
    ...footer(updated, recomputed),
  ].join("\n");
}

/**
 * Plans a recorded execution against the current measurements of the task it was run with, takes
 * each planned run's measurements through `opener` and merges them into its stored Result, then
 * recomputes and stores each of its permutations' aggregation results from the Results now stored.
 * Gives its records, its plan, the runs measured, and how many aggregation results were recomputed.
 */
async function remeasureExecution(cwd: string, store: RunDataStore, opener: MeasurementOpener, executionId: string) {
  const records = await store.getExecution(executionId);
  const measurements = await loadMeasurements(findThunderjarRoot(cwd), records[0]!.task);
  const plan = planRemeasure(records, measurements);

  const measured: Measured[] = [];
  for (const { postrunImage, measurementNames } of plan.runs) {
    const record = records.find((r) => r.postrunImage === postrunImage)!;
    const planned = measurementNames.map((name) => measurements.find((m) => m.name === name)!);
    const result = await measureContainerRun(planned, () => opener.openMeasurementContext(record.postrunImage));
    await store.recordMeasures(record.postrunImage, result);
    measured.push({ record, result });
  }

  const permutationHashes = new Set(records.map(({ permutationHash }) => permutationHash));
  for (const permutationHash of permutationHashes) {
    await recomputeAggregationResult(store, executionId, permutationHash, measurements);
  }
  return { records, plan, measured, recomputed: permutationHashes.size };
}

export async function remeasure(
  target: string,
  { cwd = process.cwd(), dataDir }: { cwd?: string; dataDir?: string } = {},
): Promise<string> {
  const store = jsonFileStore(runDataStorePath(cwd, dataDir));
  // As `run` opens them: a scratch copy of each postrun image's files, measured on the host.
  const opener = createDockerMeasurementOpener(dockerCli(), LOCAL_REPOSITORY);

  if ((await store.getExecution(target)).length > 0) {
    const { records, plan, measured, recomputed } = await remeasureExecution(cwd, store, opener, target);
    return executionReport(records[0]!.task, records.length, plan.executions[0]!, measured, recomputed);
  }

  // Every execution of the test case, newest first, where `show` takes only the latest.
  const executions = await store.listExecutions(target);
  if (executions.length > 0) {
    const planned = [];
    let updated = 0;
    let recomputed = 0;
    for (const execution of executions) {
      const { plan, measured, recomputed: ofExecution } = await remeasureExecution(
        cwd,
        store,
        opener,
        execution.executionId,
      );
      planned.push({ ...execution, plan });
      updated += measured.length;
      recomputed += ofExecution;
    }
    return testCaseReport(target, planned, updated, recomputed);
  }

  throw new Error(`${target} is not a recorded execution or test case`);
}
