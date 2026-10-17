// `thunderjar remeasure <test case | execution>` — spec/100-cli-reference.md#remeasure. Will apply
// today's measurements to past container runs without rerunning the agent. For now it only prints
// its plan (spec/110-cli-report-visualization.md#remeasure). An execution prints each of its
// task's current measurements, up to date or new / changed, and each name deleted from the task
// with how many measures of it are kept. A test case prints every execution of it, not only its
// latest as `show` does, and which of them have nothing to do. It measures nothing, writes nothing
// to the store and recomputes no aggregation result.
//
// The argument is tried as an execution ID, then a test case name, as `show` resolves it; a
// postrun tag isn't a target. Each execution is planned against its stored task's measurements,
// not today's test case declaration. `--data-dir` reads a store kept outside the project.

import { abbreviateHash } from "../../matrix/hashing.ts";
import { planRemeasure, type ExecutionSummary, type RemeasurePlan } from "../../measuring/remeasure.ts";
import { findThunderjarRoot, loadMeasurements } from "../../project/config.ts";
import {
  jsonFileStore,
  runDataStorePath,
  type ContainerRunRecord,
  type ExecutionSummary as RecordedExecution,
} from "../../store/run-data-store.ts";
import { count } from "../format.ts";

const NOT_APPLIED = "Not implemented: applying measurements and recomputing aggregation results.";

/** An execution's plan: its header, then a row per measurement name, current ones first, in one column. */
function executionReport(task: string, containerRuns: number, { executionId, measurements, deleted }: ExecutionSummary) {
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
    NOT_APPLIED,
  ].join("\n");
}

/** A test case's executions, as listed: a row each with its runs and day, marking those with nothing to take. */
function testCaseReport(testCase: string, executions: (RecordedExecution & { plan: RemeasurePlan })[]) {
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
    NOT_APPLIED,
  ].join("\n");
}

/** Plans an execution's records against the current measurements of the task they were run with. */
async function planExecution(cwd: string, records: ContainerRunRecord[]) {
  return planRemeasure(records, await loadMeasurements(findThunderjarRoot(cwd), records[0]!.task));
}

export async function remeasure(
  target: string,
  { cwd = process.cwd(), dataDir }: { cwd?: string; dataDir?: string } = {},
): Promise<string> {
  const store = jsonFileStore(runDataStorePath(cwd, dataDir));

  const records = await store.getExecution(target);
  if (records.length > 0) {
    const [summary] = (await planExecution(cwd, records)).executions;
    return executionReport(records[0]!.task, records.length, summary!);
  }

  // Every execution of the test case, newest first, where `show` takes only the latest.
  const executions = await store.listExecutions(target);
  if (executions.length > 0) {
    const planned = [];
    for (const execution of executions) {
      planned.push({ ...execution, plan: await planExecution(cwd, await store.getExecution(execution.executionId)) });
    }
    return testCaseReport(target, planned);
  }

  throw new Error(`${target} is not a recorded execution or test case`);
}
