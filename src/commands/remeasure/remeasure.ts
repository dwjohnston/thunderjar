// `thunderjar remeasure <test case | execution>` — spec/100-cli-reference.md#remeasure. Will apply
// today's measurements to past container runs without rerunning the agent. For now it prints its
// plan (spec/110-cli-report-visualization.md#remeasure). An execution prints each of its task's
// current measurements, up to date or new / changed, and each name deleted from the task with
// how many measures of it are kept. A test case prints every execution of it, not only its latest
// as `show` does, and which of them have nothing to do. It measures nothing, but recomputes and
// stores every aggregation result of each execution it was given from the Results already stored,
// even with nothing to measure, so an edited `aggregate` or a deleted measurement is picked up
// (delivery story 2400). Container run records are left as they are.
//
// The argument is tried as an execution ID, then a test case name, as `show` resolves it; a
// postrun tag isn't a target. Each execution is planned and aggregated against its stored task's
// measurements, not today's test case declaration. `--data-dir` reads and writes a store kept
// outside the project.

import { abbreviateHash } from "../../matrix/hashing.ts";
import { recomputeAggregationResult } from "../../measuring/aggregate.ts";
import { planRemeasure, type ExecutionSummary, type RemeasurePlan } from "../../measuring/remeasure.ts";
import { findThunderjarRoot, loadMeasurements } from "../../project/config.ts";
import {
  jsonFileStore,
  runDataStorePath,
  type ExecutionSummary as RecordedExecution,
  type RunDataStore,
} from "../../store/run-data-store.ts";
import { count } from "../format.ts";

/** How every report ends: the aggregation results recomputed, then what isn't done yet. */
const footer = (recomputed: number) => [
  `Recomputed ${count(recomputed, "aggregation result")}.`,
  "Not implemented: applying measurements.",
];

/** An execution's plan: its header, then a row per measurement name, current ones first, in one column. */
function executionReport(
  task: string,
  containerRuns: number,
  { executionId, measurements, deleted }: ExecutionSummary,
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
    ...footer(recomputed),
  ].join("\n");
}

/** A test case's executions, as listed: a row each with its runs and day, marking those with nothing to take. */
function testCaseReport(
  testCase: string,
  executions: (RecordedExecution & { plan: RemeasurePlan })[],
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
    ...footer(recomputed),
  ].join("\n");
}

/**
 * Plans a recorded execution against the current measurements of the task it was run with, then
 * recomputes and stores each of its permutations' aggregation results by those measurements.
 * Gives its records, its plan, and how many aggregation results were recomputed.
 */
async function planAndRecompute(cwd: string, store: RunDataStore, executionId: string) {
  const records = await store.getExecution(executionId);
  const measurements = await loadMeasurements(findThunderjarRoot(cwd), records[0]!.task);
  const plan = planRemeasure(records, measurements);
  const permutationHashes = new Set(records.map(({ permutationHash }) => permutationHash));
  for (const permutationHash of permutationHashes) {
    await recomputeAggregationResult(store, executionId, permutationHash, measurements);
  }
  return { records, plan, recomputed: permutationHashes.size };
}

export async function remeasure(
  target: string,
  { cwd = process.cwd(), dataDir }: { cwd?: string; dataDir?: string } = {},
): Promise<string> {
  const store = jsonFileStore(runDataStorePath(cwd, dataDir));

  if ((await store.getExecution(target)).length > 0) {
    const { records, plan, recomputed } = await planAndRecompute(cwd, store, target);
    return executionReport(records[0]!.task, records.length, plan.executions[0]!, recomputed);
  }

  // Every execution of the test case, newest first, where `show` takes only the latest.
  const executions = await store.listExecutions(target);
  if (executions.length > 0) {
    const planned = [];
    let recomputed = 0;
    for (const execution of executions) {
      const { plan, recomputed: ofExecution } = await planAndRecompute(cwd, store, execution.executionId);
      planned.push({ ...execution, plan });
      recomputed += ofExecution;
    }
    return testCaseReport(target, planned, recomputed);
  }

  throw new Error(`${target} is not a recorded execution or test case`);
}
